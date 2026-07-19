-- Declined invitations live in the archive, but members may reclaim a seat
-- while the event still has a directly confirmable place. They must not be
-- silently moved onto a waitlist after already declining.

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
    and event_invitations.status in ('invited', 'waitlisted', 'declined')
    and event_invitations.confirmed_at is null
    and (
      event_invitations.responded_at is null
      or event_invitations.status = 'declined'
    );
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
  is_reapplication boolean;
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

  if invitation_record.status not in ('invited', 'waitlisted', 'declined') then
    raise exception 'This invitation cannot be confirmed.'
      using errcode = '22023';
  end if;

  is_reapplication := invitation_record.status = 'declined';

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
    if is_reapplication then
      raise exception 'A seat is no longer available for this event.'
        using errcode = '22023';
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

  if is_reapplication then
    update public.event_invitation_declines
      set follow_up_status = 'resolved',
          reviewed_at = coalesce(reviewed_at, now())
    where invitation_id = invitation_record.id
      and follow_up_status <> 'resolved';
  end if;

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
