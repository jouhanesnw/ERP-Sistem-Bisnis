-- PENCATATAN GAJI: payroll per periode, rincian karyawan, dan pembayaran lewat Kas & Bank.
-- Prasyarat: migrasi 001-028 sudah diterapkan.

create table public.ak_gaji_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  jenis text not null check (jenis in ('gaji','pembayaran')),
  periode_tahun integer not null,
  periode_bulan integer not null check (periode_bulan between 1 and 12),
  terakhir integer not null default 0,
  primary key (company_id, jenis, periode_tahun, periode_bulan)
);
alter table public.ak_gaji_counter enable row level security;
revoke all on public.ak_gaji_counter from anon, authenticated;

create table public.ak_pencatatan_gaji (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nomor text not null,
  tipe_pembayaran text not null default 'Bulanan'
    check (tipe_pembayaran in ('Bulanan','Non bulanan/setahun sekali')),
  branch_id uuid,
  periode_bulan integer not null check (periode_bulan between 1 and 12),
  periode_tahun integer not null check (periode_tahun between 2000 and 2200),
  tanggal date not null default current_date,
  jatuh_tempo date not null default current_date,
  akun_hutang_id uuid not null,
  total_bruto numeric(16,2) not null default 0 check (total_bruto >= 0),
  total_pph numeric(16,2) not null default 0 check (total_pph >= 0),
  total_premi_kesehatan_perusahaan numeric(16,2) not null default 0 check (total_premi_kesehatan_perusahaan >= 0),
  total_premi_pensiun_perusahaan numeric(16,2) not null default 0 check (total_premi_pensiun_perusahaan >= 0),
  total_potongan_karyawan numeric(16,2) not null default 0 check (total_potongan_karyawan >= 0),
  total_gaji_dibayarkan numeric(16,2) not null default 0 check (total_gaji_dibayarkan >= 0),
  total_biaya numeric(16,2) not null default 0 check (total_biaya >= 0),
  catatan text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, nomor),
  foreign key (akun_hutang_id, company_id) references public.ak_akun(id, company_id),
  foreign key (branch_id, company_id) references public.company_branches(id, company_id),
  check (jatuh_tempo >= tanggal)
);
create index ak_pencatatan_gaji_company_period_idx
  on public.ak_pencatatan_gaji(company_id, periode_tahun desc, periode_bulan desc);
create index ak_pencatatan_gaji_company_date_idx
  on public.ak_pencatatan_gaji(company_id, tanggal desc);

create table public.ak_pencatatan_gaji_baris (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gaji_id uuid not null,
  employee_id uuid not null,
  nama_karyawan text not null,
  kode_karyawan text,
  ptkp_status text,
  pendapatan_bruto numeric(16,2) not null default 0 check (pendapatan_bruto >= 0),
  pph numeric(16,2) not null default 0 check (pph >= 0),
  potongan_karyawan numeric(16,2) not null default 0 check (potongan_karyawan >= 0),
  gaji_dibayarkan numeric(16,2) not null default 0 check (gaji_dibayarkan >= 0),
  premi_kesehatan_perusahaan numeric(16,2) not null default 0 check (premi_kesehatan_perusahaan >= 0),
  premi_pensiun_perusahaan numeric(16,2) not null default 0 check (premi_pensiun_perusahaan >= 0),
  biaya_perusahaan numeric(16,2) not null default 0 check (biaya_perusahaan >= 0),
  komponen jsonb not null default '[]'::jsonb check (jsonb_typeof(komponen) = 'array'),
  info_lainnya jsonb not null default '{}'::jsonb check (jsonb_typeof(info_lainnya) = 'object'),
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, gaji_id, employee_id),
  foreign key (gaji_id, company_id) references public.ak_pencatatan_gaji(id, company_id) on delete cascade,
  foreign key (employee_id, company_id) references public.company_employees(id, company_id)
);
create index ak_pencatatan_gaji_baris_parent_idx
  on public.ak_pencatatan_gaji_baris(company_id, gaji_id);
create index ak_pencatatan_gaji_baris_employee_idx
  on public.ak_pencatatan_gaji_baris(company_id, employee_id, created_at desc);

create table public.ak_gaji_pembayaran (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gaji_id uuid not null,
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
  foreign key (gaji_id, company_id) references public.ak_pencatatan_gaji(id, company_id) on delete cascade,
  foreign key (rekening_id, company_id) references public.kas_rekening(id, company_id)
);
create index ak_gaji_pembayaran_parent_idx
  on public.ak_gaji_pembayaran(company_id, gaji_id, tanggal desc);

do $policies$
declare tbl text;
begin
  foreach tbl in array array['ak_pencatatan_gaji','ak_pencatatan_gaji_baris','ak_gaji_pembayaran'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', tbl);
    execute format(
      'create policy %I on public.%I for select using (public.is_admin(company_id) and public.has_perm(company_id, ''akuntansi'', ''view''))',
      tbl || '_sel', tbl
    );
  end loop;
end
$policies$;

create or replace function public.ak_gaji_nomor(p_company uuid, p_jenis text, p_year integer, p_month integer)
returns text language plpgsql security definer set search_path=public as $$
declare seq integer;
begin
  if p_jenis not in ('gaji','pembayaran') or p_year < 2000 or p_year > 2200 or p_month < 1 or p_month > 12 then
    raise exception 'Periode/jenis nomor gaji tidak valid';
  end if;
  insert into public.ak_gaji_counter(company_id,jenis,periode_tahun,periode_bulan,terakhir)
  values(p_company,p_jenis,p_year,p_month,1)
  on conflict(company_id,jenis,periode_tahun,periode_bulan)
  do update set terakhir=ak_gaji_counter.terakhir+1
  returning terakhir into seq;
  return case p_jenis when 'gaji' then 'EPY.' else 'PGY.' end
    || p_year::text || '.' || lpad(p_month::text,2,'0') || '.' || lpad(seq::text,5,'0');
end $$;
revoke all on function public.ak_gaji_nomor(uuid,text,integer,integer) from public, anon, authenticated;

create or replace function public.ak_gaji_sync_jurnal(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  g public.ak_pencatatan_gaji%rowtype;
  expense_default uuid;
  entries jsonb := '[]'::jsonb;
  rec record;
begin
  select * into g from public.ak_pencatatan_gaji where id=p_id;
  if not found then
    delete from public.ak_jurnal where sumber_tipe='ak_gaji' and sumber_id=p_id;
    return;
  end if;

  select id into expense_default from public.ak_akun
  where company_id=g.company_id and kode='6000' and tipe='beban' and aktif and currency_code='IDR'
  order by kode limit 1;
  if expense_default is null then
    select id into expense_default from public.ak_akun
    where company_id=g.company_id and tipe='beban' and aktif and currency_code='IDR'
    order by kode limit 1;
  end if;
  if expense_default is null then raise exception 'COA akun beban aktif bermata uang IDR belum tersedia'; end if;

  for rec in
    select
      case
        when exists (
          select 1 from public.ak_akun a
          where a.id=nullif(c->>'account_id','')::uuid
            and a.company_id=g.company_id and a.tipe='beban' and a.aktif and a.currency_code='IDR'
        ) then (c->>'account_id')::uuid
        else expense_default
      end as akun_id,
      sum((c->>'nominal')::numeric)::numeric(16,2) as jumlah,
      string_agg(distinct coalesce(c->>'nama','Komponen gaji'), ', ') as keterangan
    from public.ak_pencatatan_gaji_baris b
    cross join lateral jsonb_array_elements(b.komponen) c
    where b.company_id=g.company_id and b.gaji_id=g.id
      and coalesce(c->>'item_type','') not in (
        'Potongan Gaji (Tidak Mengurangi PPh)',
        'Pengurangan Gaji (Mengurangi PPh)',
        'Premi asuransi kesehatan dibayarkan pekerja',
        'Iuran Pensiun/THT/JHT dibayarkan Pekerja'
      )
      and coalesce((c->>'nominal')::numeric,0)>0
    group by 1
  loop
    entries := entries || jsonb_build_array(jsonb_build_object(
      'akun_id',rec.akun_id,'debit',rec.jumlah,'kredit',0,
      'keterangan','Beban gaji: '||rec.keterangan
    ));
  end loop;

  if jsonb_array_length(entries)=0 then
    raise exception 'Tidak ada komponen pendapatan bernilai positif untuk dijurnal';
  end if;
  entries := entries || jsonb_build_array(jsonb_build_object(
    'akun_id',g.akun_hutang_id,'debit',0,'kredit',g.total_biaya,
    'keterangan','Hutang gaji '||g.nomor
  ));
  perform public.ak_upsert_jurnal(
    g.company_id,g.tanggal,'Pencatatan gaji '||g.nomor,'ak_gaji',g.id,entries
  );
end $$;
revoke all on function public.ak_gaji_sync_jurnal(uuid) from public, anon, authenticated;

create or replace function public.ak_pencatatan_gaji_simpan(p jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  pid uuid := nullif(p->>'id','')::uuid;
  cid uuid := nullif(p->>'company_id','')::uuid;
  actor uuid := auth.uid();
  pay_type text := coalesce(nullif(trim(p->>'tipe_pembayaran'),''),'Bulanan');
  branch_value uuid := nullif(p->>'branch_id','')::uuid;
  period_month integer := nullif(p->>'periode_bulan','')::integer;
  period_year integer := nullif(p->>'periode_tahun','')::integer;
  tgl date := coalesce(nullif(p->>'tanggal','')::date,current_date);
  due date := coalesce(nullif(p->>'jatuh_tempo','')::date,current_date);
  lines jsonb := coalesce(p->'karyawan','[]'::jsonb);
  payable uuid;
  item jsonb;
  comp jsonb;
  emp public.company_employees%rowtype;
  sal_item public.company_salary_items%rowtype;
  detail_value jsonb;
  info_value jsonb;
  amount_value numeric(16,2);
  pph_value numeric(16,2);
  gross_value numeric(16,2);
  deductions_value numeric(16,2);
  net_value numeric(16,2);
  health_value numeric(16,2);
  pension_value numeric(16,2);
  employer_value numeric(16,2);
  total_gross numeric(16,2):=0;
  total_tax numeric(16,2):=0;
  total_deductions numeric(16,2):=0;
  total_net numeric(16,2):=0;
  total_health numeric(16,2):=0;
  total_pension numeric(16,2):=0;
  total_cost numeric(16,2):=0;
  emp_id uuid;
  seen_ids uuid[] := array[]::uuid[];
begin
  if cid is null or actor is null or not public.is_admin(cid) then raise exception 'Hanya owner/admin yang bisa mengakses pencatatan gaji'; end if;
  if pay_type not in ('Bulanan','Non bulanan/setahun sekali') then raise exception 'Tipe pembayaran tidak valid'; end if;
  if period_month is null or period_month not between 1 and 12 or period_year is null or period_year not between 2000 and 2200 then
    raise exception 'Periode bulan dan tahun wajib dipilih';
  end if;
  if due < tgl then raise exception 'Jatuh tempo tidak boleh sebelum tanggal transaksi'; end if;
  if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines)=0 then raise exception 'Ambil minimal satu karyawan untuk pencatatan gaji'; end if;
  if branch_value is not null and not exists(select 1 from public.company_branches where id=branch_value and company_id=cid and active) then
    raise exception 'Cabang tidak aktif atau bukan milik perusahaan ini';
  end if;

  if pid is null then
    if not public.has_perm(cid,'akuntansi','create') then raise exception 'Tidak punya izin membuat pencatatan gaji'; end if;
  else
    if not public.has_perm(cid,'akuntansi','edit') then raise exception 'Tidak punya izin mengubah pencatatan gaji'; end if;
    if not exists(select 1 from public.ak_pencatatan_gaji where id=pid and company_id=cid) then raise exception 'Pencatatan gaji tidak ditemukan'; end if;
    if exists(select 1 from public.ak_gaji_pembayaran where gaji_id=pid and company_id=cid) then raise exception 'Pencatatan gaji yang sudah memiliki pembayaran tidak dapat diubah'; end if;
  end if;

  select id into payable from public.ak_akun
  where company_id=cid and tipe='kewajiban' and aktif and currency_code='IDR'
    and (kode='2210' or kode_tipe='OCLY')
  order by case when kode='2210' then 0 else 1 end, kode limit 1;
  if payable is null then raise exception 'COA Hutang Beban (Kewajiban Jangka Pendek) bermata uang IDR belum tersedia'; end if;

  for item in select * from jsonb_array_elements(lines) loop
    emp_id := nullif(item->>'employee_id','')::uuid;
    if emp_id is null or emp_id=any(seen_ids) then raise exception 'Karyawan wajib diisi dan tidak boleh duplikat'; end if;
    seen_ids := array_append(seen_ids,emp_id);
    select * into emp from public.company_employees e
    where e.id=emp_id and e.company_id=cid and e.active;
    if not found then raise exception 'Karyawan tidak aktif atau bukan milik perusahaan ini'; end if;
    if branch_value is not null and emp.branch_id is distinct from branch_value then
      raise exception 'Karyawan % tidak berasal dari cabang yang dipilih',emp.full_name;
    end if;
    if jsonb_typeof(coalesce(item->'komponen','[]'::jsonb))<>'array' then raise exception 'Format komponen gaji tidak valid'; end if;

    gross_value:=0; deductions_value:=0; health_value:=0; pension_value:=0; employer_value:=0;
    detail_value:='[]'::jsonb;
    for comp in select * from jsonb_array_elements(coalesce(item->'komponen','[]'::jsonb)) loop
      if coalesce(comp->>'jumlah','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'Nominal komponen gaji tidak valid untuk %',emp.full_name; end if;
      amount_value:=round((comp->>'jumlah')::numeric,2);
      if amount_value<0 then raise exception 'Nominal komponen tidak boleh negatif'; end if;
      select * into sal_item from public.company_salary_items si
      where si.id=nullif(comp->>'salary_item_id','')::uuid and si.company_id=cid and si.active;
      if not found then raise exception 'Komponen gaji tidak aktif atau bukan milik perusahaan ini'; end if;
      if sal_item.pay_type<>pay_type then raise exception 'Komponen % tidak berlaku untuk tipe pembayaran %',sal_item.name,pay_type; end if;
      detail_value:=detail_value||jsonb_build_array(jsonb_build_object(
        'salary_item_id',sal_item.id,'nama',sal_item.name,'item_type',sal_item.item_type,
        'pay_type',sal_item.pay_type,'nominal',amount_value,'account_id',sal_item.account_id
      ));

      if sal_item.item_type in (
        'Potongan Gaji (Tidak Mengurangi PPh)',
        'Pengurangan Gaji (Mengurangi PPh)',
        'Premi asuransi kesehatan dibayarkan pekerja',
        'Iuran Pensiun/THT/JHT dibayarkan Pekerja'
      ) then
        deductions_value:=deductions_value+amount_value;
      elsif sal_item.item_type in (
        'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
        'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
        'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja'
      ) then
        employer_value:=employer_value+amount_value;
        if sal_item.item_type='Premi asuransi kesehatan yang dibayarkan pemberi kerja' then health_value:=health_value+amount_value; end if;
        if sal_item.item_type='Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja' then pension_value:=pension_value+amount_value; end if;
      else
        gross_value:=gross_value+amount_value;
      end if;
    end loop;

    if gross_value<=0 then raise exception 'Pendapatan bruto karyawan % harus lebih dari nol',emp.full_name; end if;
    if coalesce(item->>'pph','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'PPh harus diisi angka nol atau lebih untuk %',emp.full_name; end if;
    pph_value:=round((item->>'pph')::numeric,2);
    if pph_value<0 then raise exception 'PPh tidak boleh negatif'; end if;
    if not emp.subject_to_pph21 and pph_value<>0 then raise exception 'Karyawan % tidak dikenai PPh 21 dalam master karyawan',emp.full_name; end if;
    net_value:=round(gross_value-deductions_value-pph_value,2);
    if net_value<=0 then raise exception 'Gaji dibayarkan setelah PPh dan potongan harus lebih dari nol untuk %',emp.full_name; end if;
    info_value:=coalesce(item->'info_lainnya','{}'::jsonb);
    if jsonb_typeof(info_value)<>'object' then raise exception 'Info lainnya harus berbentuk object'; end if;

    total_gross:=total_gross+gross_value;
    total_tax:=total_tax+pph_value;
    total_deductions:=total_deductions+deductions_value;
    total_net:=total_net+net_value;
    total_health:=total_health+health_value;
    total_pension:=total_pension+pension_value;
    total_cost:=total_cost+gross_value+employer_value;
  end loop;

  if pid is null then
    insert into public.ak_pencatatan_gaji(
      company_id,nomor,tipe_pembayaran,branch_id,periode_bulan,periode_tahun,tanggal,jatuh_tempo,
      akun_hutang_id,total_bruto,total_pph,total_premi_kesehatan_perusahaan,total_premi_pensiun_perusahaan,
      total_potongan_karyawan,total_gaji_dibayarkan,total_biaya,catatan,created_by
    ) values(
      cid,public.ak_gaji_nomor(cid,'gaji',period_year,period_month),pay_type,branch_value,period_month,period_year,tgl,due,
      payable,total_gross,total_tax,total_health,total_pension,total_deductions,total_net,total_cost,
      nullif(trim(coalesce(p->>'catatan','')),''),actor
    ) returning id into pid;
  else
    update public.ak_pencatatan_gaji set
      tipe_pembayaran=pay_type,branch_id=branch_value,periode_bulan=period_month,periode_tahun=period_year,
      tanggal=tgl,jatuh_tempo=due,akun_hutang_id=payable,total_bruto=total_gross,total_pph=total_tax,
      total_premi_kesehatan_perusahaan=total_health,total_premi_pensiun_perusahaan=total_pension,
      total_potongan_karyawan=total_deductions,total_gaji_dibayarkan=total_net,total_biaya=total_cost,
      catatan=nullif(trim(coalesce(p->>'catatan','')),''),updated_at=now()
    where id=pid and company_id=cid;
    delete from public.ak_pencatatan_gaji_baris where gaji_id=pid and company_id=cid;
  end if;

  for item in select * from jsonb_array_elements(lines) loop
    emp_id:=(item->>'employee_id')::uuid;
    select * into emp from public.company_employees where id=emp_id and company_id=cid;
    detail_value:='[]'::jsonb; gross_value:=0; deductions_value:=0; pph_value:=round((item->>'pph')::numeric,2);
    health_value:=0; pension_value:=0; employer_value:=0;
    for comp in select * from jsonb_array_elements(coalesce(item->'komponen','[]'::jsonb)) loop
      select * into sal_item from public.company_salary_items where id=(comp->>'salary_item_id')::uuid and company_id=cid;
      amount_value:=round((comp->>'jumlah')::numeric,2);
      detail_value:=detail_value||jsonb_build_array(jsonb_build_object('salary_item_id',sal_item.id,'nama',sal_item.name,'item_type',sal_item.item_type,'pay_type',sal_item.pay_type,'nominal',amount_value,'account_id',sal_item.account_id));
      if sal_item.item_type in ('Potongan Gaji (Tidak Mengurangi PPh)','Pengurangan Gaji (Mengurangi PPh)','Premi asuransi kesehatan dibayarkan pekerja','Iuran Pensiun/THT/JHT dibayarkan Pekerja') then
        deductions_value:=deductions_value+amount_value;
      elsif sal_item.item_type in ('Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian','Premi asuransi kesehatan yang dibayarkan pemberi kerja','Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja') then
        employer_value:=employer_value+amount_value;
        if sal_item.item_type='Premi asuransi kesehatan yang dibayarkan pemberi kerja' then health_value:=health_value+amount_value; end if;
        if sal_item.item_type='Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja' then pension_value:=pension_value+amount_value; end if;
      else
        gross_value:=gross_value+amount_value;
      end if;
    end loop;
    insert into public.ak_pencatatan_gaji_baris(
      company_id,gaji_id,employee_id,nama_karyawan,kode_karyawan,ptkp_status,pendapatan_bruto,pph,
      potongan_karyawan,gaji_dibayarkan,premi_kesehatan_perusahaan,premi_pensiun_perusahaan,
      biaya_perusahaan,komponen,info_lainnya
    ) values(
      cid,pid,emp.id,emp.full_name,emp.employee_code,emp.ptkp_status,gross_value,pph_value,
      deductions_value,greatest(round(gross_value-deductions_value-pph_value,2),0),health_value,pension_value,
      gross_value+employer_value,detail_value,coalesce(item->'info_lainnya','{}'::jsonb)
    );
  end loop;

  perform public.ak_gaji_sync_jurnal(pid);
  return pid;
end $$;

create or replace function public.ak_pencatatan_gaji_hapus(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select company_id into cid from public.ak_pencatatan_gaji where id=p_id;
  if cid is null then raise exception 'Pencatatan gaji tidak ditemukan'; end if;
  if not public.is_admin(cid) then raise exception 'Hanya owner/admin yang bisa menghapus pencatatan gaji'; end if;
  if not public.has_perm(cid,'akuntansi','delete') then raise exception 'Tidak punya izin menghapus pencatatan gaji'; end if;
  if exists(select 1 from public.ak_gaji_pembayaran where gaji_id=p_id and company_id=cid) then raise exception 'Pencatatan gaji yang sudah memiliki pembayaran tidak dapat dihapus'; end if;
  delete from public.ak_jurnal where company_id=cid and sumber_tipe='ak_gaji' and sumber_id=p_id;
  delete from public.ak_pencatatan_gaji where id=p_id and company_id=cid;
end $$;

create or replace function public.ak_gaji_sync_pembayaran(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  pay public.ak_gaji_pembayaran%rowtype;
  g public.ak_pencatatan_gaji%rowtype;
  cash_account uuid;
  entries jsonb;
begin
  select * into pay from public.ak_gaji_pembayaran where id=p_id;
  if not found then return; end if;
  select * into g from public.ak_pencatatan_gaji where id=pay.gaji_id and company_id=pay.company_id;
  if not found then return; end if;
  select id into cash_account from public.ak_akun
  where company_id=pay.company_id and kode='1100' and aktif and currency_code='IDR' limit 1;
  if cash_account is null then raise exception 'COA Kas dan Bank (1100) bermata uang IDR belum tersedia'; end if;
  entries:=jsonb_build_array(
    jsonb_build_object('akun_id',g.akun_hutang_id,'debit',pay.jumlah,'kredit',0,'keterangan','Pembayaran gaji '||g.nomor),
    jsonb_build_object('akun_id',cash_account,'debit',0,'kredit',pay.jumlah,'keterangan','Kas keluar')
  );
  perform public.ak_upsert_jurnal(pay.company_id,pay.tanggal,'Pembayaran gaji '||g.nomor,'kas_transaksi',pay.kas_transaksi_id,entries);
end $$;
revoke all on function public.ak_gaji_sync_pembayaran(uuid) from public, anon, authenticated;

create or replace function public.ak_gaji_payment_post()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then perform public.ak_gaji_sync_pembayaran(new.id); return new; end if;
  if tg_op='UPDATE' then perform public.ak_gaji_sync_pembayaran(new.id); return new; end if;
  return old;
end $$;
create trigger ak_gaji_payment_post after insert or update on public.ak_gaji_pembayaran
for each row execute function public.ak_gaji_payment_post();

create or replace function public.ak_gaji_bayar(p jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  cid uuid:=nullif(p->>'company_id','')::uuid;
  gid uuid:=nullif(p->>'gaji_id','')::uuid;
  tgl date:=coalesce(nullif(p->>'tanggal','')::date,current_date);
  rekening uuid:=nullif(p->>'rekening_id','')::uuid;
  amount_value numeric(16,2):=nullif(p->>'jumlah','')::numeric;
  note_value text:=nullif(trim(coalesce(p->>'catatan','')),'');
  g public.ak_pencatatan_gaji%rowtype;
  paid_value numeric(16,2);
  remaining_value numeric(16,2);
  cash_id uuid;
  cash_category uuid;
  payment_id uuid;
begin
  if cid is null or auth.uid() is null or not public.is_admin(cid) then raise exception 'Hanya owner/admin yang bisa memproses pembayaran gaji'; end if;
  if not public.has_perm(cid,'akuntansi','create') then raise exception 'Tidak punya izin memproses pembayaran gaji'; end if;
  if not public.has_perm(cid,'kas','create') then raise exception 'Perlu izin Buat pada Kas & Bank untuk membayar gaji'; end if;
  select * into g from public.ak_pencatatan_gaji where id=gid and company_id=cid for update;
  if not found then raise exception 'Pencatatan gaji tidak ditemukan'; end if;
  if amount_value is null or amount_value<=0 then raise exception 'Jumlah pembayaran harus lebih dari nol'; end if;
  select coalesce(sum(jumlah),0) into paid_value from public.ak_gaji_pembayaran where gaji_id=gid and company_id=cid;
  remaining_value:=round(g.total_gaji_dibayarkan-paid_value,2);
  if remaining_value<=0 then raise exception 'Gaji karyawan sudah dibayar penuh'; end if;
  if amount_value>remaining_value then raise exception 'Jumlah pembayaran melebihi sisa gaji'; end if;
  select id into cash_id from public.kas_rekening where id=rekening and company_id=cid and aktif and currency_code='IDR';
  if cash_id is null then raise exception 'Pilih rekening Kas/Bank aktif bermata uang IDR'; end if;

  select id into cash_category from public.kas_kategori
  where company_id=cid and jenis='keluar' and lower(trim(nama))='pembayaran gaji' and aktif limit 1;
  if cash_category is null then
    insert into public.kas_kategori(company_id,nama,jenis,aktif)
    values(cid,'Pembayaran Gaji','keluar',true)
    returning id into cash_category;
  end if;
  insert into public.kas_transaksi(company_id,tanggal,jenis,rekening_id,kategori_id,jumlah,keterangan,created_by,currency_code)
  values(cid,tgl,'keluar',rekening,cash_category,amount_value,'Pembayaran gaji '||g.nomor,auth.uid(),'IDR')
  returning id into cash_id;
  insert into public.ak_gaji_pembayaran(company_id,gaji_id,nomor,tanggal,jumlah,rekening_id,kas_transaksi_id,catatan,created_by)
  values(cid,gid,public.ak_gaji_nomor(cid,'pembayaran',g.periode_tahun,g.periode_bulan),tgl,amount_value,rekening,cash_id,note_value,auth.uid())
  returning id into payment_id;
  return payment_id;
end $$;

create or replace function public.ak_gaji_ambil_sebelumnya(p_company uuid, p_employee uuid, p_year integer, p_month integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if p_company is null or not public.is_admin(p_company) then raise exception 'Hanya owner/admin yang bisa mengakses rincian gaji'; end if;
  select jsonb_build_object(
    'komponen',b.komponen,'pph',b.pph,'info_lainnya',b.info_lainnya,'nama_karyawan',b.nama_karyawan
  ) into result
  from public.ak_pencatatan_gaji_baris b
  join public.ak_pencatatan_gaji g on g.id=b.gaji_id and g.company_id=b.company_id
  where b.company_id=p_company and b.employee_id=p_employee
    and (g.periode_tahun < p_year or (g.periode_tahun=p_year and g.periode_bulan<p_month))
  order by g.periode_tahun desc,g.periode_bulan desc,g.created_at desc limit 1;
  return result;
end $$;

create or replace view public.ak_pencatatan_gaji_v with (security_invoker=true) as
select
  g.*,
  b.name as branch_name,
  coalesce(p.dibayar,0)::numeric(16,2) as dibayar,
  greatest(g.total_gaji_dibayarkan-coalesce(p.dibayar,0),0)::numeric(16,2) as sisa,
  case
    when coalesce(p.dibayar,0)>=g.total_gaji_dibayarkan then 'Terbayar'
    when coalesce(p.dibayar,0)>0 then 'Sebagian Dibayar'
    else 'Belum Dibayar'
  end as status,
  p.nomor_pembayaran
from public.ak_pencatatan_gaji g
left join public.company_branches b on b.id=g.branch_id and b.company_id=g.company_id
left join lateral (
  select sum(x.jumlah) as dibayar,string_agg(x.nomor,', ' order by x.tanggal,x.created_at) as nomor_pembayaran
  from public.ak_gaji_pembayaran x where x.company_id=g.company_id and x.gaji_id=g.id
) p on true;

grant select on public.ak_pencatatan_gaji_v to authenticated;
grant execute on function public.ak_pencatatan_gaji_simpan(jsonb),
  public.ak_pencatatan_gaji_hapus(uuid),public.ak_gaji_bayar(jsonb),
  public.ak_gaji_ambil_sebelumnya(uuid,uuid,integer,integer) to authenticated;

commit;
