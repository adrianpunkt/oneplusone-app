-- Finish membership payment first, then let the new active member complete the
-- normal in-app event confirmation flow (including the host preference).

create or replace function public.prepare_active_event_invitation_resume(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  member_record public.members%rowtype;
  hold_record public.event_seat_holds%rowtype;
  reason text;
begin
  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();

  if session_record.id is null then
    raise exception 'The invitation session is invalid or expired.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = session_record.invitation_id
    and member_id = session_record.member_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  select * into member_record
  from public.members
  where id = invitation_record.member_id
  for update;

  if invitation_record.id is null or event_record.id is null or member_record.id is null then
    raise exception 'The invitation is no longer available.' using errcode = 'P0002';
  end if;
  if member_record.membership_status <> 'active' then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  if invitation_record.seat_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true, 'status', 'confirmed',
      'eventId', event_record.id, 'invitationId', invitation_record.id,
      'email', member_record.email
    );
  end if;

  if invitation_record.response_status = 'accepted'
    and invitation_record.seat_status = 'waitlisted'
    and invitation_record.payment_status in ('paid', 'not_required') then
    return jsonb_build_object(
      'ok', true, 'status', 'waitlisted',
      'eventId', event_record.id, 'invitationId', invitation_record.id,
      'email', member_record.email
    );
  end if;

  if invitation_record.response_status in ('declined', 'expired')
    or invitation_record.seat_status in ('cancelled', 'replaced')
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    return jsonb_build_object(
      'ok', true, 'status', 'closed',
      'eventId', event_record.id, 'invitationId', invitation_record.id,
      'email', member_record.email
    );
  end if;

  update public.event_seat_holds
  set status = 'expired', released_at = coalesce(released_at, now()), updated_at = now()
  where invitation_id = invitation_record.id
    and status = 'active'
    and expires_at <= now();

  select * into hold_record
  from public.event_seat_holds
  where invitation_id = invitation_record.id
    and status = 'active'
    and expires_at > now()
  for update;

  reason := public.event_seat_waitlist_reason(
    event_record.id,
    member_record.id,
    invitation_record.id
  );

  if hold_record.id is not null then
    update public.event_seat_holds
    set expires_at = greatest(expires_at, now() + interval '10 minutes'),
        updated_at = now()
    where id = hold_record.id
    returning * into hold_record;
  elsif reason is null then
    insert into public.event_seat_holds (
      event_id, invitation_id, member_id, priority_at, expires_at
    ) values (
      event_record.id, invitation_record.id, member_record.id,
      coalesce(invitation_record.priority_at, now()),
      now() + interval '10 minutes'
    ) returning * into hold_record;
  end if;

  update public.event_invitation_payment_attempts
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      updated_at = now()
  where invitation_id = invitation_record.id
    and status in ('created', 'checkout_created');

  update public.event_invitations
  set response_status = 'invited',
      seat_status = 'none',
      payment_status = case
        when exists (
          select 1 from public.event_invitation_payment_attempts
          where invitation_id = invitation_record.id and status = 'paid'
        ) then 'paid'
        else 'not_required'
      end,
      waitlist_reason = null,
      priority_at = coalesce(priority_at, hold_record.priority_at, now()),
      responded_at = null,
      waitlisted_at = null,
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  return jsonb_build_object(
    'ok', true, 'status', 'member_active',
    'eventId', event_record.id, 'invitationId', invitation_record.id,
    'email', member_record.email, 'holdId', hold_record.id,
    'holdExpiresAt', hold_record.expires_at,
    'priorityAt', invitation_record.priority_at
  );
end;
$$;

create or replace function public.complete_event_invitation_payment(
  p_payment_attempt_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_stripe_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_snapshot public.event_invitation_payment_attempts%rowtype;
  attempt_record public.event_invitation_payment_attempts%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  member_record public.members%rowtype;
  hold_record public.event_seat_holds%rowtype;
  existing_receipt public.stripe_event_receipts%rowtype;
  clean_checkout_id text := nullif(btrim(p_checkout_session_id), '');
  clean_event_id text := nullif(btrim(p_stripe_event_id), '');
  credit_balance integer;
  public_status text;
  resume_available boolean;
  reason text;
  result_value jsonb;
begin
  if clean_checkout_id is null or clean_event_id is null then
    raise exception 'Checkout session and Stripe event IDs are required.'
      using errcode = '22023';
  end if;

  select * into attempt_snapshot
  from public.event_invitation_payment_attempts
  where id = p_payment_attempt_id;

  if attempt_snapshot.id is null then
    raise exception 'The payment attempt was not found.' using errcode = 'P0002';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = attempt_snapshot.invitation_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  select * into attempt_record
  from public.event_invitation_payment_attempts
  where id = attempt_snapshot.id
  for update;

  select * into member_record
  from public.members
  where id = invitation_record.member_id
  for update;

  select * into existing_receipt
  from public.stripe_event_receipts
  where stripe_event_id = clean_event_id;

  if existing_receipt.stripe_event_id is not null then
    if existing_receipt.payment_attempt_id <> attempt_record.id then
      raise exception 'The Stripe event belongs to another payment attempt.'
        using errcode = '23505';
    end if;
    return existing_receipt.result;
  end if;

  if attempt_record.stripe_checkout_session_id is not null
    and attempt_record.stripe_checkout_session_id <> clean_checkout_id then
    raise exception 'The checkout session does not match the payment attempt.'
      using errcode = '22023';
  end if;

  if attempt_record.status <> 'paid' then
    perform public.mark_member_active(member_record.id, 'event_stripe_checkout', now());
    perform public.grant_member_credit(
      member_record.id,
      1,
      'membership_join_credit',
      'event_payment_attempt',
      attempt_record.id::text,
      null,
      'Granted by event-linked membership checkout.',
      now()
    );
    perform public.ensure_referral_code_for_member(member_record.id, now());

    update public.event_seat_holds
    set status = 'expired', released_at = coalesce(released_at, now()), updated_at = now()
    where invitation_id = invitation_record.id
      and status = 'active'
      and expires_at <= now();

    resume_available := invitation_record.response_status not in ('declined', 'expired')
      and invitation_record.seat_status not in ('confirmed', 'cancelled', 'replaced')
      and event_record.status in ('inviting', 'confirmed')
      and now() < event_record.rsvp_deadline_at;

    if resume_available then
      select * into hold_record
      from public.event_seat_holds
      where invitation_id = invitation_record.id
        and status = 'active'
        and expires_at > now()
      for update;

      reason := public.event_seat_waitlist_reason(
        event_record.id,
        member_record.id,
        invitation_record.id
      );

      if hold_record.id is not null then
        update public.event_seat_holds
        set expires_at = greatest(expires_at, now() + interval '10 minutes'),
            updated_at = now()
        where id = hold_record.id
        returning * into hold_record;
      elsif reason is null then
        insert into public.event_seat_holds (
          event_id, invitation_id, member_id, priority_at, expires_at
        ) values (
          event_record.id, invitation_record.id, member_record.id,
          coalesce(invitation_record.priority_at, now()),
          now() + interval '10 minutes'
        ) returning * into hold_record;
      end if;

      update public.event_invitations
      set response_status = 'invited',
          seat_status = 'none',
          payment_status = 'paid',
          waitlist_reason = null,
          priority_at = coalesce(priority_at, hold_record.priority_at, now()),
          responded_at = null,
          confirmed_at = null,
          waitlisted_at = null,
          payment_completed_at = coalesce(payment_completed_at, now()),
          cancelled_at = null,
          updated_at = now()
      where id = invitation_record.id
      returning * into invitation_record;
    else
      update public.event_seat_holds
      set status = 'released', released_at = coalesce(released_at, now()), updated_at = now()
      where invitation_id = invitation_record.id and status = 'active';

      update public.event_invitations
      set response_status = case
            when response_status in ('declined', 'expired') then response_status
            else 'expired'
          end,
          seat_status = case
            when seat_status in ('confirmed', 'cancelled', 'replaced') then seat_status
            else 'none'
          end,
          payment_status = 'paid',
          waitlist_reason = null,
          payment_completed_at = coalesce(payment_completed_at, now()),
          updated_at = now()
      where id = invitation_record.id
      returning * into invitation_record;
    end if;

    update public.event_invitation_payment_attempts
    set hold_id = coalesce(hold_id, hold_record.id),
        stripe_checkout_session_id = clean_checkout_id,
        stripe_payment_intent_id = nullif(btrim(p_payment_intent_id), ''),
        status = 'paid',
        paid_at = coalesce(paid_at, now()),
        updated_at = now()
    where id = attempt_record.id
    returning * into attempt_record;
  end if;

  public_status := case
    when invitation_record.seat_status = 'confirmed' then 'confirmed'
    when invitation_record.seat_status = 'waitlisted'
      and invitation_record.response_status = 'accepted' then 'waitlisted'
    when invitation_record.response_status = 'invited'
      and invitation_record.seat_status = 'none' then 'ready_to_confirm'
    else 'membership_active'
  end;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries
  where member_id = member_record.id;

  result_value := jsonb_build_object(
    'ok', true,
    'eventId', event_record.id,
    'invitationId', invitation_record.id,
    'memberId', member_record.id,
    'membershipStatus', 'active',
    'status', public_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'creditAvailable', credit_balance > 0,
    'loginNext', case
      when public_status = 'ready_to_confirm'
        then '/going-out?apply=' || invitation_record.id::text
      else '/going-out'
    end
  );

  insert into public.stripe_event_receipts (
    stripe_event_id, payment_attempt_id, event_type, result
  ) values (
    clean_event_id, attempt_record.id, 'checkout.session.completed', result_value
  );

  return result_value;
end;
$$;

create or replace function public.get_event_invitation_payment_result(
  p_session_token text,
  p_checkout_session_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
  invitation_record public.event_invitations%rowtype;
  attempt_record public.event_invitation_payment_attempts%rowtype;
  credit_balance integer;
  public_status text;
begin
  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();

  if session_record.id is null then
    return jsonb_build_object(
      'ok', false, 'status', 'failed', 'eventId', null,
      'seatStatus', 'none', 'paymentStatus', 'failed',
      'waitlistReason', null, 'creditAvailable', false, 'loginNext', '/login'
    );
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = session_record.invitation_id;

  select * into attempt_record
  from public.event_invitation_payment_attempts
  where invitation_id = invitation_record.id
    and stripe_checkout_session_id = nullif(btrim(p_checkout_session_id), '')
  order by created_at desc
  limit 1;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries
  where member_id = session_record.member_id;

  public_status := case
    when invitation_record.seat_status = 'confirmed' then 'confirmed'
    when invitation_record.seat_status = 'waitlisted'
      and invitation_record.response_status = 'accepted' then 'waitlisted'
    when attempt_record.status = 'paid'
      and invitation_record.response_status = 'invited'
      and invitation_record.seat_status = 'none' then 'ready_to_confirm'
    when attempt_record.status = 'paid' then 'membership_active'
    when attempt_record.status in ('created', 'checkout_created') then 'payment_pending'
    else 'failed'
  end;

  return jsonb_build_object(
    'ok', public_status <> 'failed',
    'status', public_status,
    'eventId', invitation_record.event_id,
    'seatStatus', case
      when invitation_record.seat_status in ('confirmed', 'waitlisted', 'held')
        then invitation_record.seat_status
      else 'none'
    end,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'creditAvailable', credit_balance > 0,
    'loginNext', case
      when public_status = 'ready_to_confirm'
        then '/going-out?apply=' || invitation_record.id::text
      else '/going-out'
    end
  );
end;
$$;

create or replace function public.finalize_resumed_event_invitation_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seat_status = 'confirmed'
    and old.seat_status is distinct from 'confirmed' then
    update public.event_seat_holds
    set status = 'converted',
        converted_at = coalesce(converted_at, now()),
        updated_at = now()
    where invitation_id = new.id and status = 'active';
  elsif new.seat_status in ('waitlisted', 'cancelled', 'replaced')
    or new.response_status in ('declined', 'expired') then
    update public.event_seat_holds
    set status = 'released',
        released_at = coalesce(released_at, now()),
        updated_at = now()
    where invitation_id = new.id and status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists finalize_resumed_event_invitation_hold
  on public.event_invitations;
create trigger finalize_resumed_event_invitation_hold
  after update on public.event_invitations
  for each row execute function public.finalize_resumed_event_invitation_hold();

revoke all on function public.prepare_active_event_invitation_resume(text)
  from public, anon, authenticated;
revoke all on function public.complete_event_invitation_payment(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_event_invitation_payment_result(text, text)
  from public, anon, authenticated;
revoke all on function public.finalize_resumed_event_invitation_hold()
  from public, anon, authenticated;

grant execute on function public.prepare_active_event_invitation_resume(text)
  to service_role;
grant execute on function public.complete_event_invitation_payment(uuid, text, text, text)
  to service_role;
grant execute on function public.get_event_invitation_payment_result(text, text)
  to service_role;
