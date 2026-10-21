-- MODUL PEMBELIAN: pemasok, pesanan, faktur, pembayaran (terhubung ke Kas)
-- Butuh 001_foundation.sql dan 002_kas.sql

create table public.pb_pemasok (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nama text not null, telepon text, email text, alamat text,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);

-- Pesanan dan faktur memakai satu tabel (kolom jenis)
create table public.pb_dokumen (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jenis text not null check (jenis in ('pesanan','faktur')),
  nomor text not null,
  no_referensi text,
  tanggal date not null default current_date,
  batas_tanggal date,
  pemasok_id uuid not null,
  status text not null default 'draft',
  ppn_persen numeric(5,2) not null default 0 check (ppn_persen between 0 and 100),
  catatan text,
  sumber_id uuid references public.pb_dokumen(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, nomor),
  unique (id, company_id),
  foreign key (pemasok_id, company_id) references public.pb_pemasok (id, company_id),
  check ((jenis = 'pesanan' and status in ('draft','dipesan','diterima','batal'))
      or (jenis = 'faktur' and status in ('draft','terbit','batal')))
);
create index on public.pb_dokumen (company_id, jenis, tanggal desc);

create table public.pb_dokumen_item (
  id uuid primary key default gen_random_uuid(),
  dokumen_id uuid not null,
  company_id uuid not null,
  urutan int not null default 0,
  deskripsi text not null,
  qty numeric(12,2) not null check (qty > 0),
  harga numeric(16,2) not null check (harga >= 0),
  foreign key (dokumen_id, company_id) references public.pb_dokumen (id, company_id) on delete cascade
);
create index on public.pb_dokumen_item (dokumen_id);

-- Pembayaran hanya dibuat/dihapus lewat fungsi di bawah (sekaligus mencatat kas keluar)
create table public.pb_pembayaran (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dokumen_id uuid not null references public.pb_dokumen(id) on delete restrict,
  tanggal date not null,
  jumlah numeric(16,2) not null check (jumlah > 0),
  rekening_id uuid not null,
  kas_transaksi_id uuid not null references public.kas_transaksi(id) on delete cascade,
  catatan text,
  created_at timestamptz not null default now(),
  foreign key (rekening_id, company_id) references public.kas_rekening (id, company_id)
);
create index on public.pb_pembayaran (dokumen_id);

create table public.pb_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  jenis text not null, tahun int not null, terakhir int not null default 0,
  primary key (company_id, jenis, tahun)
);
alter table public.pb_counter enable row level security;

create view public.pb_dokumen_v with (security_invoker = true) as
select d.*, p.nama as pemasok_nama, s.subtotal,
  round(s.subtotal * (1 + d.ppn_persen / 100)) as total,
  coalesce(b.terbayar, 0) as terbayar,
  round(s.subtotal * (1 + d.ppn_persen / 100)) - coalesce(b.terbayar, 0) as sisa
from public.pb_dokumen d
join public.pb_pemasok p on p.id = d.pemasok_id
cross join lateral (select coalesce(sum(i.qty * i.harga), 0) as subtotal from public.pb_dokumen_item i where i.dokumen_id = d.id) s
left join lateral (select sum(x.jumlah) as terbayar from public.pb_pembayaran x where x.dokumen_id = d.id) b on true;

-- RLS modul pembelian
do $$
declare t text;
begin
  foreach t in array array['pb_pemasok','pb_dokumen','pb_dokumen_item'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.has_perm(company_id, ''pembelian'', ''view''))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.has_perm(company_id, ''pembelian'', ''create''))', t || '_ins', t);
    execute format('create policy %I on public.%I for update using (public.has_perm(company_id, ''pembelian'', ''edit'')) with check (public.has_perm(company_id, ''pembelian'', ''edit''))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete using (public.has_perm(company_id, ''pembelian'', ''delete''))', t || '_del', t);
  end loop;
end $$;
alter table public.pb_pembayaran enable row level security;
create policy pb_pembayaran_sel on public.pb_pembayaran for select using (public.has_perm(company_id, 'pembelian', 'view'));

-- Nomor otomatis: FB/2026/0001, PO/2026/0001
create or replace function public.pb_nomor(cid uuid, jns text) returns text
language plpgsql security definer set search_path = public as $$
declare n int; yr int := extract(year from current_date)::int;
begin
  if not public.has_perm(cid, 'pembelian', 'create') then raise exception 'Tidak punya izin'; end if;
  insert into pb_counter (company_id, jenis, tahun, terakhir) values (cid, jns, yr, 1)
  on conflict (company_id, jenis, tahun) do update set terakhir = pb_counter.terakhir + 1
  returning terakhir into n;
  return case jns when 'faktur' then 'FB' else 'PO' end || '/' || yr || '/' || lpad(n::text, 4, '0');
end $$;

create or replace function public.pb_simpan_dokumen(p jsonb) returns uuid
language plpgsql as $$
declare did uuid := nullif(p->>'id', '')::uuid; cid uuid := (p->>'company_id')::uuid; jns text := p->>'jenis'; it jsonb; n int := 0;
begin
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Isi minimal satu baris item'; end if;
  if did is null then
    insert into pb_dokumen (company_id, jenis, nomor, no_referensi, tanggal, batas_tanggal, pemasok_id, status, ppn_persen, catatan)
    values (cid, jns, public.pb_nomor(cid, jns), nullif(p->>'no_referensi', ''), (p->>'tanggal')::date, nullif(p->>'batas_tanggal', '')::date,
            (p->>'pemasok_id')::uuid, 'draft', coalesce((p->>'ppn_persen')::numeric, 0), nullif(p->>'catatan', ''))
    returning id into did;
  else
    if exists (select 1 from pb_pembayaran where dokumen_id = did) then
      raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah. Hapus pembayarannya dulu.';
    end if;
    update pb_dokumen set no_referensi = nullif(p->>'no_referensi', ''), tanggal = (p->>'tanggal')::date, batas_tanggal = nullif(p->>'batas_tanggal', '')::date,
      pemasok_id = (p->>'pemasok_id')::uuid, ppn_persen = coalesce((p->>'ppn_persen')::numeric, 0), catatan = nullif(p->>'catatan', '')
    where id = did and company_id = cid;
    if not found then raise exception 'Dokumen tidak ditemukan'; end if;
    delete from pb_dokumen_item where dokumen_id = did;
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    n := n + 1;
    insert into pb_dokumen_item (dokumen_id, company_id, urutan, deskripsi, qty, harga)
    values (did, cid, n, it->>'deskripsi', (it->>'qty')::numeric, (it->>'harga')::numeric);
  end loop;
  return did;
end $$;

create or replace function public.pb_pesanan_ke_faktur(p_id uuid) returns uuid
language plpgsql as $$
declare src public.pb_dokumen%rowtype; fid uuid;
begin
  select * into src from pb_dokumen where id = p_id and jenis = 'pesanan';
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if src.status = 'batal' then raise exception 'Pesanan yang dibatalkan tidak bisa dijadikan faktur'; end if;
  if exists (select 1 from pb_dokumen where sumber_id = p_id and status <> 'batal') then
    raise exception 'Pesanan ini sudah dijadikan faktur';
  end if;
  insert into pb_dokumen (company_id, jenis, nomor, tanggal, batas_tanggal, pemasok_id, status, ppn_persen, catatan, sumber_id)
  values (src.company_id, 'faktur', public.pb_nomor(src.company_id, 'faktur'), current_date, current_date + 14,
          src.pemasok_id, 'draft', src.ppn_persen, src.catatan, src.id)
  returning id into fid;
  insert into pb_dokumen_item (dokumen_id, company_id, urutan, deskripsi, qty, harga)
  select fid, company_id, urutan, deskripsi, qty, harga from pb_dokumen_item where dokumen_id = p_id;
  update pb_dokumen set status = 'diterima' where id = p_id;
  return fid;
end $$;

create or replace function public.pb_jaga_status() returns trigger language plpgsql as $$
begin
  if new.jenis = 'faktur' and new.status <> 'terbit' and old.status = 'terbit'
     and exists (select 1 from pb_pembayaran where dokumen_id = new.id) then
    raise exception 'Faktur sudah ada pembayaran. Hapus pembayarannya dulu.';
  end if;
  return new;
end $$;
create trigger pb_jaga_status before update on public.pb_dokumen for each row execute function public.pb_jaga_status();

-- Pembayaran otomatis mencatat kas keluar. Izin cukup dari modul pembelian.
create or replace function public.pb_catat_pembayaran(p_dokumen uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.pb_dokumen%rowtype; tot numeric; sudah numeric; kat uuid; ktid uuid; pid uuid; pemasok_nama text;
begin
  select * into d from pb_dokumen where id = p_dokumen and jenis = 'faktur' for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if not public.has_perm(d.company_id, 'pembelian', 'create') then raise exception 'Tidak punya izin'; end if;
  if d.status <> 'terbit' then raise exception 'Hanya faktur berstatus terbit yang bisa dibayar'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select round(coalesce(sum(qty * harga), 0) * (1 + d.ppn_persen / 100)) into tot from pb_dokumen_item where dokumen_id = d.id;
  select coalesce(sum(jumlah), 0) into sudah from pb_pembayaran where dokumen_id = d.id;
  if p_jumlah > tot - sudah then raise exception 'Jumlah melebihi sisa tagihan (Rp %)', tot - sudah; end if;
  if not exists (select 1 from kas_rekening where id = p_rekening and company_id = d.company_id and aktif) then
    raise exception 'Rekening tidak valid';
  end if;
  select id into kat from kas_kategori where company_id = d.company_id and jenis = 'keluar' and nama = 'Pembelian' limit 1;
  if kat is null then
    insert into kas_kategori (company_id, nama, jenis) values (d.company_id, 'Pembelian', 'keluar') returning id into kat;
  end if;
  select nama into pemasok_nama from pb_pemasok where id = d.pemasok_id;
  insert into kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan)
  values (d.company_id, p_tanggal, 'keluar', p_rekening, kat, p_jumlah, 'Pembayaran ' || d.nomor || ' - ' || coalesce(pemasok_nama, ''))
  returning id into ktid;
  insert into pb_pembayaran (company_id, dokumen_id, tanggal, jumlah, rekening_id, kas_transaksi_id, catatan)
  values (d.company_id, d.id, p_tanggal, p_jumlah, p_rekening, ktid, p_catatan) returning id into pid;
  return pid;
end $$;

create or replace function public.pb_hapus_pembayaran(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.pb_pembayaran%rowtype;
begin
  select * into r from pb_pembayaran where id = p_id;
  if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
  if not public.has_perm(r.company_id, 'pembelian', 'delete') then raise exception 'Tidak punya izin'; end if;
  delete from kas_transaksi where id = r.kas_transaksi_id;
end $$;

create or replace function public.pb_rekening_pilihan(cid uuid) returns table (id uuid, nama text, aktif boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.nama, r.aktif from kas_rekening r
  where r.company_id = cid and public.has_perm(cid, 'pembelian', 'view') order by r.nama
$$;

grant execute on function public.pb_simpan_dokumen(jsonb), public.pb_pesanan_ke_faktur(uuid),
  public.pb_catat_pembayaran(uuid, date, numeric, uuid, text), public.pb_hapus_pembayaran(uuid),
  public.pb_rekening_pilihan(uuid) to authenticated;
