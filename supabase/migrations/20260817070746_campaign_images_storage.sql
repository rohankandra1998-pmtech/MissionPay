insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-images',
  'campaign-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Fundraisers can insert own campaign images" on storage.objects;
drop policy if exists "Fundraisers can select own campaign images" on storage.objects;
drop policy if exists "Fundraisers can update own campaign images" on storage.objects;
drop policy if exists "Fundraisers can delete own campaign images" on storage.objects;

create policy "Fundraisers can insert own campaign images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Fundraisers can select own campaign images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Fundraisers can update own campaign images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Fundraisers can delete own campaign images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
