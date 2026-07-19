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

create or replace function public.refund_cancelled_event_credit(
  p_invitation_id uuid,
  p_replacement_invitation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.event_invitations%rowtype;
begin
  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
  for update;

  if invitation_record.id is null or invitation_record.status <> 'cancelled' then
    raise exception 'Cancelled invitation was not found.'
      using errcode = 'P0002';
  end if;

  perform public.grant_member_credit(
    invitation_record.member_id,
    1,
    'event_waitlist_replacement_refund',
    'event_invitation',
    invitation_record.id::text,
    null,
    case
      when p_replacement_invitation_id is null then 'Credit returned after cancellation replacement.'
      else 'Credit returned after waitlist replacement ' || p_replacement_invitation_id::text || '.'
    end,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'refunded', true
  );
end;
$$;

revoke all on function public.refund_cancelled_event_credit(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.refund_cancelled_event_credit(uuid, uuid)
  to service_role;
