-- Record the actual alternative event format selected by a recipient.
-- Dinner invitations may point to Sunday brunch; brunch invitations may point
-- to Saturday dinner. Historical decline reasons remain valid.

alter table public.event_invitation_declines
  drop constraint if exists event_invitation_declines_reason_check;
alter table public.event_invitation_declines
  add constraint event_invitation_declines_reason_check check (
    reason in (
      'schedule',
      'location',
      'event_type_not_interested',
      'weekend_unavailable',
      'prefers_saturday_dinner',
      'prefers_sunday_brunch',
      'event_fit',
      'other_commitment',
      'prefer_not_to_say'
    )
  );

create or replace function public.perform_event_invitation_decline(
  p_invitation_id uuid,
  p_member_id uuid,
  p_pending_rules boolean,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
  delivery_id uuid;
  delivery_key text;
begin
  if p_member_id is null then
    raise exception 'Member account is required.' using errcode = '28000';
  end if;
  if normalized_reason not in (
    'weekend_unavailable', 'prefers_saturday_dinner',
    'prefers_sunday_brunch', 'event_fit', 'other_commitment',
    'prefer_not_to_say'
  ) and not (
    p_pending_rules and normalized_reason = 'event_type_not_interested'
  ) then
    raise exception 'Choose a reason before declining this invitation.'
      using errcode = '22023';
  end if;
  if char_length(normalized_details) > 500 then
    raise exception 'Decline details must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = p_member_id
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if (normalized_reason = 'prefers_saturday_dinner'
      and event_record.event_format <> 'brunch')
    or (normalized_reason = 'prefers_sunday_brunch'
      and event_record.event_format <> 'dinner') then
    raise exception 'Choose a reason before declining this invitation.'
      using errcode = '22023';
  end if;

  delivery_key := case when p_pending_rules
    then 'pending-member-decline-'
    else 'member-decline-'
  end || invitation_record.id::text;

  if invitation_record.response_status = 'declined'
    and invitation_record.seat_status = 'none' then
    select id into delivery_id
    from public.event_email_deliveries
    where idempotency_key = delivery_key;

    return jsonb_build_object(
      'ok', true,
      'status', 'already_declined',
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', 'declined',
      'seatStatus', 'none',
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', null,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if event_record.id is null or now() >= event_record.rsvp_deadline_at then
    raise exception 'This invitation can no longer be declined.'
      using errcode = '22023';
  end if;

  if p_pending_rules then
    if invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
      or event_record.status not in ('inviting', 'confirmed') then
      raise exception 'This invitation can no longer be declined.'
        using errcode = '22023';
    end if;

    update public.event_seat_holds
    set status = 'released',
        released_at = coalesce(released_at, now()),
        updated_at = now()
    where invitation_id = invitation_record.id and status = 'active';

    update public.event_invitation_payment_attempts
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    where invitation_id = invitation_record.id
      and status in ('created', 'checkout_created');
  elsif invitation_record.seat_status in (
    'confirmed', 'held', 'cancelled', 'replaced'
  ) then
    raise exception 'This invitation can no longer be declined.'
      using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'declined',
      seat_status = 'none',
      payment_status = case
        when p_pending_rules and payment_status = 'pending' then 'expired'
        else payment_status
      end,
      waitlist_reason = null,
      responded_at = case
        when p_pending_rules then coalesce(responded_at, now())
        else now()
      end,
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  if not exists (
    select 1 from public.event_invitation_declines
    where invitation_id = invitation_record.id
  ) then
    insert into public.event_invitation_declines (
      invitation_id,
      event_id,
      member_id,
      reason,
      details
    ) values (
      invitation_record.id,
      invitation_record.event_id,
      invitation_record.member_id,
      normalized_reason,
      normalized_details
    );
  end if;

  if p_pending_rules and normalized_reason = 'event_type_not_interested' then
    insert into public.member_event_preferences (
      member_id,
      receives_event_invitations,
      updated_at
    ) values (
      invitation_record.member_id,
      false,
      now()
    )
    on conflict (member_id) do update
    set receives_event_invitations = false,
        updated_at = now();
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id,
    invitation_record.id,
    invitation_record.member_id,
    null,
    invitation_record.member_id,
    null,
    'invitation_declined',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('responseStatus', 'declined'),
    delivery_key
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'invitationId', invitation_record.id,
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

revoke all on function public.perform_event_invitation_decline(
  uuid, uuid, boolean, text, text
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
