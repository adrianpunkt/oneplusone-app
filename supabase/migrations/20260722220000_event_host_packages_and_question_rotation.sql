-- Event-specific question selection, immutable host packages, and completion exposures.

create table if not exists public.event_question_sets (
  event_id uuid primary key references public.events(id) on delete cascade,
  revision integer not null default 0,
  confirmed_guest_count integer not null default 0,
  sharing_target integer not null,
  spicy_target integer not null,
  sharing_level_ratios jsonb not null default '{"1":30,"2":50,"3":20}'::jsonb,
  spicy_level_ratios jsonb not null default '{"1":30,"2":50,"3":20}'::jsonb,
  selection_fingerprint text not null,
  updated_by_admin_id uuid not null references ops.ops_admin_users(id) on delete restrict,
  updated_action_id uuid references public.event_action_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_question_sets_revision_check check (revision > 0),
  constraint event_question_sets_guest_count_check check (confirmed_guest_count >= 0),
  constraint event_question_sets_targets_check check (
    sharing_target between 0 and 200 and spicy_target between 0 and 200
  ),
  constraint event_question_sets_sharing_ratios_check check (
    jsonb_typeof(sharing_level_ratios) = 'object'
    and (sharing_level_ratios ->> '1')::integer between 0 and 100
    and (sharing_level_ratios ->> '2')::integer between 0 and 100
    and (sharing_level_ratios ->> '3')::integer between 0 and 100
    and (sharing_level_ratios ->> '1')::integer
      + (sharing_level_ratios ->> '2')::integer
      + (sharing_level_ratios ->> '3')::integer = 100
  ),
  constraint event_question_sets_spicy_ratios_check check (
    jsonb_typeof(spicy_level_ratios) = 'object'
    and (spicy_level_ratios ->> '1')::integer between 0 and 100
    and (spicy_level_ratios ->> '2')::integer between 0 and 100
    and (spicy_level_ratios ->> '3')::integer between 0 and 100
    and (spicy_level_ratios ->> '1')::integer
      + (spicy_level_ratios ->> '2')::integer
      + (spicy_level_ratios ->> '3')::integer = 100
  )
);

alter table public.event_question_sets enable row level security;
revoke all on table public.event_question_sets from public, anon, authenticated;
grant all on table public.event_question_sets to service_role;

alter table public.event_materials
  add column if not exists storage_path text,
  add column if not exists content_hash text,
  add column if not exists byte_size integer,
  add column if not exists question_set_revision integer,
  add column if not exists created_by_admin_id uuid references ops.ops_admin_users(id) on delete set null,
  add column if not exists source_snapshot jsonb,
  add column if not exists stale_at timestamptz;

alter table public.event_materials
  drop constraint if exists event_materials_storage_path_check,
  add constraint event_materials_storage_path_check
    check (storage_path is null or (char_length(storage_path) between 1 and 1000 and storage_path !~ '(^|/)\.\.(/|$)')),
  drop constraint if exists event_materials_content_hash_check,
  add constraint event_materials_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  drop constraint if exists event_materials_byte_size_check,
  add constraint event_materials_byte_size_check
    check (byte_size is null or byte_size between 1 and 4194303),
  drop constraint if exists event_materials_question_set_revision_check,
  add constraint event_materials_question_set_revision_check
    check (question_set_revision is null or question_set_revision > 0),
  drop constraint if exists event_materials_source_snapshot_check,
  add constraint event_materials_source_snapshot_check
    check (source_snapshot is null or jsonb_typeof(source_snapshot) = 'object'),
  drop constraint if exists event_materials_event_guide_metadata_check,
  add constraint event_materials_event_guide_metadata_check check (
    kind <> 'event_guide'
    or (
      storage_path is not null
      and content_hash is not null
      and byte_size is not null
      and question_set_revision is not null
      and created_by_admin_id is not null
      and source_snapshot is not null
    )
  ) not valid;

create index if not exists event_materials_current_guide_idx
  on public.event_materials (event_id, question_set_revision, created_at desc)
  where kind = 'event_guide';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-host-packages', 'event-host-packages', true, 4194303, array['application/pdf']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.replace_event_question_set(
  p_event_id uuid,
  p_sharing_question_ids uuid[],
  p_spicy_question_ids uuid[],
  p_sharing_target integer,
  p_spicy_target integer,
  p_sharing_level_ratios jsonb,
  p_spicy_level_ratios jsonb,
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
  next_revision integer;
  confirmed_guest_count_value integer;
  all_question_ids uuid[] := coalesce(p_sharing_question_ids, '{}'::uuid[])
    || coalesce(p_spicy_question_ids, '{}'::uuid[]);
  selection_fingerprint_value text;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if p_sharing_target not between 0 and 200 or p_spicy_target not between 0 and 200 then
    raise exception 'Question targets must be between 0 and 200.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_sharing_question_ids, 1), 0) > p_sharing_target
    or coalesce(array_length(p_spicy_question_ids, 1), 0) > p_spicy_target then
    raise exception 'A saved round cannot contain more questions than its target.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sharing_level_ratios) <> 'object'
    or jsonb_typeof(p_spicy_level_ratios) <> 'object'
    or coalesce((p_sharing_level_ratios ->> '1')::integer, -1)
      + coalesce((p_sharing_level_ratios ->> '2')::integer, -1)
      + coalesce((p_sharing_level_ratios ->> '3')::integer, -1) <> 100
    or coalesce((p_spicy_level_ratios ->> '1')::integer, -1)
      + coalesce((p_spicy_level_ratios ->> '2')::integer, -1)
      + coalesce((p_spicy_level_ratios ->> '3')::integer, -1) <> 100 then
    raise exception 'Each round level ratio must total 100 percent.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(all_question_ids) as selected(question_id)
    where selected.question_id is null
  ) or (select count(*) from unnest(all_question_ids))
    <> (select count(distinct selected.question_id) from unnest(all_question_ids) as selected(question_id)) then
    raise exception 'Question selections cannot contain nulls or duplicates.' using errcode = '22023';
  end if;

  action_info := public.begin_event_action(
    p_event_id,
    'replace_event_question_set',
    p_admin_id,
    null,
    p_idempotency_key,
    jsonb_build_object(
      'sharingTarget', p_sharing_target,
      'spicyTarget', p_spicy_target,
      'sharingCount', coalesce(array_length(p_sharing_question_ids, 1), 0),
      'spicyCount', coalesce(array_length(p_spicy_question_ids, 1), 0)
    )
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;
  if event_record.status in ('completed', 'cancelled') then
    raise exception 'Questions cannot be changed for a completed or cancelled event.' using errcode = '22023';
  end if;

  if (select count(*) from public.questions where id = any(coalesce(p_sharing_question_ids, '{}'::uuid[]))
      and type = 'sharing_time' and not is_public and deleted_at is null and rating between 1 and 3)
    <> coalesce(array_length(p_sharing_question_ids, 1), 0) then
    raise exception 'Sharing selections must contain eligible Sharing questions with levels 1 to 3.' using errcode = '22023';
  end if;
  if (select count(*) from public.questions where id = any(coalesce(p_spicy_question_ids, '{}'::uuid[]))
      and type = 'spicy_time' and not is_public and deleted_at is null and rating between 1 and 3)
    <> coalesce(array_length(p_spicy_question_ids, 1), 0) then
    raise exception 'Spicy selections must contain eligible Spicy questions with levels 1 to 3.' using errcode = '22023';
  end if;

  select count(*)::integer into confirmed_guest_count_value
  from public.event_invitations
  where event_id = p_event_id and seat_status = 'confirmed';

  select coalesce(revision, 0) + 1 into next_revision
  from public.event_question_sets where event_id = p_event_id for update;
  next_revision := coalesce(next_revision, 1);
  selection_fingerprint_value := md5(
    coalesce(array_to_string(p_sharing_question_ids, ','), '') || '|'
    || coalesce(array_to_string(p_spicy_question_ids, ','), '') || '|'
    || p_sharing_target::text || '|' || p_spicy_target::text || '|'
    || p_sharing_level_ratios::text || '|' || p_spicy_level_ratios::text
  );

  delete from public.event_questions where event_id = p_event_id;
  insert into public.event_questions (event_id, question_id, sort_order, assigned_at)
  select p_event_id, selected.question_id, selected.ordinality - 1, now()
  from unnest(coalesce(p_sharing_question_ids, '{}'::uuid[])) with ordinality
    as selected(question_id, ordinality);
  insert into public.event_questions (event_id, question_id, sort_order, assigned_at)
  select p_event_id, selected.question_id,
    coalesce(array_length(p_sharing_question_ids, 1), 0) + selected.ordinality - 1, now()
  from unnest(coalesce(p_spicy_question_ids, '{}'::uuid[])) with ordinality
    as selected(question_id, ordinality);

  insert into public.event_question_sets (
    event_id, revision, confirmed_guest_count, sharing_target, spicy_target,
    sharing_level_ratios, spicy_level_ratios, selection_fingerprint,
    updated_by_admin_id, updated_action_id, created_at, updated_at
  ) values (
    p_event_id, next_revision, confirmed_guest_count_value, p_sharing_target, p_spicy_target,
    p_sharing_level_ratios, p_spicy_level_ratios, selection_fingerprint_value,
    p_admin_id, action_id, now(), now()
  ) on conflict (event_id) do update
  set revision = excluded.revision,
      confirmed_guest_count = excluded.confirmed_guest_count,
      sharing_target = excluded.sharing_target,
      spicy_target = excluded.spicy_target,
      sharing_level_ratios = excluded.sharing_level_ratios,
      spicy_level_ratios = excluded.spicy_level_ratios,
      selection_fingerprint = excluded.selection_fingerprint,
      updated_by_admin_id = excluded.updated_by_admin_id,
      updated_action_id = excluded.updated_action_id,
      updated_at = now();

  update public.event_materials
  set stale_at = now(), updated_at = now()
  where event_id = p_event_id
    and kind = 'event_guide'
    and question_set_revision is distinct from next_revision
    and stale_at is null;

  result_value := jsonb_build_object(
    'ok', true,
    'actionId', action_id,
    'eventId', p_event_id,
    'revision', next_revision,
    'confirmedGuestCount', confirmed_guest_count_value,
    'sharingCount', coalesce(array_length(p_sharing_question_ids, 1), 0),
    'spicyCount', coalesce(array_length(p_spicy_question_ids, 1), 0),
    'selectionFingerprint', selection_fingerprint_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.set_event_host(
  p_event_id uuid,
  p_member_id uuid,
  p_public_intro text,
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
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  host_record public.event_hosts%rowtype;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'set_event_host', p_admin_id, null, p_idempotency_key,
    jsonb_build_object('memberId', p_member_id)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into invitation_record
  from public.event_invitations
  where event_id = p_event_id and member_id = p_member_id
  for update;
  select * into event_record from public.events where id = p_event_id for update;
  if invitation_record.id is null or invitation_record.seat_status <> 'confirmed' then
    raise exception 'The host must hold a confirmed, non-cancelled seat.' using errcode = '22023';
  end if;
  if event_record.status not in ('inviting', 'confirmed') then
    raise exception 'A host cannot be assigned in this event state.' using errcode = '22023';
  end if;

  select * into host_record from public.event_hosts where event_id = p_event_id for update;
  if host_record.event_id is not null and host_record.member_id <> p_member_id then
    update public.event_attendees
    set is_host = false, status = 'confirmed', updated_at = now()
    where event_id = p_event_id and member_id = host_record.member_id;
  end if;

  insert into public.event_hosts (
    event_id, member_id, invitation_id, public_intro,
    assigned_by_admin_id, assigned_action_id, assigned_at, updated_at
  ) values (
    p_event_id, p_member_id, invitation_record.id, nullif(btrim(p_public_intro), ''),
    p_admin_id, action_id, now(), now()
  ) on conflict (event_id) do update
  set member_id = excluded.member_id,
      invitation_id = excluded.invitation_id,
      public_intro = excluded.public_intro,
      assigned_by_admin_id = excluded.assigned_by_admin_id,
      assigned_action_id = excluded.assigned_action_id,
      assigned_at = excluded.assigned_at,
      updated_at = now()
  returning * into host_record;

  update public.event_attendees
  set is_host = true, status = 'host', updated_at = now()
  where event_id = p_event_id and member_id = p_member_id;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', p_event_id,
    'hostMemberId', host_record.member_id, 'assignedAt', host_record.assigned_at,
    'deliveryCount', 0
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.queue_event_host_package_delivery(
  p_event_id uuid,
  p_material_id uuid,
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
  delivery_id uuid;
  event_record public.events%rowtype;
  host_record public.event_hosts%rowtype;
  invitation_record public.event_invitations%rowtype;
  material_record public.event_materials%rowtype;
  question_set_record public.event_question_sets%rowtype;
  sharing_count integer;
  spicy_count integer;
  frozen_payload_value jsonb;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'queue_event_host_package_delivery', p_admin_id, null,
    p_idempotency_key, jsonb_build_object('materialId', p_material_id)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events where id = p_event_id for update;
  select * into host_record from public.event_hosts where event_id = p_event_id for update;
  select * into question_set_record from public.event_question_sets where event_id = p_event_id for update;
  select * into material_record from public.event_materials where id = p_material_id and event_id = p_event_id;

  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'confirmed' or event_record.confirmation_released_at is null
    or nullif(btrim(event_record.title), '') is null
    or nullif(btrim(event_record.timezone), '') is null
    or nullif(btrim(event_record.venue_name), '') is null
    or nullif(btrim(event_record.venue_address), '') is null then
    raise exception 'The event must be confirmed with complete released details.' using errcode = '22023';
  end if;
  if event_record.language_code not in ('en', 'es') then
    raise exception 'The event must use English or Spanish.' using errcode = '22023';
  end if;
  if host_record.event_id is null then
    raise exception 'Assign a host before sending the package.' using errcode = '22023';
  end if;
  select * into invitation_record from public.event_invitations
  where id = host_record.invitation_id and event_id = p_event_id
    and member_id = host_record.member_id and seat_status = 'confirmed';
  if invitation_record.id is null then
    raise exception 'The assigned host no longer has a confirmed seat.' using errcode = '22023';
  end if;
  if question_set_record.event_id is null then
    raise exception 'Save the event question set before sending the package.' using errcode = '22023';
  end if;

  select
    count(*) filter (where questions.type = 'sharing_time')::integer,
    count(*) filter (where questions.type = 'spicy_time')::integer
  into sharing_count, spicy_count
  from public.event_questions
  join public.questions on questions.id = event_questions.question_id
  where event_questions.event_id = p_event_id;
  if sharing_count <> question_set_record.sharing_target
    or spicy_count <> question_set_record.spicy_target then
    raise exception 'Both rounds must contain exactly their saved targets.' using errcode = '22023';
  end if;
  if material_record.id is null
    or material_record.kind <> 'event_guide'
    or material_record.locale <> event_record.language_code
    or material_record.question_set_revision is distinct from question_set_record.revision
    or material_record.stale_at is not null
    or material_record.storage_path is null
    or material_record.byte_size is null
    or material_record.byte_size >= 4194304 then
    raise exception 'Generate the current event-language PDF before sending.' using errcode = '22023';
  end if;

  frozen_payload_value := public.event_frozen_payload(event_record.id, invitation_record.id)
    || jsonb_build_object(
      'hostPublicIntro', host_record.public_intro,
      'materialId', material_record.id,
      'materialUrl', material_record.public_url,
      'materialVersion', material_record.version,
      'materialStoragePath', material_record.storage_path,
      'questionSetRevision', material_record.question_set_revision,
      'sharingQuestionCount', sharing_count,
      'spicyQuestionCount', spicy_count,
      'arriveEarlyMinutes', 5,
      'eventAppPath', '/events/' || event_record.id::text
    );
  if not public.event_payload_is_secret_free(frozen_payload_value) then
    raise exception 'Host package payload cannot contain bearer secrets.' using errcode = '22023';
  end if;

  insert into public.event_email_deliveries (
    event_id, invitation_id, member_id, triggered_by_admin_id, triggering_action_id,
    email_type, locale, template_id, template_version, payload, idempotency_key
  ) values (
    p_event_id, invitation_record.id, host_record.member_id, p_admin_id, action_id,
    'host_package', event_record.language_code, 'host_package', 'v2',
    frozen_payload_value, 'host-package-' || material_record.id::text
  ) on conflict (idempotency_key) do update
    set updated_at = public.event_email_deliveries.updated_at
  returning id into delivery_id;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', p_event_id,
    'deliveryId', delivery_id, 'deliveryCount', 1,
    'materialId', material_record.id,
    'questionSetRevision', question_set_record.revision
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.assert_event_question_exposure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.event_attendees
    where event_attendees.event_id = new.event_id
      and event_attendees.member_id = new.member_id
      and event_attendees.status in ('attended', 'host')
  ) and not exists (
    select 1
    from public.events
    join public.event_invitations
      on event_invitations.event_id = events.id
    where events.id = new.event_id
      and events.status = 'completed'
      and event_invitations.member_id = new.member_id
      and event_invitations.seat_status = 'confirmed'
  ) then
    raise exception 'Question exposure requires the completed event confirmed cohort.'
      using errcode = '23514';
  end if;

  if new.event_question_id is not null and not exists (
    select 1 from public.event_questions
    where event_questions.id = new.event_question_id
      and event_questions.event_id = new.event_id
      and event_questions.question_id = new.question_id
  ) then
    raise exception 'Question exposure must match the assigned event question.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.mark_event_completed(
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
  exposure_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'mark_event_completed', p_admin_id, null,
    p_idempotency_key, '{}'::jsonb
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'confirmed' then
    raise exception 'Only a confirmed event can be completed.' using errcode = '22023';
  end if;
  if event_record.starts_at > now() then
    raise exception 'An event cannot be completed before it starts.' using errcode = '22023';
  end if;

  update public.events
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = event_record.id returning * into event_record;

  insert into public.event_question_exposures (
    event_id, event_question_id, question_id, member_id, seen_at, created_at
  )
  select event_record.id, event_questions.id, event_questions.question_id,
    event_invitations.member_id, event_record.completed_at, now()
  from public.event_questions
  cross join public.event_invitations
  where event_questions.event_id = event_record.id
    and event_invitations.event_id = event_record.id
    and event_invitations.seat_status = 'confirmed'
  on conflict (event_id, question_id, member_id) do nothing;
  get diagnostics exposure_count_value = row_count;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'completed', 'transitioned', true,
    'completedAt', event_record.completed_at,
    'exposureCount', exposure_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

revoke all on function public.replace_event_question_set(uuid, uuid[], uuid[], integer, integer, jsonb, jsonb, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.set_event_host(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.queue_event_host_package_delivery(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.replace_event_question_set(uuid, uuid[], uuid[], integer, integer, jsonb, jsonb, uuid, text, text)
  to service_role;
grant execute on function public.set_event_host(uuid, uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.queue_event_host_package_delivery(uuid, uuid, uuid, text, text)
  to service_role;
