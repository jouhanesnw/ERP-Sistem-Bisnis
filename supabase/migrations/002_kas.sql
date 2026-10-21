-- MODUL KAS: rekening, kategori, transaksi (masuk/keluar/transfer), bukti (Storage)

create table public.kas_rekening (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nama text not null,
  tipe text not null default 'bank' check (tipe in ('tunai','bank','ewallet')),
  nomor text,
  saldo_awal numeric(16,2) not null default 0,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);

create table public.kas_kategori (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nama text not null,
  jenis text not null check (jenis in ('masuk','keluar')),
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);

create table public.kas_transaksi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tanggal date not null default current_date,
  jenis text not null check (jenis in ('masuk','keluar','transfer')),
  rekening_id uuid not null,            -- rekening asal (untuk masuk/keluar: rekening yang dipakai)
  rekening_tujuan_id uuid,              -- hanya untuk transfer
  kategori_id uuid,
  jumlah numeric(16,2) not null check (jumlah > 0),
  keterangan text,
  bukti_path text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  -- FK gabungan: mencegah rekening/kategori milik perusahaan lain
  foreign key (rekening_id, company_id) references public.kas_rekening (id, company_id),
  foreign key (rekening_tujuan_id, company_id) references public.kas_rekening (id, company_id),
  foreign key (kategori_id, company_id) references public.kas_kategori (id, company_id),
  check (
    (jenis = 'transfer' and rekening_tujuan_id is not null and rekening_tujuan_id <> rekening_id and kategori_id is null)
    or (jenis <> 'transfer' and rekening_tujuan_id is null)
  )
);
create index on public.kas_transaksi (company_id, tanggal desc);

-- Saldo per rekening (mengikuti RLS pemanggil)
create view public.kas_saldo with (security_invoker = true) as
select r.id, r.company_id, r.nama, r.tipe, r.nomor, r.saldo_awal, r.aktif,
  r.saldo_awal
  + coalesce((select sum(jumlah) from public.kas_transaksi t where t.rekening_id = r.id and t.jenis = 'masuk'), 0)
  - coalesce((select sum(jumlah) from public.kas_transaksi t where t.rekening_id = r.id and t.jenis in ('keluar','transfer')), 0)
  + coalesce((select sum(jumlah) from public.kas_transaksi t where t.rekening_tujuan_id = r.id and t.jenis = 'transfer'), 0)
  as saldo
from public.kas_rekening r;

-- RLS: modul 'kas'
do $$
declare t text;
begin
  foreach t in array array['kas_rekening','kas_kategori','kas_transaksi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.has_perm(company_id, ''kas'', ''view''))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.has_perm(company_id, ''kas'', ''create''))', t || '_ins', t);
    execute format('create policy %I on public.%I for update using (public.has_perm(company_id, ''kas'', ''edit'')) with check (public.has_perm(company_id, ''kas'', ''edit''))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete using (public.has_perm(company_id, ''kas'', ''delete''))', t || '_del', t);
  end loop;
end $$;

-- Storage: bucket privat untuk bukti. Path file: <company_id>/<uuid>-<nama file>
insert into storage.buckets (id, name, public) values ('kas-bukti', 'kas-bukti', false) on conflict (id) do nothing;

create policy kas_bukti_sel on storage.objects for select to authenticated
  using (bucket_id = 'kas-bukti' and public.has_perm(((storage.foldername(name))[1])::uuid, 'kas', 'view'));
create policy kas_bukti_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'kas-bukti' and public.has_perm(((storage.foldername(name))[1])::uuid, 'kas', 'create'));
create policy kas_bukti_upd on storage.objects for update to authenticated
  using (bucket_id = 'kas-bukti' and public.has_perm(((storage.foldername(name))[1])::uuid, 'kas', 'edit'));
create policy kas_bukti_del on storage.objects for delete to authenticated
  using (bucket_id = 'kas-bukti' and public.has_perm(((storage.foldername(name))[1])::uuid, 'kas', 'delete'));
