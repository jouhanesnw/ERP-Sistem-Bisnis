-- KETENTUAN PENGIRIMAN / INCOTERMS
-- Prasyarat: migrasi 001-018 sudah berhasil dijalankan.

create table public.company_shipping_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index company_shipping_terms_name_uq
  on public.company_shipping_terms(company_id, lower(trim(name)));
create index company_shipping_terms_active_idx
  on public.company_shipping_terms(company_id, active, name);

alter table public.company_shipping_terms enable row level security;
grant select, insert, update, delete on public.company_shipping_terms to authenticated;
create policy company_shipping_terms_select on public.company_shipping_terms
  for select using (public.is_member(company_id));
create policy company_shipping_terms_insert on public.company_shipping_terms
  for insert with check (public.is_admin(company_id));
create policy company_shipping_terms_update on public.company_shipping_terms
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_shipping_terms_delete on public.company_shipping_terms
  for delete using (public.is_admin(company_id));

-- Four starter types for existing companies.
insert into public.company_shipping_terms(company_id, name, description)
select c.id, seed.name, seed.description
from public.companies c
cross join (values
 ('FCA', 'Free Carrier — penjual menyerahkan barang kepada pengangkut yang ditunjuk pembeli di tempat yang disepakati.'),
 ('FOB', 'Free On Board — penjual menyerahkan barang ketika barang sudah berada di atas kapal di pelabuhan pengiriman yang disepakati.'),
 ('CIF', 'Cost, Insurance and Freight — penjual membayar biaya angkutan dan asuransi ke pelabuhan tujuan; risiko beralih saat barang berada di atas kapal di pelabuhan asal.'),
 ('DAP', 'Delivered at Place — penjual menanggung risiko sampai barang tiba di tempat tujuan yang disepakati, siap untuk dibongkar.')
) as seed(name, description)
where not exists (
  select 1 from public.company_shipping_terms existing
  where existing.company_id = c.id and lower(trim(existing.name)) = lower(seed.name)
);

create or replace function public.company_shipping_terms_seed_after_company_insert() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.company_shipping_terms(company_id, name, description)
  values
    (new.id, 'FCA', 'Free Carrier — penjual menyerahkan barang kepada pengangkut yang ditunjuk pembeli di tempat yang disepakati.'),
    (new.id, 'FOB', 'Free On Board — penjual menyerahkan barang ketika barang sudah berada di atas kapal di pelabuhan pengiriman yang disepakati.'),
    (new.id, 'CIF', 'Cost, Insurance and Freight — penjual membayar biaya angkutan dan asuransi ke pelabuhan tujuan; risiko beralih saat barang berada di atas kapal di pelabuhan asal.'),
    (new.id, 'DAP', 'Delivered at Place — penjual menanggung risiko sampai barang tiba di tempat tujuan yang disepakati, siap untuk dibongkar.')
  on conflict do nothing;
  return new;
end $$;
create trigger company_shipping_terms_seed_after_company_insert
after insert on public.companies
for each row execute function public.company_shipping_terms_seed_after_company_insert();

create or replace function public.company_shipping_term_save(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  cid uuid := nullif(p->>'company_id','')::uuid;
  tid uuid := nullif(p->>'id','')::uuid;
begin
  if cid is null or not public.is_admin(cid) then raise exception 'Hanya owner/admin perusahaan yang bisa mengatur ketentuan pengiriman'; end if;
  if coalesce(trim(p->>'name'),'') = '' then raise exception 'Nama jenis wajib diisi'; end if;
  if tid is null then
    insert into public.company_shipping_terms(company_id,name,description,active)
    values(cid,trim(p->>'name'),nullif(trim(p->>'description'),''),coalesce((p->>'active')::boolean,true))
    returning id into tid;
  else
    update public.company_shipping_terms
    set name=trim(p->>'name'),description=nullif(trim(p->>'description'),''),
        active=coalesce((p->>'active')::boolean,true),updated_at=now()
    where id=tid and company_id=cid;
    if not found then raise exception 'Ketentuan pengiriman tidak ditemukan'; end if;
  end if;
  return tid;
end $$;

-- Documents can optionally record a shipping term. Historic documents remain unchanged.
alter table public.pb_dokumen add column shipping_term_id uuid;
alter table public.pj_dokumen add column shipping_term_id uuid;
alter table public.pb_dokumen add constraint pb_dokumen_shipping_term_fk
  foreign key (shipping_term_id, company_id)
  references public.company_shipping_terms(id, company_id) on delete restrict;
alter table public.pj_dokumen add constraint pj_dokumen_shipping_term_fk
  foreign key (shipping_term_id, company_id)
  references public.company_shipping_terms(id, company_id) on delete restrict;

create index pb_dokumen_shipping_term_idx on public.pb_dokumen(company_id, shipping_term_id);
create index pj_dokumen_shipping_term_idx on public.pj_dokumen(company_id, shipping_term_id);

drop view public.pb_dokumen_v;
create view public.pb_dokumen_v with (security_invoker = true) as
select d.*, p.nama as pemasok_nama, s.subtotal,
  round(s.subtotal * (1 + d.ppn_persen / 100)) as total,
  coalesce(b.terbayar, 0) as terbayar,
  round(s.subtotal * (1 + d.ppn_persen / 100)) - coalesce(b.terbayar, 0) as sisa,
  sm.name as shipping_name,
  st.name as shipping_term_name
from public.pb_dokumen d
join public.pb_pemasok p on p.id = d.pemasok_id
cross join lateral (select coalesce(sum(i.qty * i.harga), 0) as subtotal from public.pb_dokumen_item i where i.dokumen_id = d.id) s
left join lateral (select sum(x.jumlah) as terbayar from public.pb_pembayaran x where x.dokumen_id = d.id) b on true
left join public.company_shipping_methods sm on sm.id = d.shipping_method_id and sm.company_id = d.company_id
left join public.company_shipping_terms st on st.id = d.shipping_term_id and st.company_id = d.company_id;

drop view public.pj_dokumen_v;
create view public.pj_dokumen_v with (security_invoker = true) as
select d.*, p.nama as pelanggan_nama, s.subtotal,
  round(s.subtotal * (1 + d.ppn_persen / 100)) as total,
  coalesce(b.terbayar, 0) as terbayar,
  round(s.subtotal * (1 + d.ppn_persen / 100)) - coalesce(b.terbayar, 0) as sisa,
  sm.name as shipping_name,
  st.name as shipping_term_name
from public.pj_dokumen d
join public.pj_pelanggan p on p.id = d.pelanggan_id
cross join lateral (select coalesce(sum(i.qty * i.harga), 0) as subtotal from public.pj_dokumen_item i where i.dokumen_id = d.id) s
left join lateral (select sum(x.jumlah) as terbayar from public.pj_pembayaran x where x.dokumen_id = d.id) b on true
left join public.company_shipping_methods sm on sm.id = d.shipping_method_id and sm.company_id = d.company_id
left join public.company_shipping_terms st on st.id = d.shipping_term_id and st.company_id = d.company_id;

create or replace function public.pb_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  did uuid := nullif(p->>'id','')::uuid;
  cid uuid := (p->>'company_id')::uuid;
  jns text := p->>'jenis';
  it jsonb;
  n int := 0;
  gid uuid;
  cur text := upper(coalesce(nullif(p->>'currency_code',''),'IDR'));
  ptid uuid := nullif(p->>'payment_terms_id','')::uuid;
  smid uuid := nullif(p->>'shipping_method_id','')::uuid;
  stid uuid := nullif(p->>'shipping_term_id','')::uuid;
begin
  if jns not in ('pesanan','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'pembelian','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then raise exception 'Isi minimal satu baris item'; end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then raise exception 'Mata uang belum disimpan atau tidak aktif'; end if;
  if ptid is null then select id into ptid from public.company_payment_terms where company_id=cid and is_default and active; end if;
  if not exists(select 1 from public.company_payment_terms where id=ptid and company_id=cid and active) then raise exception 'Syarat pembayaran belum dipilih, tidak aktif, atau berasal dari perusahaan lain'; end if;
  if smid is not null and not exists (
    select 1 from public.company_shipping_methods sm where sm.id=smid and sm.company_id=cid
      and (sm.active or (did is not null and exists(select 1 from public.pb_dokumen old where old.id=did and old.company_id=cid and old.shipping_method_id=smid)))
  ) then raise exception 'Pengiriman/ekspedisi tidak aktif atau berasal dari perusahaan lain'; end if;
  if stid is not null and not exists (
    select 1 from public.company_shipping_terms st where st.id=stid and st.company_id=cid
      and (st.active or (did is not null and exists(select 1 from public.pb_dokumen old where old.id=did and old.company_id=cid and old.shipping_term_id=stid)))
  ) then raise exception 'Ketentuan pengiriman tidak aktif atau berasal dari perusahaan lain'; end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pb_dokumen(company_id,jenis,nomor,no_referensi,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,gudang_id,currency_code,payment_terms_id,shipping_method_id,shipping_term_id)
    values(cid,jns,public.pb_nomor(cid,jns),nullif(p->>'no_referensi',''),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,
      (p->>'pemasok_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid,cur,ptid,smid,stid)
    returning id into did;
  else
    if not exists(select 1 from public.pb_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pb_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pb_dokumen set no_referensi=nullif(p->>'no_referensi',''),tanggal=(p->>'tanggal')::date,
      batas_tanggal=nullif(p->>'batas_tanggal','')::date,pemasok_id=(p->>'pemasok_id')::uuid,
      ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan',''),gudang_id=gid,
      currency_code=cur,payment_terms_id=ptid,shipping_method_id=smid,shipping_term_id=stid
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
  ptid uuid := nullif(p->>'payment_terms_id','')::uuid;
  smid uuid := nullif(p->>'shipping_method_id','')::uuid;
  stid uuid := nullif(p->>'shipping_term_id','')::uuid;
begin
  if jns not in ('penawaran','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'penjualan','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then raise exception 'Isi minimal satu baris item'; end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then raise exception 'Mata uang belum disimpan atau tidak aktif'; end if;
  if ptid is null then select id into ptid from public.company_payment_terms where company_id=cid and is_default and active; end if;
  if not exists(select 1 from public.company_payment_terms where id=ptid and company_id=cid and active) then raise exception 'Syarat pembayaran belum dipilih, tidak aktif, atau berasal dari perusahaan lain'; end if;
  if smid is not null and not exists (
    select 1 from public.company_shipping_methods sm where sm.id=smid and sm.company_id=cid
      and (sm.active or (did is not null and exists(select 1 from public.pj_dokumen old where old.id=did and old.company_id=cid and old.shipping_method_id=smid)))
  ) then raise exception 'Pengiriman/ekspedisi tidak aktif atau berasal dari perusahaan lain'; end if;
  if stid is not null and not exists (
    select 1 from public.company_shipping_terms st where st.id=stid and st.company_id=cid
      and (st.active or (did is not null and exists(select 1 from public.pj_dokumen old where old.id=did and old.company_id=cid and old.shipping_term_id=stid)))
  ) then raise exception 'Ketentuan pengiriman tidak aktif atau berasal dari perusahaan lain'; end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,gudang_id,currency_code,payment_terms_id,shipping_method_id,shipping_term_id)
    values(cid,jns,public.pj_nomor(cid,jns),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pelanggan_id')::uuid,
      'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid,cur,ptid,smid,stid)
    returning id into did;
  else
    if not exists(select 1 from public.pj_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pj_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pj_dokumen set tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,
      pelanggan_id=(p->>'pelanggan_id')::uuid,ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),
      catatan=nullif(p->>'catatan',''),gudang_id=gid,currency_code=cur,payment_terms_id=ptid,shipping_method_id=smid,shipping_term_id=stid
    where id=did and company_id=cid;
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
declare src public.pj_dokumen%rowtype; fid uuid; due integer;
begin
  select * into src from public.pj_dokumen where id=p_id and jenis='penawaran' for update;
  if not found then raise exception 'Penawaran tidak ditemukan'; end if;
  if not public.has_perm(src.company_id,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if src.status='ditolak' then raise exception 'Penawaran yang ditolak tidak bisa dijadikan faktur'; end if;
  if exists(select 1 from public.pj_dokumen where sumber_id=p_id and status<>'batal') then raise exception 'Penawaran ini sudah dijadikan faktur'; end if;
  select due_days into due from public.company_payment_terms where id=src.payment_terms_id and company_id=src.company_id;
  insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,sumber_id,gudang_id,currency_code,payment_terms_id,shipping_method_id,shipping_term_id)
  values(src.company_id,'faktur',public.pj_nomor(src.company_id,'faktur'),current_date,current_date+coalesce(due,0),src.pelanggan_id,
    'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id,src.currency_code,src.payment_terms_id,src.shipping_method_id,src.shipping_term_id) returning id into fid;
  insert into public.pj_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pj_dokumen_item where dokumen_id=p_id;
  update public.pj_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;


create or replace function public.pb_pesanan_ke_faktur(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.pb_dokumen%rowtype; fid uuid; due integer;
begin
  select * into src from public.pb_dokumen where id=p_id and jenis='pesanan' for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if not public.has_perm(src.company_id,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if src.status='batal' then raise exception 'Pesanan yang dibatalkan tidak bisa dijadikan faktur'; end if;
  if exists(select 1 from public.pb_dokumen where sumber_id=p_id and status<>'batal') then raise exception 'Pesanan ini sudah dijadikan faktur'; end if;
  select due_days into due from public.company_payment_terms where id=src.payment_terms_id and company_id=src.company_id;
  insert into public.pb_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,sumber_id,gudang_id,currency_code,payment_terms_id,shipping_method_id,shipping_term_id)
  values(src.company_id,'faktur',public.pb_nomor(src.company_id,'faktur'),current_date,current_date+coalesce(due,0),src.pemasok_id,
    'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id,src.currency_code,src.payment_terms_id,src.shipping_method_id,src.shipping_term_id) returning id into fid;
  insert into public.pb_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pb_dokumen_item where dokumen_id=p_id;
  update public.pb_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;


create or replace function public.company_shipping_method_delete(p_company uuid, p_shipping_method uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_company) then raise exception 'Hanya owner/admin perusahaan yang bisa menghapus pengiriman'; end if;
  if exists (select 1 from public.pb_dokumen where company_id = p_company and shipping_method_id = p_shipping_method)
     or exists (select 1 from public.pj_dokumen where company_id = p_company and shipping_method_id = p_shipping_method) then
    raise exception 'Ekspedisi sudah dipakai pada transaksi. Nonaktifkan saja agar riwayat transaksi tetap terjaga.';
  end if;
  delete from public.company_shipping_methods where id = p_shipping_method and company_id = p_company;
  if not found then raise exception 'Data pengiriman tidak ditemukan'; end if;
end $$;

grant execute on function public.company_shipping_method_save(jsonb), public.company_shipping_method_delete(uuid, uuid) to authenticated;


create or replace function public.company_shipping_term_delete(p_company uuid, p_term uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(p_company) then raise exception 'Hanya owner/admin perusahaan yang bisa menghapus ketentuan pengiriman'; end if;
  if exists(select 1 from public.pb_dokumen where company_id=p_company and shipping_term_id=p_term)
     or exists(select 1 from public.pj_dokumen where company_id=p_company and shipping_term_id=p_term) then
    raise exception 'Ketentuan pengiriman sudah digunakan pada transaksi. Nonaktifkan saja agar riwayat transaksi tetap terjaga.';
  end if;
  delete from public.company_shipping_terms where id=p_term and company_id=p_company;
  if not found then raise exception 'Ketentuan pengiriman tidak ditemukan'; end if;
end $$;

grant execute on function public.company_shipping_terms_seed_after_company_insert() to authenticated;
grant execute on function public.company_shipping_term_save(jsonb), public.company_shipping_term_delete(uuid, uuid) to authenticated;
grant execute on function public.pb_simpan_dokumen(jsonb), public.pj_simpan_dokumen(jsonb),
  public.pb_pesanan_ke_faktur(uuid), public.pj_penawaran_ke_faktur(uuid) to authenticated;
