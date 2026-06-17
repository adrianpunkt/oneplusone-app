alter table public.profile_registrations
  add column if not exists locale text not null default 'en';

alter table public.profile_registrations
  drop constraint if exists profile_registrations_locale_check;

alter table public.profile_registrations
  add constraint profile_registrations_locale_check
    check (locale in ('en', 'es'));

alter table public.profile_registrations
  drop constraint if exists profile_registrations_source_path_check;

alter table public.profile_registrations
  add constraint profile_registrations_source_path_check
    check (source_path in ('/story', '/your-story', '/es/historia', '/es/tu-historia'));

drop policy if exists "Users can create their own profile registration"
  on public.profile_registrations;

create policy "Users can create their own profile registration"
  on public.profile_registrations
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and source_path in ('/story', '/your-story', '/es/historia', '/es/tu-historia')
    and locale in ('en', 'es')
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
    and source_path in ('/story', '/your-story', '/es/historia', '/es/tu-historia')
    and locale in ('en', 'es')
  );
