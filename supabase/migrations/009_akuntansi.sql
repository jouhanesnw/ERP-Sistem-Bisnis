-- MODUL AKUNTANSI: COA, jurnal double-entry, buku besar, laporan laba rugi & neraca.
-- Prasyarat: migrasi 001-008 telah berhasil dijalankan.
-- Jalankan migrasi ini satu kali. Jurnal sumber dibuat otomatis dan tidak dapat diedit langsung dari klien.

create table public.ak_akun (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kode text not null,
  nama text not null,
  tipe text not null check (tipe in ('aset','kewajiban','modal','pendapatan','beban')),
  normal text not null check (normal in ('debit','kredit')),
  induk_id uuid,
  sistem boolean not null default false,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique(id,company_id),
  unique(company_id,kode),
  foreign key (induk_id,company_id) references public.ak_akun(id,company_id)
);
create index ak_akun_company_tipe_idx on public.ak_akun(company_id,tipe,kode);

create table public.ak_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  tahun int not null,
  terakhir int not null default 0,
  primary key(company_id,tahun)
);
alter table public.ak_counter enable row level security;

create table public.ak_jurnal (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nomor text not null,
  tanggal date not null default current_date,
  keterangan text not null,
  sumber_tipe text not null,
  sumber_id uuid,
  status text not null default 'terbit' check (status in ('terbit')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  posted_at timestamptz not null default now(),
  unique(id,company_id),
  unique(company_id,nomor)
);
create unique index ak_jurnal_source_uq on public.ak_jurnal(company_id,sumber_tipe,sumber_id) where sumber_id is not null;
create index ak_jurnal_company_date_idx on public.ak_jurnal(company_id,tanggal desc);

create table public.ak_jurnal_baris (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jurnal_id uuid not null,
  akun_id uuid not null,
  urutan int not null default 1,
  keterangan text,
  debit numeric(16,2) not null default 0 check (debit >= 0),
  kredit numeric(16,2) not null default 0 check (kredit >= 0),
  created_at timestamptz not null default now(),
  foreign key (jurnal_id,company_id) references public.ak_jurnal(id,company_id) on delete cascade,
  foreign key (akun_id,company_id) references public.ak_akun(id,company_id),
  check (not (debit > 0 and kredit > 0)),
  check (debit > 0 or kredit > 0)
);
create index ak_baris_jurnal_idx on public.ak_jurnal_baris(jurnal_id,urutan);
create index ak_baris_akun_idx on public.ak_jurnal_baris(company_id,akun_id);

alter table public.kas_kategori add column ak_akun_id uuid;
alter table public.kas_kategori add constraint kas_kategori_ak_akun_fk
  foreign key (ak_akun_id,company_id) references public.ak_akun(id,company_id);

alter table public.pd_produk add column ak_akun_persediaan_id uuid;
alter table public.pd_produk add column ak_akun_pendapatan_id uuid;
alter table public.pd_produk add column ak_akun_hpp_id uuid;
alter table public.pd_produk add constraint pd_produk_ak_persediaan_fk
  foreign key (ak_akun_persediaan_id,company_id) references public.ak_akun(id,company_id);
alter table public.pd_produk add constraint pd_produk_ak_pendapatan_fk
  foreign key (ak_akun_pendapatan_id,company_id) references public.ak_akun(id,company_id);
alter table public.pd_produk add constraint pd_produk_ak_hpp_fk
  foreign key (ak_akun_hpp_id,company_id) references public.ak_akun(id,company_id);

-- Hak akses RLS. Jurnal sumber hanya ditulis melalui fungsi aman / trigger.
alter table public.ak_akun enable row level security;
create policy ak_akun_sel on public.ak_akun for select using (public.has_perm(company_id,'akuntansi','view'));
create policy ak_akun_ins on public.ak_akun for insert with check (public.has_perm(company_id,'akuntansi','create') and not sistem);
create policy ak_akun_upd on public.ak_akun for update using (public.has_perm(company_id,'akuntansi','edit') and not sistem) with check (public.has_perm(company_id,'akuntansi','edit') and not sistem);
create policy ak_akun_del on public.ak_akun for delete using (public.has_perm(company_id,'akuntansi','delete') and not sistem);
alter table public.ak_jurnal enable row level security;
create policy ak_jurnal_sel on public.ak_jurnal for select using (public.has_perm(company_id,'akuntansi','view'));
alter table public.ak_jurnal_baris enable row level security;
create policy ak_baris_sel on public.ak_jurnal_baris for select using (public.has_perm(company_id,'akuntansi','view'));

create or replace function public.ak_seed_akun(cid uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.ak_akun(company_id,kode,nama,tipe,normal,sistem) values
    (cid,'1100','Kas dan Bank','aset','debit',true),
    (cid,'1200','Piutang Usaha','aset','debit',true),
    (cid,'1300','Persediaan Barang','aset','debit',true),
    (cid,'1400','Pajak Masukan','aset','debit',true),
    (cid,'2100','Utang Usaha','kewajiban','kredit',true),
    (cid,'2200','Pajak Keluaran','kewajiban','kredit',true),
    (cid,'3000','Modal dan Saldo Awal','modal','kredit',true),
    (cid,'3100','Saldo Laba','modal','kredit',true),
    (cid,'4000','Pendapatan Penjualan','pendapatan','kredit',true),
    (cid,'4100','Pendapatan Lain-lain','pendapatan','kredit',true),
    (cid,'5000','Harga Pokok Penjualan','beban','debit',true),
    (cid,'6000','Beban Operasional','beban','debit',true),
    (cid,'6100','Beban Lain-lain','beban','debit',true)
  on conflict(company_id,kode) do nothing;
end $$;

create or replace function public.ak_seed_perusahaan() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public.ak_seed_akun(new.id);
  return new;
end $$;
create trigger ak_seed_company after insert on public.companies for each row execute function public.ak_seed_perusahaan();
revoke all on function public.ak_seed_akun(uuid), public.ak_seed_perusahaan() from public,anon,authenticated;

do $$ declare c record; begin
  for c in select id from public.companies loop perform public.ak_seed_akun(c.id); end loop;
end $$;

create or replace function public.ak_nomor(cid uuid, p_tanggal date) returns text
language plpgsql security definer set search_path=public as $$
declare n int; yr int:=extract(year from p_tanggal)::int;
begin
  insert into public.ak_counter(company_id,tahun,terakhir) values(cid,yr,1)
  on conflict(company_id,tahun) do update set terakhir=ak_counter.terakhir+1 returning terakhir into n;
  return 'JRN/'||yr||'/'||lpad(n::text,5,'0');
end $$;
revoke all on function public.ak_nomor(uuid,date) from public,anon,authenticated;

-- Fungsi internal untuk menulis/mengganti jurnal terposting yang berasal dari transaksi.
create or replace function public.ak_upsert_jurnal(
  cid uuid,p_tanggal date,p_keterangan text,p_sumber text,p_sumber_id uuid,p_baris jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare jid uuid; nomor text; total_d numeric(16,2); total_k numeric(16,2); item jsonb; ur int:=0; aid uuid;
begin
  if p_sumber_id is not null then
    select id into jid from public.ak_jurnal where company_id=cid and sumber_tipe=p_sumber and sumber_id=p_sumber_id for update;
  end if;
  if jid is not null then
    delete from public.ak_jurnal where id=jid;
  end if;
  if p_baris is null or jsonb_typeof(p_baris)<>'array' or jsonb_array_length(p_baris)<2 then
    return null;
  end if;
  select coalesce(sum((x->>'debit')::numeric),0),coalesce(sum((x->>'kredit')::numeric),0)
    into total_d,total_k from jsonb_array_elements(p_baris) x;
  if round(total_d,2)<>round(total_k,2) then
    raise exception 'Jurnal tidak seimbang. Debit Rp %, kredit Rp %',total_d,total_k;
  end if;
  if round(total_d,2)=0 and round(total_k,2)=0 then return null; end if;
  jid:=gen_random_uuid();
  nomor:=public.ak_nomor(cid,coalesce(p_tanggal,current_date));
  insert into public.ak_jurnal(id,company_id,nomor,tanggal,keterangan,sumber_tipe,sumber_id,status)
  values(jid,cid,nomor,coalesce(p_tanggal,current_date),p_keterangan,p_sumber,p_sumber_id,'terbit');
  for item in select * from jsonb_array_elements(p_baris) loop
    ur:=ur+1;
    aid:=nullif(item->>'akun_id','')::uuid;
    if not exists(select 1 from public.ak_akun where id=aid and company_id=cid) then
      raise exception 'Akun jurnal tidak ditemukan pada perusahaan ini';
    end if;
    insert into public.ak_jurnal_baris(company_id,jurnal_id,akun_id,urutan,keterangan,debit,kredit)
    values(cid,jid,aid,ur,nullif(item->>'keterangan',''),coalesce(nullif(item->>'debit','')::numeric,0),coalesce(nullif(item->>'kredit','')::numeric,0));
  end loop;
  return jid;
end $$;
revoke all on function public.ak_upsert_jurnal(uuid,date,text,text,uuid,jsonb) from public,anon,authenticated;

-- Jurnal otomatis untuk transaksi Kas. Pembayaran faktur dipetakan sebagai pelunasan piutang/utang,
-- bukan pendapatan/beban lagi, supaya tidak dihitung ganda.
create or replace function public.ak_sync_kas(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare t public.kas_transaksi%rowtype; cid uuid; cash uuid; lawan uuid; ar uuid; ap uuid;
  pp public.pj_pembayaran%rowtype; bp public.pb_pembayaran%rowtype; baris jsonb:='[]'::jsonb;
  sumber text:='kas_transaksi'; ket text; p_nama text; v_nom numeric;
begin
  select * into t from public.kas_transaksi where id=p_id;
  if not found then
    delete from public.ak_jurnal where sumber_tipe='kas_transaksi' and sumber_id=p_id;
    return;
  end if;
  cid:=t.company_id;
  select id into cash from public.ak_akun where company_id=cid and kode='1100';
  select id into ar from public.ak_akun where company_id=cid and kode='1200';
  select id into ap from public.ak_akun where company_id=cid and kode='2100';
  select * into pp from public.pj_pembayaran where kas_transaksi_id=t.id limit 1;
  select * into bp from public.pb_pembayaran where kas_transaksi_id=t.id limit 1;
  if pp.id is not null then
    baris:=jsonb_build_array(
      jsonb_build_object('akun_id',cash,'debit',pp.jumlah,'kredit',0,'keterangan','Kas masuk'),
      jsonb_build_object('akun_id',ar,'debit',0,'kredit',pp.jumlah,'keterangan','Pelunasan piutang')
    );
    select 'Pembayaran faktur penjualan '||d.nomor into ket from public.pj_dokumen d where d.id=pp.dokumen_id;
  elsif bp.id is not null then
    baris:=jsonb_build_array(
      jsonb_build_object('akun_id',ap,'debit',bp.jumlah,'kredit',0,'keterangan','Pelunasan utang'),
      jsonb_build_object('akun_id',cash,'debit',0,'kredit',bp.jumlah,'keterangan','Kas keluar')
    );
    select 'Pembayaran faktur pembelian '||d.nomor into ket from public.pb_dokumen d where d.id=bp.dokumen_id;
  elsif t.jenis='transfer' then
    baris:=jsonb_build_array(
      jsonb_build_object('akun_id',cash,'debit',t.jumlah,'kredit',0,'keterangan','Rekening tujuan'),
      jsonb_build_object('akun_id',cash,'debit',0,'kredit',t.jumlah,'keterangan','Rekening asal')
    );
    ket:='Transfer antar rekening: '||coalesce(t.keterangan,'');
  else
    select ak_akun_id into lawan from public.kas_kategori where id=t.kategori_id and company_id=cid;
    if lawan is null then
      select id into lawan from public.ak_akun where company_id=cid and kode=case when t.jenis='masuk' then '4100' else '6000' end;
    end if;
    if t.jenis='masuk' then
      baris:=jsonb_build_array(
        jsonb_build_object('akun_id',cash,'debit',t.jumlah,'kredit',0,'keterangan','Kas masuk'),
        jsonb_build_object('akun_id',lawan,'debit',0,'kredit',t.jumlah,'keterangan',coalesce(t.keterangan,'Pemasukan'))
      );
    else
      baris:=jsonb_build_array(
        jsonb_build_object('akun_id',lawan,'debit',t.jumlah,'kredit',0,'keterangan',coalesce(t.keterangan,'Pengeluaran')),
        jsonb_build_object('akun_id',cash,'debit',0,'kredit',t.jumlah,'keterangan','Kas keluar')
      );
    end if;
    ket:=coalesce(t.keterangan,'Transaksi kas');
  end if;
  perform public.ak_upsert_jurnal(cid,t.tanggal,coalesce(ket,t.keterangan,'Transaksi kas'),sumber,t.id,baris);
end $$;
revoke all on function public.ak_sync_kas(uuid) from public,anon,authenticated;

create or replace function public.ak_trg_kas() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_sync_kas(old.id); return old; end if;
  perform public.ak_sync_kas(new.id); return new;
end $$;
create trigger ak_kas_post after insert or update or delete on public.kas_transaksi for each row execute function public.ak_trg_kas();

create or replace function public.ak_trg_pembayaran() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_sync_kas(old.kas_transaksi_id); return old; end if;
  perform public.ak_sync_kas(new.kas_transaksi_id); return new;
end $$;
create trigger ak_pj_pembayaran_post after insert or update or delete on public.pj_pembayaran for each row execute function public.ak_trg_pembayaran();
create trigger ak_pb_pembayaran_post after insert or update or delete on public.pb_pembayaran for each row execute function public.ak_trg_pembayaran();

-- Jurnal faktur penjualan: Dr Piutang, Cr Pendapatan/PPN keluaran, Dr HPP & Cr Persediaan.
create or replace function public.ak_sync_penjualan(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare d public.pj_dokumen%rowtype; baris jsonb:='[]'::jsonb; ar uuid; pajak uuid; revenue uuid; inventory uuid; hpp uuid;
  sub numeric(16,2); total numeric(16,2); tax numeric(16,2); vcost numeric(16,2); rec record; ket text;
begin
  select * into d from public.pj_dokumen where id=p_id;
  if not found then delete from public.ak_jurnal where sumber_tipe='pj_faktur' and sumber_id=p_id; return; end if;
  if d.status<>'terbit' then delete from public.ak_jurnal where company_id=d.company_id and sumber_tipe='pj_faktur' and sumber_id=d.id; return; end if;
  select id into ar from public.ak_akun where company_id=d.company_id and kode='1200';
  select id into pajak from public.ak_akun where company_id=d.company_id and kode='2200';
  select id into revenue from public.ak_akun where company_id=d.company_id and kode='4000';
  select id into inventory from public.ak_akun where company_id=d.company_id and kode='1300';
  select id into hpp from public.ak_akun where company_id=d.company_id and kode='5000';
  select coalesce(sum(round(i.qty*i.harga,2)),0) into sub from public.pj_dokumen_item i where i.dokumen_id=d.id;
  total:=round(sub*(1+d.ppn_persen/100),2); tax:=total-sub;
  ket:='Faktur penjualan '||d.nomor;
  baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',ar,'debit',total,'kredit',0,'keterangan','Piutang usaha'));
  for rec in
    select coalesce(p.ak_akun_pendapatan_id,revenue) akun_id,sum(round(i.qty*i.harga,2)) jumlah
    from public.pj_dokumen_item i left join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id
    where i.dokumen_id=d.id group by coalesce(p.ak_akun_pendapatan_id,revenue)
  loop
    if rec.jumlah>0 then baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',rec.akun_id,'debit',0,'kredit',rec.jumlah,'keterangan','Pendapatan penjualan')); end if;
  end loop;
  if tax>0 then baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',pajak,'debit',0,'kredit',tax,'keterangan','PPN keluaran')); end if;
  for rec in
    select coalesce(p.ak_akun_hpp_id,hpp) akun_id,sum(round(i.qty*p.harga_beli,2)) jumlah
    from public.pj_dokumen_item i join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id and p.lacak_stok
    where i.dokumen_id=d.id and p.harga_beli>0 group by coalesce(p.ak_akun_hpp_id,hpp)
  loop
    if rec.jumlah>0 then baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',rec.akun_id,'debit',rec.jumlah,'kredit',0,'keterangan','Harga pokok penjualan')); end if;
  end loop;
  select coalesce(sum(round(i.qty*p.harga_beli,2)),0) into vcost from public.pj_dokumen_item i
    join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id and p.lacak_stok
    where i.dokumen_id=d.id and p.harga_beli>0;
  for rec in
    select coalesce(p.ak_akun_persediaan_id,inventory) akun_id,sum(round(i.qty*p.harga_beli,2)) jumlah
    from public.pj_dokumen_item i join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id and p.lacak_stok
    where i.dokumen_id=d.id and p.harga_beli>0 group by coalesce(p.ak_akun_persediaan_id,inventory)
  loop
    if rec.jumlah>0 then baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',rec.akun_id,'debit',0,'kredit',rec.jumlah,'keterangan','Pengurangan persediaan')); end if;
  end loop;
  perform public.ak_upsert_jurnal(d.company_id,d.tanggal,ket,'pj_faktur',d.id,baris);
end $$;
revoke all on function public.ak_sync_penjualan(uuid) from public,anon,authenticated;

create or replace function public.ak_trg_penjualan() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_sync_penjualan(old.id); return old; end if;
  perform public.ak_sync_penjualan(new.id); return new;
end $$;
create trigger ak_pj_invoice_post_insert_delete after insert or delete on public.pj_dokumen for each row execute function public.ak_trg_penjualan();
create trigger ak_pj_invoice_post_update after update of status,tanggal on public.pj_dokumen for each row execute function public.ak_trg_penjualan();

-- Jurnal faktur pembelian: Dr Persediaan/Beban + PPN masukan, Cr Utang Usaha.
create or replace function public.ak_sync_pembelian(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare d public.pb_dokumen%rowtype; baris jsonb:='[]'::jsonb; ap uuid; pajak uuid; inventory uuid; expense uuid;
  sub numeric(16,2); total numeric(16,2); tax numeric(16,2); rec record;
begin
  select * into d from public.pb_dokumen where id=p_id;
  if not found then delete from public.ak_jurnal where sumber_tipe='pb_faktur' and sumber_id=p_id; return; end if;
  if d.status<>'terbit' then delete from public.ak_jurnal where company_id=d.company_id and sumber_tipe='pb_faktur' and sumber_id=d.id; return; end if;
  select id into ap from public.ak_akun where company_id=d.company_id and kode='2100';
  select id into pajak from public.ak_akun where company_id=d.company_id and kode='1400';
  select id into inventory from public.ak_akun where company_id=d.company_id and kode='1300';
  select id into expense from public.ak_akun where company_id=d.company_id and kode='6000';
  select coalesce(sum(round(i.qty*i.harga,2)),0) into sub from public.pb_dokumen_item i where i.dokumen_id=d.id;
  total:=round(sub*(1+d.ppn_persen/100),2); tax:=total-sub;
  baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',ap,'debit',0,'kredit',total,'keterangan','Utang usaha'));
  for rec in
    select case when p.lacak_stok then coalesce(p.ak_akun_persediaan_id,inventory) else expense end akun_id,sum(round(i.qty*i.harga,2)) jumlah
    from public.pb_dokumen_item i left join public.pd_produk p on p.id=i.produk_id and p.company_id=i.company_id
    where i.dokumen_id=d.id group by case when p.lacak_stok then coalesce(p.ak_akun_persediaan_id,inventory) else expense end
  loop
    if rec.jumlah>0 then baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',rec.akun_id,'debit',rec.jumlah,'kredit',0,'keterangan','Pembelian / persediaan')); end if;
  end loop;
  if tax>0 then baris:=baris||jsonb_build_array(jsonb_build_object('akun_id',pajak,'debit',tax,'kredit',0,'keterangan','PPN masukan')); end if;
  perform public.ak_upsert_jurnal(d.company_id,d.tanggal,'Faktur pembelian '||d.nomor,'pb_faktur',d.id,baris);
end $$;
revoke all on function public.ak_sync_pembelian(uuid) from public,anon,authenticated;

create or replace function public.ak_trg_pembelian() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_sync_pembelian(old.id); return old; end if;
  perform public.ak_sync_pembelian(new.id); return new;
end $$;
create trigger ak_pb_invoice_post_insert_delete after insert or delete on public.pb_dokumen for each row execute function public.ak_trg_pembelian();
create trigger ak_pb_invoice_post_update after update of status,tanggal on public.pb_dokumen for each row execute function public.ak_trg_pembelian();

-- Jurnal manual berpasangan (debit harus sama dengan kredit).
create or replace function public.ak_simpan_jurnal(p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid:=(p->>'company_id')::uuid; tgl date:=coalesce(nullif(p->>'tanggal','')::date,current_date);
  descx text:=coalesce(nullif(p->>'keterangan',''),'Jurnal umum'); l jsonb; lines jsonb; did uuid; dr numeric:=0; cr numeric:=0;
begin
  if not public.has_perm(cid,'akuntansi','create') then raise exception 'Tidak punya izin'; end if;
  lines:=p->'items';
  if lines is null or jsonb_typeof(lines)<>'array' or jsonb_array_length(lines)<2 then raise exception 'Minimal dua baris jurnal'; end if;
  for l in select * from jsonb_array_elements(lines) loop
    if coalesce((l->>'debit')::numeric,0)<0 or coalesce((l->>'kredit')::numeric,0)<0
      or (coalesce((l->>'debit')::numeric,0)>0 and coalesce((l->>'kredit')::numeric,0)>0)
      or (coalesce((l->>'debit')::numeric,0)=0 and coalesce((l->>'kredit')::numeric,0)=0) then raise exception 'Setiap baris harus berisi debit atau kredit positif, bukan keduanya'; end if;
    if not exists(select 1 from public.ak_akun where id=(l->>'akun_id')::uuid and company_id=cid and aktif) then raise exception 'Akun tidak valid'; end if;
    dr:=dr+coalesce((l->>'debit')::numeric,0); cr:=cr+coalesce((l->>'kredit')::numeric,0);
  end loop;
  if round(dr,2)<>round(cr,2) then raise exception 'Jurnal tidak seimbang. Total debit dan kredit harus sama.'; end if;
  did:=gen_random_uuid();
  did:=public.ak_upsert_jurnal(cid,tgl,descx,'manual',did,lines);
  return did;
end $$;
grant execute on function public.ak_simpan_jurnal(jsonb) to authenticated;

-- Ringkasan akun: aktivitas periode dan saldo kumulatif per akhir tanggal.
create or replace function public.ak_ringkasan_akun(cid uuid,p_mulai date,p_sampai date)
returns table(akun_id uuid,kode text,nama text,tipe text,normal text,aktif boolean,
  periode_debit numeric,periode_kredit numeric,semua_debit numeric,semua_kredit numeric)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_perm(cid,'akuntansi','view') then raise exception 'Tidak punya izin'; end if;
  return query
  select a.id,a.kode,a.nama,a.tipe,a.normal,a.aktif,
    coalesce(sum(case when j.tanggal between p_mulai and p_sampai then b.debit else 0 end),0),
    coalesce(sum(case when j.tanggal between p_mulai and p_sampai then b.kredit else 0 end),0),
    coalesce(sum(case when j.id is not null then b.debit else 0 end),0),coalesce(sum(case when j.id is not null then b.kredit else 0 end),0)
  from public.ak_akun a left join public.ak_jurnal_baris b on b.akun_id=a.id and b.company_id=a.company_id
  left join public.ak_jurnal j on j.id=b.jurnal_id and j.company_id=b.company_id and j.status='terbit' and j.tanggal<=p_sampai
  where a.company_id=cid
  group by a.id,a.kode,a.nama,a.tipe,a.normal,a.aktif
  order by a.kode;
end $$;

create or replace function public.ak_kategori_kas_pilihan(cid uuid)
returns table(id uuid,nama text,jenis text,ak_akun_id uuid)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_perm(cid,'akuntansi','view') then raise exception 'Tidak punya izin'; end if;
  return query select k.id,k.nama,k.jenis,k.ak_akun_id from public.kas_kategori k where k.company_id=cid order by k.jenis,k.nama;
end $$;
create or replace function public.ak_peta_kategori_kas(p_kategori uuid,p_akun uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select company_id into cid from public.kas_kategori where id=p_kategori;
  if cid is null or not public.has_perm(cid,'akuntansi','edit') then raise exception 'Tidak punya izin'; end if;
  if p_akun is not null and not exists(select 1 from public.ak_akun where id=p_akun and company_id=cid and aktif) then raise exception 'Akun tidak valid'; end if;
  update public.kas_kategori set ak_akun_id=p_akun where id=p_kategori and company_id=cid;
end $$;

-- Buku besar ditampilkan melalui view ini; hanya jurnal terbit yang masuk laporan.
create view public.ak_jurnal_v with (security_invoker=true) as
select j.*,coalesce(sum(b.debit),0) as total_debit,coalesce(sum(b.kredit),0) as total_kredit
from public.ak_jurnal j left join public.ak_jurnal_baris b on b.jurnal_id=j.id and b.company_id=j.company_id
group by j.id;

create view public.ak_buku_besar_v with (security_invoker=true) as
select b.id,b.company_id,b.jurnal_id,b.akun_id,b.urutan,b.keterangan as baris_keterangan,b.debit,b.kredit,
 j.nomor,j.tanggal,j.keterangan as jurnal_keterangan,j.sumber_tipe,a.kode,a.nama,a.tipe,a.normal
from public.ak_jurnal_baris b join public.ak_jurnal j on j.id=b.jurnal_id and j.company_id=b.company_id
join public.ak_akun a on a.id=b.akun_id and a.company_id=b.company_id
where j.status='terbit';

-- Saldo awal migrasi: snapshot kas, persediaan, piutang dan utang yang sudah tercatat sebelum modul Akuntansi aktif.
-- Selisihnya masuk ke Modal dan Saldo Awal agar neraca pembukaan seimbang.
create or replace function public.ak_buat_saldo_awal(cid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare cash numeric(16,2); stock numeric(16,2); arbal numeric(16,2); apbal numeric(16,2); equity numeric(16,2);
  cashid uuid; stockid uuid; arid uuid; apid uuid; eqid uuid; lines jsonb:='[]'::jsonb;
begin
  if exists(select 1 from public.ak_jurnal where company_id=cid and sumber_tipe='opening') then return; end if;
  select id into cashid from public.ak_akun where company_id=cid and kode='1100';
  select id into stockid from public.ak_akun where company_id=cid and kode='1300';
  select id into arid from public.ak_akun where company_id=cid and kode='1200';
  select id into apid from public.ak_akun where company_id=cid and kode='2100';
  select id into eqid from public.ak_akun where company_id=cid and kode='3000';
  select coalesce(sum(saldo),0) into cash from public.kas_saldo where company_id=cid;
  select coalesce(sum(greatest(stok,0)*harga_beli),0) into stock from public.pd_produk_v where company_id=cid and lacak_stok;
  select coalesce(sum(greatest(sisa,0)),0) into arbal from public.pj_dokumen_v where company_id=cid and jenis='faktur' and status='terbit';
  select coalesce(sum(greatest(sisa,0)),0) into apbal from public.pb_dokumen_v where company_id=cid and jenis='faktur' and status='terbit';
  if cash>0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',cashid,'debit',cash,'kredit',0,'keterangan','Saldo awal kas dan bank')); elsif cash<0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',cashid,'debit',0,'kredit',-cash,'keterangan','Saldo awal kas dan bank')); end if;
  if stock>0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',stockid,'debit',stock,'kredit',0,'keterangan','Saldo awal persediaan')); end if;
  if arbal>0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',arid,'debit',arbal,'kredit',0,'keterangan','Saldo awal piutang')); end if;
  if apbal>0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',apid,'debit',0,'kredit',apbal,'keterangan','Saldo awal utang')); end if;
  equity:=cash+stock+arbal-apbal;
  if equity>0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',eqid,'debit',0,'kredit',equity,'keterangan','Ekuitas pembukaan')); elsif equity<0 then lines:=lines||jsonb_build_array(jsonb_build_object('akun_id',eqid,'debit',-equity,'kredit',0,'keterangan','Ekuitas pembukaan')); end if;
  if jsonb_array_length(lines)>=2 then
    perform public.ak_upsert_jurnal(cid,current_date,'Saldo awal otomatis per tanggal migrasi','opening',cid,lines);
  end if;
end $$;
revoke all on function public.ak_buat_saldo_awal(uuid) from public,anon,authenticated;

grant execute on function public.ak_ringkasan_akun(uuid,date,date),
  public.ak_kategori_kas_pilihan(uuid),public.ak_peta_kategori_kas(uuid,uuid) to authenticated;

-- Perubahan pemetaan akun kategori Kas memperbarui jurnal transaksi manual yang sudah ada.
create or replace function public.ak_trg_peta_kategori() returns trigger
language plpgsql security definer set search_path=public as $$
declare x record;
begin
  if new.ak_akun_id is distinct from old.ak_akun_id then
    for x in select t.id from public.kas_transaksi t
      where t.kategori_id=new.id and exists(
        select 1 from public.ak_jurnal j where j.company_id=t.company_id and j.sumber_tipe='kas_transaksi' and j.sumber_id=t.id
      ) loop
      -- Hanya refresh jurnal yang telah terbentuk sejak modul Akuntansi aktif; transaksi lama tercakup saldo awal.
      perform public.ak_sync_kas(x.id);
    end loop;
  end if;
  return new;
end $$;
create trigger ak_kas_kategori_map after update of ak_akun_id on public.kas_kategori
for each row execute function public.ak_trg_peta_kategori();

create or replace function public.ak_pergerakan_kas(cid uuid,p_mulai date,p_sampai date)
returns table(jenis text,total numeric,jumlah_transaksi bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_perm(cid,'akuntansi','view') then raise exception 'Tidak punya izin'; end if;
  return query select t.jenis,coalesce(sum(t.jumlah),0),count(*)
  from public.kas_transaksi t where t.company_id=cid and t.tanggal between p_mulai and p_sampai
  group by t.jenis order by t.jenis;
end $$;
grant execute on function public.ak_pergerakan_kas(uuid,date,date) to authenticated;

-- Generate opening entries for each existing company after posting triggers and COA are ready.
do $$ declare c record; begin
  for c in select id from public.companies loop
    perform public.ak_buat_saldo_awal(c.id);
  end loop;
end $$;
