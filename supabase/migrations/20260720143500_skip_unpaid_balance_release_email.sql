-- Pending members who never paid have no reserved credit. Close their balance
-- waitlist entry at event confirmation, but do not send the credit-refund email.

create or replace function public.confirm_event_and_release_details(
  p_event_id uuid,
  p_venue_name text,
  p_venue_address text,
  p_restaurant_image_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_event_instructions text,
  p_member_notes text,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  invitation_record public.event_invitations%rowtype;
  confirmed_count_value integer;
  released_balance_count integer := 0;
  refunded_balance_count integer := 0;
  credit_refunded boolean;
  transitioned_value boolean := false;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'confirm_event_and_release_details', p_admin_id, null,
    p_idempotency_key,
    jsonb_build_object(
      'startsAt', p_starts_at, 'endsAt', p_ends_at,
      'hasVenue', nullif(btrim(p_venue_name), '') is not null,
      'hasAddress', nullif(btrim(p_venue_address), '') is not null
    )
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  perform 1 from public.event_invitations
  where event_id = p_event_id order by id for update;
  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'inviting' then
    raise exception 'Only an inviting event can release confirmation.' using errcode = '22023';
  end if;
  if nullif(btrim(p_venue_name), '') is null
    or nullif(btrim(p_venue_address), '') is null
    or p_starts_at is null
    or p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Final event time and venue details are required.' using errcode = '22023';
  end if;

  select count(*)::integer into confirmed_count_value
  from public.event_invitations
  where event_id = event_record.id and seat_status = 'confirmed';
  if confirmed_count_value < event_record.minimum_confirmed_count then
    raise exception 'The event has not reached its minimum confirmed count.' using errcode = '23514';
  end if;

  update public.events
  set status = 'confirmed', venue_name = btrim(p_venue_name),
      venue_address = btrim(p_venue_address),
      restaurant_image_url = nullif(btrim(p_restaurant_image_url), ''),
      starts_at = p_starts_at, ends_at = p_ends_at,
      event_instructions = nullif(btrim(p_event_instructions), ''),
      member_notes = nullif(btrim(p_member_notes), ''),
      venue_confirmed_at = now(), confirmation_released_at = now(),
      updated_at = now()
  where id = event_record.id returning * into event_record;
  transitioned_value := true;

  perform public.refresh_event_summary_snapshot(event_record.id, 'confirmed', action_id);

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id and seat_status = 'confirmed'
    order by created_at, id
  loop
    perform public.queue_event_email_delivery(
      event_record.id, invitation_record.id, invitation_record.member_id,
      p_admin_id, null, action_id, 'event_confirmed',
      public.event_frozen_payload(event_record.id, invitation_record.id),
      'event-confirmed-' || event_record.id::text || '-' || invitation_record.id::text
    );
    delivery_count_value := delivery_count_value + 1;
  end loop;

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id
      and response_status = 'accepted'
      and seat_status = 'waitlisted'
      and waitlist_reason = 'balance'
    order by priority_at asc nulls last, created_at, id
  loop
    credit_refunded := public.refund_event_balance_waitlist_credit(
      event_record.id,
      invitation_record.id,
      invitation_record.member_id,
      'Returned because the event was confirmed without the balancing participant.'
    );

    update public.event_invitations
    set seat_status = 'cancelled',
        waitlist_reason = null,
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    where id = invitation_record.id;

    released_balance_count := released_balance_count + 1;
    if credit_refunded then
      perform public.queue_event_email_delivery(
        event_record.id, invitation_record.id, invitation_record.member_id,
        p_admin_id, null, action_id, 'waitlist_balance_released',
        public.event_frozen_payload(event_record.id, invitation_record.id)
          || jsonb_build_object(
            'creditRefunded', true,
            'releaseReason', 'balance_not_completed'
          ),
        'balance-release-' || event_record.id::text || '-' || invitation_record.id::text
      );
      refunded_balance_count := refunded_balance_count + 1;
      delivery_count_value := delivery_count_value + 1;
    end if;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'confirmed', 'transitioned', transitioned_value,
    'confirmedCount', confirmed_count_value,
    'releasedBalanceWaitlistCount', released_balance_count,
    'refundedBalanceCreditCount', refunded_balance_count,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

grant execute on function public.confirm_event_and_release_details(
  uuid, text, text, text, timestamptz, timestamptz, text, text, uuid, text, text
) to authenticated, service_role;
