-- PENCATATAN BEBAN: pengakuan beban, hutang, pelunasan, dan jurnal otomatis
-- Prasyarat: migrasi 001-027, khususnya COA 027 dan modul Kas & Bank.

-- Akun sistem khusus untuk akrual beban. Tidak membawa saldo awal.
insert into public.ak_akun(
  company_id, kode, nama, tipe, normal, kode_tipe, currency_code, sistem, aktif
)
select c.id, '2210', 'Hutang Beban', 'kewajiban', 'kredit', 'OCLY', 'IDR', true, true
from public.companies c
on conflict (company_id, kode) do nothing;

-- Pastikan perusahaan baru juga mendapat akun Hutang Beban tanpa mengubah kode akun sistem lama.
create or replace function public.ak_seed_akun(cid uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.company_currencies(company_id, code, name, symbol, is_default, is_active)
  values (cid, 'IDR', 'Rupiah Indonesia', 'Rp', true, true)
  on conflict (company_id, code) do nothing;

  insert into public.ak_akun(company_id,kode,nama,tipe,normal,kode_tipe,currency_code,sistem) values
    (cid,'1100','Kas dan Bank','aset','debit','BANK','IDR',true),
    (cid,'1200','Piutang Usaha','aset','debit','AREC','IDR',true),
    (cid,'1300','Persediaan Barang','aset','debit','INTR','IDR',true),
    (cid,'1400','Pajak Masukan','aset','debit','OCAS','IDR',true),
    (cid,'2100','Utang Usaha','kewajiban','kredit','APAY','IDR',true),
    (cid,'2200','Pajak Keluaran','kewajiban','kredit','OCLY','IDR',true),
    (cid,'2210','Hutang Beban','kewajiban','kredit','OCLY','IDR',true),
    (cid,'3000','Modal dan Saldo Awal','modal','kredit','EQTY','IDR',true),
    (cid,'3100','Saldo Laba','modal','kredit','EQTY','IDR',true),
    (cid,'4000','Pendapatan Penjualan','pendapatan','kredit','REVE','IDR',true),
    (cid,'4100','Pendapatan Lain-lain','pendapatan','kredit','OINC','IDR',true),
    (cid,'5000','Harga Pokok Penjualan','beban','debit','COGS','IDR',true),
    (cid,'6000','Beban Operasional','beban','debit','EXPS','IDR',true),
    (cid,'6100','Beban Lain-lain','beban','debit','OEXP','IDR',true)
  on conflict(company_id,kode) do nothing;
end $$;
revoke all on function public.ak_seed_akun(uuid) from public, anon, authenticated;

create table public.ak_beban_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  jenis text not null check (jenis in ('beban','pembayaran')),
  tahun integer not null,
  terakhir integer not null default 0,
  primary key (company_id, jenis, tahun)
);
alter table public.ak_beban_counter enable row level security;
revoke all on public.ak_beban_counter from anon, authenticated;

create table public.ak_pencatatan_beban (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nomor text not null,
  tanggal date not null default current_date,
  jatuh_tempo date not null,
  hutang_akun_id uuid not null,
  currency_code text not null default 'IDR',
  total numeric(16,2) not null check (total > 0),
  branch_id uuid,
  catatan text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, nomor),
  foreign key (hutang_akun_id, company_id) references public.ak_akun(id, company_id),
  foreign key (company_id, currency_code) references public.company_currencies(company_id, code),
  foreign key (branch_id, company_id) references public.company_branches(id, company_id),
  check (jatuh_tempo >= tanggal)
);
create index ak_pencatatan_beban_company_date_idx on public.ak_pencatatan_beban(company_id, tanggal desc);
create index ak_pencatatan_beban_company_due_idx on public.ak_pencatatan_beban(company_id, jatuh_tempo);

create table public.ak_pencatatan_beban_baris (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  beban_id uuid not null,
  urutan integer not null default 1,
  akun_beban_id uuid not null,
  deskripsi text not null,
  jumlah numeric(16,2) not null check (jumlah > 0),
  created_at timestamptz not null default now(),
  foreign key (beban_id, company_id) references public.ak_pencatatan_beban(id, company_id) on delete cascade,
  foreign key (akun_beban_id, company_id) references public.ak_akun(id, company_id)
);
create index ak_pencatatan_beban_baris_parent_idx on public.ak_pencatatan_beban_baris(company_id, beban_id, urutan);

create table public.ak_beban_pembayaran (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  beban_id uuid not null,
  nomor text not null,
  tanggal date not null default current_date,
  jumlah numeric(16,2) not null check (jumlah > 0),
  rekening_id uuid not null,
  kas_transaksi_id uuid not null references public.kas_transaksi(id) on delete cascade,
  catatan text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, nomor),
  foreign key (beban_id, company_id) references public.ak_pencatatan_beban(id, company_id) on delete cascade,
  foreign key (rekening_id, company_id) references public.kas_rekening(id, company_id)
);
create index ak_beban_pembayaran_parent_idx on public.ak_beban_pembayaran(company_id, beban_id, tanggal desc);

-- Data tabel detail/pembayaran hanya bisa dibaca langsung. Semua penulisan dilakukan melalui RPC tervalidasi.
do $policies$
declare tbl text;
begin
  foreach tbl in array array['ak_pencatatan_beban','ak_pencatatan_beban_baris','ak_beban_pembayaran'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', tbl);
    execute format(
      'create policy %I on public.%I for select using (public.has_perm(company_id, ''akuntansi'', ''view''))',
      tbl || '_sel', tbl
    );
  end loop;
end
$policies$;

create or replace function public.ak_beban_nomor(p_company_id uuid, p_jenis text, p_tanggal date)
returns text language plpgsql security definer set search_path=public as $$
declare seq integer; yr integer := extract(year from p_tanggal)::integer;
begin
  if p_jenis not in ('beban','pembayaran') then raise exception 'Jenis nomor tidak valid'; end if;
  insert into public.ak_beban_counter(company_id, jenis, tahun, terakhir)
  values (p_company_id, p_jenis, yr, 1)
  on conflict (company_id, jenis, tahun) do update set terakhir = ak_beban_counter.terakhir + 1
  returning terakhir into seq;
  return case p_jenis when 'beban' then 'BEBAN/' else 'PBEBAN/' end || yr::text || '/' || lpad(seq::text, 4, '0');
end $$;
revoke all on function public.ak_beban_nomor(uuid,text,date) from public, anon, authenticated;

create or replace function public.ak_sync_pencatatan_beban(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  b public.ak_pencatatan_beban%rowtype;
  entries jsonb := '[]'::jsonb;
begin
  select * into b from public.ak_pencatatan_beban where id = p_id;
  if not found then
    delete from public.ak_jurnal where sumber_tipe = 'ak_beban' and sumber_id = p_id;
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'akun_id', l.akun_beban_id, 'debit', l.jumlah, 'kredit', 0, 'keterangan', l.deskripsi
  ) order by l.urutan), '[]'::jsonb)
  into entries
  from public.ak_pencatatan_beban_baris l
  where l.company_id = b.company_id and l.beban_id = b.id;

  entries := entries || jsonb_build_array(jsonb_build_object(
    'akun_id', b.hutang_akun_id, 'debit', 0, 'kredit', b.total, 'keterangan', 'Hutang beban ' || b.nomor
  ));

  perform public.ak_upsert_jurnal(
    b.company_id, b.tanggal, 'Pencatatan beban ' || b.nomor, 'ak_beban', b.id, entries
  );
end $$;
revoke all on function public.ak_sync_pencatatan_beban(uuid) from public, anon, authenticated;

create or replace function public.ak_pencatatan_beban_simpan(p jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  did uuid := nullif(p->>'id','')::uuid;
  cid uuid := nullif(p->>'company_id','')::uuid;
  actor uuid := auth.uid();
  tgl date := coalesce(nullif(p->>'tanggal','')::date, current_date);
  due date := nullif(p->>'jatuh_tempo','')::date;
  cur text := upper(coalesce(nullif(p->>'currency_code',''),'IDR'));
  payable uuid := nullif(p->>'hutang_akun_id','')::uuid;
  branch_value uuid := nullif(p->>'branch_id','')::uuid;
  lines jsonb := coalesce(p->'items','[]'::jsonb);
  item jsonb;
  amount_value numeric(16,2);
  total_value numeric(16,2) := 0;
  description_value text;
  expense_account uuid;
  row_no integer := 0;
begin
  if cid is null or actor is null or not public.is_member(cid) then raise exception 'Tidak punya akses ke perusahaan ini'; end if;
  if did is null then
    if not public.has_perm(cid,'akuntansi','create') then raise exception 'Tidak punya izin membuat pencatatan beban'; end if;
  else
    if not public.has_perm(cid,'akuntansi','edit') then raise exception 'Tidak punya izin mengubah pencatatan beban'; end if;
    if not exists(select 1 from public.ak_pencatatan_beban where id=did and company_id=cid) then raise exception 'Pencatatan beban tidak ditemukan'; end if;
    if exists(select 1 from public.ak_beban_pembayaran where beban_id=did and company_id=cid) then
      raise exception 'Pencatatan beban yang sudah dibayar tidak dapat diubah.';
    end if;
  end if;
  if due is null then raise exception 'Tanggal jatuh tempo wajib diisi'; end if;
  if due < tgl then raise exception 'Tanggal jatuh tempo tidak boleh lebih awal daripada tanggal beban'; end if;
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then raise exception 'Tambahkan minimal satu baris akun beban'; end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then
    raise exception 'Mata uang belum aktif pada perusahaan ini';
  end if;
  if not exists(select 1 from public.ak_akun where id=payable and company_id=cid and tipe='kewajiban' and kode_tipe='OCLY' and aktif and currency_code=cur) then
    raise exception 'Pilih akun Hutang Beban bertipe Kewajiban Jangka Pendek dan bermata uang yang sama';
  end if;
  if branch_value is not null and not exists(select 1 from public.company_branches where id=branch_value and company_id=cid and active) then
    raise exception 'Cabang tidak valid';
  end if;

  for item in select * from jsonb_array_elements(lines) loop
    row_no := row_no + 1;
    expense_account := nullif(item->>'akun_beban_id','')::uuid;
    description_value := nullif(trim(coalesce(item->>'deskripsi','')),'');
    if description_value is null then raise exception 'Keterangan baris beban wajib diisi (baris %)', row_no; end if;
    if coalesce(item->>'jumlah','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'Nominal baris % tidak valid', row_no; end if;
    amount_value := (item->>'jumlah')::numeric;
    if amount_value <= 0 then raise exception 'Nominal baris % harus lebih dari nol', row_no; end if;
    if not exists(select 1 from public.ak_akun where id=expense_account and company_id=cid and tipe='beban' and aktif and currency_code=cur) then
      raise exception 'Setiap baris harus memakai akun beban aktif dengan mata uang yang sama';
    end if;
    total_value := total_value + amount_value;
  end loop;

  if total_value <= 0 then raise exception 'Total beban harus lebih dari nol'; end if;
  if did is null then
    insert into public.ak_pencatatan_beban(company_id,nomor,tanggal,jatuh_tempo,hutang_akun_id,currency_code,total,branch_id,catatan,created_by)
    values(cid, public.ak_beban_nomor(cid,'beban',tgl),tgl,due,payable,cur,total_value,branch_value,nullif(trim(coalesce(p->>'catatan','')),''),actor)
    returning id into did;
  else
    update public.ak_pencatatan_beban set
      tanggal=tgl, jatuh_tempo=due, hutang_akun_id=payable, currency_code=cur,
      total=total_value, branch_id=branch_value, catatan=nullif(trim(coalesce(p->>'catatan','')),''),
      updated_at=now()
    where id=did and company_id=cid;
    delete from public.ak_pencatatan_beban_baris where beban_id=did and company_id=cid;
  end if;

  row_no := 0;
  for item in select * from jsonb_array_elements(lines) loop
    row_no := row_no + 1;
    insert into public.ak_pencatatan_beban_baris(company_id,beban_id,urutan,akun_beban_id,deskripsi,jumlah)
    values(cid,did,row_no,(item->>'akun_beban_id')::uuid,trim(item->>'deskripsi'),(item->>'jumlah')::numeric);
  end loop;

  perform public.ak_sync_pencatatan_beban(did);
  return did;
end $$;

create or replace function public.ak_pencatatan_beban_hapus(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select company_id into cid from public.ak_pencatatan_beban where id=p_id;
  if cid is null then raise exception 'Pencatatan beban tidak ditemukan'; end if;
  if not public.has_perm(cid,'akuntansi','delete') then raise exception 'Tidak punya izin menghapus pencatatan beban'; end if;
  if exists(select 1 from public.ak_beban_pembayaran where beban_id=p_id) then raise exception 'Beban yang sudah memiliki pembayaran tidak bisa dihapus'; end if;
  delete from public.ak_jurnal where company_id=cid and sumber_tipe='ak_beban' and sumber_id=p_id;
  delete from public.ak_pencatatan_beban where id=p_id and company_id=cid;
end $$;

create or replace function public.ak_beban_bayar(p jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  cid uuid := nullif(p->>'company_id','')::uuid;
  bid uuid := nullif(p->>'beban_id','')::uuid;
  tgl date := coalesce(nullif(p->>'tanggal','')::date,current_date);
  rekening uuid := nullif(p->>'rekening_id','')::uuid;
  amount_value numeric(16,2) := nullif(p->>'jumlah','')::numeric;
  note_value text := nullif(trim(coalesce(p->>'catatan','')),'');
  bill public.ak_pencatatan_beban%rowtype;
  paid_value numeric(16,2);
  remaining_value numeric(16,2);
  cash_id uuid;
  payment_id uuid;
  cash_category uuid;
  currency_value text;
begin
  if cid is null or auth.uid() is null or not public.is_member(cid) then raise exception 'Tidak punya akses ke perusahaan ini'; end if;
  if not public.has_perm(cid,'akuntansi','create') then raise exception 'Tidak punya izin memproses pembayaran beban'; end if;
  if not public.has_perm(cid,'kas','create') then raise exception 'Perlu hak membuat transaksi Kas & Bank untuk melunasi beban'; end if;
  select * into bill from public.ak_pencatatan_beban where id=bid and company_id=cid for update;
  if not found then raise exception 'Pencatatan beban tidak ditemukan'; end if;
  if amount_value is null or amount_value <= 0 then raise exception 'Jumlah pembayaran harus lebih dari nol'; end if;
  select coalesce(sum(pembayaran.jumlah),0) into paid_value from public.ak_beban_pembayaran pembayaran where pembayaran.beban_id=bid and pembayaran.company_id=cid;
  remaining_value := round(bill.total - paid_value,2);
  if remaining_value <= 0 then raise exception 'Beban ini sudah lunas'; end if;
  if amount_value > remaining_value then raise exception 'Jumlah melebihi sisa beban (% %)', bill.currency_code, remaining_value; end if;
  select id into cash_id from public.kas_rekening where id=rekening and company_id=cid and aktif and currency_code=bill.currency_code;
  if cash_id is null then raise exception 'Pilih rekening Kas/Bank aktif dengan mata uang yang sama (%).', bill.currency_code; end if;
  currency_value := bill.currency_code;

  select id into cash_category from public.kas_kategori
  where company_id=cid and jenis='keluar' and lower(trim(nama))='pembayaran beban' and aktif limit 1;
  if cash_category is null then
    insert into public.kas_kategori(company_id,nama,jenis,aktif)
    values(cid,'Pembayaran Beban','keluar',true)
    returning id into cash_category;
  end if;

  insert into public.kas_transaksi(company_id,tanggal,jenis,rekening_id,kategori_id,jumlah,keterangan,created_by,currency_code)
  values(cid,tgl,'keluar',rekening,cash_category,amount_value,
    'Pembayaran beban '||bill.nomor,auth.uid(),currency_value)
  returning id into cash_id;

  insert into public.ak_beban_pembayaran(company_id,beban_id,nomor,tanggal,jumlah,rekening_id,kas_transaksi_id,catatan,created_by)
  values(cid,bid,public.ak_beban_nomor(cid,'pembayaran',tgl),tgl,amount_value,rekening,cash_id,note_value,auth.uid())
  returning id into payment_id;

  return payment_id;
end $$;

create or replace function public.ak_beban_payment_post()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_sync_kas(old.kas_transaksi_id); return old; end if;
  perform public.ak_sync_kas(new.kas_transaksi_id); return new;
end $$;
create trigger ak_beban_payment_post after insert or update or delete on public.ak_beban_pembayaran
for each row execute function public.ak_beban_payment_post();

-- Extend the existing Kas journal sync so paying an accrued expense settles the liability,
-- rather than booking the expense a second time through the general cash-out category.
create or replace function public.ak_sync_kas(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  t public.kas_transaksi%rowtype;
  cid uuid;
  cash uuid;
  lawan uuid;
  ar uuid;
  ap uuid;
  pp public.pj_pembayaran%rowtype;
  bp public.pb_pembayaran%rowtype;
  ep public.ak_beban_pembayaran%rowtype;
  expense_bill public.ak_pencatatan_beban%rowtype;
  baris jsonb := '[]'::jsonb;
  sumber text := 'kas_transaksi';
  ket text;
  p_nama text;
  v_nom numeric;
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
  select * into ep from public.ak_beban_pembayaran where kas_transaksi_id=t.id limit 1;
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
  elsif ep.id is not null then
    select * into expense_bill from public.ak_pencatatan_beban where id=ep.beban_id;
    baris:=jsonb_build_array(
      jsonb_build_object('akun_id',expense_bill.hutang_akun_id,'debit',ep.jumlah,'kredit',0,'keterangan','Pelunasan hutang beban '||expense_bill.nomor),
      jsonb_build_object('akun_id',cash,'debit',0,'kredit',ep.jumlah,'keterangan','Kas keluar')
    );
    ket:='Pembayaran pencatatan beban '||expense_bill.nomor;
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
revoke all on function public.ak_sync_kas(uuid) from public, anon, authenticated;

-- Form accounting can query the summary without calculating paid status in the browser.
create or replace view public.ak_pencatatan_beban_v with (security_invoker=true) as
select
  b.*,
  ha.kode as hutang_akun_kode,
  ha.nama as hutang_akun_nama,
  cb.name as branch_name,
  coalesce(p.dibayar,0)::numeric(16,2) as dibayar,
  greatest(b.total-coalesce(p.dibayar,0),0)::numeric(16,2) as sisa,
  case
    when coalesce(p.dibayar,0)>=b.total then 'Terbayar'
    when coalesce(p.dibayar,0)>0 then 'Sebagian Dibayar'
    else 'Sedang Diproses'
  end as status,
  p.nomor_pembayaran
from public.ak_pencatatan_beban b
join public.ak_akun ha on ha.id=b.hutang_akun_id and ha.company_id=b.company_id
left join public.company_branches cb on cb.id=b.branch_id and cb.company_id=b.company_id
left join lateral (
  select sum(x.jumlah) as dibayar, string_agg(x.nomor, ', ' order by x.tanggal, x.created_at) as nomor_pembayaran
  from public.ak_beban_pembayaran x
  where x.company_id=b.company_id and x.beban_id=b.id
) p on true;

grant select on public.ak_pencatatan_beban_v to authenticated;
grant execute on function public.ak_pencatatan_beban_simpan(jsonb), public.ak_pencatatan_beban_hapus(uuid), public.ak_beban_bayar(jsonb) to authenticated;

-- Sync outstanding expense records to the existing company transaction calendar.
create or replace function public.ak_beban_sync_calendar(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  b public.ak_pencatatan_beban%rowtype;
  cal public.company_calendars%rowtype;
  owner_id uuid;
  paid_value numeric(16,2);
  start_value timestamptz;
  reminder_value timestamptz;
  channels_value text[];
  recipients_value jsonb;
  description_value text;
begin
  select * into b from public.ak_pencatatan_beban where id=p_id;
  if not found then
    delete from public.company_calendar_events
    where source_table='ak_pencatatan_beban' and source_id=p_id;
    return;
  end if;

  select coalesce(sum(p.jumlah),0) into paid_value
  from public.ak_beban_pembayaran p where p.company_id=b.company_id and p.beban_id=b.id;
  if paid_value >= b.total then
    delete from public.company_calendar_events
    where company_id=b.company_id and source_table='ak_pencatatan_beban'
      and source_id=b.id and event_type='Jadwal Pembayaran Beban';
    return;
  end if;

  select c.* into cal from public.company_calendars c
  where c.company_id=b.company_id and c.name='Jadwal Transaksi'
  order by c.created_at asc limit 1;

  if not found then
    select created_by into owner_id from public.companies where id=b.company_id;
    owner_id := coalesce(owner_id,b.created_by,auth.uid());
    if owner_id is null then
      raise exception 'Tidak dapat menentukan pemilik untuk membuat kalender pembayaran beban.';
    end if;
    insert into public.company_calendars(
      company_id, calendar_type, name, description, access_all, event_edit_all, admin_all, created_by
    ) values (
      b.company_id, 'Kegiatan', 'Jadwal Transaksi',
      'Kalender otomatis untuk jadwal penerimaan barang, pembayaran beban, dan jatuh tempo transaksi.',
      true, false, false, owner_id
    ) returning * into cal;
  end if;

  channels_value := coalesce(cal.default_reminder_channels,'{}'::text[]);
  recipients_value := coalesce(cal.default_reminder_recipients,'{}'::jsonb);
  start_value := (b.jatuh_tempo::timestamp + interval '9 hours') at time zone 'Asia/Jakarta';
  reminder_value := start_value - make_interval(mins => coalesce(cal.default_reminder_minutes_before,1440));
  description_value := 'Sisa belum dibayar: ' || b.currency_code || ' ' || to_char(greatest(b.total-paid_value,0),'FM999G999G999G990D00')
    || case when nullif(trim(coalesce(b.catatan,'')),'') is not null then E'\nCatatan: '||b.catatan else '' end;

  insert into public.company_calendar_events(
    company_id, calendar_id, event_type, title, description, start_at, due_at, reminder_at,
    repeat_rule, attachment_links, reminder_channels, reminder_recipients, reminder_status,
    reminder_attempts, reminder_last_error, reminder_sent_at, repeat_processed_at,
    source_table, source_id, source_url, created_by
  ) values (
    b.company_id, cal.id, 'Jadwal Pembayaran Beban', 'Jadwal Pembayaran Beban · '||b.nomor,
    description_value, start_value, start_value, reminder_value, 'none', '[]'::jsonb,
    channels_value, recipients_value,
    case when cardinality(channels_value)>0 then 'pending' else 'not_configured' end,
    0, null, null, null, 'ak_pencatatan_beban', b.id, '/akuntansi/pencatatan-beban',
    coalesce(b.created_by,auth.uid(),owner_id)
  )
  on conflict (company_id, source_table, source_id, event_type)
    where source_table is not null and source_id is not null
  do update set
    calendar_id=excluded.calendar_id,
    title=excluded.title,
    description=excluded.description,
    start_at=excluded.start_at,
    due_at=excluded.due_at,
    reminder_at=excluded.reminder_at,
    reminder_channels=excluded.reminder_channels,
    reminder_recipients=excluded.reminder_recipients,
    reminder_status=case
      when public.company_calendar_events.start_at is distinct from excluded.start_at
        or public.company_calendar_events.reminder_channels is distinct from excluded.reminder_channels
        or public.company_calendar_events.reminder_recipients is distinct from excluded.reminder_recipients
      then case when cardinality(excluded.reminder_channels)>0 then 'pending' else 'not_configured' end
      else public.company_calendar_events.reminder_status
    end,
    reminder_attempts=case
      when public.company_calendar_events.start_at is distinct from excluded.start_at
        or public.company_calendar_events.reminder_channels is distinct from excluded.reminder_channels
        or public.company_calendar_events.reminder_recipients is distinct from excluded.reminder_recipients
      then 0 else public.company_calendar_events.reminder_attempts
    end,
    reminder_last_error=case
      when public.company_calendar_events.start_at is distinct from excluded.start_at
        or public.company_calendar_events.reminder_channels is distinct from excluded.reminder_channels
        or public.company_calendar_events.reminder_recipients is distinct from excluded.reminder_recipients
      then null else public.company_calendar_events.reminder_last_error
    end,
    reminder_sent_at=case
      when public.company_calendar_events.start_at is distinct from excluded.start_at
        or public.company_calendar_events.reminder_channels is distinct from excluded.reminder_channels
        or public.company_calendar_events.reminder_recipients is distinct from excluded.reminder_recipients
      then null else public.company_calendar_events.reminder_sent_at
    end,
    source_url=excluded.source_url,
    updated_at=now();
end $$;
revoke all on function public.ak_beban_sync_calendar(uuid) from public,anon,authenticated;

create or replace function public.ak_beban_calendar_row()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_beban_sync_calendar(old.id); return old; end if;
  perform public.ak_beban_sync_calendar(new.id); return new;
end $$;
create trigger ak_pencatatan_beban_calendar
after insert or update or delete on public.ak_pencatatan_beban
for each row execute function public.ak_beban_calendar_row();

create or replace function public.ak_beban_calendar_payment_row()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.ak_beban_sync_calendar(old.beban_id); return old; end if;
  perform public.ak_beban_sync_calendar(new.beban_id); return new;
end $$;
create trigger ak_beban_payment_calendar
after insert or update or delete on public.ak_beban_pembayaran
for each row execute function public.ak_beban_calendar_payment_row();

-- New tables created after audit migration 026 need their own audit triggers.
do $audit$
declare tbl text;
begin
  if to_regprocedure('public.company_activity_audit_row()') is null then return; end if;
  foreach tbl in array array['ak_pencatatan_beban','ak_pencatatan_beban_baris','ak_beban_pembayaran'] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_change_'||tbl, tbl);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.company_activity_audit_row(%L)',
      'audit_change_'||tbl, tbl, 'id'
    );
  end loop;
end
$audit$;

-- Extend transaction favorite templates to support reusable expense entries.
alter table public.company_transaction_favorites
  drop constraint if exists company_transaction_favorites_favorite_type_check;
alter table public.company_transaction_favorites
  add constraint company_transaction_favorites_favorite_type_check
  check (favorite_type in (
    'sales_quote','sales_invoice','purchase_order','purchase_invoice',
    'kas_in','kas_out','kas_transfer','journal_manual','expense_recording'
  ));


-- Allow Pencatatan Beban templates in the shared Favorites service.
create or replace function public.company_transaction_favorite_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id','')::uuid;
  fid uuid := nullif(p->>'id','')::uuid;
  actor uuid := auth.uid();
  name_value text := trim(coalesce(p->>'name',''));
  type_value text := trim(coalesce(p->>'favorite_type',''));
  visibility_value text := coalesce(nullif(p->>'visibility',''),'all_members');
  payload_value jsonb := coalesce(p->'payload','{}'::jsonb);
begin
  if cid is null or not public.is_member(cid) then raise exception 'Tidak punya akses ke perusahaan ini'; end if;
  if actor is null then raise exception 'Sesi login sudah berakhir'; end if;
  if name_value = '' then raise exception 'Nama transaksi favorit wajib diisi'; end if;
  if type_value not in (
    'sales_quote','sales_invoice','purchase_order','purchase_invoice',
    'kas_in','kas_out','kas_transfer','journal_manual','expense_recording'
  ) then raise exception 'Jenis transaksi favorit belum didukung'; end if;
  if visibility_value not in ('all_members','private') then raise exception 'Pilihan akses tidak valid'; end if;
  if jsonb_typeof(payload_value) <> 'object' then raise exception 'Data templat tidak valid'; end if;

  if fid is null then
    insert into public.company_transaction_favorites(company_id,favorite_type,name,visibility,payload,created_by)
    values(cid,type_value,name_value,visibility_value,payload_value,actor)
    returning id into fid;
  else
    update public.company_transaction_favorites
    set favorite_type=type_value,name=name_value,visibility=visibility_value,payload=payload_value,updated_at=now()
    where id=fid and company_id=cid and (created_by=actor or public.is_admin(cid));
    if not found then raise exception 'Transaksi favorit tidak ditemukan atau tidak boleh diubah'; end if;
  end if;
  return fid;
end $$;
grant execute on function public.company_transaction_favorite_save(jsonb) to authenticated;
