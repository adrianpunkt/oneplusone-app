drop policy if exists "Users can update their own profile registration"
  on public.profile_registrations;

create policy "Users can update their own profile registration"
  on public.profile_registrations
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and source_path in ('/story', '/your-story')
    and (
      status <> 'submitted'
      or not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    )
  )
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and source_path in ('/story', '/your-story')
  );
