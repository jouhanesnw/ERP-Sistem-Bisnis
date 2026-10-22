-- MODUL PRODUK & STOK: master produk, kartu stok, penyesuaian, terhubung ke faktur Penjualan/Pembelian.
-- Prasyarat: 001_foundation.sql, 002_kas.sql, 003_penjualan.sql, 004_pembelian.sql.

create table public.pd_produk (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kode text,
  nama text not null,
  satuan text not null default 'pcs',
  harga_beli numeric(16,2) not null default 0 check (harga_beli >= 0),
  harga_jual numeric(16,2) not null default 0 check (harga_jual >= 0),
  lacak_stok boolean not null default true,
  stok_minimum numeric(14,2) not null default 0 check (stok_minimum >= 0),
  aktif boolean not null default true,
  catatan text,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index pd_produk_kode_uq on public.pd_produk(company_id, lower(kode)) where kode is not null;

create table public.pd_stok_mutasi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  produk_id uuid not null,
  tanggal date not null default current_date,
  jumlah numeric(14,2) not null check (jumlah <> 0),
  jenis text not null check (jenis in ('awal','pembelian','penjualan','penyesuaian')),
  sumber_tipe text,
  sumber_id uuid,
  keterangan text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (produk_id, company_id) references public.pd_produk(id, company_id)
);
create index pd_mutasi_company_tanggal_idx on public.pd_stok_mutasi(company_id, tanggal desc);
create index pd_mutasi_produk_idx on public.pd_stok_mutasi(produk_id);
create index pd_mutasi_sumber_idx on public.pd_stok_mutasi(sumber_tipe, sumber_id);

create view public.pd_produk_v with (security_invoker = true) as
select p.*,
  case when p.lacak_stok then coalesce((select sum(m.jumlah) from public.pd_stok_mutasi m where m.produk_id = p.id),0) else 0 end as stok
from public.pd_produk p;

alter table public.pd_produk enable row level security;
create policy pd_produk_sel on public.pd_produk for select using (public.has_perm(company_id,'produk','view'));
create policy pd_produk_ins on public.pd_produk for insert with check (public.has_perm(company_id,'produk','create'));
create policy pd_produk_upd on public.pd_produk for update using (public.has_perm(company_id,'produk','edit')) with check (public.has_perm(company_id,'produk','edit'));
create policy pd_produk_del on public.pd_produk for delete using (public.has_perm(company_id,'produk','delete'));
alter table public.pd_stok_mutasi enable row level security;
create policy pd_mutasi_sel on public.pd_stok_mutasi for select using (public.has_perm(company_id,'produk','view'));

-- Input stok awal atau hasil stok opname. p_fisik adalah total fisik saat ini; fungsi hanya mencatat selisih.
create or replace function public.pd_sesuaikan(p_produk uuid, p_tanggal date, p_fisik numeric, p_ket text default null, p_jenis text default 'penyesuaian')
returns numeric language plpgsql security definer set search_path = public as $$
declare pr public.pd_produk%rowtype; cur numeric; delta numeric;
begin
  select * into pr from public.pd_produk where id = p_produk for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if not public.has_perm(pr.company_id,'produk','create') then raise exception 'Tidak punya izin'; end if;
  if not pr.lacak_stok then raise exception 'Produk ini tidak dilacak stoknya'; end if;
  if p_jenis not in ('awal','penyesuaian') then raise exception 'Jenis tidak valid'; end if;
  if p_fisik is null or p_fisik < 0 then raise exception 'Stok fisik tidak boleh negatif'; end if;
  select coalesce(sum(jumlah),0) into cur from public.pd_stok_mutasi where produk_id = p_produk;
  delta := p_fisik - cur;
  if delta <> 0 then
    insert into public.pd_stok_mutasi(company_id,produk_id,tanggal,jumlah,jenis,sumber_tipe,keterangan)
    values (pr.company_id,p_produk,coalesce(p_tanggal,current_date),delta,p_jenis,'adj',p_ket);
  end if;
  return delta;
end $$;

-- Daftar produk untuk form faktur; pengguna hanya perlu akses modul Penjualan/Pembelian.
create or replace function public.pd_pilihan(cid uuid, modul text)
returns table (id uuid, kode text, nama text, satuan text, harga_jual numeric, harga_beli numeric, stok numeric, lacak_stok boolean, aktif boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if modul not in ('penjualan','pembelian') or not public.has_perm(cid,modul,'view') then return; end if;
  return query select p.id,p.kode,p.nama,p.satuan,p.harga_jual,p.harga_beli,
    case when p.lacak_stok then coalesce((select sum(m.jumlah) from public.pd_stok_mutasi m where m.produk_id=p.id),0) else 0 end,
    p.lacak_stok,p.aktif
  from public.pd_produk p where p.company_id=cid order by p.nama;
end $$;
grant execute on function public.pd_sesuaikan(uuid,date,numeric,text,text), public.pd_pilihan(uuid,text) to authenticated;

-- Baris faktur bisa terhubung ke produk. Kolom tetap nullable agar deskripsi bebas masih didukung.
alter table public.pj_dokumen_item add column produk_id uuid;
alter table public.pj_dokumen_item add constraint pj_item_produk_fk foreign key (produk_id,company_id) references public.pd_produk(id,company_id);
alter table public.pb_dokumen_item add column produk_id uuid;
alter table public.pb_dokumen_item add constraint pb_item_produk_fk foreign key (produk_id,company_id) references public.pd_produk(id,company_id);

-- Stok berubah saat faktur berstatus terbit. Faktur draft/batal tidak memengaruhi stok.
create or replace function public.pd_sync_dokumen(p_tipe text, p_dok uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid; st text; j text; t date; no_dok text; p uuid;
begin
  delete from public.pd_stok_mutasi where sumber_tipe=p_tipe and sumber_id=p_dok;
  if p_tipe='pj' then
    select company_id,status,jenis,tanggal,nomor into c,st,j,t,no_dok from public.pj_dokumen where id=p_dok;
  elsif p_tipe='pb' then
    select company_id,status,jenis,tanggal,nomor into c,st,j,t,no_dok from public.pb_dokumen where id=p_dok;
  else raise exception 'Jenis sumber stok tidak valid'; end if;
  if not found or j<>'faktur' or st<>'terbit' then return; end if;
  if p_tipe='pj' then
    insert into public.pd_stok_mutasi(company_id,produk_id,tanggal,jumlah,jenis,sumber_tipe,sumber_id,keterangan)
    select i.company_id,i.produk_id,t,-sum(i.qty),'penjualan','pj',p_dok,'Faktur penjualan '||no_dok
    from public.pj_dokumen_item i join public.pd_produk pr on pr.id=i.produk_id and pr.company_id=i.company_id and pr.lacak_stok
    where i.dokumen_id=p_dok and i.produk_id is not null group by i.company_id,i.produk_id;
  else
    insert into public.pd_stok_mutasi(company_id,produk_id,tanggal,jumlah,jenis,sumber_tipe,sumber_id,keterangan)
    select i.company_id,i.produk_id,t,sum(i.qty),'pembelian','pb',p_dok,'Faktur pembelian '||no_dok
    from public.pb_dokumen_item i join public.pd_produk pr on pr.id=i.produk_id and pr.company_id=i.company_id and pr.lacak_stok
    where i.dokumen_id=p_dok and i.produk_id is not null group by i.company_id,i.produk_id;
  end if;
  -- Cegah faktur penjualan terbit jika stok produk akan menjadi negatif.
  if p_tipe='pj' then
    for p in select distinct produk_id from public.pj_dokumen_item where dokumen_id=p_dok and produk_id is not null loop
      if (select coalesce(sum(m.jumlah),0) from public.pd_stok_mutasi m where m.produk_id=p)<0 then
        raise exception 'Stok produk tidak mencukupi. Faktur tidak dapat diterbitkan.';
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.pd_sync_dokumen(text,uuid) from public, anon, authenticated;

create or replace function public.pd_trg_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='DELETE' then
    perform public.pd_sync_dokumen(tg_argv[0],old.dokumen_id);
  elsif tg_op='UPDATE' then
    if old.dokumen_id is distinct from new.dokumen_id then perform public.pd_sync_dokumen(tg_argv[0],old.dokumen_id); end if;
    perform public.pd_sync_dokumen(tg_argv[0],new.dokumen_id);
  else
    perform public.pd_sync_dokumen(tg_argv[0],new.dokumen_id);
  end if;
  return null;
end $$;
create or replace function public.pd_trg_dok()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='DELETE' then perform public.pd_sync_dokumen(tg_argv[0],old.id); return old; end if;
  perform public.pd_sync_dokumen(tg_argv[0],new.id);
  return new;
end $$;
create trigger pd_item_pj after insert or update or delete on public.pj_dokumen_item for each row execute function public.pd_trg_item('pj');
create trigger pd_item_pb after insert or update or delete on public.pb_dokumen_item for each row execute function public.pd_trg_item('pb');
create trigger pd_dok_pj after update of status,tanggal or delete on public.pj_dokumen for each row execute function public.pd_trg_dok('pj');
create trigger pd_dok_pb after update of status,tanggal or delete on public.pb_dokumen for each row execute function public.pd_trg_dok('pb');

-- Save Penjualan: retain permission checks and persist produk_id.
create or replace function public.pj_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid:=nullif(p->>'id','')::uuid; cid uuid:=(p->>'company_id')::uuid; jns text:=p->>'jenis'; it jsonb; n int:=0;
begin
  if jns not in ('penawaran','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'penjualan','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then raise exception 'Isi minimal satu baris item'; end if;
  if did is null then
    insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan)
    values(cid,jns,public.pj_nomor(cid,jns),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pelanggan_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan','')) returning id into did;
  else
    if not exists(select 1 from public.pj_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pj_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah. Hapus pembayarannya dulu.'; end if;
    update public.pj_dokumen set tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,pelanggan_id=(p->>'pelanggan_id')::uuid,
      ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan','') where id=did and company_id=cid;
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
language plpgsql security definer set search_path = public as $$
declare src public.pj_dokumen%rowtype; fid uuid;
begin
  select * into src from public.pj_dokumen where id=p_id and jenis='penawaran' for update;
  if not found then raise exception 'Penawaran tidak ditemukan'; end if;
  if not public.has_perm(src.company_id,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if src.status='ditolak' then raise exception 'Penawaran yang ditolak tidak bisa dijadikan faktur'; end if;
  if exists(select 1 from public.pj_dokumen where sumber_id=p_id and status<>'batal') then raise exception 'Penawaran ini sudah dijadikan faktur'; end if;
  insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,sumber_id)
  values(src.company_id,'faktur',public.pj_nomor(src.company_id,'faktur'),current_date,current_date+14,src.pelanggan_id,'draft',src.ppn_persen,src.catatan,src.id) returning id into fid;
  insert into public.pj_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pj_dokumen_item where dokumen_id=p_id;
  update public.pj_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;

-- Save Pembelian: retain permission checks and persist produk_id.
create or replace function public.pb_simpan_dokumen(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid:=nullif(p->>'id','')::uuid; cid uuid:=(p->>'company_id')::uuid; jns text:=p->>'jenis'; it jsonb; n int:=0;
begin
  if jns not in ('pesanan','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'pembelian','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then raise exception 'Isi minimal satu baris item'; end if;
  if did is null then
    insert into public.pb_dokumen(company_id,jenis,nomor,no_referensi,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan)
    values(cid,jns,public.pb_nomor(cid,jns),nullif(p->>'no_referensi',''),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pemasok_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan','')) returning id into did;
  else
    if not exists(select 1 from public.pb_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pb_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah. Hapus pembayarannya dulu.'; end if;
    update public.pb_dokumen set no_referensi=nullif(p->>'no_referensi',''),tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,
      pemasok_id=(p->>'pemasok_id')::uuid,ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan','') where id=did and company_id=cid;
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
language plpgsql security definer set search_path = public as $$
declare src public.pb_dokumen%rowtype; fid uuid;
begin
  select * into src from public.pb_dokumen where id=p_id and jenis='pesanan' for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if not public.has_perm(src.company_id,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if src.status='batal' then raise exception 'Pesanan yang dibatalkan tidak bisa dijadikan faktur'; end if;
  if exists(select 1 from public.pb_dokumen where sumber_id=p_id and status<>'batal') then raise exception 'Pesanan ini sudah dijadikan faktur'; end if;
  insert into public.pb_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,sumber_id)
  values(src.company_id,'faktur',public.pb_nomor(src.company_id,'faktur'),current_date,current_date+14,src.pemasok_id,'draft',src.ppn_persen,src.catatan,src.id) returning id into fid;
  insert into public.pb_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pb_dokumen_item where dokumen_id=p_id;
  update public.pb_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;

grant execute on function public.pj_simpan_dokumen(jsonb), public.pj_penawaran_ke_faktur(uuid),
  public.pb_simpan_dokumen(jsonb), public.pb_pesanan_ke_faktur(uuid) to authenticated;
