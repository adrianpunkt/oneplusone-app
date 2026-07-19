alter table public.events
  add column if not exists gender_balance_enabled boolean not null default true;

comment on column public.events.gender_balance_enabled is
  'When true, male and female confirmations alternate to keep the group balanced.';

create or replace function public.enforce_event_invitation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.event_id = old.event_id then
      return new;
    end if;
  elsif exists (
    select 1
    from public.event_invitations
    where event_id = new.event_id
      and member_id = new.member_id
  ) then
    -- Let the unique constraint route existing invitations through upsert updates.
    return new;
  end if;

  perform 1
  from public.events
  where id = new.event_id
  for update;

  if tg_op = 'UPDATE' then
    select count(*)::integer
      into invitation_count
    from public.event_invitations
    where event_id = new.event_id
      and id <> old.id;
  else
    select count(*)::integer
      into invitation_count
    from public.event_invitations
    where event_id = new.event_id;
  end if;

  if invitation_count >= 12 then
    raise exception 'An event can have at most 12 invitations.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_event_invitation_limit
  on public.event_invitations;
create trigger enforce_event_invitation_limit
  before insert or update of event_id on public.event_invitations
  for each row
  execute function public.enforce_event_invitation_limit();

revoke all on function public.enforce_event_invitation_limit()
  from public, anon, authenticated;

create or replace function public.event_member_binary_gender(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when lower(nullif(btrim(profile.profile_json ->> 'profile.gender'), ''))
      in ('female', 'woman', 'women') then 'female'
    when lower(nullif(btrim(profile.profile_json ->> 'profile.gender'), ''))
      in ('male', 'man', 'men') then 'male'
    else null
  end
  from public.members
  left join lateral (
    select profile_registrations.profile_json
    from public.profile_registrations
    where profile_registrations.status = 'submitted'
      and profile_registrations.contact_email_norm = members.email_norm
    order by profile_registrations.updated_at desc
    limit 1
  ) profile on true
  where members.id = p_member_id;
$$;

revoke all on function public.event_member_binary_gender(uuid)
  from public, anon, authenticated;

create or replace function public.event_invitation_response_mode_for_member(
  p_event_id uuid,
  p_member_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  confirmed_count integer;
  female_count integer;
  male_count integer;
  member_gender text;
begin
  select *
    into event_record
  from public.events
  where id = p_event_id;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or event_record.starts_at <= now() then
    return 'closed';
  end if;

  select count(*)::integer
    into confirmed_count
  from public.event_invitations
  where event_id = p_event_id
    and status = 'confirmed';

  if confirmed_count >= 8 then
    return 'waitlist';
  end if;

  if not event_record.gender_balance_enabled then
    return 'confirm';
  end if;

  member_gender := public.event_member_binary_gender(p_member_id);

  if member_gender not in ('female', 'male') or member_gender is null then
    return 'confirm';
  end if;

  select
    count(*) filter (
      where public.event_member_binary_gender(event_invitations.member_id) = 'female'
    )::integer,
    count(*) filter (
      where public.event_member_binary_gender(event_invitations.member_id) = 'male'
    )::integer
    into female_count, male_count
  from public.event_invitations
  where event_id = p_event_id
    and status = 'confirmed';

  if member_gender = 'female' and female_count > male_count then
    return 'waitlist';
  end if;

  if member_gender = 'male' and male_count > female_count then
    return 'waitlist';
  end if;

  return 'confirm';
end;
$$;

revoke all on function public.event_invitation_response_mode_for_member(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.get_event_invitation_response_modes()
returns table(invitation_id uuid, response_mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event_invitations.id,
    public.event_invitation_response_mode_for_member(
      event_invitations.event_id,
      event_invitations.member_id
    )
  from public.event_invitations
  where event_invitations.member_id = public.current_member_id()
    and event_invitations.status in ('invited', 'waitlisted')
    and event_invitations.confirmed_at is null
    and event_invitations.responded_at is null;
$$;

revoke all on function public.get_event_invitation_response_modes()
  from public, anon, authenticated;
grant execute on function public.get_event_invitation_response_modes()
  to authenticated;

create or replace function public.confirm_event_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  response_mode text;
  credit_balance integer;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and event_invitations.member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.'
      using errcode = 'P0002';
  end if;

  if invitation_record.status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'status', 'confirmed'
    );
  end if;

  if invitation_record.status not in ('invited', 'waitlisted') then
    raise exception 'This invitation cannot be confirmed.'
      using errcode = '22023';
  end if;

  select *
    into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or event_record.starts_at <= now() then
    raise exception 'This event is not open for confirmation.'
      using errcode = '22023';
  end if;

  response_mode := public.event_invitation_response_mode_for_member(
    invitation_record.event_id,
    current_member_id_value
  );

  if response_mode = 'waitlist' then
    update public.event_invitations
      set status = 'waitlisted',
          responded_at = now(),
          cancelled_at = null,
          updated_at = now()
    where id = invitation_record.id;

    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'status', 'waitlisted'
    );
  end if;

  if response_mode <> 'confirm' then
    raise exception 'This event is not open for confirmation.'
      using errcode = '22023';
  end if;

  select coalesce(sum(delta), 0)::integer
    into credit_balance
  from public.credit_ledger_entries
  where credit_ledger_entries.member_id = current_member_id_value;

  if credit_balance < 1 then
    raise exception 'You need at least 1 credit to confirm this event.'
      using errcode = '22023';
  end if;

  update public.event_invitations
    set status = 'confirmed',
        responded_at = now(),
        confirmed_at = now(),
        cancelled_at = null,
        updated_at = now()
  where id = invitation_record.id;

  insert into public.event_attendees (
    event_id,
    member_id,
    invitation_id,
    status,
    created_at,
    updated_at
  )
  values (
    invitation_record.event_id,
    current_member_id_value,
    invitation_record.id,
    'confirmed',
    now(),
    now()
  )
  on conflict (event_id, member_id) do update
    set invitation_id = excluded.invitation_id,
        status = 'confirmed',
        updated_at = now();

  perform public.grant_member_credit(
    current_member_id_value,
    -1,
    'event_confirmation',
    'event_invitation',
    invitation_record.id::text,
    null,
    'Credit used to confirm an event seat.',
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'status', 'confirmed'
  );
end;
$$;

revoke all on function public.confirm_event_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_event_invitation(uuid)
  to authenticated;

create or replace function public.join_event_waitlist(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  response_mode text;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and event_invitations.member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.'
      using errcode = 'P0002';
  end if;

  if invitation_record.status = 'waitlisted'
    and invitation_record.responded_at is not null then
    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'status', 'waitlisted'
    );
  end if;

  if invitation_record.confirmed_at is not null
    or invitation_record.status not in ('invited', 'waitlisted', 'declined', 'cancelled') then
    raise exception 'This waitlist is no longer available.'
      using errcode = '22023';
  end if;

  select *
    into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or event_record.starts_at <= now() then
    raise exception 'This waitlist is no longer available.'
      using errcode = '22023';
  end if;

  if invitation_record.status in ('invited', 'waitlisted') then
    response_mode := public.event_invitation_response_mode_for_member(
      invitation_record.event_id,
      current_member_id_value
    );

    if response_mode <> 'waitlist' then
      raise exception 'A seat is currently available for this invitation.'
        using errcode = '22023';
    end if;
  end if;

  update public.event_invitations
    set status = 'waitlisted',
        responded_at = now(),
        cancelled_at = null,
        updated_at = now()
  where id = invitation_record.id;

  return jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'status', 'waitlisted'
  );
end;
$$;

revoke all on function public.join_event_waitlist(uuid)
  from public, anon, authenticated;
grant execute on function public.join_event_waitlist(uuid)
  to authenticated;

create or replace function public.restore_cancelled_event_confirmation(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  response_mode text;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and event_invitations.member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.'
      using errcode = 'P0002';
  end if;

  if invitation_record.status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'status', 'confirmed'
    );
  end if;

  if invitation_record.status <> 'cancelled'
    or invitation_record.confirmed_at is null then
    raise exception 'This invitation can no longer be restored.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.credit_ledger_entries
    where credit_ledger_entries.member_id = current_member_id_value
      and credit_ledger_entries.reason = 'event_waitlist_replacement_refund'
      and credit_ledger_entries.source_type = 'event_invitation'
      and credit_ledger_entries.source_id = invitation_record.id::text
  ) then
    raise exception 'This seat has already been filled.'
      using errcode = '22023';
  end if;

  select *
    into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or event_record.starts_at <= now() then
    raise exception 'This event is not open for confirmation.'
      using errcode = '22023';
  end if;

  response_mode := public.event_invitation_response_mode_for_member(
    invitation_record.event_id,
    current_member_id_value
  );

  if response_mode <> 'confirm' then
    raise exception 'This seat has already been filled.'
      using errcode = '22023';
  end if;

  update public.event_invitations
    set status = 'confirmed',
        responded_at = now(),
        cancelled_at = null,
        updated_at = now()
  where id = invitation_record.id;

  insert into public.event_attendees (
    event_id,
    member_id,
    invitation_id,
    status,
    created_at,
    updated_at
  )
  values (
    invitation_record.event_id,
    current_member_id_value,
    invitation_record.id,
    'confirmed',
    now(),
    now()
  )
  on conflict (event_id, member_id) do update
    set invitation_id = excluded.invitation_id,
        status = 'confirmed',
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'status', 'confirmed'
  );
end;
$$;

revoke all on function public.restore_cancelled_event_confirmation(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_cancelled_event_confirmation(uuid)
  to authenticated;
