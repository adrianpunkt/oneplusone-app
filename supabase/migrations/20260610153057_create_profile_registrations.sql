create table if not exists public.profile_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'started',
  source_path text not null,
  story_variant text not null default 'default',
  profile_json jsonb not null default '{}'::jsonb,
  contact_email text,
  contact_email_norm text generated always as (lower(nullif(btrim(contact_email), ''))) stored,
  terms_accepted_at timestamptz,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_registrations_status_check
    check (status in ('started', 'submitted')),
  constraint profile_registrations_source_path_check
    check (source_path in ('/story', '/your-story')),
  constraint profile_registrations_story_variant_check
    check (story_variant in ('default', 'open')),
  constraint profile_registrations_submitted_check
    check (
      status <> 'submitted'
      or (
        contact_email_norm is not null
        and terms_accepted_at is not null
        and submitted_at is not null
        and profile_json <> '{}'::jsonb
      )
    )
);

alter table public.profile_registrations enable row level security;

revoke all on table public.profile_registrations from anon;
grant select, insert, update on table public.profile_registrations to authenticated;
grant all on table public.profile_registrations to service_role;

create index if not exists profile_registrations_status_idx
  on public.profile_registrations (status);

create index if not exists profile_registrations_contact_email_norm_idx
  on public.profile_registrations (contact_email_norm)
  where contact_email_norm is not null;

create index if not exists profile_registrations_submitted_at_idx
  on public.profile_registrations (submitted_at desc)
  where submitted_at is not null;

drop policy if exists "Users can view their own profile registration"
  on public.profile_registrations;

create policy "Users can view their own profile registration"
  on public.profile_registrations
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

drop policy if exists "Users can create their own profile registration"
  on public.profile_registrations;

create policy "Users can create their own profile registration"
  on public.profile_registrations
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and source_path in ('/story', '/your-story')
  );

drop policy if exists "Users can update their own profile registration"
  on public.profile_registrations;

create policy "Users can update their own profile registration"
  on public.profile_registrations
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  )
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and source_path in ('/story', '/your-story')
  );
