-- Keep a pending member's event-type preference distinct from declining one
-- specific date or event.

alter table public.event_invitation_declines
  drop constraint if exists event_invitation_declines_reason_check;

alter table public.event_invitation_declines
  add constraint event_invitation_declines_reason_check check (
    reason in (
      'schedule',
      'location',
      'event_type_not_interested',
      'weekend_unavailable',
      'prefers_sunday_brunch',
      'event_fit',
      'other_commitment',
      'prefer_not_to_say'
    )
  );

create or replace function public.decline_pending_event_invitation(
  p_session_token text,
  p_reason text,
  p_details text default null
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
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
  delivery_id uuid;
begin
  if normalized_reason not in (
    'event_type_not_interested', 'weekend_unavailable',
    'prefers_sunday_brunch', 'event_fit', 'other_commitment',
    'prefer_not_to_say'
  ) or char_length(normalized_details) > 500 then
    raise exception 'A valid decline reason is required.' using errcode = '22023';
  end if;

  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();
  if session_record.id is null then
    raise exception 'The invitation session is invalid or expired.' using errcode = '28000';
  end if;

  select * into invitation_record from public.event_invitations
  where id = session_record.invitation_id and member_id = session_record.member_id
  for update;
  select * into event_record from public.events
  where id = invitation_record.event_id for update;

  if invitation_record.member_status_at_invite <> 'pending'
    or invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'This invitation can no longer be declined.' using errcode = '22023';
  end if;

  update public.event_seat_holds
  set status = 'released', released_at = coalesce(released_at, now()), updated_at = now()
  where invitation_id = invitation_record.id and status = 'active';
  update public.event_invitation_payment_attempts
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where invitation_id = invitation_record.id and status in ('created', 'checkout_created');
  update public.event_invitations
  set response_status = 'declined', seat_status = 'none',
      payment_status = case when payment_status = 'pending' then 'expired' else payment_status end,
      waitlist_reason = null, responded_at = coalesce(responded_at, now()),
      updated_at = now()
  where id = invitation_record.id returning * into invitation_record;

  if not exists (
    select 1 from public.event_invitation_declines
    where invitation_id = invitation_record.id
  ) then
    insert into public.event_invitation_declines (
      invitation_id, event_id, member_id, reason, details
    ) values (
      invitation_record.id, invitation_record.event_id,
      invitation_record.member_id, normalized_reason, normalized_details
    );
  end if;

  if normalized_reason = 'event_type_not_interested' then
    insert into public.member_event_preferences (
      member_id, receives_event_invitations, updated_at
    ) values (
      invitation_record.member_id, false, now()
    )
    on conflict (member_id) do update
    set receives_event_invitations = false,
        updated_at = now();
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, invitation_record.member_id,
    null, invitation_record.member_id, null, 'cancellation_received',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('responseStatus', 'declined'),
    'pending-member-decline-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true, 'eventId', event_record.id,
    'responseStatus', 'declined', 'seatStatus', 'none',
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', null, 'deliveryId', delivery_id
  );
end;
$$;

revoke all on function public.decline_pending_event_invitation(text, text, text)
  from public, anon, authenticated;
grant execute on function public.decline_pending_event_invitation(text, text, text)
  to service_role;
