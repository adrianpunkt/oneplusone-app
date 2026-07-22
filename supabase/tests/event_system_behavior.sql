-- Run against an isolated database after all app and ops migrations:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/event_system_behavior.sql
-- The transaction rolls back every fixture.

begin;

do $test$
begin
  if public.event_gender_balance_requires_waitlist('male', 0, 0, 8, false)
    or public.event_gender_balance_requires_waitlist('male', 0, 1, 8, false)
    or public.event_gender_balance_requires_waitlist('male', 0, 2, 8, false) then
    raise exception 'The first three men must not be balance-waitlisted.';
  end if;

  if not public.event_gender_balance_requires_waitlist('male', 0, 3, 8, false)
    or not public.event_gender_balance_requires_waitlist('male', 3, 3, 8, false) then
    raise exception 'A fourth man must be balance-waitlisted unless men are behind.';
  end if;

  if public.event_gender_balance_requires_waitlist('male', 4, 3, 8, false) then
    raise exception 'A fourth man must be admitted when he balances four women.';
  end if;

  if public.event_gender_balance_requires_waitlist('male', 3, 3, 8, true) then
    raise exception 'The counterpart of an eligible balance waiter must be admitted.';
  end if;

  if public.event_gender_balance_requires_waitlist('female', 0, 0, 8, false)
    or public.event_gender_balance_requires_waitlist('female', 0, 2, 8, false)
    or not public.event_gender_balance_requires_waitlist('female', 3, 3, 8, false)
    or public.event_gender_balance_requires_waitlist('female', 3, 4, 8, false) then
    raise exception 'The three-person balance threshold must be symmetric.';
  end if;

  if public.event_gender_balance_requires_waitlist('male', 0, 3, 10, false)
    or public.event_gender_balance_requires_waitlist('male', 3, 3, 10, false)
    or public.event_gender_balance_requires_waitlist('female', 3, 0, 12, false)
    or not public.event_gender_balance_requires_waitlist('male', 4, 4, 10, false)
    or not public.event_gender_balance_requires_waitlist('female', 4, 4, 12, false)
    or public.event_gender_balance_requires_waitlist('male', 4, 4, 10, true) then
    raise exception 'Capacity 10 and 12 must use a four-person automatic threshold and paired admission.';
  end if;
end;
$test$;

do $test$
declare
  balance_event_id uuid := gen_random_uuid();
  member_ids uuid[] := array[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];
  user_ids uuid[] := array[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];
  candidate_invitation_id uuid;
  counterpart_invitation_id uuid;
  index_value integer;
begin
  for index_value in 1..8 loop
    insert into auth.users (id, email)
    values (
      user_ids[index_value],
      'balance-pair-' || index_value::text || '@example.com'
    );

    insert into public.members (id, email, membership_status)
    values (
      member_ids[index_value],
      'balance-pair-' || index_value::text || '@example.com',
      'active'
    );

    insert into public.profile_registrations (
      user_id, status, source_path, profile_json, contact_email,
      terms_accepted_at, submitted_at
    ) values (
      user_ids[index_value],
      'submitted',
      '/story',
      jsonb_build_object(
        'profile.gender',
        case when index_value in (1, 2, 3, 7) then 'Man' else 'Woman' end
      ),
      'balance-pair-' || index_value::text || '@example.com',
      now(),
      now()
    );
  end loop;

  insert into public.events (
    id, title, event_format, status, starts_at, ends_at, timezone, city,
    capacity, invitation_limit, credit_cost, minimum_confirmed_count,
    minimum_run_count, gender_balance_enabled, rsvp_deadline_at,
    invitations_opened_at
  ) values (
    balance_event_id, 'Balance-pair regression', 'dinner', 'inviting',
    now() + interval '2 days', now() + interval '2 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 8, 8, 1, 1, 1, true,
    now() + interval '1 day', now()
  );

  for index_value in 1..6 loop
    insert into public.event_invitations (
      event_id, member_id, response_status, seat_status, payment_status,
      member_status_at_invite, priority_at, responded_at, confirmed_at
    ) values (
      balance_event_id, member_ids[index_value], 'accepted', 'confirmed',
      'not_required', 'active', now(), now(), now()
    );
  end loop;

  perform public.grant_member_credit(
    member_ids[7], 1, 'membership_join_credit', 'test_fixture',
    member_ids[7]::text, null, 'Balance-pair regression fixture.', now()
  );
  insert into public.event_invitations (
    event_id, member_id, response_status, seat_status, payment_status,
    member_status_at_invite, priority_at, responded_at
  ) values (
    balance_event_id, member_ids[7], 'accepted', 'none', 'not_required',
    'active', now() - interval '1 minute', now()
  ) returning id into candidate_invitation_id;
  update public.event_invitations
  set seat_status = 'waitlisted', waitlist_reason = 'balance',
      waitlisted_at = now(), updated_at = now()
  where id = candidate_invitation_id;

  if not public.event_invitation_has_credit_debit(
    candidate_invitation_id, member_ids[7]
  ) then
    raise exception 'The balance waiter did not reserve a credit.';
  end if;

  perform public.grant_member_credit(
    member_ids[8], 1, 'membership_join_credit', 'test_fixture',
    member_ids[8]::text, null, 'Balance-pair regression fixture.', now()
  );
  insert into public.event_invitations (
    event_id, member_id, response_status, seat_status, payment_status,
    member_status_at_invite, priority_at, responded_at
  ) values (
    balance_event_id, member_ids[8], 'accepted', 'none', 'not_required',
    'active', now(), now()
  ) returning id into counterpart_invitation_id;

  if public.event_seat_waitlist_reason(
    balance_event_id, member_ids[8], counterpart_invitation_id
  ) is not null then
    raise exception 'The counterpart of the balance waiter was not admitted.';
  end if;

  update public.event_invitations
  set seat_status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = counterpart_invitation_id;

  if (select seat_status from public.event_invitations
      where id = candidate_invitation_id) <> 'confirmed'
    or (select count(*) from public.event_invitations
        where event_id = balance_event_id and seat_status = 'confirmed') <> 8
    or not exists (
      select 1 from public.event_attendees
      where invitation_id = candidate_invitation_id and status = 'confirmed'
    )
    or not exists (
      select 1 from public.event_email_deliveries
      where invitation_id = candidate_invitation_id
        and email_type = 'seat_confirmed'
    )
    or exists (
      select 1 from public.event_email_deliveries
      where invitation_id = candidate_invitation_id
        and email_type = 'waitlist_balance_released'
    )
    or exists (
      select 1 from public.credit_ledger_entries
      where member_id = member_ids[7]
        and reason = 'event_balance_waitlist_refund'
    ) then
    raise exception 'The completed gender-balance pair was not promoted cleanly.';
  end if;
end;
$test$;

set local role service_role;

do $test$
declare
  admin_id uuid := gen_random_uuid();
  group_id uuid := gen_random_uuid();
  member_ids uuid[] := array[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];
  prepare_result jsonb;
  prepare_retry jsonb;
  open_result jsonb;
  open_retry jsonb;
  confirm_result jsonb;
  cancel_result jsonb;
  token_result jsonb;
  refresh_token_result jsonb;
  refresh_result jsonb;
  refresh_retry jsonb;
  refresh_claim jsonb;
  session_result jsonb;
  payment_result jsonb;
  payment_retry jsonb;
  resume_result jsonb;
  completion_result jsonb;
  completion_retry jsonb;
  transition_retry jsonb;
  prepared_event_id uuid;
  pending_invitation_id uuid;
  payment_attempt_id uuid;
  index_value integer;
  raw_token text;
  raw_session text;
  priority_before timestamptz;
  late_event_id uuid := gen_random_uuid();
  late_pending_member_id uuid := gen_random_uuid();
  late_seated_member_id uuid := gen_random_uuid();
  late_invitation_id uuid;
  late_token jsonb;
  late_session jsonb;
  late_payment jsonb;
  late_attempt_id uuid;
  late_priority timestamptz;
  replacement_event_id uuid := gen_random_uuid();
  cancelled_invitation_id uuid;
  replacement_invitation_id uuid;
  no_replacement_invitation_id uuid;
  replacement_result jsonb;
  replacement_retry jsonb;
  credit_offer_result jsonb;
  test_city_id bigint;
begin
  insert into ops.ops_admin_users (id, email, role, status)
  values (admin_id, 'event-contract-test@example.com', 'owner', 'active');

  for index_value in 1..6 loop
    insert into public.members (id, email, membership_status)
    values (
      member_ids[index_value],
      'event-member-' || index_value::text || '@example.com',
      case when index_value = 6 then 'pending' else 'active' end
    );
  end loop;

  select id into test_city_id
  from public.cities
  where ascii_name = 'Lisbon' and country_code = 'PT'
  order by population desc nulls last, id
  limit 1;

  insert into ops.matching_groups (
    id, name, city_id, location, language, target_men, target_women,
    model, status, weekend_start, created_by, updated_by
  ) values (
    group_id, 'Event contract test', test_city_id, 'Lisbon', 'en', 4, 4,
    'practical', 'fixed', date '2026-07-25', admin_id, admin_id
  );
  for index_value in 1..6 loop
    insert into ops.matching_group_members (group_id, member_id, display_order)
    values (group_id, member_ids[index_value], index_value);
  end loop;

  prepare_result := public.prepare_event_from_matching_group(
    group_id, 'Contract event', 'Test description', '{}'::jsonb,
    'dinner', now() + interval '3 days', now() + interval '3 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 'en', 6, 6,
    now(), now() + interval '1 day', 5, 5,
    admin_id, 'event-contract-test@example.com', 'test-prepare-event'
  );
  prepare_retry := public.prepare_event_from_matching_group(
    group_id, 'Contract event', 'Test description', '{}'::jsonb,
    'dinner', now() + interval '3 days', now() + interval '3 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 'en', 6, 6,
    now(), now() + interval '1 day', 5, 5,
    admin_id, 'event-contract-test@example.com', 'test-prepare-event'
  );
  prepared_event_id := (prepare_result ->> 'eventId')::uuid;
  if prepare_result <> prepare_retry
    or (select count(*) from public.events where matching_group_id = group_id) <> 1
    or (select count(*) from public.event_invitations where event_id = prepared_event_id) <> 6 then
    raise exception 'prepare_event_from_matching_group is not idempotent.';
  end if;

  open_result := public.open_event_invitations(
    prepared_event_id, admin_id, 'event-contract-test@example.com', 'test-open-event'
  );
  open_retry := public.open_event_invitations(
    prepared_event_id, admin_id, 'event-contract-test@example.com', 'test-open-event'
  );
  if open_result <> open_retry
    or (select status from public.events where id = prepared_event_id) <> 'inviting'
    or (select count(*) from public.event_email_deliveries where event_id = prepared_event_id) <> 6
    or (select count(*) from public.event_email_deliveries where event_id = prepared_event_id)
      <> (select count(distinct idempotency_key) from public.event_email_deliveries where event_id = prepared_event_id) then
    raise exception 'Invitation open transition or delivery uniqueness failed.';
  end if;

  select id into pending_invitation_id
  from public.event_invitations
  where event_id = prepared_event_id and member_id = member_ids[6];
  update public.events
  set gender_balance_enabled = false
  where id = prepared_event_id;
  for index_value in 1..5 loop
    perform public.grant_member_credit(
      member_ids[index_value], 1, 'membership_join_credit', 'test_fixture',
      member_ids[index_value]::text, null,
      'Event contract confirmation fixture.', now()
    );
  end loop;
  update public.event_invitations
  set response_status = 'accepted', seat_status = 'confirmed', confirmed_at = now()
  where event_id = prepared_event_id and member_id = any(member_ids[1:5]);

  token_result := public.create_event_invitation_access_token(
    pending_invitation_id,
    (open_result ->> 'actionId')::uuid,
    60
  );
  raw_token := token_result ->> 'token';
  if exists (
    select 1 from public.event_invitation_access_tokens
    where id = (token_result ->> 'tokenId')::uuid and token_hash = raw_token
  ) then
    raise exception 'A raw invitation token was stored.';
  end if;
  if (token_result ->> 'expiresAt')::timestamptz
    > (select rsvp_deadline_at from public.events where id = prepared_event_id) then
    raise exception 'Invitation token expiry exceeded the RSVP deadline.';
  end if;

  session_result := public.claim_event_invitation_access_token(raw_token, 60);
  raw_session := session_result ->> 'sessionToken';
  if exists (
    select 1 from public.event_invitation_sessions
    where session_hash = raw_session
  ) then
    raise exception 'A raw invitation session was stored.';
  end if;

  refresh_token_result := public.create_event_invitation_access_token(
    pending_invitation_id,
    (open_result ->> 'actionId')::uuid,
    60
  );
  update public.event_invitation_access_tokens
  set expires_at = now() - interval '1 second'
  where id = (refresh_token_result ->> 'tokenId')::uuid;
  refresh_result := public.refresh_expired_event_invitation_link(
    refresh_token_result ->> 'token'
  );
  refresh_retry := public.refresh_expired_event_invitation_link(
    refresh_token_result ->> 'token'
  );
  if refresh_result ->> 'status' <> 'queued'
    or (refresh_result ->> 'deliveryId') <> (refresh_retry ->> 'deliveryId')
    or (select count(*) from public.event_email_deliveries
        where payload @> jsonb_build_object(
          'refreshSourceAccessId', refresh_token_result ->> 'tokenId'
        )) <> 1 then
    raise exception 'Expired invitation replacement was not queued exactly once.';
  end if;
  refresh_claim := public.claim_event_email_delivery(
    (refresh_result ->> 'deliveryId')::uuid,
    null,
    'test-invitation-pending-template'
  );
  if nullif(refresh_claim ->> 'invitationAccessToken', '') is null
    or (select expires_at from public.event_invitation_access_tokens
        where id = (refresh_claim ->> 'invitationAccessTokenId')::uuid)
      > (select rsvp_deadline_at from public.events where id = prepared_event_id) then
    raise exception 'Replacement invitation did not mint a deadline-capped link.';
  end if;

  payment_result := public.begin_event_invitation_payment(raw_session, 'test-valid-hold');
  payment_retry := public.begin_event_invitation_payment(raw_session, 'test-valid-hold');
  payment_attempt_id := (payment_result ->> 'paymentAttemptId')::uuid;
  priority_before := (payment_result ->> 'priorityAt')::timestamptz;
  if payment_result <> payment_retry
    or payment_result ->> 'status' <> 'checkout_required'
    or (select expires_at - created_at from public.event_seat_holds where id = (payment_result ->> 'holdId')::uuid)
      <> interval '10 minutes' then
    raise exception 'Seat hold creation or payment idempotency failed.';
  end if;

  perform public.attach_event_checkout_session(payment_attempt_id, 'cs_test_valid_hold');
  completion_result := public.complete_event_invitation_payment(
    payment_attempt_id, 'cs_test_valid_hold', 'pi_test_valid_hold', 'evt_test_valid_hold'
  );
  completion_retry := public.complete_event_invitation_payment(
    payment_attempt_id, 'cs_test_valid_hold', 'pi_test_valid_hold', 'evt_test_valid_hold'
  );
  if completion_result <> completion_retry
    or completion_result ->> 'status' <> 'ready_to_confirm'
    or (select priority_at from public.event_invitations where id = pending_invitation_id) <> priority_before
    or (select response_status from public.event_invitations where id = pending_invitation_id) <> 'invited'
    or (select seat_status from public.event_invitations where id = pending_invitation_id) <> 'none'
    or (select count(*) from public.credit_ledger_entries
        where member_id = member_ids[6] and reason = 'membership_join_credit') <> 1
    or (select count(*) from public.credit_ledger_entries
        where member_id = member_ids[6] and reason = 'event_confirmation') <> 0
    or not exists (
      select 1 from public.event_seat_holds
      where invitation_id = pending_invitation_id
        and status = 'active'
        and expires_at > now()
    ) then
    raise exception 'Valid-hold payment did not preserve an exactly-once in-app resume.';
  end if;

  resume_result := public.prepare_active_event_invitation_resume(raw_session);
  if resume_result ->> 'status' <> 'member_active'
    or resume_result ->> 'invitationId' <> pending_invitation_id::text then
    raise exception 'Active-member invitation resume was not prepared.';
  end if;

  confirm_result := public.confirm_event_and_release_details(
    prepared_event_id, 'Test restaurant', 'Test address', 'https://example.com/restaurant.jpg',
    now() + interval '3 days', now() + interval '3 days 2 hours',
    'Arrive five minutes early.', 'Member note', admin_id,
    'event-contract-test@example.com', 'test-confirm-event'
  );
  transition_retry := public.confirm_event_and_release_details(
    prepared_event_id, 'Test restaurant', 'Test address', 'https://example.com/restaurant.jpg',
    now() + interval '3 days', now() + interval '3 days 2 hours',
    'Arrive five minutes early.', 'Member note', admin_id,
    'event-contract-test@example.com', 'test-confirm-event'
  );
  if confirm_result <> transition_retry
    or confirm_result ->> 'status' <> 'confirmed'
    or (select confirmation_released_at is null from public.events where id = prepared_event_id) then
    raise exception 'Founder confirmation transition failed.';
  end if;

  cancel_result := public.cancel_event(
    prepared_event_id, 'Test cancellation', admin_id,
    'event-contract-test@example.com', 'test-cancel-event'
  );
  transition_retry := public.cancel_event(
    prepared_event_id, 'Test cancellation', admin_id,
    'event-contract-test@example.com', 'test-cancel-event'
  );
  if cancel_result <> transition_retry
    or cancel_result ->> 'status' <> 'cancelled'
    or (select count(*) from public.credit_ledger_entries
        where member_id = member_ids[6] and reason = 'event_cancelled_refund') <> 0 then
    raise exception 'Founder cancellation or exactly-once refund failed.';
  end if;

  insert into public.members (id, email, membership_status)
  values
    (late_pending_member_id, 'late-pending@example.com', 'pending'),
    (late_seated_member_id, 'late-seated@example.com', 'active');
  insert into public.events (
    id, title, event_format, status, starts_at, ends_at, timezone, city,
    capacity, invitation_limit, credit_cost, minimum_confirmed_count,
    minimum_run_count, rsvp_deadline_at, invitations_opened_at
  ) values (
    late_event_id, 'Late payment event', 'dinner', 'inviting',
    now() + interval '2 days', now() + interval '2 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 1, 2, 1, 1, 1,
    now() + interval '1 day', now()
  );
  insert into public.event_invitations (
    event_id, member_id, member_status_at_invite, payment_status
  ) values (
    late_event_id, late_pending_member_id, 'pending', 'pending'
  ) returning id into late_invitation_id;

  late_token := public.create_event_invitation_access_token(late_invitation_id, null, 60);
  late_session := public.claim_event_invitation_access_token(late_token ->> 'token', 60);
  late_payment := public.begin_event_invitation_payment(
    late_session ->> 'sessionToken', 'test-expired-hold'
  );
  late_attempt_id := (late_payment ->> 'paymentAttemptId')::uuid;
  late_priority := (late_payment ->> 'priorityAt')::timestamptz;
  perform public.attach_event_checkout_session(late_attempt_id, 'cs_test_expired_hold');
  update public.event_seat_holds
  set expires_at = now() - interval '1 second'
  where id = (late_payment ->> 'holdId')::uuid;
  insert into public.event_invitations (
    event_id, member_id, response_status, seat_status,
    payment_status, member_status_at_invite, priority_at, confirmed_at
  ) values (
    late_event_id, late_seated_member_id, 'accepted', 'confirmed',
    'not_required', 'active', now(), now()
  );

  completion_result := public.complete_event_invitation_payment(
    late_attempt_id, 'cs_test_expired_hold', 'pi_test_expired_hold', 'evt_test_expired_hold'
  );
  if completion_result ->> 'status' <> 'ready_to_confirm'
    or completion_result ->> 'waitlistReason' is not null
    or not (completion_result ->> 'creditAvailable')::boolean
    or (select priority_at from public.event_invitations where id = late_invitation_id) <> late_priority
    or (select response_status from public.event_invitations where id = late_invitation_id) <> 'invited'
    or (select seat_status from public.event_invitations where id = late_invitation_id) <> 'none'
    or (select count(*) from public.credit_ledger_entries
        where member_id = late_pending_member_id and reason = 'event_confirmation') <> 0 then
    raise exception 'Expired-hold late payment did not preserve the resumable priority and credit.';
  end if;

  update public.events
  set rsvp_deadline_at = now() - interval '1 second'
  where id = late_event_id;
  refresh_result := public.refresh_expired_event_invitation_link(late_token ->> 'token');
  if refresh_result ->> 'status' <> 'deadline_passed' then
    raise exception 'Expired invitation replacement ignored the RSVP deadline.';
  end if;
  payment_result := public.begin_event_invitation_payment(
    late_session ->> 'sessionToken', 'test-stored-deadline'
  );
  if payment_result ->> 'status' <> 'closed'
    or (select payment_status from public.event_invitations where id = late_invitation_id) <> 'paid' then
    raise exception 'Stored RSVP deadline was not enforced safely.';
  end if;

  insert into public.events (
    id, title, event_format, status, starts_at, ends_at, timezone, city,
    capacity, invitation_limit, credit_cost, minimum_confirmed_count,
    minimum_run_count, rsvp_deadline_at, invitations_opened_at,
    confirmation_released_at
  ) values (
    replacement_event_id, 'Replacement test', 'dinner', 'confirmed',
    now() + interval '2 days', now() + interval '2 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 2, 3, 1, 1, 1,
    now() + interval '1 day', now(), now()
  );
  insert into public.event_invitations (
    event_id, member_id, response_status, seat_status, payment_status,
    member_status_at_invite, priority_at, confirmed_at, cancelled_at
  ) values (
    replacement_event_id, member_ids[1], 'accepted', 'cancelled',
    'not_required', 'active', now() - interval '1 hour', now() - interval '1 hour', now()
  ) returning id into cancelled_invitation_id;
  insert into public.event_invitations (
    event_id, member_id, response_status, seat_status, payment_status,
    member_status_at_invite, priority_at, confirmed_at
  ) values (
    replacement_event_id, member_ids[2], 'accepted', 'confirmed',
    'not_required', 'active', now(), now()
  ) returning id into replacement_invitation_id;
  insert into public.event_invitations (
    event_id, member_id, response_status, seat_status, payment_status,
    member_status_at_invite, priority_at, confirmed_at, cancelled_at
  ) values (
    replacement_event_id, member_ids[3], 'accepted', 'cancelled',
    'not_required', 'active', now(), now(), now()
  ) returning id into no_replacement_invitation_id;
  perform public.grant_member_credit(
    member_ids[1], -1, 'event_confirmation', 'event_invitation',
    cancelled_invitation_id::text, null, 'Replacement fixture.', now()
  );

  replacement_result := public.record_event_replacement(
    cancelled_invitation_id, replacement_invitation_id, true,
    admin_id, 'event-contract-test@example.com', 'test-record-replacement'
  );
  replacement_retry := public.record_event_replacement(
    cancelled_invitation_id, replacement_invitation_id, true,
    admin_id, 'event-contract-test@example.com', 'test-record-replacement'
  );
  if replacement_result <> replacement_retry
    or not (replacement_result ->> 'creditRefunded')::boolean
    or (select count(*) from public.credit_ledger_entries
        where member_id = member_ids[1]
          and reason = 'event_waitlist_replacement_refund'
          and source_id = cancelled_invitation_id::text) <> 1
    or (select seat_status from public.event_invitations
        where id = cancelled_invitation_id) <> 'replaced' then
    raise exception 'Replacement/refund recording is not idempotent.';
  end if;

  replacement_result := public.record_event_replacement(
    no_replacement_invitation_id, null, false,
    admin_id, 'event-contract-test@example.com', 'test-no-replacement'
  );
  if replacement_result ->> 'status' <> 'no_replacement'
    or not exists (
      select 1 from public.event_email_deliveries
      where invitation_id = no_replacement_invitation_id
        and email_type = 'no_replacement'
    ) then
    raise exception 'The founder no-replacement decision was not recorded.';
  end if;

  update public.events
  set status = 'completed', completed_at = now()
  where id = replacement_event_id;
  update public.members
  set marketing_eligible = true
  where id in (member_ids[1], member_ids[2]);
  insert into public.event_feedback (event_id, member_id, overall_rating)
  values (replacement_event_id, member_ids[2], 5);

  credit_offer_result := public.prepare_event_email_deliveries(
    replacement_event_id, 'credit_offer', now(), admin_id,
    'event-contract-test@example.com', 'test-credit-offer-cohort'
  );
  if (credit_offer_result ->> 'deliveryCount')::integer <> 1
    or not exists (
      select 1 from public.event_email_deliveries
      where triggering_action_id = (credit_offer_result ->> 'actionId')::uuid
        and member_id = member_ids[2]
        and email_type = 'credit_offer'
    ) then
    raise exception 'Credit offer cohort must be confirmed, feedback-complete, and marketing-eligible.';
  end if;

  if exists (
    select 1 from public.event_email_deliveries
    where not public.event_payload_is_secret_free(payload)
  ) then
    raise exception 'A delivery payload contains bearer material.';
  end if;
end;
$test$;

do $test$
declare
  decline_event_id uuid := gen_random_uuid();
  brunch_event_id uuid := gen_random_uuid();
  active_member_id uuid := gen_random_uuid();
  brunch_member_id uuid := gen_random_uuid();
  pending_member_id uuid := gen_random_uuid();
  deadline_member_id uuid := gen_random_uuid();
  active_invitation_id uuid;
  brunch_invitation_id uuid;
  pending_invitation_id uuid;
  deadline_invitation_id uuid;
  active_delivery_id uuid := gen_random_uuid();
  brunch_delivery_id uuid := gen_random_uuid();
  pending_delivery_id uuid := gen_random_uuid();
  deadline_delivery_id uuid := gen_random_uuid();
  active_claim jsonb;
  brunch_claim jsonb;
  pending_claim jsonb;
  deadline_claim jsonb;
  extra_token jsonb;
  expired_token jsonb;
  resolution jsonb;
  decline_result jsonb;
  decline_retry jsonb;
  pending_hold_id uuid;
  active_raw_token text;
  brunch_raw_token text;
  pending_raw_token text;
begin
  insert into public.members (id, email, membership_status)
  values
    (active_member_id, 'scanner-decline-active@example.com', 'active'),
    (brunch_member_id, 'scanner-decline-brunch@example.com', 'active'),
    (pending_member_id, 'scanner-decline-pending@example.com', 'pending'),
    (deadline_member_id, 'scanner-decline-deadline@example.com', 'active');

  insert into public.events (
    id, title, event_format, status, starts_at, ends_at, timezone, city,
    capacity, invitation_limit, credit_cost, minimum_confirmed_count,
    minimum_run_count, rsvp_deadline_at, invitations_opened_at
  ) values (
    decline_event_id, 'Scanner-safe decline test', 'dinner', 'inviting',
    now() + interval '12 days', now() + interval '12 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 6, 6, 1, 1, 1,
    now() + interval '10 days', now()
  );
  insert into public.events (
    id, title, event_format, status, starts_at, ends_at, timezone, city,
    capacity, invitation_limit, credit_cost, minimum_confirmed_count,
    minimum_run_count, rsvp_deadline_at, invitations_opened_at
  ) values (
    brunch_event_id, 'Format-aware brunch decline test', 'brunch', 'inviting',
    now() + interval '12 days', now() + interval '12 days 2 hours',
    'Europe/Lisbon', 'Lisbon', 6, 6, 1, 1, 1,
    now() + interval '10 days', now()
  );

  insert into public.event_invitations (
    event_id, member_id, member_status_at_invite, payment_status
  ) values (
    decline_event_id, active_member_id, 'pending', 'not_required'
  ) returning id into active_invitation_id;
  insert into public.event_invitations (
    event_id, member_id, member_status_at_invite, payment_status
  ) values (
    brunch_event_id, brunch_member_id, 'active', 'not_required'
  ) returning id into brunch_invitation_id;
  insert into public.event_invitations (
    event_id, member_id, member_status_at_invite, payment_status
  ) values (
    decline_event_id, pending_member_id, 'pending', 'pending'
  ) returning id into pending_invitation_id;
  insert into public.event_invitations (
    event_id, member_id, member_status_at_invite, payment_status
  ) values (
    decline_event_id, deadline_member_id, 'active', 'not_required'
  ) returning id into deadline_invitation_id;

  insert into public.event_email_deliveries (
    id, event_id, invitation_id, member_id, triggered_by_member_id,
    email_type, locale, template_id, template_version, payload,
    idempotency_key
  ) values
    (
      active_delivery_id, decline_event_id, active_invitation_id,
      active_member_id, active_member_id, 'invitation_member', 'en',
      'invitation_member', 'v1', '{}'::jsonb,
      'scanner-decline-active-delivery'
    ),
    (
      brunch_delivery_id, brunch_event_id, brunch_invitation_id,
      brunch_member_id, brunch_member_id, 'invitation_member', 'en',
      'invitation_member', 'v1', '{}'::jsonb,
      'scanner-decline-brunch-delivery'
    ),
    (
      pending_delivery_id, decline_event_id, pending_invitation_id,
      pending_member_id, pending_member_id, 'invitation_pending', 'en',
      'invitation_pending', 'v1', '{}'::jsonb,
      'scanner-decline-pending-delivery'
    ),
    (
      deadline_delivery_id, decline_event_id, deadline_invitation_id,
      deadline_member_id, deadline_member_id, 'invitation_member', 'en',
      'invitation_member', 'v1', '{}'::jsonb,
      'scanner-decline-deadline-delivery'
    );

  active_claim := public.claim_event_email_delivery(
    active_delivery_id, null, 'test-invitation-member-template'
  );
  brunch_claim := public.claim_event_email_delivery(
    brunch_delivery_id, null, 'test-invitation-member-template'
  );
  pending_claim := public.claim_event_email_delivery(
    pending_delivery_id, null, 'test-invitation-pending-template'
  );
  deadline_claim := public.claim_event_email_delivery(
    deadline_delivery_id, null, 'test-invitation-member-template'
  );
  active_raw_token := active_claim ->> 'invitationDeclineToken';
  brunch_raw_token := brunch_claim ->> 'invitationDeclineToken';
  pending_raw_token := pending_claim ->> 'invitationDeclineToken';

  if nullif(active_raw_token, '') is null
    or nullif(brunch_raw_token, '') is null
    or nullif(pending_raw_token, '') is null
    or active_claim ->> 'invitationDeclineTokenId' is null
    or pending_claim ->> 'invitationDeclineTokenId' is null
    or exists (
      select 1 from public.event_invitation_decline_tokens
      where token_hash in (active_raw_token, pending_raw_token)
    )
    or exists (
      select 1 from public.event_invitation_decline_tokens
      where id in (
        (active_claim ->> 'invitationDeclineTokenId')::uuid,
        (pending_claim ->> 'invitationDeclineTokenId')::uuid
      ) and token_hash <> public.hash_payment_resume_secret(
        case when delivery_id = active_delivery_id
          then active_raw_token else pending_raw_token end
      )
    ) then
    raise exception 'Decline claims did not return one-time raw tokens backed only by hashes.';
  end if;

  if exists (
    select 1 from public.event_invitation_decline_tokens
    where id in (
      (active_claim ->> 'invitationDeclineTokenId')::uuid,
      (pending_claim ->> 'invitationDeclineTokenId')::uuid
    ) and (
      expires_at > created_at + interval '7 days'
      or expires_at > (select rsvp_deadline_at from public.events where id = decline_event_id)
    )
  ) then
    raise exception 'Decline token expiry was not capped at seven days and the RSVP deadline.';
  end if;

  resolution := public.resolve_event_invitation_decline_token(active_raw_token);
  if resolution ->> 'status' <> 'valid'
    or resolution ->> 'eventFormat' <> 'dinner'
    or resolution ->> 'city' <> 'Lisbon'
    or resolution ?| array[
      'email', 'memberId', 'venueName', 'venueAddress',
      'profileJson', 'recipientEmail'
    ]
    or (select response_status from public.event_invitations
        where id = active_invitation_id) <> 'invited'
    or exists (
      select 1 from public.event_invitation_declines
      where invitation_id = active_invitation_id
    ) then
    raise exception 'Read-only decline-token resolution exposed private data or mutated the invitation.';
  end if;

  begin
    perform public.create_event_invitation_decline_token(
      active_delivery_id, gen_random_uuid()
    );
    raise exception 'A mismatched delivery action created a decline token.';
  exception
    when sqlstate '28000' then null;
  end;

  extra_token := public.create_event_invitation_decline_token(
    active_delivery_id, null
  );
  update public.event_invitation_decline_tokens
  set used_at = now()
  where id = (extra_token ->> 'tokenId')::uuid;
  if public.resolve_event_invitation_decline_token(extra_token ->> 'token')
      ->> 'status' <> 'unavailable' then
    raise exception 'A consumed decline token remained available.';
  end if;

  expired_token := public.create_event_invitation_decline_token(
    active_delivery_id, null
  );
  update public.event_invitation_decline_tokens
  set created_at = now() - interval '8 days',
      expires_at = now() - interval '1 second'
  where id = (expired_token ->> 'tokenId')::uuid;
  if public.resolve_event_invitation_decline_token(expired_token ->> 'token')
      ->> 'status' <> 'expired' then
    raise exception 'An expired decline token did not resolve as expired.';
  end if;

  decline_result := public.decline_event_invitation_from_token(
    active_raw_token, 'prefers_sunday_brunch', 'Scanner-safe active decline.'
  );
  decline_retry := public.decline_event_invitation_from_token(
    active_raw_token, 'prefers_sunday_brunch', 'Scanner-safe active decline.'
  );
  if decline_result ->> 'status' <> 'declined'
    or decline_retry ->> 'status' <> 'already_declined'
    or (select response_status from public.event_invitations
        where id = active_invitation_id) <> 'declined'
    or (select count(*) from public.event_invitation_declines
        where invitation_id = active_invitation_id) <> 1
    or (select reason from public.event_invitation_declines
        where invitation_id = active_invitation_id) <> 'prefers_sunday_brunch'
    or (select count(*) from public.event_email_deliveries
        where idempotency_key = 'member-decline-' || active_invitation_id::text
          and email_type = 'invitation_declined') <> 1
    or exists (
      select 1 from public.event_invitation_decline_tokens
      where invitation_id = active_invitation_id and used_at is null
    ) then
    raise exception 'Active token decline was not consumed and replay-safe.';
  end if;

  begin
    perform public.decline_event_invitation_from_token(
      deadline_claim ->> 'invitationDeclineToken',
      'prefers_saturday_dinner',
      'Mismatched dinner reason.'
    );
    raise exception 'A dinner invitation accepted the Saturday dinner alternative.';
  exception
    when sqlstate '22023' then null;
  end;
  if (select response_status from public.event_invitations
      where id = deadline_invitation_id) <> 'invited' then
    raise exception 'A mismatched format reason changed the invitation.';
  end if;

  decline_result := public.decline_event_invitation_from_token(
    brunch_raw_token, 'prefers_saturday_dinner', 'Format-aware brunch decline.'
  );
  if decline_result ->> 'status' <> 'declined'
    or (select reason from public.event_invitation_declines
        where invitation_id = brunch_invitation_id) <> 'prefers_saturday_dinner' then
    raise exception 'A brunch decline did not record the Saturday dinner alternative.';
  end if;

  update public.event_invitations
  set response_status = 'accepted', seat_status = 'held',
      payment_status = 'pending', responded_at = now(), held_at = now(),
      priority_at = now(), updated_at = now()
  where id = pending_invitation_id;
  insert into public.event_seat_holds (
    event_id, invitation_id, member_id, priority_at, expires_at
  ) values (
    decline_event_id, pending_invitation_id, pending_member_id,
    now(), now() + interval '10 minutes'
  ) returning id into pending_hold_id;
  insert into public.event_invitation_payment_attempts (
    event_id, invitation_id, hold_id, member_id, idempotency_key, status
  ) values (
    decline_event_id, pending_invitation_id, pending_hold_id,
    pending_member_id, 'scanner-decline-pending-payment', 'checkout_created'
  );

  decline_result := public.decline_event_invitation_from_token(
    pending_raw_token, 'event_type_not_interested', 'Scanner-safe pending decline.'
  );
  decline_retry := public.decline_event_invitation_from_token(
    pending_raw_token, 'event_type_not_interested', 'Scanner-safe pending decline.'
  );
  if decline_result ->> 'status' <> 'declined'
    or decline_retry ->> 'status' <> 'already_declined'
    or (select response_status from public.event_invitations
        where id = pending_invitation_id) <> 'declined'
    or (select seat_status from public.event_invitations
        where id = pending_invitation_id) <> 'none'
    or (select payment_status from public.event_invitations
        where id = pending_invitation_id) <> 'expired'
    or (select status from public.event_seat_holds
        where id = pending_hold_id) <> 'released'
    or (select status from public.event_invitation_payment_attempts
        where idempotency_key = 'scanner-decline-pending-payment') <> 'cancelled'
    or not exists (
      select 1 from public.member_event_preferences
      where member_id = pending_member_id and not receives_event_invitations
    )
    or (select count(*) from public.event_invitation_declines
        where invitation_id = pending_invitation_id) <> 1
    or (select count(*) from public.event_email_deliveries
        where idempotency_key = 'pending-member-decline-' || pending_invitation_id::text
          and email_type = 'invitation_declined') <> 1
    or exists (
      select 1 from public.event_invitation_decline_tokens
      where invitation_id = pending_invitation_id and used_at is null
    ) then
    raise exception 'Pending token decline did not preserve hold, payment, opt-out, and replay rules.';
  end if;

  update public.events
  set rsvp_deadline_at = now() - interval '1 second'
  where id = decline_event_id;
  if public.resolve_event_invitation_decline_token(
      deadline_claim ->> 'invitationDeclineToken'
    ) ->> 'status' <> 'deadline_passed'
    or public.resolve_event_invitation_decline_token('not-a-real-token')
      ->> 'status' <> 'invalid' then
    raise exception 'Deadline-passed and invalid decline link states were not enforced.';
  end if;
end;
$test$;

rollback;
