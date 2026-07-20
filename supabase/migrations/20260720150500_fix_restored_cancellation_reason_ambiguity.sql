-- Qualify the ledger reason column and avoid the PL/pgSQL variable name that
-- made reservation restoration fail at runtime with an ambiguous reference.
create or replace function public.restore_cancelled_event_confirmation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  waitlist_reason_value text;
  delivery_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  if invitation_record.seat_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', null
    );
  end if;

  if invitation_record.seat_status <> 'cancelled' or invitation_record.confirmed_at is null then
    raise exception 'This invitation can no longer be restored.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.event_replacements
    where cancelled_invitation_id = invitation_record.id
      and status = 'replaced'
  ) then
    raise exception 'This seat has already been filled.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.credit_ledger_entries as ledger
    where ledger.member_id = current_member_id_value
      and ledger.reason = 'event_waitlist_replacement_refund'
      and ledger.source_type = 'event_invitation'
      and ledger.source_id = invitation_record.id::text
  ) then
    raise exception 'The cancellation credit has already been returned.' using errcode = '22023';
  end if;

  select * into event_record
  from public.events where id = invitation_record.event_id for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'This event is not open for restoration.' using errcode = '22023';
  end if;

  waitlist_reason_value := public.event_seat_waitlist_reason(
    event_record.id, current_member_id_value, invitation_record.id
  );
  if waitlist_reason_value is not null then
    raise exception 'This seat has already been filled.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = 'confirmed',
      waitlist_reason = null,
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  insert into public.event_attendees (
    event_id, member_id, invitation_id, status, is_host, created_at, updated_at
  ) values (
    event_record.id, current_member_id_value, invitation_record.id,
    'confirmed', false, now(), now()
  ) on conflict (event_id, member_id) do update
  set invitation_id = excluded.invitation_id,
      status = 'confirmed',
      updated_at = now();

  update public.event_replacements
  set status = 'restored', updated_at = now()
  where cancelled_invitation_id = invitation_record.id;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, current_member_id_value,
    null, current_member_id_value, null,
    'seat_confirmed',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('seatStatus', 'confirmed', 'restored', true),
    'member-seat-restored-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true, 'invitationId', invitation_record.id,
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

revoke all on function public.restore_cancelled_event_confirmation(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_cancelled_event_confirmation(uuid)
  to authenticated;
