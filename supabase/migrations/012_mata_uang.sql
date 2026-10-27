-- MATA UANG PERUSAHAAN
-- Jalankan setelah migrasi 001-011 selesai.
-- Mata uang tersimpan per perusahaan; transaksi lama tetap memakai IDR.

create table public.company_currencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create unique index company_currencies_one_default_uq
  on public.company_currencies(company_id) where is_default;

-- Setiap perusahaan mendapat mata uang dasar IDR.
insert into public.company_currencies(company_id, code, name, symbol, is_default, is_active)
select c.id, 'IDR', 'Rupiah Indonesia', 'Rp', true, true
from public.companies c
on conflict (company_id, code) do update
set name = excluded.name, symbol = excluded.symbol, is_default = true, is_active = true;

create or replace function public.company_currency_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_currencies(company_id, code, name, symbol, is_default, is_active)
  values (new.id, 'IDR', 'Rupiah Indonesia', 'Rp', true, true)
  on conflict (company_id, code) do nothing;
  return new;
end $$;
create trigger company_currency_default_after_insert
after insert on public.companies
for each row execute function public.company_currency_default();

alter table public.company_currencies enable row level security;
create policy company_currencies_select on public.company_currencies
  for select using (public.is_member(company_id));
create policy company_currencies_insert on public.company_currencies
  for insert with check (public.is_admin(company_id));
create policy company_currencies_update on public.company_currencies
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_currencies_delete on public.company_currencies
  for delete using (public.is_admin(company_id));

-- Simpan mata uang yang digunakan pada dokumen serta transaksi kas/pembayaran.
alter table public.kas_transaksi add column currency_code text not null default 'IDR';
alter table public.pb_dokumen add column currency_code text not null default 'IDR';
alter table public.pb_pembayaran add column currency_code text not null default 'IDR';
alter table public.pj_dokumen add column currency_code text not null default 'IDR';
alter table public.pj_pembayaran add column currency_code text not null default 'IDR';

alter table public.kas_transaksi add constraint kas_transaksi_company_currency_fk
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code);
alter table public.pb_dokumen add constraint pb_dokumen_company_currency_fk
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code);
alter table public.pb_pembayaran add constraint pb_pembayaran_company_currency_fk
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code);
alter table public.pj_dokumen add constraint pj_dokumen_company_currency_fk
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code);
alter table public.pj_pembayaran add constraint pj_pembayaran_company_currency_fk
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code);

-- Menjaga agar transaksi baru hanya memilih mata uang yang aktif.
create or replace function public.check_active_company_currency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.currency_code = old.currency_code then return new; end if;
  if not exists (
    select 1 from public.company_currencies c
    where c.company_id = new.company_id and c.code = new.currency_code
  ) then
    raise exception 'Mata uang belum disimpan untuk perusahaan ini';
  end if;
  return new;
end $$;
create trigger kas_transaksi_active_currency before insert or update on public.kas_transaksi
for each row execute function public.check_active_company_currency();
create trigger pb_dokumen_active_currency before insert or update on public.pb_dokumen
for each row execute function public.check_active_company_currency();
create trigger pj_dokumen_active_currency before insert or update on public.pj_dokumen
for each row execute function public.check_active_company_currency();

-- Dokumen penjualan: sama dengan migrasi multi-gudang, dengan currency_code.
create or replace function public.pj_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  did uuid := nullif(p->>'id','')::uuid;
  cid uuid := (p->>'company_id')::uuid;
  jns text := p->>'jenis';
  it jsonb;
  n int := 0;
  gid uuid;
  cur text := upper(coalesce(nullif(p->>'currency_code',''),'IDR'));
begin
  if jns not in ('penawaran','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'penjualan','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then
    raise exception 'Isi minimal satu baris item';
  end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then
    raise exception 'Mata uang belum disimpan atau tidak aktif';
  end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,gudang_id,currency_code)
    values(cid,jns,public.pj_nomor(cid,jns),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pelanggan_id')::uuid,
      'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid,cur)
    returning id into did;
  else
    if not exists(select 1 from public.pj_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pj_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pj_dokumen set tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,
      pelanggan_id=(p->>'pelanggan_id')::uuid,ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),
      catatan=nullif(p->>'catatan',''),gudang_id=gid,currency_code=cur where id=did and company_id=cid;
    delete from public.pj_dokumen_item where dokumen_id=did;
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    n:=n+1;
    insert into public.pj_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
    values(did,cid,n,it->>'deskripsi',(it->>'qty')::numeric,(it->>'harga')::numeric,nullif(it->>'produk_id','')::uuid);
  end loop;
  return did;
end $$;

create or replace function public.pj_penawaran_ke_faktur(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.pj_dokumen%rowtype; fid uuid;
begin
  select * into src from public.pj_dokumen where id=p_id and jenis='penawaran' for update;
  if not found then raise exception 'Penawaran tidak ditemukan'; end if;
  if not public.has_perm(src.company_id,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if src.status='ditolak' then raise exception 'Penawaran yang ditolak tidak bisa dijadikan faktur'; end if;
  if exists(select 1 from public.pj_dokumen where sumber_id=p_id and status<>'batal') then raise exception 'Penawaran ini sudah dijadikan faktur'; end if;
  insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,sumber_id,gudang_id,currency_code)
  values(src.company_id,'faktur',public.pj_nomor(src.company_id,'faktur'),current_date,current_date+14,src.pelanggan_id,
    'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id,src.currency_code) returning id into fid;
  insert into public.pj_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pj_dokumen_item where dokumen_id=p_id;
  update public.pj_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;

-- Dokumen pembelian: sama dengan migrasi multi-gudang, dengan currency_code.
create or replace function public.pb_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  did uuid:=nullif(p->>'id','')::uuid;
  cid uuid:=(p->>'company_id')::uuid;
  jns text:=p->>'jenis';
  it jsonb;
  n int:=0;
  gid uuid;
  cur text:=upper(coalesce(nullif(p->>'currency_code',''),'IDR'));
begin
  if jns not in ('pesanan','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'pembelian','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then
    raise exception 'Isi minimal satu baris item';
  end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then
    raise exception 'Mata uang belum disimpan atau tidak aktif';
  end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pb_dokumen(company_id,jenis,nomor,no_referensi,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,gudang_id,currency_code)
    values(cid,jns,public.pb_nomor(cid,jns),nullif(p->>'no_referensi',''),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,
      (p->>'pemasok_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid,cur)
    returning id into did;
  else
    if not exists(select 1 from public.pb_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pb_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pb_dokumen set no_referensi=nullif(p->>'no_referensi',''),tanggal=(p->>'tanggal')::date,
      batas_tanggal=nullif(p->>'batas_tanggal','')::date,pemasok_id=(p->>'pemasok_id')::uuid,
      ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan',''),gudang_id=gid,currency_code=cur
    where id=did and company_id=cid;
    delete from public.pb_dokumen_item where dokumen_id=did;
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    n:=n+1;
    insert into public.pb_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
    values(did,cid,n,it->>'deskripsi',(it->>'qty')::numeric,(it->>'harga')::numeric,nullif(it->>'produk_id','')::uuid);
  end loop;
  return did;
end $$;

create or replace function public.pb_pesanan_ke_faktur(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.pb_dokumen%rowtype; fid uuid;
begin
  select * into src from public.pb_dokumen where id=p_id and jenis='pesanan' for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if not public.has_perm(src.company_id,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if src.status='batal' then raise exception 'Pesanan yang dibatalkan tidak bisa dijadikan faktur'; end if;
  if exists(select 1 from public.pb_dokumen where sumber_id=p_id and status<>'batal') then raise exception 'Pesanan ini sudah dijadikan faktur'; end if;
  insert into public.pb_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,sumber_id,gudang_id,currency_code)
  values(src.company_id,'faktur',public.pb_nomor(src.company_id,'faktur'),current_date,current_date+14,src.pemasok_id,
    'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id,src.currency_code) returning id into fid;
  insert into public.pb_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pb_dokumen_item where dokumen_id=p_id;
  update public.pb_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;

-- Pembayaran memakai mata uang faktur dan meneruskannya ke transaksi Kas.
create or replace function public.pj_catat_pembayaran(p_dokumen uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.pj_dokumen%rowtype; tot numeric; sudah numeric; kat uuid; ktid uuid; pid uuid; pel text;
begin
  select * into d from public.pj_dokumen where id = p_dokumen and jenis = 'faktur' for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if not public.has_perm(d.company_id, 'penjualan', 'create') then raise exception 'Tidak punya izin'; end if;
  if d.status <> 'terbit' then raise exception 'Hanya faktur berstatus terbit yang bisa dibayar'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select round(coalesce(sum(qty * harga), 0) * (1 + d.ppn_persen / 100)) into tot from public.pj_dokumen_item where dokumen_id = d.id;
  select coalesce(sum(jumlah), 0) into sudah from public.pj_pembayaran where dokumen_id = d.id;
  if p_jumlah > tot - sudah then raise exception 'Jumlah melebihi sisa tagihan (% %)', d.currency_code, tot - sudah; end if;
  if not exists (select 1 from public.kas_rekening where id = p_rekening and company_id = d.company_id and aktif) then raise exception 'Rekening tidak valid'; end if;
  select id into kat from public.kas_kategori where company_id = d.company_id and jenis = 'masuk' and nama = 'Penjualan' limit 1;
  if kat is null then insert into public.kas_kategori (company_id, nama, jenis) values (d.company_id, 'Penjualan', 'masuk') returning id into kat; end if;
  select nama into pel from public.pj_pelanggan where id = d.pelanggan_id;
  insert into public.kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan, currency_code)
  values (d.company_id, p_tanggal, 'masuk', p_rekening, kat, p_jumlah, 'Pembayaran ' || d.nomor || ' - ' || coalesce(pel, ''), d.currency_code)
  returning id into ktid;
  insert into public.pj_pembayaran (company_id, dokumen_id, tanggal, jumlah, rekening_id, kas_transaksi_id, catatan, currency_code)
  values (d.company_id, d.id, p_tanggal, p_jumlah, p_rekening, ktid, p_catatan, d.currency_code) returning id into pid;
  return pid;
end $$;

create or replace function public.pb_catat_pembayaran(p_dokumen uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.pb_dokumen%rowtype; tot numeric; sudah numeric; kat uuid; ktid uuid; pid uuid; pemasok_nama text;
begin
  select * into d from public.pb_dokumen where id = p_dokumen and jenis = 'faktur' for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if not public.has_perm(d.company_id, 'pembelian', 'create') then raise exception 'Tidak punya izin'; end if;
  if d.status <> 'terbit' then raise exception 'Hanya faktur berstatus terbit yang bisa dibayar'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select round(coalesce(sum(qty * harga), 0) * (1 + d.ppn_persen / 100)) into tot from public.pb_dokumen_item where dokumen_id = d.id;
  select coalesce(sum(jumlah), 0) into sudah from public.pb_pembayaran where dokumen_id = d.id;
  if p_jumlah > tot - sudah then raise exception 'Jumlah melebihi sisa tagihan (% %)', d.currency_code, tot - sudah; end if;
  if not exists (select 1 from public.kas_rekening where id = p_rekening and company_id = d.company_id and aktif) then raise exception 'Rekening tidak valid'; end if;
  select id into kat from public.kas_kategori where company_id = d.company_id and jenis = 'keluar' and nama = 'Pembelian' limit 1;
  if kat is null then insert into public.kas_kategori (company_id, nama, jenis) values (d.company_id, 'Pembelian', 'keluar') returning id into kat; end if;
  select nama into pemasok_nama from public.pb_pemasok where id = d.pemasok_id;
  insert into public.kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan, currency_code)
  values (d.company_id, p_tanggal, 'keluar', p_rekening, kat, p_jumlah, 'Pembayaran ' || d.nomor || ' - ' || coalesce(pemasok_nama, ''), d.currency_code)
  returning id into ktid;
  insert into public.pb_pembayaran (company_id, dokumen_id, tanggal, jumlah, rekening_id, kas_transaksi_id, catatan, currency_code)
  values (d.company_id, d.id, p_tanggal, p_jumlah, p_rekening, ktid, p_catatan, d.currency_code) returning id into pid;
  return pid;
end $$;

grant execute on function public.pj_simpan_dokumen(jsonb), public.pj_penawaran_ke_faktur(uuid),
  public.pj_catat_pembayaran(uuid, date, numeric, uuid, text),
  public.pb_simpan_dokumen(jsonb), public.pb_pesanan_ke_faktur(uuid),
  public.pb_catat_pembayaran(uuid, date, numeric, uuid, text) to authenticated;


-- Mata uang mengikuti rekening. Ini mencegah saldo rekening mencampur nilai IDR, USD, dll.
alter table public.kas_rekening add column currency_code text not null default 'IDR';
alter table public.kas_rekening add constraint kas_rekening_company_currency_fk
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code);

-- Saldo rekening hanya menjumlahkan transaksi yang memakai mata uang rekening tersebut.
create or replace view public.kas_saldo with (security_invoker = true) as
select r.id, r.company_id, r.nama, r.tipe, r.nomor, r.saldo_awal, r.aktif,
  r.saldo_awal
  + coalesce((select sum(jumlah) from public.kas_transaksi t where t.rekening_id = r.id and t.jenis = 'masuk' and t.currency_code = r.currency_code), 0)
  - coalesce((select sum(jumlah) from public.kas_transaksi t where t.rekening_id = r.id and t.jenis in ('keluar','transfer') and t.currency_code = r.currency_code), 0)
  + coalesce((select sum(jumlah) from public.kas_transaksi t where t.rekening_tujuan_id = r.id and t.jenis = 'transfer' and t.currency_code = r.currency_code), 0)
  as saldo,
  r.currency_code
from public.kas_rekening r;

-- Transaksi Kas harus menggunakan mata uang rekening asal dan tujuan.
create or replace function public.check_cash_transaction_currency() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  origin_currency text;
  destination_currency text;
begin
  select currency_code into origin_currency from public.kas_rekening
    where id = new.rekening_id and company_id = new.company_id and aktif;
  if origin_currency is null then raise exception 'Rekening asal tidak aktif atau tidak ditemukan'; end if;
  if new.currency_code <> origin_currency then
    raise exception 'Mata uang transaksi harus sama dengan mata uang rekening asal (%)', origin_currency;
  end if;
  if new.jenis = 'transfer' then
    select currency_code into destination_currency from public.kas_rekening
      where id = new.rekening_tujuan_id and company_id = new.company_id and aktif;
    if destination_currency is null then raise exception 'Rekening tujuan tidak aktif atau tidak ditemukan'; end if;
    if destination_currency <> origin_currency then
      raise exception 'Transfer antar rekening hanya bisa dilakukan jika mata uangnya sama';
    end if;
  end if;
  return new;
end $$;
create trigger kas_transaksi_currency_match before insert or update on public.kas_transaksi
for each row execute function public.check_cash_transaction_currency();

-- Daftar rekening yang dapat digunakan untuk pembayaran kini menyertakan mata uang.
drop function public.pj_rekening_pilihan(uuid);
create function public.pj_rekening_pilihan(cid uuid)
returns table (id uuid, nama text, aktif boolean, currency_code text)
language sql stable security definer set search_path = public as $$
  select r.id, r.nama, r.aktif, r.currency_code from public.kas_rekening r
  where r.company_id = cid and public.has_perm(cid, 'penjualan', 'view') order by r.nama
$$;
grant execute on function public.pj_rekening_pilihan(uuid) to authenticated;

drop function public.pb_rekening_pilihan(uuid);
create function public.pb_rekening_pilihan(cid uuid)
returns table (id uuid, nama text, aktif boolean, currency_code text)
language sql stable security definer set search_path = public as $$
  select r.id, r.nama, r.aktif, r.currency_code from public.kas_rekening r
  where r.company_id = cid and public.has_perm(cid, 'pembelian', 'view') order by r.nama
$$;
grant execute on function public.pb_rekening_pilihan(uuid) to authenticated;

-- Pembayaran memakai rekening yang mata uangnya sama dengan faktur.
create or replace function public.pj_catat_pembayaran(p_dokumen uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.pj_dokumen%rowtype; tot numeric; sudah numeric; kat uuid; ktid uuid; pid uuid; pel text;
begin
  select * into d from public.pj_dokumen where id = p_dokumen and jenis = 'faktur' for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if not public.has_perm(d.company_id, 'penjualan', 'create') then raise exception 'Tidak punya izin'; end if;
  if d.status <> 'terbit' then raise exception 'Hanya faktur berstatus terbit yang bisa dibayar'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select round(coalesce(sum(qty * harga), 0) * (1 + d.ppn_persen / 100)) into tot from public.pj_dokumen_item where dokumen_id = d.id;
  select coalesce(sum(jumlah), 0) into sudah from public.pj_pembayaran where dokumen_id = d.id;
  if p_jumlah > tot - sudah then raise exception 'Jumlah melebihi sisa tagihan (% %)', d.currency_code, tot - sudah; end if;
  if not exists (select 1 from public.kas_rekening where id = p_rekening and company_id = d.company_id and aktif and currency_code = d.currency_code) then
    raise exception 'Pilih rekening aktif dengan mata uang yang sama seperti faktur (%)', d.currency_code;
  end if;
  select id into kat from public.kas_kategori where company_id = d.company_id and jenis = 'masuk' and nama = 'Penjualan' limit 1;
  if kat is null then insert into public.kas_kategori (company_id, nama, jenis) values (d.company_id, 'Penjualan', 'masuk') returning id into kat; end if;
  select nama into pel from public.pj_pelanggan where id = d.pelanggan_id;
  insert into public.kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan, currency_code)
  values (d.company_id, p_tanggal, 'masuk', p_rekening, kat, p_jumlah, 'Pembayaran ' || d.nomor || ' - ' || coalesce(pel, ''), d.currency_code)
  returning id into ktid;
  insert into public.pj_pembayaran (company_id, dokumen_id, tanggal, jumlah, rekening_id, kas_transaksi_id, catatan, currency_code)
  values (d.company_id, d.id, p_tanggal, p_jumlah, p_rekening, ktid, p_catatan, d.currency_code) returning id into pid;
  return pid;
end $$;

create or replace function public.pb_catat_pembayaran(p_dokumen uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.pb_dokumen%rowtype; tot numeric; sudah numeric; kat uuid; ktid uuid; pid uuid; pemasok_nama text;
begin
  select * into d from public.pb_dokumen where id = p_dokumen and jenis = 'faktur' for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if not public.has_perm(d.company_id, 'pembelian', 'create') then raise exception 'Tidak punya izin'; end if;
  if d.status <> 'terbit' then raise exception 'Hanya faktur berstatus terbit yang bisa dibayar'; end if;
  if p_jumlah is null or p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select round(coalesce(sum(qty * harga), 0) * (1 + d.ppn_persen / 100)) into tot from public.pb_dokumen_item where dokumen_id = d.id;
  select coalesce(sum(jumlah), 0) into sudah from public.pb_pembayaran where dokumen_id = d.id;
  if p_jumlah > tot - sudah then raise exception 'Jumlah melebihi sisa tagihan (% %)', d.currency_code, tot - sudah; end if;
  if not exists (select 1 from public.kas_rekening where id = p_rekening and company_id = d.company_id and aktif and currency_code = d.currency_code) then
    raise exception 'Pilih rekening aktif dengan mata uang yang sama seperti faktur (%)', d.currency_code;
  end if;
  select id into kat from public.kas_kategori where company_id = d.company_id and jenis = 'keluar' and nama = 'Pembelian' limit 1;
  if kat is null then insert into public.kas_kategori (company_id, nama, jenis) values (d.company_id, 'Pembelian', 'keluar') returning id into kat; end if;
  select nama into pemasok_nama from public.pb_pemasok where id = d.pemasok_id;
  insert into public.kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan, currency_code)
  values (d.company_id, p_tanggal, 'keluar', p_rekening, kat, p_jumlah, 'Pembayaran ' || d.nomor || ' - ' || coalesce(pemasok_nama, ''), d.currency_code)
  returning id into ktid;
  insert into public.pb_pembayaran (company_id, dokumen_id, tanggal, jumlah, rekening_id, kas_transaksi_id, catatan, currency_code)
  values (d.company_id, d.id, p_tanggal, p_jumlah, p_rekening, ktid, p_catatan, d.currency_code) returning id into pid;
  return pid;
end $$;

grant execute on function public.pj_catat_pembayaran(uuid, date, numeric, uuid, text),
  public.pb_catat_pembayaran(uuid, date, numeric, uuid, text) to authenticated;
