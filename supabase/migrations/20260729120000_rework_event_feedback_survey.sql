alter table public.event_feedback
  add column if not exists attended boolean not null default true,
  add column if not exists nonattendance_reason text,
  add column if not exists nonattendance_other text,
  add column if not exists group_compatibility_rating integer,
  add column if not exists wants_to_connect boolean not null default false,
  add column if not exists connection_member_ids uuid[] not null default '{}'::uuid[];

alter table public.event_feedback
  drop constraint if exists event_feedback_one_star_detail_check,
  drop constraint if exists event_feedback_at_least_one_rating_check,
  drop constraint if exists event_feedback_group_compatibility_check,
  drop constraint if exists event_feedback_nonattendance_reason_check,
  drop constraint if exists event_feedback_nonattendance_other_length_check,
  drop constraint if exists event_feedback_connection_count_check,
  drop constraint if exists event_feedback_attendance_branch_check;

alter table public.event_feedback
  add constraint event_feedback_group_compatibility_check
    check (
      group_compatibility_rating is null
      or group_compatibility_rating between 1 and 5
    ),
  add constraint event_feedback_nonattendance_reason_check
    check (
      nonattendance_reason is null
      or nonattendance_reason in (
        'schedule_change',
        'illness',
        'event_not_appealing',
        'other'
      )
    ),
  add constraint event_feedback_nonattendance_other_length_check
    check (
      nonattendance_other is null
      or length(btrim(nonattendance_other)) between 1 and 300
    ),
  add constraint event_feedback_connection_count_check
    check (cardinality(connection_member_ids) <= 32),
  add constraint event_feedback_attendance_branch_check
    check (
      (
        attended
        and nonattendance_reason is null
        and nonattendance_other is null
      )
      or
      (
        not attended
        and nonattendance_reason is not null
        and (
          nonattendance_reason = 'other'
          or nonattendance_other is null
        )
        and (
          nonattendance_reason <> 'other'
          or length(btrim(coalesce(nonattendance_other, ''))) > 0
        )
        and overall_rating is null
        and group_compatibility_rating is null
        and questions_rating is null
        and restaurant_rating is null
        and host_rating is null
        and hosting_experience_rating is null
        and comments is null
        and one_star_detail is null
        and not wants_to_connect
        and cardinality(connection_member_ids) = 0
      )
    );

comment on column public.event_feedback.attended is
  'Whether the member says they attended the event.';
comment on column public.event_feedback.nonattendance_reason is
  'Structured reason supplied when the member did not attend.';
comment on column public.event_feedback.group_compatibility_rating is
  'Member rating from 1 to 5 for compatibility with the event group.';
comment on column public.event_feedback.connection_member_ids is
  'Other confirmed event members selected as people the respondent would like to connect with.';

create or replace function public.submit_event_feedback_v2(
  p_event_id uuid,
  p_attended boolean,
  p_nonattendance_reason text,
  p_nonattendance_other text,
  p_overall_rating integer,
  p_group_compatibility_rating integer,
  p_questions_rating integer,
  p_restaurant_rating integer,
  p_host_rating integer,
  p_wants_to_connect boolean,
  p_connection_member_ids uuid[],
  p_comments text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  feedback_record public.event_feedback%rowtype;
  connection_member_ids_value uuid[];
  normalized_nonattendance_reason text := nullif(btrim(p_nonattendance_reason), '');
  normalized_nonattendance_other text := nullif(btrim(p_nonattendance_other), '');
  normalized_comments text := nullif(btrim(p_comments), '');
  has_other_host boolean := false;
begin
  if member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;
  if p_attended is null then
    raise exception 'Choose whether you attended the event.' using errcode = '22023';
  end if;

  select * into invitation_record
  from public.event_invitations
  where event_id = p_event_id and member_id = member_id_value
  for update;

  select * into event_record
  from public.events
  where id = p_event_id
  for update;

  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;
  if invitation_record.id is null
    or invitation_record.seat_status <> 'confirmed'
    or invitation_record.cancelled_at is not null then
    raise exception 'Feedback requires a confirmed, non-cancelled seat.'
      using errcode = '22023';
  end if;
  if event_record.status <> 'completed'
    and coalesce(event_record.ends_at, event_record.starts_at) > now() then
    raise exception 'Feedback opens after the event ends.' using errcode = '22023';
  end if;

  select coalesce(array_agg(candidate.member_id order by candidate.member_id), '{}'::uuid[])
  into connection_member_ids_value
  from (
    select distinct unnest(coalesce(p_connection_member_ids, '{}'::uuid[])) as member_id
  ) as candidate;

  if cardinality(connection_member_ids_value) > 32 then
    raise exception 'Choose no more than 32 members to connect with.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.event_hosts
    where event_id = p_event_id
      and member_id <> member_id_value
  ) into has_other_host;

  if p_attended then
    if normalized_nonattendance_reason is not null
      or normalized_nonattendance_other is not null then
      raise exception 'Attendance reasons are only accepted when you did not attend.'
        using errcode = '22023';
    end if;
    if p_overall_rating is null
      or p_group_compatibility_rating is null
      or p_questions_rating is null
      or p_restaurant_rating is null then
      raise exception 'Complete every event rating.' using errcode = '22023';
    end if;
    if has_other_host and p_host_rating is null then
      raise exception 'Add a host rating.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from unnest(connection_member_ids_value) as selected(selected_member_id)
      where selected.selected_member_id = member_id_value
        or not exists (
          select 1
          from public.event_invitations as selected_invitation
          where selected_invitation.event_id = p_event_id
            and selected_invitation.member_id = selected.selected_member_id
            and selected_invitation.seat_status = 'confirmed'
            and selected_invitation.cancelled_at is null
        )
    ) then
      raise exception 'A selected member is not part of this event.'
        using errcode = '22023';
    end if;
  else
    if normalized_nonattendance_reason not in (
      'schedule_change',
      'illness',
      'event_not_appealing',
      'other'
    ) then
      raise exception 'Choose what stopped you from attending.'
        using errcode = '22023';
    end if;
    if normalized_nonattendance_reason = 'other'
      and normalized_nonattendance_other is null then
      raise exception 'Tell us what stopped you from attending.'
        using errcode = '22023';
    end if;
    if p_overall_rating is not null
      or p_group_compatibility_rating is not null
      or p_questions_rating is not null
      or p_restaurant_rating is not null
      or p_host_rating is not null
      or normalized_comments is not null
      or coalesce(p_wants_to_connect, false)
      or cardinality(connection_member_ids_value) > 0 then
      raise exception 'Event ratings are only accepted when you attended.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.event_feedback (
    event_id,
    member_id,
    attended,
    nonattendance_reason,
    nonattendance_other,
    overall_rating,
    group_compatibility_rating,
    questions_rating,
    restaurant_rating,
    host_rating,
    hosting_experience_rating,
    wants_to_connect,
    connection_member_ids,
    comments,
    one_star_detail,
    submitted_at,
    created_at,
    updated_at
  ) values (
    event_record.id,
    member_id_value,
    p_attended,
    case when p_attended then null else normalized_nonattendance_reason end,
    case
      when not p_attended and normalized_nonattendance_reason = 'other'
        then normalized_nonattendance_other
      else null
    end,
    case when p_attended then p_overall_rating else null end,
    case when p_attended then p_group_compatibility_rating else null end,
    case when p_attended then p_questions_rating else null end,
    case when p_attended then p_restaurant_rating else null end,
    case when p_attended and has_other_host then p_host_rating else null end,
    null,
    case
      when p_attended
        then coalesce(p_wants_to_connect, false)
          or cardinality(connection_member_ids_value) > 0
      else false
    end,
    case when p_attended then connection_member_ids_value else '{}'::uuid[] end,
    case when p_attended then normalized_comments else null end,
    null,
    now(),
    now(),
    now()
  )
  on conflict (event_id, member_id) do update
  set attended = excluded.attended,
      nonattendance_reason = excluded.nonattendance_reason,
      nonattendance_other = excluded.nonattendance_other,
      overall_rating = excluded.overall_rating,
      group_compatibility_rating = excluded.group_compatibility_rating,
      questions_rating = excluded.questions_rating,
      restaurant_rating = excluded.restaurant_rating,
      host_rating = excluded.host_rating,
      hosting_experience_rating = excluded.hosting_experience_rating,
      wants_to_connect = excluded.wants_to_connect,
      connection_member_ids = excluded.connection_member_ids,
      comments = excluded.comments,
      one_star_detail = excluded.one_star_detail,
      submitted_at = now(),
      updated_at = now()
  returning * into feedback_record;

  return jsonb_build_object(
    'ok', true,
    'eventId', event_record.id,
    'feedbackId', feedback_record.id,
    'attended', feedback_record.attended,
    'submittedAt', feedback_record.submitted_at
  );
end;
$$;

-- Confirmed event members may see first names in the feedback multi-select.
-- Messaging remains gated separately on an attended=true feedback response.
create or replace function public.get_past_event_attendees(p_event_id uuid)
returns table (
  member_id uuid,
  first_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    members.id as member_id,
    coalesce(
      nullif(latest.profile_json ->> 'profile.first_name', ''),
      nullif(split_part(members.email, '@', 1), ''),
      'Member'
    ) as first_name
  from public.event_invitations as invitations
  join public.members as members on members.id = invitations.member_id
  left join lateral (
    select registrations.profile_json
    from public.profile_registrations as registrations
    where registrations.contact_email_norm = members.email_norm
      and registrations.status = 'submitted'
    order by registrations.updated_at desc
    limit 1
  ) as latest on true
  where invitations.event_id = p_event_id
    and invitations.member_id <> public.current_active_member_id()
    and invitations.seat_status = 'confirmed'
    and invitations.cancelled_at is null
    and public.member_has_confirmed_event_seat(
      public.current_active_member_id(),
      p_event_id
    )
  order by first_name asc;
$$;

create or replace function public.member_attended_past_event(
  p_member_id uuid,
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_has_confirmed_event_seat(p_member_id, p_event_id)
    and exists (
      select 1
      from public.event_feedback
      where event_id = p_event_id
        and member_id = p_member_id
        and attended
    );
$$;

revoke all on function public.submit_event_feedback_v2(
  uuid,
  boolean,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  boolean,
  uuid[],
  text
) from public, anon, authenticated;

grant execute on function public.submit_event_feedback_v2(
  uuid,
  boolean,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  boolean,
  uuid[],
  text
) to authenticated;
