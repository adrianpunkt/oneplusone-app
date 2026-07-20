-- Members who leave a waitlist may apply again while RSVP remains open.
-- Keep credit-ledger cycles append-only so a refunded balance-waitlist credit
-- is reserved again if the member reapplies.

create or replace function public.event_invitation_has_credit_debit(
  p_invitation_id uuid,
  p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(entries.delta), 0) < 0
  from public.credit_ledger_entries as entries
  where entries.member_id = p_member_id
    and entries.reason in (
      'event_confirmation',
      'event_balance_waitlist_refund'
    )
    and entries.source_type = 'event_invitation'
    and (
      entries.source_id = p_invitation_id::text
      or entries.source_id like p_invitation_id::text || ':reservation:%'
    );
$$;

create or replace function public.ensure_event_invitation_credit_debit(
  p_event_id uuid,
  p_invitation_id uuid,
  p_member_id uuid,
  p_notes text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  credit_balance integer;
  reservation_count integer;
  ledger_source_id text;
begin
  if public.event_invitation_has_credit_debit(
    p_invitation_id,
    p_member_id
  ) then
    return false;
  end if;

  select * into event_record
  from public.events
  where id = p_event_id;

  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries
  where member_id = p_member_id;

  if credit_balance < event_record.credit_cost then
    raise exception 'You do not have enough credits for this event.'
      using errcode = '22023';
  end if;

  select count(*)::integer into reservation_count
  from public.credit_ledger_entries as entries
  where entries.member_id = p_member_id
    and entries.reason = 'event_confirmation'
    and entries.source_type = 'event_invitation'
    and (
      entries.source_id = p_invitation_id::text
      or entries.source_id like p_invitation_id::text || ':reservation:%'
    );

  ledger_source_id := case
    when reservation_count = 0 then p_invitation_id::text
    else p_invitation_id::text || ':reservation:' || (reservation_count + 1)::text
  end;

  perform public.grant_member_credit(
    p_member_id,
    -event_record.credit_cost,
    'event_confirmation',
    'event_invitation',
    ledger_source_id,
    null,
    p_notes,
    now()
  );

  return true;
end;
$$;

create or replace function public.refund_event_balance_waitlist_credit(
  p_event_id uuid,
  p_invitation_id uuid,
  p_member_id uuid,
  p_notes text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_credit_cost integer;
  ledger_source_id text;
begin
  if not public.event_invitation_has_credit_debit(
    p_invitation_id,
    p_member_id
  ) then
    return false;
  end if;

  select debits.source_id into ledger_source_id
  from public.credit_ledger_entries as debits
  where debits.member_id = p_member_id
    and debits.reason = 'event_confirmation'
    and debits.source_type = 'event_invitation'
    and (
      debits.source_id = p_invitation_id::text
      or debits.source_id like p_invitation_id::text || ':reservation:%'
    )
    and not exists (
      select 1
      from public.credit_ledger_entries as refunds
      where refunds.member_id = debits.member_id
        and refunds.reason = 'event_balance_waitlist_refund'
        and refunds.source_type = debits.source_type
        and refunds.source_id = debits.source_id
    )
  order by debits.created_at desc, debits.id desc
  limit 1;

  if ledger_source_id is null then
    return false;
  end if;

  select credit_cost into event_credit_cost
  from public.events
  where id = p_event_id;

  if event_credit_cost is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  perform public.grant_member_credit(
    p_member_id,
    event_credit_cost,
    'event_balance_waitlist_refund',
    'event_invitation',
    ledger_source_id,
    null,
    p_notes,
    now()
  );

  return true;
end;
$$;

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
  reapplication_source_id uuid;
  waitlist_delivery_key text;
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

  if invitation_record.seat_status = 'confirmed'
    or (
      invitation_record.seat_status = 'waitlisted'
      and invitation_record.response_status = 'accepted'
    ) then
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

  if is_reapplication then
    select cancellations.id into reapplication_source_id
    from public.event_reservation_cancellations as cancellations
    where cancellations.invitation_id = invitation_record.id
    order by cancellations.created_at desc, cancellations.id desc
    limit 1;

    if reapplication_source_id is null then
      select declines.id into reapplication_source_id
      from public.event_invitation_declines as declines
      where declines.invitation_id = invitation_record.id
      order by declines.created_at desc, declines.id desc
      limit 1;
    end if;
  end if;

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

    if is_reapplication then
      update public.event_invitation_declines
      set follow_up_status = 'resolved',
          reviewed_at = coalesce(reviewed_at, now())
      where invitation_id = invitation_record.id
        and follow_up_status <> 'resolved';
    end if;

    waitlist_delivery_key := case
      when is_reapplication then
        'member-waitlist-reapply-' || waitlist_reason_value || '-' ||
        coalesce(reapplication_source_id, invitation_record.id)::text
      else
        'member-waitlist-' || waitlist_reason_value || '-' ||
        invitation_record.id::text
    end;

    delivery_id := public.queue_event_email_delivery(
      event_record.id,
      invitation_record.id,
      current_member_id_value,
      null,
      current_member_id_value,
      null,
      case
        when waitlist_reason_value = 'balance' then 'waitlist_balance'
        else 'waitlist_capacity'
      end,
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object(
          'seatStatus', 'waitlisted',
          'waitlistReason', waitlist_reason_value
        ),
      waitlist_delivery_key
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
    raise exception 'You do not have enough credits to confirm this event.'
      using errcode = '22023';
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

revoke all on function public.event_invitation_has_credit_debit(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ensure_event_invitation_credit_debit(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.refund_event_balance_waitlist_credit(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.confirm_event_invitation(uuid)
  from public, anon, authenticated;

grant execute on function public.confirm_event_invitation(uuid)
  to authenticated;
