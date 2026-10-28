-- PERBAIKAN SKEMA MASTER GAJI/TUNJANGAN YANG SUDAH ADA
-- Gunakan script ini jika company_salary_items sudah dibuat oleh versi migration 020 sebelumnya.
-- Jangan jalankan ulang CREATE TABLE dari migration 020.
-- Target: pilihan Bayar/Potong, % dari Gaji, Batas Maksimum, dan Akun Beban mengikuti aturan terbaru.

begin;

-- Tambahkan kolom baru dengan aman jika belum ada.
alter table public.company_salary_items
  add column if not exists percentage_of_salary numeric(8,4),
  add column if not exists maximum_salary_enabled boolean not null default false;

-- Akun beban hanya wajib untuk tipe yang memang memerlukannya.
alter table public.company_salary_items alter column account_id drop not null;

-- Lepas constraint lama sebelum menormalkan nilai dan memasang daftar baru.
alter table public.company_salary_items
  drop constraint if exists company_salary_items_item_type_check;
alter table public.company_salary_items
  drop constraint if exists company_salary_items_pay_type_check;
alter table public.company_salary_items
  drop constraint if exists company_salary_items_percentage_check;

-- Kompatibilitas data yang mungkin sudah disimpan memakai label versi sebelumnya.
update public.company_salary_items
set pay_type = case
  when item_type = 'Penerimaan dalam bentuk natura dan kenikmatan lainnya'
    then 'Non bulanan/setahun sekali'
  when item_type in (
    'Honorarium dan Imbalan lain sejenisnya',
    'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR'
  ) and pay_type in ('Tidak Tetap', 'Non bulanan/setahun sekali')
    then 'Non bulanan/setahun sekali'
  else 'Bulanan'
end;

-- Daftar tipe diperluas dengan iuran pensiun/THT/JHT yang dibayarkan pekerja.
alter table public.company_salary_items
  add constraint company_salary_items_item_type_check check (item_type in (
    'Gaji/Pensiun atau THT/JHT',
    'Tunjangan PPh',
    'Subsidi PPh',
    'Tunjangan Lainnya, Uang lembur dan sebagainya',
    'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
    'Honorarium dan Imbalan lain sejenisnya',
    'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
    'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
    'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
    'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja',
    'Potongan Gaji (Tidak Mengurangi PPh)',
    'Pengurangan Gaji (Mengurangi PPh)',
    'Premi asuransi kesehatan dibayarkan pekerja',
    'Iuran Pensiun/THT/JHT dibayarkan Pekerja'
  ));

alter table public.company_salary_items
  add constraint company_salary_items_pay_type_check
  check (pay_type in ('Bulanan', 'Non bulanan/setahun sekali'));

alter table public.company_salary_items
  add constraint company_salary_items_percentage_check
  check (percentage_of_salary is null or (percentage_of_salary >= 0 and percentage_of_salary <= 100));

create unique index if not exists company_salary_items_name_uq
  on public.company_salary_items(company_id, lower(trim(name)));
create index if not exists company_salary_items_company_active_idx
  on public.company_salary_items(company_id, active, name);

create or replace function public.company_salary_item_pay_options(p_type text) returns text[]
language sql immutable as $$
  select case
    when p_type = 'Penerimaan dalam bentuk natura dan kenikmatan lainnya'
      then array['Non bulanan/setahun sekali']::text[]
    when p_type in (
      'Honorarium dan Imbalan lain sejenisnya',
      'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR'
    ) then array['Bulanan','Non bulanan/setahun sekali']::text[]
    else array['Bulanan']::text[]
  end
$$;

create or replace function public.company_salary_item_needs_percentage(p_type text) returns boolean
language sql immutable as $$
  select p_type in (
    'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
    'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
    'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja',
    'Premi asuransi kesehatan dibayarkan pekerja',
    'Iuran Pensiun/THT/JHT dibayarkan Pekerja'
  )
$$;

create or replace function public.company_salary_item_needs_account(p_type text) returns boolean
language sql immutable as $$
  select p_type in (
    'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
    'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
    'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
    'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
    'Potongan Gaji (Tidak Mengurangi PPh)',
    'Pengurangan Gaji (Mengurangi PPh)'
  )
$$;

create or replace function public.company_salary_item_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id','')::uuid;
  sid uuid := nullif(p->>'id','')::uuid;
  name_value text := trim(coalesce(p->>'name',''));
  type_value text := trim(coalesce(p->>'item_type',''));
  pay_value text := trim(coalesce(p->>'pay_type',''));
  account_value uuid := nullif(p->>'account_id','')::uuid;
  percentage_value numeric := nullif(p->>'percentage_of_salary','')::numeric;
  maximum_value boolean := coalesce((p->>'maximum_salary_enabled')::boolean,false);
  active_value boolean := coalesce((p->>'active')::boolean,true);
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur gaji/tunjangan';
  end if;
  if name_value = '' then raise exception 'Nama gaji/tunjangan wajib diisi'; end if;
  if type_value not in (
    'Gaji/Pensiun atau THT/JHT',
    'Tunjangan PPh',
    'Subsidi PPh',
    'Tunjangan Lainnya, Uang lembur dan sebagainya',
    'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
    'Honorarium dan Imbalan lain sejenisnya',
    'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
    'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
    'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
    'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja',
    'Potongan Gaji (Tidak Mengurangi PPh)',
    'Pengurangan Gaji (Mengurangi PPh)',
    'Premi asuransi kesehatan dibayarkan pekerja',
    'Iuran Pensiun/THT/JHT dibayarkan Pekerja'
  ) then raise exception 'Tipe gaji/tunjangan tidak valid'; end if;

  if not (pay_value = any(public.company_salary_item_pay_options(type_value))) then
    raise exception 'Pilihan Bayar/Potong tidak sesuai dengan tipe gaji/tunjangan';
  end if;

  if public.company_salary_item_needs_percentage(type_value) then
    if percentage_value is null or percentage_value < 0 or percentage_value > 100 then
      raise exception 'Persentase dari gaji wajib diisi antara 0 sampai 100';
    end if;
  else
    percentage_value := null;
  end if;

  if public.company_salary_item_needs_account(type_value) then
    if account_value is null then raise exception 'Pilih akun beban'; end if;
  else
    account_value := null;
  end if;

  if account_value is not null and not exists (
    select 1 from public.ak_akun a
    where a.id = account_value and a.company_id = cid and a.tipe = 'beban' and a.aktif
  ) then raise exception 'Akun beban tidak aktif atau bukan milik perusahaan ini'; end if;

  if type_value <> 'Iuran Pensiun/THT/JHT dibayarkan Pekerja' then
    maximum_value := false;
  end if;

  if sid is null then
    insert into public.company_salary_items(
      company_id,name,item_type,pay_type,percentage_of_salary,maximum_salary_enabled,account_id,active
    ) values (
      cid,name_value,type_value,pay_value,percentage_value,maximum_value,account_value,active_value
    ) returning id into sid;
  else
    update public.company_salary_items
       set name=name_value,item_type=type_value,pay_type=pay_value,
           percentage_of_salary=percentage_value,maximum_salary_enabled=maximum_value,
           account_id=account_value,active=active_value,updated_at=now()
     where id=sid and company_id=cid;
    if not found then raise exception 'Data gaji/tunjangan tidak ditemukan'; end if;
  end if;
  return sid;
end $$;

create or replace function public.company_salary_item_delete(p_company uuid, p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_company is null or not public.is_admin(p_company) then
    raise exception 'Hanya owner/admin perusahaan yang bisa menghapus gaji/tunjangan';
  end if;
  delete from public.company_salary_items where id=p_item and company_id=p_company;
  if not found then raise exception 'Data gaji/tunjangan tidak ditemukan'; end if;
end $$;

alter table public.company_salary_items enable row level security;
grant select on public.company_salary_items to authenticated;
grant execute on function public.company_salary_item_pay_options(text) to authenticated;
grant execute on function public.company_salary_item_needs_percentage(text) to authenticated;
grant execute on function public.company_salary_item_needs_account(text) to authenticated;
grant execute on function public.company_salary_item_save(jsonb) to authenticated;
grant execute on function public.company_salary_item_delete(uuid, uuid) to authenticated;

commit;
