-- Detail profil data usaha dan upload logo untuk onboarding ERP
-- Jalankan satu kali setelah migrasi 001_foundation.sql.

alter table public.companies
  add column if not exists alias_name text,
  add column if not exists business_type text,
  add column if not exists business_field text,
  add column if not exists logo_url text;

create or replace function public.create_company_with_details(
  p_name text,
  p_alias text,
  p_business_type text,
  p_business_field text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  clean_name text := btrim(coalesce(p_name, ''));
  clean_alias text := btrim(coalesce(p_alias, ''));
  clean_type text := btrim(coalesce(p_business_type, ''));
  clean_field text := btrim(coalesce(p_business_field, ''));
begin
  if auth.uid() is null then
    raise exception 'Belum login';
  end if;
  if clean_name = '' then
    raise exception 'Nama perusahaan wajib diisi';
  end if;
  if clean_alias = '' then
    raise exception 'Nama alias wajib diisi';
  end if;
  if clean_type = '' then
    raise exception 'Jenis usaha wajib dipilih';
  end if;
  if clean_field = '' then
    raise exception 'Bidang usaha wajib dipilih';
  end if;

  insert into public.companies (name, alias_name, business_type, business_field, created_by)
  values (clean_name, clean_alias, clean_type, clean_field, auth.uid())
  returning id into cid;

  insert into public.memberships (company_id, user_id, role)
  values (cid, auth.uid(), 'owner');

  return cid;
end;
$$;

grant execute on function public.create_company_with_details(text, text, text, text) to authenticated;

-- Logo usaha bersifat publik agar bisa ditampilkan di UI; hanya owner/admin perusahaan
-- yang dapat mengunggah file di folder company_id masing-masing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 524288, array['image/png', 'image/jpeg'])
on conflict (id) do update
set public = true,
    file_size_limit = 524288,
    allowed_mime_types = array['image/png', 'image/jpeg'];

drop policy if exists "Company admins upload company logos" on storage.objects;
create policy "Company admins upload company logos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-logos'
  and exists (
    select 1
    from public.companies c
    where c.id = (storage.foldername(name))[1]::uuid
      and public.is_admin(c.id)
  )
);
