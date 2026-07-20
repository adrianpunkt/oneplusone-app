-- Pending-member invitation links remain replaceable until the event RSVP
-- cutoff. Replacement sends are durable and idempotent per expired link.

create or replace function public.create_event_invitation_access_token(
  p_invitation_id uuid,
  p_action_id uuid,
  p_ttl_minutes integer default 10080
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  generated_token text;
  token_id uuid;
  token_expires_at timestamptz;
  ttl_minutes integer := greatest(5, least(coalesce(p_ttl_minutes, 10080), 43200));
begin
  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id;

  if invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending' then
    raise exception 'A pending-member invitation is required.' using errcode = '22023';
  end if;

  select * into event_record
  from public.events
  where id = invitation_record.event_id;

  if event_record.id is null or now() >= event_record.rsvp_deadline_at then
    raise exception 'The event RSVP deadline has passed.' using errcode = '22023';
  end if;

  if p_action_id is not null and not exists (
    select 1 from public.event_action_runs where id = p_action_id
  ) then
    raise exception 'The triggering action was not found.' using errcode = 'P0002';
  end if;

  generated_token := public.generate_payment_resume_secret();
  token_expires_at := least(
    event_record.rsvp_deadline_at,
    now() + make_interval(mins => ttl_minutes)
  );

  insert into public.event_invitation_access_tokens (
    invitation_id, action_id, token_hash, expires_at
  ) values (
    invitation_record.id,
    p_action_id,
    public.hash_payment_resume_secret(generated_token),
    token_expires_at
  ) returning id into token_id;

  return jsonb_build_object(
    'ok', true,
    'tokenId', token_id,
    'token', generated_token,
    'expiresAt', token_expires_at
  );
end;
$$;

create or replace function public.claim_event_invitation_access_token(
  p_token text,
  p_session_ttl_minutes integer default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_access_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  generated_session text;
  session_expires_at timestamptz;
  ttl_minutes integer := greatest(5, least(coalesce(p_session_ttl_minutes, 1440), 10080));
begin
  if nullif(btrim(p_token), '') is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into token_record
  from public.event_invitation_access_tokens
  where token_hash = public.hash_payment_resume_secret(p_token)
  for update;

  if token_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id;

  if event_record.id is not null and now() >= event_record.rsvp_deadline_at then
    return jsonb_build_object(
      'ok', false,
      'status', 'deadline_passed',
      'locale', public.effective_member_locale(invitation_record.member_id)
    );
  end if;

  if token_record.used_at is not null
    or token_record.expires_at <= now()
    or invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending'
    or event_record.status not in ('inviting', 'confirmed') then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  generated_session := public.generate_payment_resume_secret();
  session_expires_at := least(
    token_record.expires_at,
    event_record.rsvp_deadline_at,
    now() + make_interval(mins => ttl_minutes)
  );

  update public.event_invitation_access_tokens
  set used_at = now()
  where id = token_record.id;

  insert into public.event_invitation_sessions (
    invitation_id, event_id, member_id, token_id, session_hash, expires_at
  ) values (
    invitation_record.id,
    invitation_record.event_id,
    invitation_record.member_id,
    token_record.id,
    public.hash_payment_resume_secret(generated_session),
    session_expires_at
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'claimed',
    'sessionToken', generated_session,
    'maxAgeSeconds', greatest(1, floor(extract(epoch from session_expires_at - now()))::integer),
    'expiresAt', session_expires_at
  );
end;
$$;

create or replace function public.refresh_expired_event_invitation_link(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_access_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  delivery_record public.event_email_deliveries%rowtype;
  delivery_id uuid;
  delivery_locale text;
begin
  if nullif(btrim(p_token), '') is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into token_record
  from public.event_invitation_access_tokens
  where token_hash = public.hash_payment_resume_secret(p_token);

  if token_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  delivery_locale := public.effective_member_locale(invitation_record.member_id);

  if event_record.id is not null and now() >= event_record.rsvp_deadline_at then
    return jsonb_build_object(
      'ok', false,
      'status', 'deadline_passed',
      'locale', delivery_locale
    );
  end if;

  if invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending'
    or invitation_record.response_status not in ('invited', 'accepted')
    or invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
    or event_record.status not in ('inviting', 'confirmed') then
    return jsonb_build_object(
      'ok', false,
      'status', 'unavailable',
      'locale', delivery_locale
    );
  end if;

  -- A still-claimable token should never cause a replacement email. This also
  -- avoids turning a transient claim failure into an unnecessary second send.
  if token_record.used_at is null and token_record.expires_at > now() then
    return jsonb_build_object(
      'ok', false,
      'status', 'valid',
      'locale', delivery_locale
    );
  end if;

  select * into delivery_record
  from public.event_email_deliveries
  where email_type = 'invitation_pending'
    and payload @> jsonb_build_object('refreshSourceTokenId', token_record.id::text)
  order by created_at desc
  limit 1
  for update;

  if delivery_record.id is not null then
    if delivery_record.status = 'sending'
      and delivery_record.claimed_at < now() - interval '5 minutes' then
      update public.event_email_deliveries
      set status = 'failed',
          last_error = 'Replacement invitation send timed out and may be retried.',
          failed_at = now(),
          updated_at = now()
      where id = delivery_record.id
      returning * into delivery_record;
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', case
        when delivery_record.status in ('draft', 'failed') then 'queued'
        else 'already_sent'
      end,
      'deliveryId', delivery_record.id,
      'locale', delivery_record.locale
    );
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id,
    invitation_record.id,
    invitation_record.member_id,
    null,
    invitation_record.member_id,
    null,
    'invitation_pending',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('refreshSourceTokenId', token_record.id::text),
    'pending-invite-refresh-' || token_record.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'queued',
    'deliveryId', delivery_id,
    'locale', delivery_locale
  );
end;
$$;

revoke all on function public.create_event_invitation_access_token(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.claim_event_invitation_access_token(text, integer)
  from public, anon, authenticated;
revoke all on function public.refresh_expired_event_invitation_link(text)
  from public, anon, authenticated;

grant execute on function public.create_event_invitation_access_token(uuid, uuid, integer)
  to service_role;
grant execute on function public.claim_event_invitation_access_token(text, integer)
  to service_role;
grant execute on function public.refresh_expired_event_invitation_link(text)
  to service_role;
