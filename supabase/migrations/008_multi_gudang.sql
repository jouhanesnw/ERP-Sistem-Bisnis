-- MULTI-GUDANG: stok terpisah per lokasi, transfer atomik, penyesuaian per gudang.
-- Prasyarat: migrasi 001-007 sudah berhasil dijalankan.

create table public.pd_gudang (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kode text not null,
  nama text not null,
  alamat text,
  aktif boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index pd_gudang_kode_uq on public.pd_gudang(company_id, lower(kode));
create unique index pd_gudang_default_uq on public.pd_gudang(company_id) where is_default;

-- Setiap perusahaan mendapat gudang utama. Riwayat stok lama dipertahankan dan ditempatkan di sana.
insert into public.pd_gudang(company_id,kode,nama,is_default)
select c.id,'UTAMA','Gudang Utama',true from public.companies c
where not exists (select 1 from public.pd_gudang g where g.company_id=c.id and g.is_default);

-- Otomatis membuat gudang utama untuk perusahaan yang dibuat setelah migrasi ini.
create or replace function public.pd_buat_gudang_default() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.pd_gudang(company_id,kode,nama,is_default)
  values(new.id,'UTAMA','Gudang Utama',true)
  on conflict do nothing;
  return new;
end $$;
create trigger pd_company_gudang_default after insert on public.companies
for each row execute function public.pd_buat_gudang_default();

alter table public.pd_stok_mutasi add column gudang_id uuid;
update public.pd_stok_mutasi m set gudang_id=g.id
from public.pd_gudang g where g.company_id=m.company_id and g.is_default and m.gudang_id is null;
alter table public.pd_stok_mutasi alter column gudang_id set not null;
alter table public.pd_stok_mutasi add constraint pd_mutasi_gudang_fk
  foreign key (gudang_id,company_id) references public.pd_gudang(id,company_id);
create index pd_mutasi_gudang_tanggal_idx on public.pd_stok_mutasi(company_id,gudang_id,tanggal desc);

-- Tambahkan gudang tujuan pada penawaran/faktur Penjualan dan pesanan/faktur Pembelian.
alter table public.pj_dokumen add column gudang_id uuid;
alter table public.pb_dokumen add column gudang_id uuid;
update public.pj_dokumen d set gudang_id=g.id from public.pd_gudang g where g.company_id=d.company_id and g.is_default and d.gudang_id is null;
update public.pb_dokumen d set gudang_id=g.id from public.pd_gudang g where g.company_id=d.company_id and g.is_default and d.gudang_id is null;
alter table public.pj_dokumen alter column gudang_id set not null;
alter table public.pb_dokumen alter column gudang_id set not null;
alter table public.pj_dokumen add constraint pj_dok_gudang_fk foreign key (gudang_id,company_id) references public.pd_gudang(id,company_id);
alter table public.pb_dokumen add constraint pb_dok_gudang_fk foreign key (gudang_id,company_id) references public.pd_gudang(id,company_id);

-- Jenis mutasi tambahan untuk pasangan transfer keluar/masuk.
alter table public.pd_stok_mutasi drop constraint if exists pd_stok_mutasi_jenis_check;
alter table public.pd_stok_mutasi add constraint pd_stok_mutasi_jenis_check
  check (jenis in ('awal','pembelian','penjualan','penyesuaian','transfer_keluar','transfer_masuk'));

create table public.pd_transfer (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nomor text not null,
  tanggal date not null default current_date,
  gudang_asal_id uuid not null,
  gudang_tujuan_id uuid not null,
  produk_id uuid not null,
  jumlah numeric(14,2) not null check (jumlah > 0),
  catatan text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (gudang_asal_id <> gudang_tujuan_id),
  unique (company_id,nomor),
  foreign key (gudang_asal_id,company_id) references public.pd_gudang(id,company_id),
  foreign key (gudang_tujuan_id,company_id) references public.pd_gudang(id,company_id),
  foreign key (produk_id,company_id) references public.pd_produk(id,company_id)
);
create index pd_transfer_company_tanggal_idx on public.pd_transfer(company_id,tanggal desc);

alter table public.pd_gudang enable row level security;
create policy pd_gudang_sel on public.pd_gudang for select using (
  public.has_perm(company_id,'produk','view') or
  public.has_perm(company_id,'penjualan','view') or
  public.has_perm(company_id,'pembelian','view')
);
create policy pd_gudang_ins on public.pd_gudang for insert with check (public.has_perm(company_id,'produk','create'));
create policy pd_gudang_upd on public.pd_gudang for update using (public.has_perm(company_id,'produk','edit')) with check (public.has_perm(company_id,'produk','edit'));
create policy pd_gudang_del on public.pd_gudang for delete using (public.has_perm(company_id,'produk','delete') and not is_default);
alter table public.pd_transfer enable row level security;
create policy pd_transfer_sel on public.pd_transfer for select using (public.has_perm(company_id,'produk','view'));

-- Kombinasi produk dan gudang dengan stok hasil kartu mutasi.
create or replace view public.pd_gudang_stok_v with (security_invoker = true) as
select p.company_id,p.id as produk_id,p.kode,p.nama as produk_nama,p.satuan,p.harga_beli,p.harga_jual,
  p.lacak_stok,p.stok_minimum,p.aktif,g.id as gudang_id,g.kode as gudang_kode,g.nama as gudang_nama,
  case when p.lacak_stok then coalesce(sum(m.jumlah),0) else 0 end as stok
from public.pd_produk p
cross join public.pd_gudang g
left join public.pd_stok_mutasi m on m.produk_id=p.id and m.gudang_id=g.id
where g.company_id=p.company_id
group by p.company_id,p.id,g.id;

-- Fungsi stok awal lama tetap bekerja dan memasukkan stok ke gudang utama.
create or replace function public.pd_sesuaikan(p_produk uuid,p_tanggal date,p_fisik numeric,p_ket text default null,p_jenis text default 'penyesuaian')
returns numeric language plpgsql security definer set search_path = public as $$
declare pr public.pd_produk%rowtype; gid uuid; cur numeric; delta numeric;
begin
  select * into pr from public.pd_produk where id=p_produk for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if not public.has_perm(pr.company_id,'produk','create') then raise exception 'Tidak punya izin'; end if;
  if not pr.lacak_stok then raise exception 'Produk ini tidak dilacak stoknya'; end if;
  if p_jenis not in ('awal','penyesuaian') then raise exception 'Jenis tidak valid'; end if;
  if p_fisik is null or p_fisik<0 then raise exception 'Stok fisik tidak boleh negatif'; end if;
  select id into gid from public.pd_gudang where company_id=pr.company_id and is_default;
  select coalesce(sum(jumlah),0) into cur from public.pd_stok_mutasi where produk_id=p_produk and gudang_id=gid;
  delta:=p_fisik-cur;
  if delta<>0 then insert into public.pd_stok_mutasi(company_id,produk_id,gudang_id,tanggal,jumlah,jenis,sumber_tipe,keterangan)
    values(pr.company_id,p_produk,gid,coalesce(p_tanggal,current_date),delta,p_jenis,'adj',p_ket); end if;
  return delta;
end $$;

create or replace function public.pd_sesuaikan_gudang(p_produk uuid,p_gudang uuid,p_tanggal date,p_fisik numeric,p_ket text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare pr public.pd_produk%rowtype; cur numeric; delta numeric;
begin
  select * into pr from public.pd_produk where id=p_produk for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if not public.has_perm(pr.company_id,'produk','create') then raise exception 'Tidak punya izin'; end if;
  if not pr.lacak_stok then raise exception 'Produk ini tidak dilacak stoknya'; end if;
  if not exists(select 1 from public.pd_gudang where id=p_gudang and company_id=pr.company_id and aktif) then raise exception 'Gudang tidak valid atau nonaktif'; end if;
  if p_fisik is null or p_fisik<0 then raise exception 'Stok fisik tidak boleh negatif'; end if;
  select coalesce(sum(jumlah),0) into cur from public.pd_stok_mutasi where produk_id=p_produk and gudang_id=p_gudang;
  delta:=p_fisik-cur;
  if delta<>0 then insert into public.pd_stok_mutasi(company_id,produk_id,gudang_id,tanggal,jumlah,jenis,sumber_tipe,keterangan)
    values(pr.company_id,p_produk,p_gudang,coalesce(p_tanggal,current_date),delta,'penyesuaian','adj',p_ket); end if;
  return delta;
end $$;

-- Gudang yang dapat dipilih dalam formulir Penjualan/Pembelian.
create or replace function public.gd_pilihan(cid uuid,modul text)
returns table(id uuid,kode text,nama text,is_default boolean)
language sql stable security definer set search_path=public as $$
  select g.id,g.kode,g.nama,g.is_default from public.pd_gudang g
  where g.company_id=cid and g.aktif and
    (public.has_perm(cid,'produk','view') or (modul in ('penjualan','pembelian') and public.has_perm(cid,modul,'view')))
  order by g.is_default desc,g.nama
$$;

create or replace function public.pd_pilihan_gudang(cid uuid,modul text,gid uuid)
returns table(id uuid,kode text,nama text,satuan text,harga_jual numeric,harga_beli numeric,stok numeric,lacak_stok boolean,aktif boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if modul not in ('penjualan','pembelian') or not public.has_perm(cid,modul,'view') then return; end if;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  return query select p.id,p.kode,p.nama,p.satuan,p.harga_jual,p.harga_beli,
    case when p.lacak_stok then coalesce((select sum(m.jumlah) from public.pd_stok_mutasi m where m.produk_id=p.id and m.gudang_id=gid),0) else 0 end,
    p.lacak_stok,p.aktif from public.pd_produk p where p.company_id=cid order by p.nama;
end $$;
grant execute on function public.gd_pilihan(uuid,text),public.pd_pilihan_gudang(uuid,text,uuid),public.pd_sesuaikan_gudang(uuid,uuid,date,numeric,text) to authenticated;

-- Mutasi invoice ditulis ulang berdasarkan gudang yang dipilih pada dokumen.
create or replace function public.pd_sync_dokumen(p_tipe text,p_dok uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c uuid; st text; j text; t date; no_dok text; gid uuid; pr_id uuid;
begin
  delete from public.pd_stok_mutasi where sumber_tipe=p_tipe and sumber_id=p_dok;
  if p_tipe='pj' then
    select company_id,status,jenis,tanggal,nomor,gudang_id into c,st,j,t,no_dok,gid from public.pj_dokumen where id=p_dok;
  elsif p_tipe='pb' then
    select company_id,status,jenis,tanggal,nomor,gudang_id into c,st,j,t,no_dok,gid from public.pb_dokumen where id=p_dok;
  else raise exception 'Jenis sumber stok tidak valid'; end if;
  if not found or j<>'faktur' or st<>'terbit' then return; end if;
  if gid is null then raise exception 'Pilih gudang sebelum menerbitkan faktur'; end if;
  if p_tipe='pj' then
    -- Stok tersedia dicek per gudang dan memperhitungkan kuantitas semua baris faktur ini.
    for pr_id in select distinct i.produk_id from public.pj_dokumen_item i join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id and p.lacak_stok where i.dokumen_id=p_dok and i.produk_id is not null loop
      -- Lock row produk agar dua faktur bersamaan tidak dapat menjual stok yang sama.
      perform 1 from public.pd_produk where id=pr_id for update;
      if (select coalesce(sum(m.jumlah),0) from public.pd_stok_mutasi m where m.produk_id=pr_id and m.gudang_id=gid)
         < (select sum(i.qty) from public.pj_dokumen_item i where i.dokumen_id=p_dok and i.produk_id=pr_id) then
        raise exception 'Stok produk tidak mencukupi di gudang yang dipilih.';
      end if;
    end loop;
    insert into public.pd_stok_mutasi(company_id,produk_id,gudang_id,tanggal,jumlah,jenis,sumber_tipe,sumber_id,keterangan)
    select i.company_id,i.produk_id,gid,t,-sum(i.qty),'penjualan','pj',p_dok,'Faktur penjualan '||no_dok
    from public.pj_dokumen_item i join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id and p.lacak_stok
    where i.dokumen_id=p_dok and i.produk_id is not null group by i.company_id,i.produk_id;
  else
    insert into public.pd_stok_mutasi(company_id,produk_id,gudang_id,tanggal,jumlah,jenis,sumber_tipe,sumber_id,keterangan)
    select i.company_id,i.produk_id,gid,t,sum(i.qty),'pembelian','pb',p_dok,'Faktur pembelian '||no_dok
    from public.pb_dokumen_item i join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id and p.lacak_stok
    where i.dokumen_id=p_dok and i.produk_id is not null group by i.company_id,i.produk_id;
  end if;
end $$;
revoke all on function public.pd_sync_dokumen(text,uuid) from public,anon,authenticated;

-- Fungsi simpan dokumen menerima gudang_id dan menjaga izin per modul.
create or replace function public.pj_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare did uuid:=nullif(p->>'id','')::uuid; cid uuid:=(p->>'company_id')::uuid; jns text:=p->>'jenis'; it jsonb; n int:=0; gid uuid;
begin
  if jns not in ('penawaran','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'penjualan','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then raise exception 'Isi minimal satu baris item'; end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,gudang_id)
    values(cid,jns,public.pj_nomor(cid,jns),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pelanggan_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid) returning id into did;
  else
    if not exists(select 1 from public.pj_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pj_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pj_dokumen set tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,pelanggan_id=(p->>'pelanggan_id')::uuid,
      ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan',''),gudang_id=gid where id=did and company_id=cid;
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
  insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,sumber_id,gudang_id)
  values(src.company_id,'faktur',public.pj_nomor(src.company_id,'faktur'),current_date,current_date+14,src.pelanggan_id,'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id) returning id into fid;
  insert into public.pj_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pj_dokumen_item where dokumen_id=p_id;
  update public.pj_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;

create or replace function public.pb_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare did uuid:=nullif(p->>'id','')::uuid; cid uuid:=(p->>'company_id')::uuid; jns text:=p->>'jenis'; it jsonb; n int:=0; gid uuid;
begin
  if jns not in ('pesanan','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'pembelian','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then raise exception 'Isi minimal satu baris item'; end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pb_dokumen(company_id,jenis,nomor,no_referensi,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,gudang_id)
    values(cid,jns,public.pb_nomor(cid,jns),nullif(p->>'no_referensi',''),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pemasok_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid) returning id into did;
  else
    if not exists(select 1 from public.pb_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pb_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pb_dokumen set no_referensi=nullif(p->>'no_referensi',''),tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,
      pemasok_id=(p->>'pemasok_id')::uuid,ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan',''),gudang_id=gid where id=did and company_id=cid;
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
  insert into public.pb_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,sumber_id,gudang_id)
  values(src.company_id,'faktur',public.pb_nomor(src.company_id,'faktur'),current_date,current_date+14,src.pemasok_id,'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id) returning id into fid;
  insert into public.pb_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pb_dokumen_item where dokumen_id=p_id;
  update public.pb_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;


-- Recreate document views so the newly added gudang_id is included in their output.
drop view public.pj_dokumen_v;
create view public.pj_dokumen_v with (security_invoker = true) as
select d.*, p.nama as pelanggan_nama, s.subtotal,
  round(s.subtotal * (1 + d.ppn_persen / 100)) as total,
  coalesce(b.terbayar, 0) as terbayar,
  round(s.subtotal * (1 + d.ppn_persen / 100)) - coalesce(b.terbayar, 0) as sisa
from public.pj_dokumen d
join public.pj_pelanggan p on p.id = d.pelanggan_id
cross join lateral (select coalesce(sum(i.qty * i.harga), 0) as subtotal from public.pj_dokumen_item i where i.dokumen_id = d.id) s
left join lateral (select sum(x.jumlah) as terbayar from public.pj_pembayaran x where x.dokumen_id = d.id) b on true;

drop view public.pb_dokumen_v;
create view public.pb_dokumen_v with (security_invoker = true) as
select d.*, p.nama as pemasok_nama, s.subtotal,
  round(s.subtotal * (1 + d.ppn_persen / 100)) as total,
  coalesce(b.terbayar, 0) as terbayar,
  round(s.subtotal * (1 + d.ppn_persen / 100)) - coalesce(b.terbayar, 0) as sisa
from public.pb_dokumen d
join public.pb_pemasok p on p.id = d.pemasok_id
cross join lateral (select coalesce(sum(i.qty * i.harga), 0) as subtotal from public.pb_dokumen_item i where i.dokumen_id = d.id) s
left join lateral (select sum(x.jumlah) as terbayar from public.pb_pembayaran x where x.dokumen_id = d.id) b on true;

-- Protect issued invoices from in-place edits: changing their items would rewrite a posted stock movement.

create or replace function public.pd_tolak_edit_faktur_terbit() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.jenis='faktur' and old.status='terbit' then
    -- Faktur terbit tidak boleh diedit; satu-satunya perubahan yang diizinkan adalah membatalkan faktur tanpa pembayaran.
    if new.status<>'batal' or (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
      raise exception 'Faktur terbit tidak dapat diubah. Untuk membatalkan, ubah hanya status menjadi batal.';
    end if;
    if tg_table_name='pj_dokumen' and exists(select 1 from public.pj_pembayaran where dokumen_id=old.id) then raise exception 'Faktur yang sudah dibayar tidak dapat dibatalkan.'; end if;
    if tg_table_name='pb_dokumen' and exists(select 1 from public.pb_pembayaran where dokumen_id=old.id) then raise exception 'Faktur yang sudah dibayar tidak dapat dibatalkan.'; end if;
  end if;
  return new;
end $$;
create trigger pd_protect_pj_invoice before update on public.pj_dokumen for each row execute function public.pd_tolak_edit_faktur_terbit();
create trigger pd_protect_pb_invoice before update on public.pb_dokumen for each row execute function public.pd_tolak_edit_faktur_terbit();

create or replace function public.pd_tolak_hapus_faktur_terbit() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.jenis='faktur' and old.status='terbit' then
    raise exception 'Faktur terbit tidak boleh dihapus langsung. Batalkan faktur tanpa pembayaran terlebih dahulu.';
  end if;
  return old;
end $$;
create trigger pd_hapus_pj_invoice before delete on public.pj_dokumen for each row execute function public.pd_tolak_hapus_faktur_terbit();
create trigger pd_hapus_pb_invoice before delete on public.pb_dokumen for each row execute function public.pd_tolak_hapus_faktur_terbit();

-- Keep stock movements synchronized when the warehouse is changed on a still-draft invoice.
drop trigger if exists pd_dok_pj on public.pj_dokumen;
drop trigger if exists pd_dok_pb on public.pb_dokumen;
create trigger pd_dok_pj after update of status,tanggal,gudang_id or delete on public.pj_dokumen for each row execute function public.pd_trg_dok('pj');
create trigger pd_dok_pb after update of status,tanggal,gudang_id or delete on public.pb_dokumen for each row execute function public.pd_trg_dok('pb');


-- Blokir perubahan detail item faktur yang sudah terbit agar kartu stok tidak dapat diedit langsung lewat API.
create or replace function public.pd_jaga_item_faktur()
returns trigger language plpgsql security definer set search_path=public as $$
declare did uuid; st text; j text;
begin
  did := case when tg_op='DELETE' then old.dokumen_id else new.dokumen_id end;
  if tg_table_name='pj_dokumen_item' then
    select status,jenis into st,j from public.pj_dokumen where id=did;
  else
    select status,jenis into st,j from public.pb_dokumen where id=did;
  end if;
  if j='faktur' and st='terbit' then raise exception 'Rincian faktur terbit tidak dapat diubah. Batalkan faktur tanpa pembayaran lalu buat ulang.'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger pd_jaga_item_pj before insert or update or delete on public.pj_dokumen_item for each row execute function public.pd_jaga_item_faktur();
create trigger pd_jaga_item_pb before insert or update or delete on public.pb_dokumen_item for each row execute function public.pd_jaga_item_faktur();

-- Transfer langsung dan atomik: stok asal berkurang persis saat stok tujuan bertambah.
create or replace function public.pd_transfer_stok(p_tanggal date,p_asal uuid,p_tujuan uuid,p_produk uuid,p_jumlah numeric,p_catatan text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid; nomor text; tid uuid; tersedia numeric;
begin
  if p_asal=p_tujuan then raise exception 'Gudang asal dan tujuan harus berbeda'; end if;
  select company_id into c from public.pd_gudang where id=p_asal and aktif;
  if c is null or not exists(select 1 from public.pd_gudang where id=p_tujuan and company_id=c and aktif) then raise exception 'Gudang tidak valid'; end if;
  if not public.has_perm(c,'produk','create') then raise exception 'Tidak punya izin'; end if;
  if p_jumlah is null or p_jumlah<=0 then raise exception 'Jumlah transfer harus lebih dari 0'; end if;
  perform 1 from public.pd_produk where id=p_produk and company_id=c and lacak_stok for update;
  if not found then raise exception 'Produk tidak valid atau tidak melacak stok'; end if;
  select coalesce(sum(jumlah),0) into tersedia from public.pd_stok_mutasi where produk_id=p_produk and gudang_id=p_asal;
  if tersedia<p_jumlah then raise exception 'Stok gudang asal tidak mencukupi'; end if;
  nomor:='TRF/'||to_char(coalesce(p_tanggal,current_date),'YYYY')||'/'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.pd_transfer(company_id,nomor,tanggal,gudang_asal_id,gudang_tujuan_id,produk_id,jumlah,catatan)
  values(c,nomor,coalesce(p_tanggal,current_date),p_asal,p_tujuan,p_produk,p_jumlah,nullif(p_catatan,'')) returning id into tid;
  insert into public.pd_stok_mutasi(company_id,produk_id,gudang_id,tanggal,jumlah,jenis,sumber_tipe,sumber_id,keterangan)
  values(c,p_produk,p_asal,coalesce(p_tanggal,current_date),-p_jumlah,'transfer_keluar','transfer',tid,'Transfer '||nomor||' ke gudang tujuan'),
        (c,p_produk,p_tujuan,coalesce(p_tanggal,current_date),p_jumlah,'transfer_masuk','transfer',tid,'Transfer '||nomor||' dari gudang asal');
  return tid;
end $$;
grant execute on function public.pd_transfer_stok(date,uuid,uuid,uuid,numeric,text) to authenticated;
