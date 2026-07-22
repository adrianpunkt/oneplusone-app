-- Give invitation and RSVP follow-up emails a purpose-scoped decline link.
-- GET requests only resolve sanitized context; the invitation changes only
-- after the bearer token, reason, and optional details are posted explicitly.

create table if not exists public.event_invitation_decline_tokens (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.event_email_deliveries(id) on delete cascade,
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  created_action_id uuid references public.event_action_runs(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_invitation_decline_tokens_expiry_check check (expires_at > created_at)
);

create index if not exists event_invitation_decline_tokens_invitation_idx
  on public.event_invitation_decline_tokens (invitation_id, created_at desc);

create index if not exists event_invitation_decline_tokens_delivery_idx
  on public.event_invitation_decline_tokens (delivery_id, created_at desc);

alter table public.event_invitation_decline_tokens enable row level security;

revoke all on table public.event_invitation_decline_tokens
  from public, anon, authenticated;
grant select, insert, update, delete on table public.event_invitation_decline_tokens
  to service_role;

create or replace function public.create_event_invitation_decline_token(
  p_delivery_id uuid,
  p_action_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.event_email_deliveries%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  raw_token text;
  token_id uuid;
  token_expires_at timestamptz;
begin
  select * into delivery_record
  from public.event_email_deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'Delivery was not found.' using errcode = 'P0002';
  end if;
  if delivery_record.triggering_action_id is distinct from p_action_id
    or (p_action_id is not null and not exists (
      select 1 from public.event_action_runs
      where id = p_action_id and event_id = delivery_record.event_id
    ))
    or (p_action_id is null and delivery_record.triggered_by_member_id is null) then
    raise exception 'The delivery action does not match.' using errcode = '28000';
  end if;
  if delivery_record.status not in ('sending', 'sent') then
    raise exception 'Only sending or sent deliveries can create decline links.'
      using errcode = '22023';
  end if;
  if delivery_record.email_type not in (
    'invitation_member', 'invitation_pending', 'rsvp_reminder', 'rsvp_last_call'
  ) or delivery_record.invitation_id is null then
    raise exception 'This delivery cannot create an invitation decline link.'
      using errcode = '22023';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = delivery_record.invitation_id;

  select * into event_record
  from public.events
  where id = invitation_record.event_id;

  if invitation_record.id is null
    or event_record.id is null
    or invitation_record.response_status = 'declined'
    or invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'This invitation cannot create a decline link.'
      using errcode = '22023';
  end if;

  raw_token := public.generate_payment_resume_secret();
  token_expires_at := least(
    event_record.rsvp_deadline_at,
    now() + interval '7 days'
  );

  insert into public.event_invitation_decline_tokens (
    delivery_id,
    invitation_id,
    created_action_id,
    token_hash,
    expires_at
  ) values (
    delivery_record.id,
    invitation_record.id,
    p_action_id,
    public.hash_payment_resume_secret(raw_token),
    token_expires_at
  )
  returning id into token_id;

  return jsonb_build_object(
    'ok', true,
    'deliveryId', delivery_record.id,
    'invitationId', invitation_record.id,
    'tokenId', token_id,
    'token', raw_token,
    'expiresAt', token_expires_at
  );
end;
$$;

create or replace function public.perform_event_invitation_decline(
  p_invitation_id uuid,
  p_member_id uuid,
  p_pending_rules boolean,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
  delivery_id uuid;
  delivery_key text;
begin
  if p_member_id is null then
    raise exception 'Member account is required.' using errcode = '28000';
  end if;
  if normalized_reason not in (
    'weekend_unavailable', 'prefers_sunday_brunch', 'event_fit',
    'other_commitment', 'prefer_not_to_say'
  ) and not (
    p_pending_rules and normalized_reason = 'event_type_not_interested'
  ) then
    raise exception 'Choose a reason before declining this invitation.'
      using errcode = '22023';
  end if;
  if char_length(normalized_details) > 500 then
    raise exception 'Decline details must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = p_member_id
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  delivery_key := case when p_pending_rules
    then 'pending-member-decline-'
    else 'member-decline-'
  end || invitation_record.id::text;

  if invitation_record.response_status = 'declined'
    and invitation_record.seat_status = 'none' then
    select id into delivery_id
    from public.event_email_deliveries
    where idempotency_key = delivery_key;

    return jsonb_build_object(
      'ok', true,
      'status', 'already_declined',
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', 'declined',
      'seatStatus', 'none',
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', null,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if event_record.id is null or now() >= event_record.rsvp_deadline_at then
    raise exception 'This invitation can no longer be declined.'
      using errcode = '22023';
  end if;

  if p_pending_rules then
    if invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
      or event_record.status not in ('inviting', 'confirmed') then
      raise exception 'This invitation can no longer be declined.'
        using errcode = '22023';
    end if;

    update public.event_seat_holds
    set status = 'released',
        released_at = coalesce(released_at, now()),
        updated_at = now()
    where invitation_id = invitation_record.id and status = 'active';

    update public.event_invitation_payment_attempts
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    where invitation_id = invitation_record.id
      and status in ('created', 'checkout_created');
  elsif invitation_record.seat_status in (
    'confirmed', 'held', 'cancelled', 'replaced'
  ) then
    raise exception 'This invitation can no longer be declined.'
      using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'declined',
      seat_status = 'none',
      payment_status = case
        when p_pending_rules and payment_status = 'pending' then 'expired'
        else payment_status
      end,
      waitlist_reason = null,
      responded_at = case
        when p_pending_rules then coalesce(responded_at, now())
        else now()
      end,
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  if not exists (
    select 1 from public.event_invitation_declines
    where invitation_id = invitation_record.id
  ) then
    insert into public.event_invitation_declines (
      invitation_id,
      event_id,
      member_id,
      reason,
      details
    ) values (
      invitation_record.id,
      invitation_record.event_id,
      invitation_record.member_id,
      normalized_reason,
      normalized_details
    );
  end if;

  if p_pending_rules and normalized_reason = 'event_type_not_interested' then
    insert into public.member_event_preferences (
      member_id,
      receives_event_invitations,
      updated_at
    ) values (
      invitation_record.member_id,
      false,
      now()
    )
    on conflict (member_id) do update
    set receives_event_invitations = false,
        updated_at = now();
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id,
    invitation_record.id,
    invitation_record.member_id,
    null,
    invitation_record.member_id,
    null,
    'cancellation_received',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('responseStatus', 'declined'),
    delivery_key
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
end;
$$;

create or replace function public.decline_event_invitation(
  p_invitation_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  return public.perform_event_invitation_decline(
    p_invitation_id,
    current_member_id_value,
    false,
    p_reason,
    p_details
  );
end;
$$;

create or replace function public.decline_pending_event_invitation(
  p_session_token text,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
begin
  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();

  if session_record.id is null then
    raise exception 'The invitation session is invalid or expired.'
      using errcode = '28000';
  end if;

  return public.perform_event_invitation_decline(
    session_record.invitation_id,
    session_record.member_id,
    true,
    p_reason,
    p_details
  );
end;
$$;

create or replace function public.resolve_event_invitation_decline_token(
  p_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_decline_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  member_record public.members%rowtype;
  delivery_id uuid;
  response_locale text;
begin
  if nullif(btrim(p_token), '') is null or length(p_token) > 512 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into token_record
  from public.event_invitation_decline_tokens
  where token_hash = public.hash_payment_resume_secret(p_token);

  if token_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id;

  select * into event_record
  from public.events
  where id = invitation_record.event_id;

  select * into member_record
  from public.members
  where id = invitation_record.member_id;

  response_locale := public.effective_member_locale(invitation_record.member_id);

  if invitation_record.response_status = 'declined'
    and invitation_record.seat_status = 'none' then
    select id into delivery_id
    from public.event_email_deliveries
    where idempotency_key in (
      'member-decline-' || invitation_record.id::text,
      'pending-member-decline-' || invitation_record.id::text
    )
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'status', 'already_declined',
      'locale', response_locale,
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'deliveryId', delivery_id
    );
  end if;

  if event_record.id is not null and now() >= event_record.rsvp_deadline_at then
    return jsonb_build_object(
      'ok', false,
      'status', 'deadline_passed',
      'locale', response_locale
    );
  end if;

  if token_record.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'status', 'expired',
      'locale', response_locale
    );
  end if;

  if token_record.used_at is not null then
    return jsonb_build_object(
      'ok', false,
      'status', 'unavailable',
      'locale', response_locale
    );
  end if;

  if invitation_record.id is null
    or event_record.id is null
    or member_record.membership_status not in ('active', 'pending')
    or event_record.status not in ('inviting', 'confirmed')
    or invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
    or (
      member_record.membership_status = 'active'
      and invitation_record.seat_status = 'held'
    ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'unavailable',
      'locale', response_locale
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'valid',
    'locale', response_locale,
    'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'memberStatus', member_record.membership_status,
    'eventFormat', event_record.event_format,
    'startsAt', event_record.starts_at,
    'timezone', event_record.timezone,
    'city', event_record.city,
    'expiresAt', token_record.expires_at
  );
end;
$$;

create or replace function public.decline_event_invitation_from_token(
  p_token text,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_decline_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  member_record public.members%rowtype;
  response_result jsonb;
  response_locale text;
begin
  if nullif(btrim(p_token), '') is null or length(p_token) > 512 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into token_record
  from public.event_invitation_decline_tokens
  where token_hash = public.hash_payment_resume_secret(p_token)
  for update;

  if token_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id;

  select * into event_record
  from public.events
  where id = invitation_record.event_id;

  select * into member_record
  from public.members
  where id = invitation_record.member_id;

  response_locale := public.effective_member_locale(invitation_record.member_id);

  if invitation_record.response_status = 'declined'
    and invitation_record.seat_status = 'none' then
    update public.event_invitation_decline_tokens
    set used_at = coalesce(used_at, now())
    where invitation_id = invitation_record.id;

    return jsonb_build_object(
      'ok', true,
      'status', 'already_declined',
      'locale', response_locale,
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id
    );
  end if;

  if event_record.id is not null and now() >= event_record.rsvp_deadline_at then
    return jsonb_build_object(
      'ok', false,
      'status', 'deadline_passed',
      'locale', response_locale
    );
  end if;

  if token_record.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'status', 'expired',
      'locale', response_locale
    );
  end if;

  if token_record.used_at is not null then
    return jsonb_build_object(
      'ok', false,
      'status', 'unavailable',
      'locale', response_locale
    );
  end if;

  if invitation_record.id is null
    or event_record.id is null
    or member_record.membership_status not in ('active', 'pending')
    or event_record.status not in ('inviting', 'confirmed') then
    return jsonb_build_object(
      'ok', false,
      'status', 'unavailable',
      'locale', response_locale
    );
  end if;

  response_result := public.perform_event_invitation_decline(
    invitation_record.id,
    invitation_record.member_id,
    member_record.membership_status = 'pending',
    p_reason,
    p_details
  );

  update public.event_invitation_decline_tokens
  set used_at = coalesce(used_at, now())
  where invitation_id = invitation_record.id;

  return response_result || jsonb_build_object('locale', response_locale);
end;
$$;

create or replace function public.claim_event_email_delivery(
  p_delivery_id uuid,
  p_action_id uuid,
  p_template_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.event_email_deliveries%rowtype;
  current_member_status text;
  recipient_email text;
  token_result jsonb;
  raw_access_token text;
  access_token_id uuid;
  decline_token_result jsonb;
  raw_decline_token text;
  decline_token_id uuid;
  resolved_template_id text := nullif(btrim(p_template_id), '');
begin
  select * into delivery_record
  from public.event_email_deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'Delivery was not found.' using errcode = 'P0002';
  end if;
  if delivery_record.triggering_action_id is distinct from p_action_id
    or (p_action_id is not null and not exists (
      select 1 from public.event_action_runs
      where id = p_action_id and event_id = delivery_record.event_id
    ))
    or (p_action_id is null and delivery_record.triggered_by_member_id is null) then
    raise exception 'The delivery action does not match.' using errcode = '28000';
  end if;
  if resolved_template_id is null then
    raise exception 'The resolved provider template or workflow ID is required.'
      using errcode = '22023';
  end if;
  if delivery_record.status not in ('draft', 'failed') then
    raise exception 'Only draft or failed deliveries can be claimed.' using errcode = '22023';
  end if;

  select email, membership_status
  into recipient_email, current_member_status
  from public.members
  where id = delivery_record.member_id;

  if nullif(btrim(recipient_email), '') is null then
    raise exception 'The delivery recipient has no email address.' using errcode = '22023';
  end if;

  if delivery_record.email_type in ('rsvp_reminder', 'rsvp_last_call')
    and current_member_status not in ('active', 'pending') then
    raise exception 'The RSVP follow-up recipient must be a current active or pending member.'
      using errcode = '22023';
  end if;

  if delivery_record.email_type = 'invitation_pending'
    or (
      delivery_record.email_type in ('rsvp_reminder', 'rsvp_last_call')
      and current_member_status = 'pending'
    ) then
    update public.event_invitation_access_tokens
    set used_at = coalesce(used_at, now())
    where invitation_id = delivery_record.invitation_id
      and used_at is null;

    token_result := public.create_event_invitation_access_token(
      delivery_record.invitation_id,
      p_action_id,
      10080
    );
    raw_access_token := token_result ->> 'token';
    access_token_id := (token_result ->> 'tokenId')::uuid;
  else
    access_token_id := delivery_record.invitation_access_token_id;
  end if;

  update public.event_email_deliveries
  set status = 'sending',
      template_id = resolved_template_id,
      invitation_access_token_id = access_token_id,
      attempts = attempts + 1,
      claimed_at = now(),
      last_attempt_at = now(),
      last_error = null,
      failed_at = null,
      updated_at = now()
  where id = delivery_record.id
  returning * into delivery_record;

  if delivery_record.email_type in (
    'invitation_member', 'invitation_pending', 'rsvp_reminder', 'rsvp_last_call'
  ) then
    decline_token_result := public.create_event_invitation_decline_token(
      delivery_record.id,
      p_action_id
    );
    raw_decline_token := decline_token_result ->> 'token';
    decline_token_id := (decline_token_result ->> 'tokenId')::uuid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deliveryId', delivery_record.id,
    'status', 'sending',
    'emailType', delivery_record.email_type,
    'recipientEmail', recipient_email,
    'locale', delivery_record.locale,
    'templateId', delivery_record.template_id,
    'templateVersion', delivery_record.template_version,
    'idempotencyKey', delivery_record.idempotency_key,
    'payload', delivery_record.payload,
    'memberStatus', current_member_status,
    'invitationAccessTokenId', delivery_record.invitation_access_token_id,
    'invitationAccessToken', raw_access_token,
    'invitationDeclineTokenId', decline_token_id,
    'invitationDeclineToken', raw_decline_token,
    'attempts', delivery_record.attempts
  );
end;
$$;

revoke all on function public.create_event_invitation_decline_token(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.perform_event_invitation_decline(uuid, uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_event_invitation_decline_token(text)
  from public, anon, authenticated;
revoke all on function public.decline_event_invitation_from_token(text, text, text)
  from public, anon, authenticated;
revoke all on function public.decline_event_invitation(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.decline_pending_event_invitation(text, text, text)
  from public, anon, authenticated;

grant execute on function public.create_event_invitation_decline_token(uuid, uuid)
  to service_role;
grant execute on function public.resolve_event_invitation_decline_token(text)
  to service_role;
grant execute on function public.decline_event_invitation_from_token(text, text, text)
  to service_role;
grant execute on function public.decline_event_invitation(uuid, text, text)
  to authenticated;
grant execute on function public.decline_pending_event_invitation(text, text, text)
  to service_role;

notify pgrst, 'reload schema';
