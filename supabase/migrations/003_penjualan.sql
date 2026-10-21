-- MODUL PENJUALAN: pelanggan, penawaran, faktur, pembayaran (terhubung ke Kas)
-- Butuh 001_foundation.sql dan 002_kas.sql

create table public.pj_pelanggan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nama text not null, telepon text, email text, alamat text,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);

create table public.pj_dokumen (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jenis text not null check (jenis in ('penawaran','faktur')),
  nomor text not null,
  tanggal date not null default current_date,
  batas_tanggal date,
  pelanggan_id uuid not null,
  status text not null default 'draft',
  ppn_persen numeric(5,2) not null default 0 check (ppn_persen between 0 and 100),
  catatan text,
  sumber_id uuid references public.pj_dokumen(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, nomor),
  unique (id, company_id),
  foreign key (pelanggan_id, company_id) references public.pj_pelanggan(id, company_id),
  check ((jenis = 'penawaran' and status in ('draft','terkirim','diterima','ditolak'))
      or (jenis = 'faktur' and status in ('draft','terbit','batal')))
);
create index on public.pj_dokumen (company_id, jenis, tanggal desc);

create table public.pj_dokumen_item (
  id uuid primary key default gen_random_uuid(),
  dokumen_id uuid not null,
  company_id uuid not null,
  urutan int not null default 0,
  deskripsi text not null,
  qty numeric(12,2) not null check (qty > 0),
  harga numeric(16,2) not null check (harga >= 0),
  foreign key (dokumen_id, company_id) references public.pj_dokumen(id, company_id) on delete cascade
);
create index on public.pj_dokumen_item (dokumen_id);

create table public.pj_pembayaran (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dokumen_id uuid not null references public.pj_dokumen(id) on delete restrict,
  tanggal date not null,
  jumlah numeric(16,2) not null check (jumlah > 0),
  rekening_id uuid not null,
  kas_transaksi_id uuid not null references public.kas_transaksi(id) on delete cascade,
  catatan text,
  created_at timestamptz not null default now(),
  foreign key (rekening_id, company_id) references public.kas_rekening(id, company_id)
);
create index on public.pj_pembayaran (dokumen_id);

create table public.pj_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  jenis text not null, tahun int not null, terakhir int not null default 0,
  primary key (company_id, jenis, tahun)
);
alter table public.pj_counter enable row level security;

create view public.pj_dokumen_v with (security_invoker = true) as
select d.*, p.nama as pelanggan_nama, s.subtotal,
  round(s.subtotal * (1 + d.ppn_persen / 100)) as total,
  coalesce(b.terbayar, 0) as terbayar,
  round(s.subtotal * (1 + d.ppn_persen / 100)) - coalesce(b.terbayar, 0) as sisa
from public.pj_dokumen d
join public.pj_pelanggan p on p.id = d.pelanggan_id
cross join lateral (select coalesce(sum(i.qty * i.harga), 0) as subtotal from public.pj_dokumen_item i where i.dokumen_id = d.id) s
left join lateral (select sum(x.jumlah) as terbayar from public.pj_pembayaran x where x.dokumen_id = d.id) b on true;

do $$
declare t text;
begin
  foreach t in array array['pj_pelanggan','pj_dokumen','pj_dokumen_item'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.has_perm(company_id, ''penjualan'', ''view''))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.has_perm(company_id, ''penjualan'', ''create''))', t || '_ins', t);
    execute format('create policy %I on public.%I for update using (public.has_perm(company_id, ''penjualan'', ''edit'')) with check (public.has_perm(company_id, ''penjualan'', ''edit''))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete using (public.has_perm(company_id, ''penjualan'', ''delete''))', t || '_del', t);
  end loop;
end $$;
alter table public.pj_pembayaran enable row level security;
create policy pj_pembayaran_sel on public.pj_pembayaran for select using (public.has_perm(company_id, 'penjualan', 'view'));

create or replace function public.pj_nomor(cid uuid, jns text) returns text
language plpgsql security definer set search_path = public as $$
declare n int; yr int := extract(year from current_date)::int;
begin
  if not public.has_perm(cid, 'penjualan', 'create') then raise exception 'Tidak punya izin'; end if;
  insert into pj_counter (company_id, jenis, tahun, terakhir) values (cid, jns, yr, 1)
  on conflict (company_id, jenis, tahun) do update set terakhir = pj_counter.terakhir + 1
  returning terakhir into n;
  return case jns when 'faktur' then 'INV' else 'QT' end || '/' || yr || '/' || lpad(n::text, 4, '0');
end $$;

create or replace function public.pj_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid := nullif(p->>'id', '')::uuid; cid uuid := (p->>'company_id')::uuid; jns text := p->>'jenis'; it jsonb; n int := 0;
begin
  if not public.has_perm(cid, 'penjualan', 'create') and did is null then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid, 'penjualan', 'edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Isi minimal satu baris item'; end if;
  if did is null then
    insert into pj_dokumen (company_id, jenis, nomor, tanggal, batas_tanggal, pelanggan_id, status, ppn_persen, catatan)
    values (cid, jns, public.pj_nomor(cid, jns), (p->>'tanggal')::date, nullif(p->>'batas_tanggal', '')::date,
      (p->>'pelanggan_id')::uuid, 'draft', coalesce((p->>'ppn_persen')::numeric, 0), nullif(p->>'catatan', ''))
    returning id into did;
  else
    if exists (select 1 from pj_pembayaran where dokumen_id = did) then
      raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah. Hapus pembayarannya dulu.';
    end if;
    update pj_dokumen set tanggal = (p->>'tanggal')::date, batas_tanggal = nullif(p->>'batas_tanggal', '')::date,
      pelanggan_id = (p->>'pelanggan_id')::uuid, ppn_persen = coalesce((p->>'ppn_persen')::numeric, 0), catatan = nullif(p->>'catatan', '')
    where id = did and company_id = cid;
    if not found then raise exception 'Dokumen tidak ditemukan'; end if;
    delete from pj_dokumen_item where dokumen_id = did;
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    n := n + 1;
    insert into pj_dokumen_item (dokumen_id, company_id, urutan, deskripsi, qty, harga)
    values (did, cid, n, it->>'deskripsi', (it->>'qty')::numeric, (it->>'harga')::numeric);
  end loop;
  return did;
end $$;

create or replace function public.pj_penawaran_ke_faktur(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src public.pj_dokumen%rowtype; fid uuid;
begin
  select * into src from pj_dokumen where id = p_id and jenis = 'penawaran';
  if not found then raise exception 'Penawaran tidak ditemukan'; end if;
  if not public.has_perm(src.company_id, 'penjualan', 'create') then raise exception 'Tidak punya izin'; end if;
  if src.status = 'ditolak' then raise exception 'Penawaran yang ditolak tidak bisa dijadikan faktur'; end if;
  if exists (select 1 from pj_dokumen where sumber_id = p_id and status <> 'batal') then
    raise exception 'Penawaran ini sudah dijadikan faktur';
  end if;
  insert into pj_dokumen (company_id, jenis, nomor, tanggal, batas_tanggal, pelanggan_id, status, ppn_persen, catatan, sumber_id)
  values (src.company_id, 'faktur', public.pj_nomor(src.company_id, 'faktur'), current_date, current_date + 14,
    src.pelanggan_id, 'draft', src.ppn_persen, src.catatan, src.id)
  returning id into fid;
  insert into pj_dokumen_item (dokumen_id, company_id, urutan, deskripsi, qty, harga)
  select fid, company_id, urutan, deskripsi, qty, harga from pj_dokumen_item where dokumen_id = p_id;
  update pj_dokumen set status = 'diterima' where id = p_id;
  return fid;
end $$;

create or replace function public.pj_jaga_status() returns trigger language plpgsql as $$
begin
  if new.jenis = 'faktur' and new.status <> 'terbit' and old.status = 'terbit'
     and exists (select 1 from pj_pembayaran where dokumen_id = new.id) then
    raise exception 'Faktur sudah ada pembayaran. Hapus pembayarannya dulu.';
  end if;
  return new;
end $$;
create trigger pj_jaga_status before update on public.pj_dokumen for each row execute function public.pj_jaga_status();

create or replace function public.pj_catat_pembayaran(p_dokumen uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.pj_dokumen%rowtype; tot numeric; sudah numeric; kat uuid; ktid uuid; pid uuid; pel text;
begin
  select * into d from pj_dokumen where id = p_dokumen and jenis = 'faktur' for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if not public.has_perm(d.company_id, 'penjualan', 'create') then raise exception 'Tidak punya izin'; end if;
  if d.status <> 'terbit' then raise exception 'Hanya faktur berstatus terbit yang bisa dibayar'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select round(coalesce(sum(qty * harga), 0) * (1 + d.ppn_persen / 100)) into tot from pj_dokumen_item where dokumen_id = d.id;
  select coalesce(sum(jumlah), 0) into sudah from pj_pembayaran where dokumen_id = d.id;
  if p_jumlah > tot - sudah then raise exception 'Jumlah melebihi sisa tagihan (Rp %)', tot - sudah; end if;
  if not exists (select 1 from kas_rekening where id = p_rekening and company_id = d.company_id and aktif) then raise exception 'Rekening tidak valid'; end if;
  select id into kat from kas_kategori where company_id = d.company_id and jenis = 'masuk' and nama = 'Penjualan' limit 1;
  if kat is null then
    insert into kas_kategori (company_id, nama, jenis) values (d.company_id, 'Penjualan', 'masuk') returning id into kat;
  end if;
  select nama into pel from pj_pelanggan where id = d.pelanggan_id;
  insert into kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan)
  values (d.company_id, p_tanggal, 'masuk', p_rekening, kat, p_jumlah, 'Pembayaran ' || d.nomor || ' - ' || coalesce(pel, ''))
  returning id into ktid;
  insert into pj_pembayaran (company_id, dokumen_id, tanggal, jumlah, rekening_id, kas_transaksi_id, catatan)
  values (d.company_id, d.id, p_tanggal, p_jumlah, p_rekening, ktid, p_catatan) returning id into pid;
  return pid;
end $$;

create or replace function public.pj_hapus_pembayaran(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.pj_pembayaran%rowtype;
begin
  select * into r from pj_pembayaran where id = p_id;
  if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
  if not public.has_perm(r.company_id, 'penjualan', 'delete') then raise exception 'Tidak punya izin'; end if;
  delete from kas_transaksi where id = r.kas_transaksi_id;
end $$;

create or replace function public.pj_rekening_pilihan(cid uuid) returns table (id uuid, nama text, aktif boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.nama, r.aktif from kas_rekening r
  where r.company_id = cid and public.has_perm(cid, 'penjualan', 'view') order by r.nama
$$;

grant execute on function public.pj_simpan_dokumen(jsonb), public.pj_penawaran_ke_faktur(uuid),
  public.pj_catat_pembayaran(uuid, date, numeric, uuid, text), public.pj_hapus_pembayaran(uuid),
  public.pj_rekening_pilihan(uuid) to authenticated;
