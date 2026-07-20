-- Membership checkout and seat confirmation are separate decisions. Preserve
-- the paid marker when the member confirms (or joins a waitlist) in the app.

create or replace function public.confirm_event_invitation(p_invitation_id uuid)
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
  credit_balance integer;
  delivery_id uuid;
  result jsonb;
  is_reapplication boolean;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  if invitation_record.seat_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', null
    );
  end if;

  if invitation_record.response_status = 'expired'
    or invitation_record.seat_status in ('cancelled', 'replaced', 'held') then
    raise exception 'This invitation cannot be confirmed.' using errcode = '22023';
  end if;

  is_reapplication := invitation_record.response_status = 'declined';

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'The RSVP deadline has passed.' using errcode = '22023';
  end if;

  update public.event_seat_holds
  set status = 'expired', updated_at = now()
  where event_id = event_record.id
    and status = 'active'
    and expires_at <= now();

  waitlist_reason_value := public.event_seat_waitlist_reason(
    event_record.id,
    current_member_id_value,
    invitation_record.id
  );

  if waitlist_reason_value in ('capacity', 'balance') then
    if is_reapplication then
      raise exception 'A seat is no longer available for this event.' using errcode = '22023';
    end if;

    update public.event_invitations
    set response_status = 'accepted',
        seat_status = 'waitlisted',
        payment_status = case
          when invitation_record.payment_status = 'paid' then 'paid'
          else 'not_required'
        end,
        waitlist_reason = waitlist_reason_value,
        priority_at = coalesce(priority_at, now()),
        responded_at = coalesce(responded_at, now()),
        waitlisted_at = coalesce(waitlisted_at, now()),
        cancelled_at = null,
        updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;

    delivery_id := public.queue_event_email_delivery(
      event_record.id,
      invitation_record.id,
      current_member_id_value,
      null,
      current_member_id_value,
      null,
      case when waitlist_reason_value = 'balance' then 'waitlist_balance' else 'waitlist_capacity' end,
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object('seatStatus', 'waitlisted', 'waitlistReason', waitlist_reason_value),
      'member-waitlist-' || waitlist_reason_value || '-' || invitation_record.id::text
    );

    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if waitlist_reason_value = 'closed' then
    raise exception 'The RSVP deadline has passed.' using errcode = '22023';
  end if;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries
  where member_id = current_member_id_value;

  if credit_balance < event_record.credit_cost then
    raise exception 'You do not have enough credits to confirm this event.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = 'confirmed',
      payment_status = case
        when invitation_record.payment_status = 'paid' then 'paid'
        else 'not_required'
      end,
      waitlist_reason = null,
      priority_at = coalesce(priority_at, now()),
      responded_at = coalesce(responded_at, now()),
      confirmed_at = coalesce(confirmed_at, now()),
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  insert into public.event_attendees (
    event_id, member_id, invitation_id, status, is_host, created_at, updated_at
  ) values (
    event_record.id, current_member_id_value, invitation_record.id,
    'confirmed', false, now(), now()
  )
  on conflict (event_id, member_id) do update
  set invitation_id = excluded.invitation_id,
      status = 'confirmed',
      updated_at = now();

  perform public.grant_member_credit(
    current_member_id_value,
    -event_record.credit_cost,
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

  delivery_id := public.queue_event_email_delivery(
    event_record.id,
    invitation_record.id,
    current_member_id_value,
    null,
    current_member_id_value,
    null,
    'seat_confirmed',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('seatStatus', 'confirmed'),
    'member-seat-confirmed-' || invitation_record.id::text
  );

  result := jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
  return result;
end;
$$;

revoke all on function public.confirm_event_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_event_invitation(uuid)
  to authenticated;
