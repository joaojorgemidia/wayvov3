
insert into storage.buckets (id, name, public)
values ('crlv-documents', 'crlv-documents', false);

create policy "Anon upload CRLV"
on storage.objects for insert
to anon
with check (bucket_id = 'crlv-documents');

create policy "Anon read CRLV"
on storage.objects for select
to anon
using (bucket_id = 'crlv-documents');

create policy "Auth upload CRLV"
on storage.objects for insert
to authenticated
with check (bucket_id = 'crlv-documents');

create policy "Auth read CRLV"
on storage.objects for select
to authenticated
using (bucket_id = 'crlv-documents');
