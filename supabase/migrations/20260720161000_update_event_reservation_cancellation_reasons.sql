-- Use the shorter member-facing cancellation list while retaining historical
-- values already stored before this change.
alter table public.event_reservation_cancellations
  drop constraint if exists event_reservation_cancellations_reason_check;

alter table public.event_reservation_cancellations
  add constraint event_reservation_cancellations_reason_check check (
    reason in (
      'illness',
      'schedule_changed',
      'no_longer_interested',
      'something_else',
      'work_commitment',
      'family_or_personal',
      'travel_or_transport',
      'prefer_not_to_say'
    )
  );

create or replace function public.cancel_event_confirmation(
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
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  cancellation_id uuid;
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
  previous_seat_status_value text;
  previous_waitlist_reason_value text;
  credit_outcome_value text;
  delivery_email_type text;
  delivery_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  if normalized_reason not in (
    'illness',
    'schedule_changed',
    'no_longer_interested',
    'something_else'
  ) then
    raise exception 'Choose a reason before cancelling this reservation.'
      using errcode = '22023';
  end if;

  if char_length(normalized_details) > 500 then
    raise exception 'Cancellation details must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.id is null or event_record.status in ('completed', 'cancelled') then
    raise exception 'This event confirmation can no longer be cancelled.' using errcode = '22023';
  end if;

  if invitation_record.seat_status = 'cancelled' then
    select cancellations.id into cancellation_id
    from public.event_reservation_cancellations as cancellations
    where cancellations.invitation_id = invitation_record.id
    order by cancellations.created_at desc
    limit 1;

    if cancellation_id is not null then
      select deliveries.id into delivery_id
      from public.event_email_deliveries as deliveries
      where deliveries.idempotency_key = 'member-cancellation-' || cancellation_id::text;
    end if;

    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'cancellationId', cancellation_id,
      'deliveryId', delivery_id
    );
  end if;

  previous_seat_status_value := invitation_record.seat_status;
  previous_waitlist_reason_value := invitation_record.waitlist_reason;

  if previous_seat_status_value = 'waitlisted' then
    update public.event_invitations
    set response_status = 'declined',
        seat_status = 'none',
        waitlist_reason = null,
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;

    credit_outcome_value := case
      when previous_waitlist_reason_value = 'balance'
        and exists (
          select 1
          from public.credit_ledger_entries
          where member_id = current_member_id_value
            and reason = 'event_balance_waitlist_refund'
            and source_type = 'event_invitation'
            and source_id = invitation_record.id::text
        ) then 'refunded'
      else 'not_spent'
    end;
    delivery_email_type := case
      when credit_outcome_value = 'refunded' then 'cancellation_received'
      else 'reservation_cancellation_received'
    end;
  elsif previous_seat_status_value = 'confirmed' then
    update public.event_invitations
    set response_status = 'accepted',
        seat_status = 'cancelled',
        waitlist_reason = null,
        cancelled_at = now(),
        updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;

    update public.event_attendees
    set status = 'cancelled', is_host = false, updated_at = now()
    where event_id = event_record.id and member_id = current_member_id_value;

    insert into public.event_replacements (
      event_id, cancelled_invitation_id, status, refund_eligible_at
    ) values (
      event_record.id, invitation_record.id, 'eligible', null
    ) on conflict (cancelled_invitation_id) do update
    set replacement_invitation_id = null,
        status = 'eligible',
        refund_eligible_at = null,
        replaced_at = null,
        refunded_at = null,
        actor_admin_id = null,
        action_id = null,
        updated_at = now();

    delete from public.event_hosts
    where event_id = event_record.id and member_id = current_member_id_value;

    credit_outcome_value := 'replacement_pending';
    delivery_email_type := 'reservation_cancellation_received';
  else
    raise exception 'Only confirmed or waitlisted invitations can be cancelled here.' using errcode = '22023';
  end if;

  insert into public.event_reservation_cancellations (
    invitation_id,
    event_id,
    member_id,
    previous_seat_status,
    previous_waitlist_reason,
    reason,
    details,
    initial_credit_outcome
  ) values (
    invitation_record.id,
    invitation_record.event_id,
    current_member_id_value,
    previous_seat_status_value,
    previous_waitlist_reason_value,
    normalized_reason,
    normalized_details,
    credit_outcome_value
  ) returning id into cancellation_id;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, current_member_id_value,
    null, current_member_id_value, null,
    delivery_email_type,
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object(
        'cancellationId', cancellation_id,
        'cancellationReason', normalized_reason,
        'creditOutcome', credit_outcome_value,
        'previousSeatStatus', previous_seat_status_value,
        'previousWaitlistReason', previous_waitlist_reason_value
      ),
    'member-cancellation-' || cancellation_id::text
  );

  return jsonb_build_object(
    'ok', true, 'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'cancellationId', cancellation_id,
    'cancellationReason', normalized_reason,
    'creditOutcome', credit_outcome_value,
    'deliveryId', delivery_id
  );
end;
$$;

revoke all on function public.cancel_event_confirmation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_event_confirmation(uuid, text, text)
  to authenticated;
