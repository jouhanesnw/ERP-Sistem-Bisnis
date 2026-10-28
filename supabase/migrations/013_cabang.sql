-- CABANG PERUSAHAAN DAN PENGGUNA YANG DITUGASKAN
-- Jalankan setelah migrasi 001-012.

-- Memungkinkan relasi assignment memvalidasi bahwa membership berasal dari perusahaan yang sama.
alter table public.memberships
  add constraint memberships_id_company_unique unique (id, company_id);

create table public.company_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  address text,
  city text,
  postal_code text,
  province text,
  country text not null default 'Indonesia',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index company_branches_name_uq
  on public.company_branches(company_id, lower(trim(name)));

create table public.branch_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  branch_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (branch_id, company_id) references public.company_branches(id, company_id) on delete cascade,
  foreign key (membership_id, company_id) references public.memberships(id, company_id) on delete cascade,
  unique (branch_id, membership_id)
);

alter table public.company_branches enable row level security;
alter table public.branch_members enable row level security;

grant select, insert, update, delete on public.company_branches to authenticated;
grant select, insert, update, delete on public.branch_members to authenticated;

create policy company_branches_select on public.company_branches
  for select using (public.is_member(company_id));
create policy company_branches_insert on public.company_branches
  for insert with check (public.is_admin(company_id));
create policy company_branches_update on public.company_branches
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_branches_delete on public.company_branches
  for delete using (public.is_admin(company_id));

create policy branch_members_select on public.branch_members
  for select using (public.is_member(company_id));
create policy branch_members_insert on public.branch_members
  for insert with check (public.is_admin(company_id));
create policy branch_members_update on public.branch_members
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy branch_members_delete on public.branch_members
  for delete using (public.is_admin(company_id));

-- Simpan data cabang + ganti daftar pengguna secara atomik.
create or replace function public.company_branch_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id', '')::uuid;
  bid uuid := nullif(p->>'id', '')::uuid;
  picked jsonb := coalesce(p->'membership_ids', '[]'::jsonb);
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur cabang';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Nama cabang wajib diisi'; end if;
  if jsonb_typeof(picked) <> 'array' then raise exception 'Daftar pengguna tidak valid'; end if;

  if exists (
    select 1 from jsonb_array_elements_text(picked) as selected(value)
    where not exists (
      select 1 from public.memberships m
      where m.id = selected.value::uuid and m.company_id = cid
    )
  ) then
    raise exception 'Pengguna harus berasal dari daftar anggota perusahaan yang sama';
  end if;

  if bid is null then
    insert into public.company_branches(company_id, name, phone, address, city, postal_code, province, country, active)
    values (
      cid, trim(p->>'name'), nullif(trim(p->>'phone'), ''), nullif(trim(p->>'address'), ''),
      nullif(trim(p->>'city'), ''), nullif(trim(p->>'postal_code'), ''),
      nullif(trim(p->>'province'), ''), coalesce(nullif(trim(p->>'country'), ''), 'Indonesia'),
      coalesce((p->>'active')::boolean, true)
    ) returning id into bid;
  else
    update public.company_branches
    set name = trim(p->>'name'),
        phone = nullif(trim(p->>'phone'), ''),
        address = nullif(trim(p->>'address'), ''),
        city = nullif(trim(p->>'city'), ''),
        postal_code = nullif(trim(p->>'postal_code'), ''),
        province = nullif(trim(p->>'province'), ''),
        country = coalesce(nullif(trim(p->>'country'), ''), 'Indonesia'),
        active = coalesce((p->>'active')::boolean, true),
        updated_at = now()
    where id = bid and company_id = cid;
    if not found then raise exception 'Cabang tidak ditemukan'; end if;
    delete from public.branch_members where branch_id = bid and company_id = cid;
  end if;

  insert into public.branch_members(company_id, branch_id, membership_id)
  select cid, bid, m.id
  from public.memberships m
  join (
    select distinct value::uuid as membership_id
    from jsonb_array_elements_text(picked) as selected(value)
  ) selected on selected.membership_id = m.id
  where m.company_id = cid
  on conflict (branch_id, membership_id) do nothing;

  return bid;
end $$;

create or replace function public.company_branch_delete(p_company uuid, p_branch uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_company) then raise exception 'Hanya owner/admin perusahaan yang bisa menghapus cabang'; end if;
  delete from public.company_branches where id = p_branch and company_id = p_company;
  if not found then raise exception 'Cabang tidak ditemukan'; end if;
end $$;

grant execute on function public.company_branch_save(jsonb), public.company_branch_delete(uuid, uuid) to authenticated;
