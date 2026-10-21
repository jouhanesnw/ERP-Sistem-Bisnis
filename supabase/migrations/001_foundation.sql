-- FONDASI ERP: perusahaan, anggota, hak akses per modul
-- Jalankan di Supabase > SQL Editor

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- Hak akses per modul untuk role 'member'. Tidak ada baris = tidak punya akses.
create table public.module_access (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  unique (membership_id, module)
);

-- ---------- Fungsi bantu (security definer agar RLS tidak rekursif) ----------
create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where company_id = cid and user_id = auth.uid())
$$;

create or replace function public.is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where company_id = cid and user_id = auth.uid() and role in ('owner','admin'))
$$;

-- Dipakai di RLS semua modul: has_perm(company_id, 'kas', 'view')
create or replace function public.has_perm(cid uuid, mod text, act text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.company_id = cid and m.user_id = auth.uid()
      and (m.role in ('owner','admin') or exists (
        select 1 from module_access a
        where a.membership_id = m.id and a.module = mod
          and case act when 'view' then a.can_view when 'create' then a.can_create
                       when 'edit' then a.can_edit when 'delete' then a.can_delete else false end))
  )
$$;

-- ---------- Profil otomatis saat daftar ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- RPC ----------
create or replace function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  insert into companies (name, created_by) values (p_name, auth.uid()) returning id into cid;
  insert into memberships (company_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

create or replace function public.add_member_by_email(p_company uuid, p_email text, p_role text default 'member') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin(p_company) then raise exception 'Hanya admin yang boleh menambah anggota'; end if;
  if p_role not in ('admin','member') then raise exception 'Peran tidak valid'; end if;
  select id into uid from profiles where lower(email) = lower(p_email);
  if uid is null then raise exception 'Email belum terdaftar. Minta pengguna mendaftar dulu.'; end if;
  insert into memberships (company_id, user_id, role) values (p_company, uid, p_role);
end $$;

grant execute on function public.create_company(text) to authenticated;
grant execute on function public.add_member_by_email(uuid, text, text) to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.module_access enable row level security;

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from memberships a join memberships b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on public.profiles for update using (id = auth.uid());

create policy companies_select on public.companies for select using (public.is_member(id));
create policy companies_update on public.companies for update using (public.is_admin(id));

create policy memberships_select on public.memberships for select using (public.is_member(company_id));
create policy memberships_insert on public.memberships for insert with check (public.is_admin(company_id) and role <> 'owner');
create policy memberships_update on public.memberships for update using (public.is_admin(company_id) and role <> 'owner') with check (role <> 'owner');
create policy memberships_delete on public.memberships for delete using (public.is_admin(company_id) and role <> 'owner');

create policy access_select on public.module_access for select using (
  exists (select 1 from memberships m where m.id = membership_id and (m.user_id = auth.uid() or public.is_admin(m.company_id)))
);
create policy access_write on public.module_access for all
using (exists (select 1 from memberships m where m.id = membership_id and public.is_admin(m.company_id)))
with check (exists (select 1 from memberships m where m.id = membership_id and public.is_admin(m.company_id)));

-- ---------- TEMPLATE untuk tabel modul berikutnya (contoh: kas) ----------
-- create table public.kas_transaksi (
--   id uuid primary key default gen_random_uuid(),
--   company_id uuid not null references public.companies(id) on delete cascade,
--   ...kolom lain...
-- );
-- alter table public.kas_transaksi enable row level security;
-- create policy sel on public.kas_transaksi for select using (public.has_perm(company_id, 'kas', 'view'));
-- create policy ins on public.kas_transaksi for insert with check (public.has_perm(company_id, 'kas', 'create'));
-- create policy upd on public.kas_transaksi for update using (public.has_perm(company_id, 'kas', 'edit'));
-- create policy del on public.kas_transaksi for delete using (public.has_perm(company_id, 'kas', 'delete'));
