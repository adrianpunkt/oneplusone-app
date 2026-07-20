alter table public.event_email_deliveries
  drop constraint if exists event_email_deliveries_type_check;

alter table public.event_email_deliveries
  add constraint event_email_deliveries_type_check check (email_type in (
    'invitation_member', 'invitation_pending', 'seat_confirmed',
    'waitlist_capacity', 'waitlist_balance', 'waitlist_balance_released',
    'cancellation_received', 'reservation_cancellation_received',
    'rsvp_reminder', 'event_confirmed', 'event_cancelled', 'host_package',
    'event_reminder', 'replacement_refund', 'no_replacement',
    'feedback_request', 'credit_offer'
  )) not valid;

do $$
begin
  if not exists (
    select 1
    from public.event_email_deliveries
    where email_type = 'late_cancellation_notice'
  ) then
    alter table public.event_email_deliveries
      validate constraint event_email_deliveries_type_check;
  end if;
end;
$$;
create or replace function public.prepare_event_email_deliveries(
  p_event_id uuid,
  p_email_type text,
  p_due_at timestamptz,
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
  recipient record;
  delivery_id uuid;
  delivery_ids jsonb := '[]'::jsonb;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if p_email_type not in (
    'invitation_member', 'invitation_pending', 'rsvp_reminder',
    'event_confirmed', 'event_cancelled', 'host_package', 'event_reminder',
    'replacement_refund', 'no_replacement', 'feedback_request', 'credit_offer'
  ) then
    raise exception 'This delivery type is not a founder batch command.' using errcode = '22023';
  end if;

  action_info := public.begin_event_action(
    p_event_id, 'prepare_event_email_deliveries', p_admin_id, null,
    p_idempotency_key,
    jsonb_build_object('emailType', p_email_type, 'dueAt', p_due_at)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;
  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;

  for recipient in
    select invitations.id as invitation_id, invitations.member_id
    from public.event_invitations as invitations
    join public.members as members on members.id = invitations.member_id
    left join public.event_hosts as hosts
      on hosts.event_id = invitations.event_id and hosts.member_id = invitations.member_id
    left join public.event_feedback as feedback
      on feedback.event_id = invitations.event_id and feedback.member_id = invitations.member_id
    left join public.event_replacements as replacements
      on replacements.cancelled_invitation_id = invitations.id
    where invitations.event_id = event_record.id
      and case p_email_type
        when 'invitation_member' then invitations.member_status_at_invite = 'active'
          and invitations.response_status = 'invited'
        when 'invitation_pending' then invitations.member_status_at_invite = 'pending'
          and invitations.response_status = 'invited'
        when 'rsvp_reminder' then event_record.status = 'inviting'
          and invitations.response_status = 'invited'
          and now() < event_record.rsvp_deadline_at
        when 'event_confirmed' then event_record.status = 'confirmed'
          and invitations.seat_status = 'confirmed'
        when 'event_cancelled' then event_record.status = 'cancelled'
        when 'host_package' then hosts.member_id is not null
          and invitations.seat_status = 'confirmed'
        when 'event_reminder' then event_record.status = 'confirmed'
          and invitations.seat_status = 'confirmed'
        when 'replacement_refund' then replacements.refunded_at is not null
        when 'no_replacement' then replacements.status = 'no_replacement'
        when 'feedback_request' then invitations.seat_status = 'confirmed'
          and feedback.id is null
          and (event_record.status = 'completed' or coalesce(event_record.ends_at, event_record.starts_at) <= now())
        when 'credit_offer' then event_record.status = 'completed'
          and members.marketing_eligible
          and invitations.seat_status = 'confirmed'
          and feedback.id is not null
        else false
      end
    order by invitations.created_at, invitations.id
  loop
    delivery_id := public.queue_event_email_delivery(
      event_record.id, recipient.invitation_id, recipient.member_id,
      p_admin_id, null, action_id, p_email_type,
      public.event_frozen_payload(event_record.id, recipient.invitation_id),
      'founder-email-' || action_id::text || '-' || recipient.invitation_id::text,
      p_due_at
    );
    delivery_ids := delivery_ids || jsonb_build_array(delivery_id);
    delivery_count_value := delivery_count_value + 1;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'emailType', p_email_type, 'deliveryCount', delivery_count_value,
    'deliveryIds', delivery_ids
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;
