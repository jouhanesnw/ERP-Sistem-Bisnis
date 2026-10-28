-- MASTER GAJI / TUNJANGAN PER PERUSAHAAN
-- Prasyarat: migrasi 001-019 sudah berhasil dijalankan.

create table public.company_salary_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  item_type text not null check (item_type in (
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
    'Premi asuransi kesehatan dibayarkan pekerja'
  )),
  pay_type text not null check (pay_type in ('Bulanan', 'Tidak Tetap', 'Potong')),
  account_id uuid not null references public.ak_akun(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index company_salary_items_name_uq
  on public.company_salary_items(company_id, lower(trim(name)));
create index company_salary_items_company_active_idx
  on public.company_salary_items(company_id, active, name);

alter table public.company_salary_items enable row level security;
grant select on public.company_salary_items to authenticated;
create policy company_salary_items_select on public.company_salary_items
  for select using (public.is_member(company_id));

-- The payroll classification is derived from the selected type, not trusted from the browser.
create or replace function public.company_salary_item_pay_type(p_type text) returns text
language sql immutable as $$
  select case
    when p_type in (
      'Potongan Gaji (Tidak Mengurangi PPh)',
      'Pengurangan Gaji (Mengurangi PPh)',
      'Premi asuransi kesehatan dibayarkan pekerja'
    ) then 'Potong'
    when p_type in (
      'Tunjangan Lainnya, Uang lembur dan sebagainya',
      'Honorarium dan Imbalan lain sejenisnya',
      'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
      'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR'
    ) then 'Tidak Tetap'
    else 'Bulanan'
  end
$$;

create or replace function public.company_salary_item_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id','')::uuid;
  sid uuid := nullif(p->>'id','')::uuid;
  name_value text := trim(coalesce(p->>'name',''));
  type_value text := trim(coalesce(p->>'item_type',''));
  account_value uuid := nullif(p->>'account_id','')::uuid;
  active_value boolean := coalesce((p->>'active')::boolean,true);
  pay_value text;
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
    'Premi asuransi kesehatan dibayarkan pekerja'
  ) then raise exception 'Tipe gaji/tunjangan tidak valid'; end if;
  if account_value is null or not exists (
    select 1 from public.ak_akun a
    where a.id = account_value and a.company_id = cid and a.tipe = 'beban' and a.aktif
  ) then raise exception 'Pilih akun beban yang aktif dari perusahaan ini'; end if;

  pay_value := public.company_salary_item_pay_type(type_value);

  if sid is null then
    insert into public.company_salary_items(company_id,name,item_type,pay_type,account_id,active)
    values(cid,name_value,type_value,pay_value,account_value,active_value)
    returning id into sid;
  else
    update public.company_salary_items
       set name=name_value,item_type=type_value,pay_type=pay_value,
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

grant execute on function public.company_salary_item_pay_type(text) to authenticated;
grant execute on function public.company_salary_item_save(jsonb) to authenticated;
grant execute on function public.company_salary_item_delete(uuid, uuid) to authenticated;
