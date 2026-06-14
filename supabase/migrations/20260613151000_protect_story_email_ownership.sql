drop index if exists public.profile_registrations_contact_email_norm_idx;

with duplicate_submissions as (
  select
    id,
    contact_email_norm,
    row_number() over (
      partition by contact_email_norm
      order by submitted_at desc nulls last, updated_at desc, started_at desc, id desc
    ) as duplicate_rank
  from public.profile_registrations
  where contact_email_norm is not null
    and status = 'submitted'
)
update public.profile_registrations as registration
set contact_email = duplicate_submissions.contact_email_norm || ' duplicate ' || registration.id::text,
    updated_at = now()
from duplicate_submissions
where registration.id = duplicate_submissions.id
  and duplicate_submissions.duplicate_rank > 1;

create unique index if not exists profile_registrations_contact_email_norm_submitted_key
  on public.profile_registrations (contact_email_norm)
  where contact_email_norm is not null
    and status = 'submitted';

create or replace function public.claim_profile_registration_for_current_email()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email_norm text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  target_registration_id uuid;
  target_user_id uuid;
begin
  if current_user_id is null or current_email_norm is null then
    raise exception 'Authenticated email is required to claim a story registration.'
      using errcode = '28000';
  end if;

  select id, user_id
    into target_registration_id, target_user_id
  from public.profile_registrations
  where contact_email_norm = current_email_norm
    and status = 'submitted'
  order by submitted_at desc nulls last, updated_at desc
  limit 1
  for update;

  if target_registration_id is null then
    raise exception 'No submitted story registration exists for the authenticated email.'
      using errcode = 'P0002';
  end if;

  if target_user_id = current_user_id then
    return target_registration_id;
  end if;

  if exists (
    select 1
    from public.profile_registrations
    where user_id = current_user_id
      and id <> target_registration_id
      and status = 'submitted'
  ) then
    raise exception 'The authenticated user already owns a submitted story registration.'
      using errcode = '23505';
  end if;

  delete from public.profile_registrations
  where user_id = current_user_id
    and status = 'started';

  update public.profile_registrations
    set user_id = current_user_id,
        last_seen_at = now(),
        updated_at = now()
  where id = target_registration_id
  returning id into target_registration_id;

  return target_registration_id;
end;
$$;

revoke all on function public.claim_profile_registration_for_current_email() from public;
grant execute on function public.claim_profile_registration_for_current_email() to authenticated;
