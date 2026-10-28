-- MASTER KARYAWAN
-- Prasyarat: migrations 001-021 sudah diterapkan (termasuk cabang dan departemen).

create table public.company_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_code text not null,
  employee_code_auto boolean not null default true,
  employee_code_series text not null default 'Karyawan',
  name_prefix text,
  full_name text not null check (length(trim(full_name)) > 0),
  identity_number text,
  email text,
  mobile_phone text,
  business_phone text,
  home_phone text,
  whatsapp text,
  website text,
  position_title text,
  start_date date not null default current_date,
  branch_id uuid,
  department_id uuid,
  is_salesperson boolean not null default false,
  notes text,
  address_line text,
  city text,
  postal_code text,
  province text,
  country text not null default 'Indonesia',
  subject_to_pph21 boolean not null default true,
  npwp text,
  employment_status text not null default 'Pegawai Tetap'
    check (employment_status in ('Pegawai Tetap','Pegawai Tidak Tetap','Bukan Pegawai','Penerima Pensiun')),
  ptkp_status text not null default 'TK/0'
    check (ptkp_status in ('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3')),
  tax_start_month integer not null default extract(month from current_date)::integer check (tax_start_month between 1 and 12),
  tax_start_year integer not null default extract(year from current_date)::integer check (tax_start_year between 2000 and 2200),
  previous_income numeric(16,2) not null default 0 check (previous_income >= 0),
  previous_pph numeric(16,2) not null default 0 check (previous_pph >= 0),
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (branch_id, company_id)
    references public.company_branches(id, company_id) on delete set null (branch_id),
  foreign key (department_id, company_id)
    references public.company_departments(id, company_id) on delete set null (department_id)
);

create unique index company_employees_code_uq
  on public.company_employees(company_id, lower(trim(employee_code)));
create unique index company_employees_identity_uq
  on public.company_employees(company_id, trim(identity_number))
  where identity_number is not null and trim(identity_number) <> '';
create index company_employees_company_active_name_idx
  on public.company_employees(company_id, active, full_name);
create index company_employees_branch_idx
  on public.company_employees(company_id, branch_id);
create index company_employees_department_idx
  on public.company_employees(company_id, department_id);

alter table public.company_employees enable row level security;
grant select, insert, update, delete on public.company_employees to authenticated;
create policy company_employees_select on public.company_employees
  for select using (public.is_member(company_id));
create policy company_employees_insert on public.company_employees
  for insert with check (public.is_admin(company_id));
create policy company_employees_update on public.company_employees
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_employees_delete on public.company_employees
  for delete using (public.is_admin(company_id));

create or replace function public.company_employee_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id','')::uuid;
  eid uuid := nullif(p->>'id','')::uuid;
  branch_value uuid := nullif(p->>'branch_id','')::uuid;
  department_value uuid := nullif(p->>'department_id','')::uuid;
  name_value text := trim(coalesce(p->>'full_name',''));
  code_value text := trim(coalesce(p->>'employee_code',''));
  code_auto_value boolean := coalesce((p->>'employee_code_auto')::boolean,true);
  code_series_value text := coalesce(nullif(trim(p->>'employee_code_series'),''),'Karyawan');
  old_code text;
  old_auto boolean;
  next_number bigint;
  tax_month integer := coalesce(nullif(p->>'tax_start_month','')::integer, extract(month from current_date)::integer);
  tax_year integer := coalesce(nullif(p->>'tax_start_year','')::integer, extract(year from current_date)::integer);
  employment_value text := coalesce(nullif(trim(p->>'employment_status'),''),'Pegawai Tetap');
  ptkp_value text := coalesce(nullif(trim(p->>'ptkp_status'),''),'TK/0');
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur karyawan';
  end if;
  if name_value = '' then raise exception 'Nama lengkap wajib diisi'; end if;
  if code_series_value <> 'Karyawan' then raise exception 'Format ID karyawan tidak valid'; end if;
  if eid is not null then
    select employee_code, employee_code_auto into old_code, old_auto
    from public.company_employees where id=eid and company_id=cid for update;
    if not found then raise exception 'Data karyawan tidak ditemukan'; end if;
  end if;

  if code_auto_value then
    if eid is not null and old_auto then
      code_value := old_code;
    else
      perform pg_advisory_xact_lock(hashtext(cid::text)::bigint);
      select coalesce(max(substring(employee_code from '^KRY-([0-9]+)$')::bigint),0)+1
        into next_number
      from public.company_employees
      where company_id=cid;
      code_value := 'KRY-' || lpad(next_number::text,5,'0');
    end if;
  elsif code_value = '' then
    raise exception 'ID karyawan wajib diisi jika tidak menggunakan ID otomatis';
  end if;

  if tax_month < 1 or tax_month > 12 or tax_year < 2000 or tax_year > 2200 then
    raise exception 'Periode mulai perhitungan PPh tidak valid';
  end if;
  if employment_value not in ('Pegawai Tetap','Pegawai Tidak Tetap','Bukan Pegawai','Penerima Pensiun') then
    raise exception 'Status pekerja tidak valid';
  end if;
  if ptkp_value not in ('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3') then
    raise exception 'Status PTKP tidak valid';
  end if;
  if branch_value is not null and not exists (
    select 1 from public.company_branches b where b.id=branch_value and b.company_id=cid and b.active
  ) then raise exception 'Cabang tidak aktif atau bukan milik perusahaan ini'; end if;
  if department_value is not null and not exists (
    select 1 from public.company_departments d where d.id=department_value and d.company_id=cid and d.active
  ) then raise exception 'Departemen tidak aktif atau bukan milik perusahaan ini'; end if;

  if eid is null then
    insert into public.company_employees (
      company_id,employee_code,employee_code_auto,employee_code_series,name_prefix,full_name,
      identity_number,email,mobile_phone,business_phone,home_phone,whatsapp,website,
      position_title,start_date,branch_id,department_id,is_salesperson,notes,
      address_line,city,postal_code,province,country,subject_to_pph21,npwp,
      employment_status,ptkp_status,tax_start_month,tax_start_year,previous_income,previous_pph,
      bank_name,bank_account_number,bank_account_name,active
    ) values (
      cid,code_value,code_auto_value,code_series_value,nullif(trim(p->>'name_prefix'),''),name_value,
      nullif(trim(p->>'identity_number'),''),nullif(trim(p->>'email'),''),nullif(trim(p->>'mobile_phone'), ''),
      nullif(trim(p->>'business_phone'),''),nullif(trim(p->>'home_phone'),''),nullif(trim(p->>'whatsapp'), ''),
      nullif(trim(p->>'website'),''),nullif(trim(p->>'position_title'),''),coalesce(nullif(p->>'start_date','')::date,current_date),
      branch_value,department_value,coalesce((p->>'is_salesperson')::boolean,false),nullif(trim(p->>'notes'),''),
      nullif(trim(p->>'address_line'),''),nullif(trim(p->>'city'),''),nullif(trim(p->>'postal_code'),''),
      nullif(trim(p->>'province'),''),coalesce(nullif(trim(p->>'country'),''),'Indonesia'),
      coalesce((p->>'subject_to_pph21')::boolean,true),nullif(trim(p->>'npwp'),''),employment_value,ptkp_value,
      tax_month,tax_year,coalesce(nullif(p->>'previous_income','')::numeric,0),
      coalesce(nullif(p->>'previous_pph','')::numeric,0),nullif(trim(p->>'bank_name'),''),
      nullif(trim(p->>'bank_account_number'),''),nullif(trim(p->>'bank_account_name'),''),coalesce((p->>'active')::boolean,true)
    ) returning id into eid;
  else
    update public.company_employees set
      employee_code=code_value,employee_code_auto=code_auto_value,employee_code_series=code_series_value,
      name_prefix=nullif(trim(p->>'name_prefix'),''),full_name=name_value,
      identity_number=nullif(trim(p->>'identity_number'),''),email=nullif(trim(p->>'email'), ''),
      mobile_phone=nullif(trim(p->>'mobile_phone'),''),business_phone=nullif(trim(p->>'business_phone'),''),
      home_phone=nullif(trim(p->>'home_phone'),''),whatsapp=nullif(trim(p->>'whatsapp'), ''),
      website=nullif(trim(p->>'website'),''),position_title=nullif(trim(p->>'position_title'),''),
      start_date=coalesce(nullif(p->>'start_date','')::date,current_date),
      branch_id=branch_value,department_id=department_value,
      is_salesperson=coalesce((p->>'is_salesperson')::boolean,false),notes=nullif(trim(p->>'notes'),''),
      address_line=nullif(trim(p->>'address_line'),''),city=nullif(trim(p->>'city'), ''),
      postal_code=nullif(trim(p->>'postal_code'),''),province=nullif(trim(p->>'province'),''),
      country=coalesce(nullif(trim(p->>'country'),''),'Indonesia'),
      subject_to_pph21=coalesce((p->>'subject_to_pph21')::boolean,true),
      npwp=nullif(trim(p->>'npwp'),''),employment_status=employment_value,ptkp_status=ptkp_value,
      tax_start_month=tax_month,tax_start_year=tax_year,
      previous_income=coalesce(nullif(p->>'previous_income','')::numeric,0),
      previous_pph=coalesce(nullif(p->>'previous_pph','')::numeric,0),
      bank_name=nullif(trim(p->>'bank_name'),''),bank_account_number=nullif(trim(p->>'bank_account_number'),''),
      bank_account_name=nullif(trim(p->>'bank_account_name'),''),active=coalesce((p->>'active')::boolean,true),
      updated_at=now()
    where id=eid and company_id=cid;
    if not found then raise exception 'Data karyawan tidak ditemukan'; end if;
  end if;
  return eid;
end $$;

create or replace function public.company_employee_delete(p_company uuid, p_employee uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_company is null or not public.is_admin(p_company) then
    raise exception 'Hanya owner/admin perusahaan yang bisa menghapus karyawan';
  end if;
  delete from public.company_employees where id=p_employee and company_id=p_company;
  if not found then raise exception 'Data karyawan tidak ditemukan'; end if;
end $$;

grant execute on function public.company_employee_save(jsonb) to authenticated;
grant execute on function public.company_employee_delete(uuid, uuid) to authenticated;
