-- The refresh source is a database row id used for idempotency, not a bearer
-- secret. Avoid "token" in its payload key so the email privacy guard accepts
-- the queued replacement while continuing to reject actual bearer material.

create or replace function public.refresh_expired_event_invitation_link(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_access_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  delivery_record public.event_email_deliveries%rowtype;
  delivery_id uuid;
  delivery_locale text;
begin
  if nullif(btrim(p_token), '') is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into token_record
  from public.event_invitation_access_tokens
  where token_hash = public.hash_payment_resume_secret(p_token);

  if token_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  delivery_locale := public.effective_member_locale(invitation_record.member_id);

  if event_record.id is not null and now() >= event_record.rsvp_deadline_at then
    return jsonb_build_object(
      'ok', false,
      'status', 'deadline_passed',
      'locale', delivery_locale
    );
  end if;

  if invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending'
    or invitation_record.response_status not in ('invited', 'accepted')
    or invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
    or event_record.status not in ('inviting', 'confirmed') then
    return jsonb_build_object(
      'ok', false,
      'status', 'unavailable',
      'locale', delivery_locale
    );
  end if;

  if token_record.used_at is null and token_record.expires_at > now() then
    return jsonb_build_object(
      'ok', false,
      'status', 'valid',
      'locale', delivery_locale
    );
  end if;

  select * into delivery_record
  from public.event_email_deliveries
  where email_type = 'invitation_pending'
    and payload @> jsonb_build_object('refreshSourceAccessId', token_record.id::text)
  order by created_at desc
  limit 1
  for update;

  if delivery_record.id is not null then
    if delivery_record.status = 'sending'
      and delivery_record.claimed_at < now() - interval '5 minutes' then
      update public.event_email_deliveries
      set status = 'failed',
          last_error = 'Replacement invitation send timed out and may be retried.',
          failed_at = now(),
          updated_at = now()
      where id = delivery_record.id
      returning * into delivery_record;
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', case
        when delivery_record.status in ('draft', 'failed') then 'queued'
        else 'already_sent'
      end,
      'deliveryId', delivery_record.id,
      'locale', delivery_record.locale
    );
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id,
    invitation_record.id,
    invitation_record.member_id,
    null,
    invitation_record.member_id,
    null,
    'invitation_pending',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('refreshSourceAccessId', token_record.id::text),
    'pending-invite-refresh-' || token_record.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'queued',
    'deliveryId', delivery_id,
    'locale', delivery_locale
  );
end;
$$;

revoke all on function public.refresh_expired_event_invitation_link(text)
  from public, anon, authenticated;
grant execute on function public.refresh_expired_event_invitation_link(text)
  to service_role;
