alter table public.member_event_preferences
  add column if not exists receives_event_invitations boolean not null default true;

comment on column public.member_event_preferences.receives_event_invitations is
  'Whether the member may be included in new event invitations.';

create or replace function public.cancel_opted_out_event_invitation_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.receives_event_invitations then
    return new;
  end if;

  update public.event_email_deliveries
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      failed_at = null,
      last_error = null,
      updated_at = now()
  where member_id = new.member_id
    and email_type in ('invitation_member', 'invitation_pending')
    and status in ('draft', 'failed');

  return new;
end;
$$;

drop trigger if exists cancel_opted_out_event_invitation_deliveries
  on public.member_event_preferences;
create trigger cancel_opted_out_event_invitation_deliveries
after insert or update of receives_event_invitations
on public.member_event_preferences
for each row
when (not new.receives_event_invitations)
execute function public.cancel_opted_out_event_invitation_deliveries();

create or replace function public.enforce_member_event_invitation_preference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.member_event_preferences as preferences
    where preferences.member_id = new.member_id
      and not preferences.receives_event_invitations
  ) then
    raise exception 'The member has opted out of event invitations.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_member_event_invitation_preference
  on public.event_invitations;
create trigger enforce_member_event_invitation_preference
before insert or update of member_id on public.event_invitations
for each row execute function public.enforce_member_event_invitation_preference();

create or replace function public.open_event_invitations(
  p_event_id uuid,
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
  transitioned_value boolean := false;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'open_event_invitations', p_admin_id, null,
    p_idempotency_key, '{}'::jsonb
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'draft' then
    raise exception 'Only a draft event can open invitations.' using errcode = '22023';
  end if;

  update public.events
  set status = 'inviting',
      invitation_send_at = now(),
      invitations_opened_at = now(),
      updated_at = now()
  where id = event_record.id
  returning * into event_record;
  transitioned_value := true;

  for invitation_record in
    select invitations.*
    from public.event_invitations as invitations
    where invitations.event_id = event_record.id
      and not exists (
        select 1
        from public.member_event_preferences as preferences
        where preferences.member_id = invitations.member_id
          and not preferences.receives_event_invitations
      )
    order by invitations.created_at, invitations.id
  loop
    perform public.queue_event_email_delivery(
      event_record.id, invitation_record.id, invitation_record.member_id,
      p_admin_id, null, action_id,
      case when invitation_record.member_status_at_invite = 'pending'
        then 'invitation_pending' else 'invitation_member' end,
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object('memberStatusAtInvite', invitation_record.member_status_at_invite),
      'event-open-' || event_record.id::text || '-' || invitation_record.id::text
    );
    delivery_count_value := delivery_count_value + 1;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'inviting', 'transitioned', transitioned_value,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;
