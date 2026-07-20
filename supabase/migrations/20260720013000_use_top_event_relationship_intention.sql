-- Event summaries show the most common relationship-intention option from each
-- submitted stories. Keep the existing majority_* column and payload names for
-- compatibility, but do not replace the calculated option with free-form copy.

create or replace function public.refresh_event_summary_snapshot(
  p_event_id uuid,
  p_stage text,
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  age_min_value integer;
  age_max_value integer;
  source_count_value integer;
  top_intention text;
  top_intention_count integer := 0;
  majority_value text;
begin
  if p_stage not in ('proposed', 'confirmed') then
    raise exception 'Unknown event summary stage.' using errcode = '22023';
  end if;

  select * into event_record from public.events where id = p_event_id;
  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  with source as (
    select latest.profile_json
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
      and (p_stage = 'proposed' or invitations.seat_status = 'confirmed')
  )
  select
    min(case when profile_json ->> 'profile.age' ~ '^[0-9]{2,3}$'
      then (profile_json ->> 'profile.age')::integer end),
    max(case when profile_json ->> 'profile.age' ~ '^[0-9]{2,3}$'
      then (profile_json ->> 'profile.age')::integer end),
    count(*)::integer
  into age_min_value, age_max_value, source_count_value
  from source;

  with raw_intentions as (
    select nullif(btrim(latest.profile_json ->> 'profile.available_relationships'), '') as intention
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
      and (p_stage = 'proposed' or invitations.seat_status = 'confirmed')
  ), intentions as (
    select case intention
      when 'A serious relationship, slow dating, and meeting someone offline first'
        then 'Marriage / life partner'
      when 'A serious relationship' then 'Marriage / life partner'
      when 'Serious relationship' then 'Marriage / life partner'
      when 'A committed exclusive relationship' then 'Exclusive relationship'
      when 'Committed relationship' then 'Exclusive relationship'
      when 'Casual dating' then 'Casual dating, seeing where it goes'
      when 'Meeting people and seeing where it goes'
        then 'Casual dating, seeing where it goes'
      when 'See where it goes' then 'Casual dating, seeing where it goes'
      when 'Open relationship / ethical non-monogamy' then 'Ethical non-monogamy'
      when 'Not sure yet' then 'Not sure - still exploring'
      when 'Still exploring' then 'Not sure - still exploring'
      else intention
    end as intention
    from raw_intentions
  )
  select intention, count(*)::integer
  into top_intention, top_intention_count
  from intentions
  where intention is not null
  group by intention
  order by count(*) desc, intention
  limit 1;

  top_intention_count := coalesce(top_intention_count, 0);
  majority_value := top_intention;

  insert into public.event_summary_snapshots (
    event_id, stage, age_min, age_max, primary_language,
    additional_languages, majority_intention, majority_source_count,
    source_count, calculated_at, created_action_id
  ) values (
    event_record.id, p_stage, age_min_value, age_max_value,
    event_record.language_code, '[]'::jsonb, majority_value,
    top_intention_count, source_count_value, now(), p_action_id
  ) on conflict (event_id, stage) do update
  set age_min = excluded.age_min,
      age_max = excluded.age_max,
      primary_language = excluded.primary_language,
      additional_languages = excluded.additional_languages,
      majority_intention = excluded.majority_intention,
      majority_source_count = excluded.majority_source_count,
      source_count = excluded.source_count,
      calculated_at = excluded.calculated_at,
      created_action_id = excluded.created_action_id;

  return jsonb_build_object(
    'ageMin', age_min_value,
    'ageMax', age_max_value,
    'primaryLanguage', event_record.language_code,
    'additionalLanguages', '[]'::jsonb,
    'majorityIntention', majority_value,
    'sourceCount', source_count_value
  );
end;
$$;

do $$
declare
  snapshot_record record;
begin
  for snapshot_record in
    select event_id, stage, created_action_id
    from public.event_summary_snapshots
  loop
    perform public.refresh_event_summary_snapshot(
      snapshot_record.event_id,
      snapshot_record.stage,
      snapshot_record.created_action_id
    );
  end loop;
end;
$$;
