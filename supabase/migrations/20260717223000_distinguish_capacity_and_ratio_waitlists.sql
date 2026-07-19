-- Capacity waitlists are visible before a member responds. Ratio waitlists keep
-- the normal seat-application flow and reveal the outcome after submission.
-- Events default to 8 seats, while events.capacity can raise that to 10 or 12.

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

  -- Up to 12 confirmed seats plus room for a 12-person waitlist.
  if invitation_count >= 24 then
    raise exception 'An event can have at most 24 invitations.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

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
  event_capacity integer;
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

  event_capacity := greatest(
    1,
    least(coalesce(event_record.capacity, 8), 12)
  );

  select count(*)::integer
    into confirmed_count
  from public.event_invitations
  where event_id = p_event_id
    and status = 'confirmed';

  if confirmed_count >= event_capacity then
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
    return 'apply_waitlist';
  end if;

  if member_gender = 'male' and male_count > female_count then
    return 'apply_waitlist';
  end if;

  return 'confirm';
end;
$$;

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

  if response_mode in ('apply_waitlist', 'waitlist') then
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

revoke all on function public.enforce_event_invitation_limit()
  from public, anon, authenticated;
revoke all on function public.event_invitation_response_mode_for_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_event_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_event_invitation(uuid)
  to authenticated;
