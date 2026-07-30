-- Freeze and privately distribute one Sharing and one Spicy question per
-- confirmed attendee when a no-host event reminder is prepared.

create table if not exists public.event_round_question_releases (
  event_id uuid primary key references public.events(id) on delete cascade,
  question_set_revision integer not null,
  language_code text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_action_id uuid not null references public.event_action_runs(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint event_round_question_releases_revision_check
    check (question_set_revision > 0),
  constraint event_round_question_releases_language_check
    check (language_code in ('en', 'es')),
  constraint event_round_question_releases_window_check
    check (closes_at = opens_at + interval '24 hours')
);

create table if not exists public.event_round_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_round_question_releases(event_id) on delete cascade,
  round_type text not null,
  question_id uuid not null references public.questions(id) on delete restrict,
  sort_order integer not null,
  prompt_en text not null,
  prompt_es text not null,
  created_at timestamptz not null default now(),
  constraint event_round_questions_type_check
    check (round_type in ('sharing_time', 'spicy_time')),
  constraint event_round_questions_sort_order_check
    check (sort_order >= 0),
  constraint event_round_questions_prompt_en_check
    check (char_length(btrim(prompt_en)) between 1 and 1000),
  constraint event_round_questions_prompt_es_check
    check (char_length(btrim(prompt_es)) between 1 and 1000),
  constraint event_round_questions_event_type_question_key
    unique (event_id, round_type, question_id),
  constraint event_round_questions_event_type_order_key
    unique (event_id, round_type, sort_order),
  constraint event_round_questions_event_type_id_key
    unique (event_id, round_type, id)
);

create table if not exists public.event_round_question_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  round_type text not null,
  release_question_id uuid not null,
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  constraint event_round_question_assignments_type_check
    check (round_type in ('sharing_time', 'spicy_time')),
  constraint event_round_question_assignments_release_question_fkey
    foreign key (event_id, round_type, release_question_id)
    references public.event_round_questions(event_id, round_type, id)
    on delete cascade,
  constraint event_round_question_assignments_member_key
    unique (event_id, round_type, member_id),
  constraint event_round_question_assignments_question_key
    unique (event_id, round_type, release_question_id)
);

create index if not exists event_round_question_assignments_invitation_idx
  on public.event_round_question_assignments (invitation_id);

alter table public.event_round_question_releases enable row level security;
alter table public.event_round_questions enable row level security;
alter table public.event_round_question_assignments enable row level security;

revoke all on table public.event_round_question_releases
  from public, anon, authenticated;
revoke all on table public.event_round_questions
  from public, anon, authenticated;
revoke all on table public.event_round_question_assignments
  from public, anon, authenticated;

grant select, insert, update, delete on table public.event_round_question_releases
  to service_role;
grant select, insert, update, delete on table public.event_round_questions
  to service_role;
grant select, insert, update, delete on table public.event_round_question_assignments
  to service_role;

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
  question_set_record public.event_question_sets%rowtype;
  release_record public.event_round_question_releases%rowtype;
  recipient record;
  delivery_id uuid;
  delivery_payload jsonb;
  delivery_ids jsonb := '[]'::jsonb;
  delivery_count_value integer := 0;
  confirmed_guest_count_value integer := 0;
  sharing_question_count_value integer := 0;
  spicy_question_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if p_email_type not in (
    'invitation_member', 'invitation_pending', 'rsvp_reminder',
    'rsvp_last_call', 'event_confirmed', 'event_cancelled', 'host_package',
    'event_reminder', 'replacement_refund', 'no_replacement',
    'feedback_request', 'credit_offer'
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

  select * into event_record
  from public.events
  where id = p_event_id
  for update;
  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  if p_email_type = 'event_reminder' and event_record.host_status = 'none' then
    select count(*)::integer
    into confirmed_guest_count_value
    from public.event_invitations
    where event_id = event_record.id
      and seat_status = 'confirmed'
      and cancelled_at is null;

    select * into release_record
    from public.event_round_question_releases
    where event_id = event_record.id
    for update;

    if release_record.event_id is null then
      if event_record.language_code is null
        or event_record.language_code not in ('en', 'es') then
        raise exception 'A no-host reminder requires an English or Spanish event language.'
          using errcode = '22023';
      end if;

      select * into question_set_record
      from public.event_question_sets
      where event_id = event_record.id
      for update;
      if question_set_record.event_id is null then
        raise exception 'Save the event question set before sending a no-host reminder.'
          using errcode = '22023';
      end if;
      if question_set_record.confirmed_guest_count <> confirmed_guest_count_value then
        raise exception 'Refresh the event question set for the current confirmed attendees before sending.'
          using errcode = '22023';
      end if;

      select
        count(*) filter (where questions.type = 'sharing_time')::integer,
        count(*) filter (where questions.type = 'spicy_time')::integer
      into sharing_question_count_value, spicy_question_count_value
      from public.event_questions
      join public.questions on questions.id = event_questions.question_id
      where event_questions.event_id = event_record.id;

      if sharing_question_count_value < confirmed_guest_count_value
        or spicy_question_count_value < confirmed_guest_count_value then
        raise exception 'Save at least one Sharing and one Spicy question per confirmed attendee before sending.'
          using errcode = '22023';
      end if;
      if exists (
        select 1
        from public.event_questions
        join public.questions on questions.id = event_questions.question_id
        where event_questions.event_id = event_record.id
          and (
            nullif(btrim(questions.prompt), '') is null
            or nullif(btrim(questions.localized_content #>> '{es,prompt}'), '') is null
          )
      ) then
        raise exception 'Every saved event question requires English and Spanish copy before sending.'
          using errcode = '22023';
      end if;

      insert into public.event_round_question_releases (
        event_id,
        question_set_revision,
        language_code,
        opens_at,
        closes_at,
        created_action_id
      ) values (
        event_record.id,
        question_set_record.revision,
        event_record.language_code,
        event_record.starts_at,
        event_record.starts_at + interval '24 hours',
        action_id
      )
      returning * into release_record;

      insert into public.event_round_questions (
        event_id,
        round_type,
        question_id,
        sort_order,
        prompt_en,
        prompt_es
      )
      select
        event_record.id,
        questions.type,
        questions.id,
        (row_number() over (
          partition by questions.type
          order by event_questions.sort_order, event_questions.question_id
        ) - 1)::integer,
        btrim(questions.prompt),
        btrim(questions.localized_content #>> '{es,prompt}')
      from public.event_questions
      join public.questions on questions.id = event_questions.question_id
      where event_questions.event_id = event_record.id;
    end if;

    insert into public.event_round_question_assignments (
      event_id,
      round_type,
      release_question_id,
      invitation_id,
      member_id
    )
    with recipients as (
      select
        invitations.id as invitation_id,
        invitations.member_id,
        (row_number() over (
          order by invitations.created_at, invitations.id
        ) - 1)::integer as recipient_order
      from public.event_invitations as invitations
      where invitations.event_id = event_record.id
        and invitations.seat_status = 'confirmed'
        and invitations.cancelled_at is null
    )
    select
      event_record.id,
      release_questions.round_type,
      release_questions.id,
      recipients.invitation_id,
      recipients.member_id
    from recipients
    join public.event_round_questions as release_questions
      on release_questions.event_id = event_record.id
      and release_questions.sort_order = recipients.recipient_order
    on conflict (event_id, round_type, member_id) do nothing;
  end if;

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
          and members.membership_status in ('active', 'pending')
          and now() < event_record.rsvp_deadline_at
        when 'rsvp_last_call' then event_record.status = 'inviting'
          and invitations.response_status = 'invited'
          and members.membership_status in ('active', 'pending')
          and now() < event_record.rsvp_deadline_at
        when 'event_confirmed' then event_record.status = 'confirmed'
          and invitations.seat_status = 'confirmed'
        when 'event_cancelled' then event_record.status = 'cancelled'
        when 'host_package' then hosts.member_id is not null
          and invitations.seat_status = 'confirmed'
        when 'event_reminder' then event_record.status = 'confirmed'
          and invitations.seat_status = 'confirmed'
          and invitations.cancelled_at is null
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
    delivery_payload := public.event_frozen_payload(
      event_record.id,
      recipient.invitation_id
    );
    if p_email_type = 'event_reminder'
      and event_record.host_status = 'none'
      and release_record.event_id is not null then
      delivery_payload := delivery_payload || jsonb_build_object(
        'roundQuestionSetRevision', release_record.question_set_revision,
        'roundQuestionsOpenAt', release_record.opens_at,
        'roundQuestionsCloseAt', release_record.closes_at
      );
    end if;

    delivery_id := public.queue_event_email_delivery(
      event_record.id, recipient.invitation_id, recipient.member_id,
      p_admin_id, null, action_id, p_email_type,
      delivery_payload,
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

create or replace function public.get_my_event_round_question(
  p_event_id uuid,
  p_round_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  event_record public.events%rowtype;
  invitation_record public.event_invitations%rowtype;
  release_record public.event_round_question_releases%rowtype;
  assignment_record public.event_round_question_assignments%rowtype;
  stale_assignment_record public.event_round_question_assignments%rowtype;
  question_record public.event_round_questions%rowtype;
  current_timestamp_value timestamptz := statement_timestamp();
  event_title_value text;
  localized_prompt text;
begin
  if p_round_type not in ('sharing_time', 'spicy_time') then
    raise exception 'Round type must be sharing_time or spicy_time.'
      using errcode = '22023';
  end if;

  if current_member_id_value is null then
    return jsonb_build_object('ok', false, 'status', 'unavailable');
  end if;

  select * into event_record
  from public.events
  where id = p_event_id;

  select * into invitation_record
  from public.event_invitations
  where event_id = p_event_id
    and member_id = current_member_id_value
    and seat_status = 'confirmed'
    and cancelled_at is null
  order by confirmed_at desc nulls last, created_at desc
  limit 1;

  select * into release_record
  from public.event_round_question_releases
  where event_id = p_event_id
  for update;

  if event_record.id is null
    or event_record.status = 'cancelled'
    or invitation_record.id is null
    or release_record.event_id is null then
    return jsonb_build_object('ok', false, 'status', 'unavailable');
  end if;

  event_title_value := coalesce(
    nullif(
      btrim(event_record.localized_content -> release_record.language_code ->> 'title'),
      ''
    ),
    event_record.title
  );

  if current_timestamp_value < release_record.opens_at then
    return jsonb_build_object(
      'ok', true,
      'status', 'locked',
      'eventId', event_record.id,
      'eventTitle', event_title_value,
      'roundType', p_round_type,
      'languageCode', release_record.language_code,
      'startsAt', event_record.starts_at,
      'timezone', event_record.timezone,
      'city', event_record.city,
      'venueName', event_record.venue_name,
      'opensAt', release_record.opens_at,
      'closesAt', release_record.closes_at
    );
  end if;

  if current_timestamp_value >= release_record.closes_at then
    return jsonb_build_object(
      'ok', true,
      'status', 'expired',
      'eventId', event_record.id,
      'eventTitle', event_title_value,
      'roundType', p_round_type,
      'languageCode', release_record.language_code,
      'startsAt', event_record.starts_at,
      'timezone', event_record.timezone,
      'city', event_record.city,
      'venueName', event_record.venue_name,
      'opensAt', release_record.opens_at,
      'closesAt', release_record.closes_at
    );
  end if;

  select assignments.* into assignment_record
  from public.event_round_question_assignments as assignments
  where assignments.event_id = p_event_id
    and assignments.round_type = p_round_type
    and assignments.member_id = current_member_id_value;

  if assignment_record.id is null then
    select release_questions.* into question_record
    from public.event_round_questions as release_questions
    where release_questions.event_id = p_event_id
      and release_questions.round_type = p_round_type
      and not exists (
        select 1
        from public.event_round_question_assignments as assignments
        where assignments.event_id = release_questions.event_id
          and assignments.round_type = release_questions.round_type
          and assignments.release_question_id = release_questions.id
      )
    order by release_questions.sort_order
    limit 1;

    if question_record.id is not null then
      insert into public.event_round_question_assignments (
        event_id,
        round_type,
        release_question_id,
        invitation_id,
        member_id
      ) values (
        p_event_id,
        p_round_type,
        question_record.id,
        invitation_record.id,
        current_member_id_value
      )
      returning * into assignment_record;
    else
      select assignments.* into stale_assignment_record
      from public.event_round_question_assignments as assignments
      where assignments.event_id = p_event_id
        and assignments.round_type = p_round_type
        and not exists (
          select 1
          from public.event_invitations as invitations
          where invitations.id = assignments.invitation_id
            and invitations.event_id = assignments.event_id
            and invitations.member_id = assignments.member_id
            and invitations.seat_status = 'confirmed'
            and invitations.cancelled_at is null
        )
      order by assignments.assigned_at, assignments.id
      limit 1
      for update;

      if stale_assignment_record.id is null then
        return jsonb_build_object('ok', false, 'status', 'unavailable');
      end if;

      update public.event_round_question_assignments
      set invitation_id = invitation_record.id,
          member_id = current_member_id_value,
          assigned_at = current_timestamp_value
      where id = stale_assignment_record.id
      returning * into assignment_record;
    end if;
  end if;

  if question_record.id is null then
    select * into question_record
    from public.event_round_questions
    where id = assignment_record.release_question_id
      and event_id = p_event_id
      and round_type = p_round_type;
  end if;

  if question_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'unavailable');
  end if;

  localized_prompt := case release_record.language_code
    when 'es' then question_record.prompt_es
    else question_record.prompt_en
  end;

  return jsonb_build_object(
    'ok', true,
    'status', 'open',
    'eventId', event_record.id,
    'eventTitle', event_title_value,
    'roundType', p_round_type,
    'languageCode', release_record.language_code,
    'startsAt', event_record.starts_at,
    'timezone', event_record.timezone,
    'city', event_record.city,
    'venueName', event_record.venue_name,
    'opensAt', release_record.opens_at,
    'closesAt', release_record.closes_at,
    'question', localized_prompt
  );
end;
$$;

revoke all on function public.get_my_event_round_question(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_my_event_round_question(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
