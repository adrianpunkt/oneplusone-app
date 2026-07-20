-- Reserve an event credit for gender-balance waitlists, promote paired members
-- without a second debit, and refund unresolved reservations exactly once.

alter table public.event_email_deliveries
  drop constraint if exists event_email_deliveries_type_check;

alter table public.event_email_deliveries
  add constraint event_email_deliveries_type_check check (email_type in (
    'invitation_member', 'invitation_pending', 'seat_confirmed',
    'waitlist_capacity', 'waitlist_balance', 'waitlist_balance_released',
    'cancellation_received', 'rsvp_reminder', 'event_confirmed',
    'event_cancelled', 'host_package', 'event_reminder',
    'replacement_refund', 'no_replacement', 'late_cancellation_notice',
    'feedback_request', 'credit_offer'
  ));

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
  select exists (
    select 1
    from public.credit_ledger_entries
    where member_id = p_member_id
      and reason = 'event_confirmation'
      and source_type = 'event_invitation'
      and source_id = p_invitation_id::text
      and delta < 0
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
begin
  if public.event_invitation_has_credit_debit(p_invitation_id, p_member_id) then
    return false;
  end if;

  if exists (
    select 1
    from public.credit_ledger_entries
    where member_id = p_member_id
      and reason = 'event_balance_waitlist_refund'
      and source_type = 'event_invitation'
      and source_id = p_invitation_id::text
  ) then
    raise exception 'This balance-waitlist reservation has already been released.'
      using errcode = '22023';
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

  perform public.grant_member_credit(
    p_member_id,
    -event_record.credit_cost,
    'event_confirmation',
    'event_invitation',
    p_invitation_id::text,
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
begin
  if not public.event_invitation_has_credit_debit(p_invitation_id, p_member_id) then
    return false;
  end if;

  if exists (
    select 1
    from public.credit_ledger_entries
    where member_id = p_member_id
      and reason = 'event_balance_waitlist_refund'
      and source_type = 'event_invitation'
      and source_id = p_invitation_id::text
  ) then
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
    p_invitation_id::text,
    null,
    p_notes,
    now()
  );

  return true;
end;
$$;

create or replace function public.enforce_event_invitation_credit_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seat_status = 'waitlisted'
    and new.waitlist_reason = 'balance'
    and new.payment_status in ('not_required', 'paid')
    and (
      old.seat_status is distinct from 'waitlisted'
      or old.waitlist_reason is distinct from 'balance'
      or old.payment_status = 'pending'
    ) then
    perform public.ensure_event_invitation_credit_debit(
      new.event_id,
      new.id,
      new.member_id,
      'Reserved while the event waits for one person to balance the group.'
    );
  end if;

  if new.seat_status = 'confirmed'
    and old.seat_status is distinct from 'confirmed' then
    perform public.ensure_event_invitation_credit_debit(
      new.event_id,
      new.id,
      new.member_id,
      'Credit used to confirm an event seat.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists zz_enforce_event_invitation_credit_transition
  on public.event_invitations;
create trigger zz_enforce_event_invitation_credit_transition
  before update on public.event_invitations
  for each row execute function public.enforce_event_invitation_credit_transition();

create or replace function public.refund_departing_balance_waitlist_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.seat_status = 'waitlisted'
    and old.waitlist_reason = 'balance'
    and old.payment_status in ('not_required', 'paid')
    and not (
      new.seat_status = 'waitlisted'
      and new.waitlist_reason = 'balance'
    )
    and new.seat_status <> 'confirmed' then
    perform public.refund_event_balance_waitlist_credit(
      old.event_id,
      old.id,
      old.member_id,
      'Returned because the gender-balance waitlist reservation was released.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists refund_departing_balance_waitlist_credit
  on public.event_invitations;
create trigger refund_departing_balance_waitlist_credit
  after update on public.event_invitations
  for each row execute function public.refund_departing_balance_waitlist_credit();

-- Convert the existing member cancellation acknowledgement into the dedicated
-- release/refund email after the ledger trigger has returned the credit.
create or replace function public.queue_event_email_delivery(
  p_event_id uuid,
  p_invitation_id uuid,
  p_member_id uuid,
  p_admin_id uuid,
  p_member_actor_id uuid,
  p_action_id uuid,
  p_email_type text,
  p_payload jsonb,
  p_idempotency_key text,
  p_due_at timestamptz default null,
  p_invitation_access_token_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_id uuid;
  delivery_locale text;
  effective_email_type text := p_email_type;
  effective_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  clean_key text := nullif(btrim(p_idempotency_key), '');
begin
  if clean_key is null or length(clean_key) > 100 then
    raise exception 'Delivery idempotency keys must be between 1 and 100 characters.'
      using errcode = '22023';
  end if;

  if p_email_type = 'cancellation_received'
    and p_invitation_id is not null
    and exists (
      select 1
      from public.credit_ledger_entries
      where member_id = p_member_id
        and reason = 'event_balance_waitlist_refund'
        and source_type = 'event_invitation'
        and source_id = p_invitation_id::text
    ) then
    effective_email_type := 'waitlist_balance_released';
    effective_payload := effective_payload || jsonb_build_object(
      'creditRefunded', true,
      'releaseReason', 'member_left'
    );
  end if;

  if not public.event_payload_is_secret_free(effective_payload) then
    raise exception 'Email payloads cannot contain bearer secrets.'
      using errcode = '22023';
  end if;

  delivery_locale := public.effective_member_locale(p_member_id);

  insert into public.event_email_deliveries (
    event_id,
    invitation_id,
    member_id,
    triggered_by_admin_id,
    triggered_by_member_id,
    triggering_action_id,
    invitation_access_token_id,
    email_type,
    locale,
    template_id,
    template_version,
    payload,
    idempotency_key,
    due_at
  ) values (
    p_event_id,
    p_invitation_id,
    p_member_id,
    p_admin_id,
    p_member_actor_id,
    p_action_id,
    p_invitation_access_token_id,
    effective_email_type,
    delivery_locale,
    effective_email_type,
    'v1',
    effective_payload,
    clean_key,
    p_due_at
  )
  on conflict (idempotency_key) do update
    set updated_at = public.event_email_deliveries.updated_at
  returning id into delivery_id;

  return delivery_id;
end;
$$;

create or replace function public.promote_event_balance_waitlist(
  p_event_id uuid,
  p_triggering_invitation_id uuid,
  p_admin_id uuid default null,
  p_action_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.event_invitations%rowtype;
  triggering_member_id uuid;
  delivery_id uuid;
  delivery_ids jsonb := '[]'::jsonb;
  promoted_count integer := 0;
begin
  select member_id into triggering_member_id
  from public.event_invitations
  where id = p_triggering_invitation_id;

  loop
    candidate := null;
    select invitations.* into candidate
    from public.event_invitations as invitations
    where invitations.event_id = p_event_id
      and invitations.response_status = 'accepted'
      and invitations.seat_status = 'waitlisted'
      and invitations.waitlist_reason = 'balance'
      and invitations.payment_status in ('not_required', 'paid')
      and public.event_invitation_has_credit_debit(
        invitations.id,
        invitations.member_id
      )
      and public.event_seat_waitlist_reason(
        p_event_id,
        invitations.member_id,
        invitations.id
      ) is null
    order by invitations.priority_at asc nulls last,
      invitations.waitlisted_at asc nulls last,
      invitations.created_at,
      invitations.id
    for update skip locked
    limit 1;

    exit when candidate.id is null;

    update public.event_invitations
    set seat_status = 'confirmed',
        waitlist_reason = null,
        confirmed_at = coalesce(confirmed_at, now()),
        updated_at = now()
    where id = candidate.id;

    insert into public.event_attendees (
      event_id, member_id, invitation_id, status, is_host, created_at, updated_at
    ) values (
      p_event_id, candidate.member_id, candidate.id,
      'confirmed', false, now(), now()
    ) on conflict (event_id, member_id) do update
    set invitation_id = excluded.invitation_id,
        status = 'confirmed',
        updated_at = now();

    delivery_id := public.queue_event_email_delivery(
      p_event_id,
      candidate.id,
      candidate.member_id,
      p_admin_id,
      case when p_admin_id is null then triggering_member_id else null end,
      p_action_id,
      'seat_confirmed',
      public.event_frozen_payload(p_event_id, candidate.id)
        || jsonb_build_object(
          'seatStatus', 'confirmed',
          'promotedFromBalanceWaitlist', true,
          'pairedByInvitationId', p_triggering_invitation_id,
          'creditWasReserved', true
        ),
      'balance-promotion-' || candidate.id::text
    );

    delivery_ids := delivery_ids || jsonb_build_array(delivery_id);
    promoted_count := promoted_count + 1;
  end loop;

  return jsonb_build_object(
    'deliveryIds', delivery_ids,
    'promotedCount', promoted_count
  );
end;
$$;

create or replace function public.promote_balance_waitlist_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id_value uuid;
  action_id_value uuid;
begin
  if pg_trigger_depth() > 1
    or coalesce(current_setting('app.skip_balance_waitlist_promotion', true), '') = 'true'
    or new.seat_status <> 'confirmed'
    or old.seat_status = 'confirmed' then
    return new;
  end if;

  admin_id_value := nullif(
    current_setting('app.event_admin_id', true), ''
  )::uuid;
  action_id_value := nullif(
    current_setting('app.event_action_id', true), ''
  )::uuid;

  perform public.promote_event_balance_waitlist(
    new.event_id,
    new.id,
    admin_id_value,
    action_id_value
  );

  return new;
end;
$$;

drop trigger if exists promote_balance_waitlist_after_confirmation
  on public.event_invitations;
create trigger promote_balance_waitlist_after_confirmation
  after update on public.event_invitations
  for each row execute function public.promote_balance_waitlist_after_confirmation();

create or replace function public.set_event_capacity(
  p_event_id uuid,
  p_capacity integer,
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
  previous_capacity integer;
  promoted_count integer := 0;
  delivery_count_value integer := 0;
  reason text;
  balance integer;
  debit_exists boolean;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'set_event_capacity', p_admin_id, null, p_idempotency_key,
    jsonb_build_object('capacity', p_capacity)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  perform 1 from public.event_invitations
  where event_id = p_event_id
  order by id
  for update;
  select * into event_record from public.events where id = p_event_id for update;

  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'Capacity can only increase while RSVP is open.' using errcode = '22023';
  end if;
  if p_capacity <= event_record.capacity or p_capacity > event_record.invitation_limit then
    raise exception 'Capacity must increase without exceeding the invitation limit.' using errcode = '22023';
  end if;

  perform set_config('app.skip_balance_waitlist_promotion', 'true', true);
  previous_capacity := event_record.capacity;
  update public.events set capacity = p_capacity, updated_at = now()
  where id = event_record.id returning * into event_record;

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id
      and seat_status = 'waitlisted'
    order by priority_at asc nulls last, created_at, id
  loop
    reason := public.event_seat_waitlist_reason(
      event_record.id, invitation_record.member_id, invitation_record.id
    );
    debit_exists := public.event_invitation_has_credit_debit(
      invitation_record.id, invitation_record.member_id
    );
    select coalesce(sum(delta), 0)::integer into balance
    from public.credit_ledger_entries
    where member_id = invitation_record.member_id;

    if reason is null
      and (debit_exists or balance >= event_record.credit_cost) then
      perform public.ensure_event_invitation_credit_debit(
        event_record.id,
        invitation_record.id,
        invitation_record.member_id,
        case
          when debit_exists then 'Credit already reserved on the gender-balance waitlist.'
          else 'Spent when promoted after a founder capacity increase.'
        end
      );
      update public.event_invitations
      set response_status = 'accepted', seat_status = 'confirmed',
          waitlist_reason = null, confirmed_at = coalesce(confirmed_at, now()),
          updated_at = now()
      where id = invitation_record.id;
      insert into public.event_attendees (
        event_id, member_id, invitation_id, status, is_host, created_at, updated_at
      ) values (
        event_record.id, invitation_record.member_id, invitation_record.id,
        'confirmed', false, now(), now()
      ) on conflict (event_id, member_id) do update
      set invitation_id = excluded.invitation_id,
          status = 'confirmed', updated_at = now();
      perform public.queue_event_email_delivery(
        event_record.id, invitation_record.id, invitation_record.member_id,
        p_admin_id, null, action_id, 'seat_confirmed',
        public.event_frozen_payload(event_record.id, invitation_record.id)
          || jsonb_build_object(
            'promotedAfterCapacityIncrease', true,
            'creditWasReserved', debit_exists
          ),
        'capacity-promotion-' || action_id::text || '-' || invitation_record.id::text
      );
      promoted_count := promoted_count + 1;
      delivery_count_value := delivery_count_value + 1;
    end if;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'capacity', event_record.capacity, 'previousCapacity', previous_capacity,
    'promotedCount', promoted_count, 'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

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

revoke all on function public.event_invitation_has_credit_debit(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ensure_event_invitation_credit_debit(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.refund_event_balance_waitlist_credit(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.enforce_event_invitation_credit_transition()
  from public, anon, authenticated;
revoke all on function public.refund_departing_balance_waitlist_credit()
  from public, anon, authenticated;
revoke all on function public.promote_event_balance_waitlist(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.promote_balance_waitlist_after_confirmation()
  from public, anon, authenticated;

grant execute on function public.set_event_capacity(uuid, integer, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.confirm_event_and_release_details(
  uuid, text, text, text, timestamptz, timestamptz, text, text, uuid, text, text
) to authenticated, service_role;
