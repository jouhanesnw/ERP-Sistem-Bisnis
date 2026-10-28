-- DEPARTEMEN PERUSAHAAN, COA, SALDO AWAL, DAN PENUGASAN PENGGUNA
-- Jalankan setelah migrasi 001-013 selesai.

create table public.company_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  parent_department_id uuid,
  opening_balance numeric(16,2) not null default 0,
  opening_balance_date date not null default current_date,
  coa_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (parent_department_id, company_id)
    references public.company_departments(id, company_id) on delete set null (parent_department_id),
  foreign key (coa_id, company_id)
    references public.ak_akun(id, company_id) on delete set null (coa_id)
);

create unique index company_departments_name_uq
  on public.company_departments(company_id, lower(trim(name)));
create index company_departments_parent_idx
  on public.company_departments(company_id, parent_department_id);
create index company_departments_coa_idx
  on public.company_departments(company_id, coa_id);

create table public.department_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  department_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (department_id, company_id)
    references public.company_departments(id, company_id) on delete cascade,
  foreign key (membership_id, company_id)
    references public.memberships(id, company_id) on delete cascade,
  unique (department_id, membership_id)
);
create index department_members_company_department_idx
  on public.department_members(company_id, department_id);

alter table public.company_departments enable row level security;
alter table public.department_members enable row level security;

grant select, insert, update, delete on public.company_departments to authenticated;
grant select, insert, update, delete on public.department_members to authenticated;

create policy company_departments_select on public.company_departments
  for select using (public.is_member(company_id));
create policy company_departments_insert on public.company_departments
  for insert with check (public.is_admin(company_id));
create policy company_departments_update on public.company_departments
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_departments_delete on public.company_departments
  for delete using (public.is_admin(company_id));

create policy department_members_select on public.department_members
  for select using (public.is_member(company_id));
create policy department_members_insert on public.department_members
  for insert with check (public.is_admin(company_id));
create policy department_members_update on public.department_members
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy department_members_delete on public.department_members
  for delete using (public.is_admin(company_id));

create or replace function public.company_department_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id', '')::uuid;
  did uuid := nullif(p->>'id', '')::uuid;
  parent_id uuid := nullif(p->>'parent_department_id', '')::uuid;
  account_id uuid := nullif(p->>'coa_id', '')::uuid;
  picked jsonb := coalesce(p->'membership_ids', '[]'::jsonb);
  bad_member boolean;
  bad_parent boolean;
  has_cycle boolean;
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur departemen';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Nama departemen wajib diisi'; end if;
  if jsonb_typeof(picked) <> 'array' then raise exception 'Daftar pengguna tidak valid'; end if;
  if coalesce(trim(p->>'opening_balance_date'), '') = '' then raise exception 'Tanggal saldo awal wajib diisi'; end if;
  if coalesce((p->>'opening_balance')::numeric, 0) is null then raise exception 'Saldo awal tidak valid'; end if;

  if exists (
    select 1 from jsonb_array_elements_text(picked) as selected(value)
    where not exists (
      select 1 from public.memberships m
      where m.id = selected.value::uuid and m.company_id = cid
    )
  ) then
    raise exception 'Pengguna harus berasal dari daftar anggota perusahaan yang sama';
  end if;

  if parent_id is not null then
    if not exists (select 1 from public.company_departments d where d.id = parent_id and d.company_id = cid and d.active) then
      raise exception 'Departemen induk tidak ditemukan atau nonaktif';
    end if;
    if did is not null then
      if parent_id = did then raise exception 'Departemen tidak bisa menjadi subdepartemen dirinya sendiri'; end if;
      with recursive descendants(id, parent_department_id) as (
        select d.id, d.parent_department_id from public.company_departments d where d.id = did and d.company_id = cid
        union all
        select child.id, child.parent_department_id
        from public.company_departments child
        join descendants parent on child.parent_department_id = parent.id
        where child.company_id = cid
      )
      select exists(select 1 from descendants where id = parent_id) into has_cycle;
      if has_cycle then raise exception 'Departemen induk tidak boleh merupakan subdepartemen dari departemen ini'; end if;
    end if;
  end if;

  if account_id is not null and not exists (
    select 1 from public.ak_akun a where a.id = account_id and a.company_id = cid and a.aktif
  ) then
    raise exception 'COA harus dipilih dari akun aktif milik perusahaan ini';
  end if;

  if did is null then
    insert into public.company_departments(
      company_id, name, description, parent_department_id, opening_balance, opening_balance_date, coa_id, active
    ) values (
      cid, trim(p->>'name'), nullif(trim(p->>'description'), ''), parent_id,
      coalesce((p->>'opening_balance')::numeric, 0), (p->>'opening_balance_date')::date, account_id,
      coalesce((p->>'active')::boolean, true)
    ) returning id into did;
  else
    update public.company_departments
    set name = trim(p->>'name'),
        description = nullif(trim(p->>'description'), ''),
        parent_department_id = parent_id,
        opening_balance = coalesce((p->>'opening_balance')::numeric, 0),
        opening_balance_date = (p->>'opening_balance_date')::date,
        coa_id = account_id,
        active = coalesce((p->>'active')::boolean, true),
        updated_at = now()
    where id = did and company_id = cid;
    if not found then raise exception 'Departemen tidak ditemukan'; end if;
  end if;

  delete from public.department_members where department_id = did and company_id = cid;
  insert into public.department_members(company_id, department_id, membership_id)
  select cid, did, m.id
  from public.memberships m
  join (
    select distinct value::uuid as membership_id
    from jsonb_array_elements_text(picked) as selected(value)
  ) selected on selected.membership_id = m.id
  where m.company_id = cid
  on conflict (department_id, membership_id) do nothing;

  return did;
end $$;

create or replace function public.company_department_delete(p_company uuid, p_department uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_company) then raise exception 'Hanya owner/admin perusahaan yang bisa menghapus departemen'; end if;
  if exists (select 1 from public.company_departments where company_id = p_company and parent_department_id = p_department) then
    raise exception 'Departemen ini masih memiliki subdepartemen. Pindahkan atau hapus subdepartemennya terlebih dahulu.';
  end if;
  delete from public.company_departments where id = p_department and company_id = p_company;
  if not found then raise exception 'Departemen tidak ditemukan'; end if;
end $$;

grant execute on function public.company_department_save(jsonb), public.company_department_delete(uuid, uuid) to authenticated;
