-- Fondasi Reminder bersama; diperlukan oleh modul Kendaraan untuk sinkronisasi pajak dan servis.
-- UI Reminder dapat dikembangkan kemudian tanpa mengganti struktur dasar tabel ini.
create table public.rm_pengingat (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  judul text not null,
  catatan text,
  tanggal date not null,
  ingatkan_hari integer not null default 0 check (ingatkan_hari between 0 and 365),
  ulang text not null default 'tidak' check (ulang in ('tidak','harian','mingguan','bulanan','tahunan')),
  status text not null default 'aktif' check (status in ('aktif','selesai','dibatalkan')),
  sumber text,
  sumber_id uuid,
  selesai_pada timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rm_pengingat_company_status_tanggal_idx
  on public.rm_pengingat (company_id, status, tanggal);
create unique index rm_pengingat_sumber_uq
  on public.rm_pengingat (sumber, sumber_id) where sumber is not null;

alter table public.rm_pengingat enable row level security;
create policy rm_pengingat_sel on public.rm_pengingat
  for select using (public.has_perm(company_id, 'reminder', 'view'));
create policy rm_pengingat_ins on public.rm_pengingat
  for insert with check (public.has_perm(company_id, 'reminder', 'create'));
create policy rm_pengingat_upd on public.rm_pengingat
  for update using (public.has_perm(company_id, 'reminder', 'edit'))
  with check (public.has_perm(company_id, 'reminder', 'edit'));
create policy rm_pengingat_del on public.rm_pengingat
  for delete using (public.has_perm(company_id, 'reminder', 'delete'));
