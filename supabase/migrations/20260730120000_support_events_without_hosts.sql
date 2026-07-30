-- Some confirmed cohorts do not contain a willing host. Record that decision
-- explicitly so it is distinct from an event whose host selection is pending.

alter table public.events
  add column if not exists host_status text;

update public.events as events
set host_status = case
  when exists (
    select 1
    from public.event_hosts as hosts
    where hosts.event_id = events.id
  ) then 'assigned'
  else 'pending'
end
where host_status is null;

alter table public.events
  alter column host_status set default 'pending',
  alter column host_status set not null;

alter table public.events
  drop constraint if exists events_host_status_check;

alter table public.events
  add constraint events_host_status_check
  check (host_status in ('pending', 'assigned', 'none'));

create or replace function public.sync_event_host_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (
    tg_op = 'UPDATE'
    and old.event_id is distinct from new.event_id
  ) then
    update public.events
    set host_status = 'pending', updated_at = now()
    where id = old.event_id
      and not exists (
        select 1
        from public.event_hosts
        where event_id = old.event_id
      );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    update public.events
    set host_status = 'assigned', updated_at = now()
    where id = new.event_id;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists event_hosts_sync_event_host_status on public.event_hosts;
create trigger event_hosts_sync_event_host_status
after insert or delete or update of event_id, member_id on public.event_hosts
for each row execute function public.sync_event_host_status();

revoke all on function public.sync_event_host_status()
  from public, anon, authenticated;

create or replace function public.set_event_no_host(
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
  cancelled_delivery_count integer := 0;
  event_record public.events%rowtype;
  previous_host_member_id uuid;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;

  action_info := public.begin_event_action(
    p_event_id,
    'set_event_no_host',
    p_admin_id,
    null,
    p_idempotency_key,
    jsonb_build_object('hostStatus', 'none')
  );
  if (action_info ->> 'replay')::boolean then
    return action_info -> 'result';
  end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select *
  into event_record
  from public.events
  where id = p_event_id
  for update;

  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;
  if event_record.status not in ('inviting', 'confirmed') then
    raise exception 'A no-host decision cannot be recorded in this event state.'
      using errcode = '22023';
  end if;

  select member_id
  into previous_host_member_id
  from public.event_hosts
  where event_id = event_record.id
  for update;

  delete from public.event_hosts
  where event_id = event_record.id;

  update public.event_attendees
  set is_host = false,
      status = case when status = 'host' then 'confirmed' else status end,
      updated_at = now()
  where event_id = event_record.id
    and (is_host or status = 'host');

  update public.event_materials
  set stale_at = coalesce(stale_at, now()), updated_at = now()
  where event_id = event_record.id
    and kind = 'event_guide'
    and stale_at is null;

  update public.event_email_deliveries
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      last_error = null,
      updated_at = now()
  where event_id = event_record.id
    and email_type = 'host_package'
    and status in ('draft', 'failed');
  get diagnostics cancelled_delivery_count = row_count;

  update public.events
  set host_status = 'none', updated_at = now()
  where id = event_record.id;

  result_value := jsonb_build_object(
    'ok', true,
    'actionId', action_id,
    'eventId', event_record.id,
    'hostStatus', 'none',
    'previousHostMemberId', previous_host_member_id,
    'cancelledHostDeliveryCount', cancelled_delivery_count,
    'deliveryCount', 0
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

revoke all on function public.set_event_no_host(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.set_event_no_host(uuid, uuid, text, text)
  to authenticated, service_role;

create or replace function public.event_frozen_payload(
  p_event_id uuid,
  p_invitation_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'eventId', events.id,
    'invitationId', p_invitation_id,
    'title', events.title,
    'eventFormat', events.event_format,
    'startsAt', events.starts_at,
    'endsAt', events.ends_at,
    'timezone', events.timezone,
    'city', events.city,
    'languageCode', events.language_code,
    'rsvpDeadlineAt', events.rsvp_deadline_at,
    'creditCost', events.credit_cost,
    'capacity', events.capacity,
    'hostStatus', events.host_status,
    'venueName', case
      when events.confirmation_released_at is not null then events.venue_name
      else null
    end,
    'venueAddress', case
      when events.confirmation_released_at is not null then events.venue_address
      else null
    end,
    'restaurantImageUrl', case
      when events.confirmation_released_at is not null then events.restaurant_image_url
      else null
    end,
    'eventInstructions', case
      when events.confirmation_released_at is not null then events.event_instructions
      else null
    end
  ))
  from public.events
  where events.id = p_event_id;
$$;

revoke all on function public.event_frozen_payload(uuid, uuid)
  from public, anon, authenticated;
