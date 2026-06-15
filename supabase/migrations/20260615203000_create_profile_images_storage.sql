insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-images',
  'profile-images',
  true,
  1048576,
  array['image/webp', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile images are publicly readable" on storage.objects;
create policy "Profile images are publicly readable"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile-images');

drop policy if exists "Members can upload own profile images" on storage.objects;
create policy "Members can upload own profile images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-images'
    and split_part(name, '/', 1) = public.current_member_id()::text
  );

drop policy if exists "Members can update own profile images" on storage.objects;
create policy "Members can update own profile images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-images'
    and split_part(name, '/', 1) = public.current_member_id()::text
  )
  with check (
    bucket_id = 'profile-images'
    and split_part(name, '/', 1) = public.current_member_id()::text
  );

drop policy if exists "Members can delete own profile images" on storage.objects;
create policy "Members can delete own profile images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-images'
    and split_part(name, '/', 1) = public.current_member_id()::text
  );
