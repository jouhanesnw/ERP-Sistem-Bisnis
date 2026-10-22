-- MODUL KENDARAAN: daftar, servis, BBM, pajak/STNK, lokasi (pin), posisi live
-- Butuh: 001 (fondasi), 002 (kas) dan 005 (reminder)

create table public.kd_kendaraan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nama text not null,
  plat text not null,
  jenis text not null default 'mobil' check (jenis in ('mobil','motor','truk','pickup','bus','lainnya')),
  merek text,
  tahun int check (tahun between 1950 and 2100),
  odometer integer not null default 0,
  aktif boolean not null default true,
  catatan text,
  -- dipakai halaman sopir (/lacak/<token>) dan perangkat GPS untuk mengirim posisi
  track_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, plat)
);

create table public.kd_servis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kendaraan_id uuid not null,
  tanggal date not null,
  jenis text not null,
  bengkel text,
  odometer integer,
  biaya numeric(16,2) not null default 0 check (biaya >= 0),
  keterangan text,
  berikutnya_tanggal date,
  berikutnya_km integer,
  kas_transaksi_id uuid references public.kas_transaksi(id) on delete set null,
  rekening_id uuid,                      -- rekening Kas yang dipakai (jika dicatat ke Kas)
  created_at timestamptz not null default now(),
  foreign key (kendaraan_id, company_id) references public.kd_kendaraan (id, company_id)
);
create index on public.kd_servis (company_id, tanggal desc);

create table public.kd_bbm (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kendaraan_id uuid not null,
  tanggal date not null,
  liter numeric(8,2) not null check (liter > 0),
  biaya numeric(16,2) not null default 0 check (biaya >= 0),
  odometer integer,
  spbu text,
  jenis_bbm text,
  kas_transaksi_id uuid references public.kas_transaksi(id) on delete set null,
  rekening_id uuid,                      -- rekening Kas yang dipakai (jika dicatat ke Kas)
  created_at timestamptz not null default now(),
  foreign key (kendaraan_id, company_id) references public.kd_kendaraan (id, company_id)
);
create index on public.kd_bbm (company_id, tanggal desc);

create table public.kd_pajak (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kendaraan_id uuid not null,
  jenis text not null check (jenis in ('pajak_tahunan','stnk','kir','asuransi','lainnya')),
  berlaku_sampai date not null,
  biaya numeric(16,2),
  catatan text,
  created_at timestamptz not null default now(),
  foreign key (kendaraan_id, company_id) references public.kd_kendaraan (id, company_id)
);

create table public.kd_lokasi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nama text not null,
  jenis text not null default 'lainnya' check (jenis in ('pool','bengkel','spbu','lainnya')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  alamat text,
  catatan text,
  created_at timestamptz not null default now()
);

-- Posisi terakhir tiap kendaraan. Ditulis hanya oleh server (/api/lokasi), dibaca lewat RLS + Realtime.
create table public.kd_posisi_terakhir (
  kendaraan_id uuid primary key references public.kd_kendaraan(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  kecepatan real,
  waktu timestamptz not null default now(),
  sumber text not null default 'gps'
);

-- ---------- RLS: modul 'kendaraan' ----------
do $$
declare t text;
begin
  foreach t in array array['kd_kendaraan','kd_pajak','kd_lokasi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.has_perm(company_id, ''kendaraan'', ''view''))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.has_perm(company_id, ''kendaraan'', ''create''))', t || '_ins', t);
    execute format('create policy %I on public.%I for update using (public.has_perm(company_id, ''kendaraan'', ''edit'')) with check (public.has_perm(company_id, ''kendaraan'', ''edit''))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete using (public.has_perm(company_id, ''kendaraan'', ''delete''))', t || '_del', t);
  end loop;
  -- servis, BBM, posisi: hanya baca langsung. Tulis lewat fungsi di bawah / server.
  foreach t in array array['kd_servis','kd_bbm','kd_posisi_terakhir'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.has_perm(company_id, ''kendaraan'', ''view''))', t || '_sel', t);
  end loop;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.kd_posisi_terakhir;
exception when others then null;
end $$;

-- ---------- Kas keluar otomatis untuk servis & BBM (fungsi internal) ----------
create or replace function public.kd_kas(p_company uuid, p_old uuid, p_tanggal date, p_jumlah numeric, p_rekening uuid, p_kategori text, p_ket text)
returns uuid language plpgsql security definer set search_path = public as $$
declare kat uuid; kid uuid;
begin
  if p_rekening is null or p_jumlah is null or p_jumlah <= 0 then
    if p_old is not null then delete from kas_transaksi where id = p_old and company_id = p_company; end if;
    return null;
  end if;
  if not exists (select 1 from kas_rekening where id = p_rekening and company_id = p_company and aktif) then
    raise exception 'Rekening tidak valid';
  end if;
  select id into kat from kas_kategori where company_id = p_company and jenis = 'keluar' and nama = p_kategori limit 1;
  if kat is null then
    insert into kas_kategori (company_id, nama, jenis) values (p_company, p_kategori, 'keluar') returning id into kat;
  end if;
  if p_old is not null then
    update kas_transaksi set tanggal = p_tanggal, jumlah = p_jumlah, rekening_id = p_rekening, kategori_id = kat, keterangan = p_ket
    where id = p_old and company_id = p_company returning id into kid;
  end if;
  if kid is null then
    insert into kas_transaksi (company_id, tanggal, jenis, rekening_id, kategori_id, jumlah, keterangan)
    values (p_company, p_tanggal, 'keluar', p_rekening, kat, p_jumlah, p_ket) returning id into kid;
  end if;
  return kid;
end $$;
revoke all on function public.kd_kas(uuid, uuid, date, numeric, uuid, text, text) from public, anon, authenticated;

create or replace function public.kd_simpan_servis(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid := nullif(p->>'id', '')::uuid; cid uuid := (p->>'company_id')::uuid; kend uuid := (p->>'kendaraan_id')::uuid;
  v_plat text; old_k uuid; kid uuid; v_tgl date := (p->>'tanggal')::date;
  v_biaya numeric := coalesce(nullif(p->>'biaya', '')::numeric, 0); v_odo int := nullif(p->>'odometer', '')::int;
begin
  if not public.has_perm(cid, 'kendaraan', case when did is null then 'create' else 'edit' end) then raise exception 'Tidak punya izin'; end if;
  select plat into v_plat from kd_kendaraan where id = kend and company_id = cid;
  if not found then raise exception 'Kendaraan tidak valid'; end if;
  if did is not null then
    select kas_transaksi_id into old_k from kd_servis where id = did and company_id = cid;
    if not found then raise exception 'Data tidak ditemukan'; end if;
  end if;
  kid := public.kd_kas(cid, old_k, v_tgl, v_biaya, nullif(p->>'rekening_id', '')::uuid, 'Servis Kendaraan', 'Servis ' || v_plat || ' - ' || (p->>'jenis'));
  if did is null then
    insert into kd_servis (company_id, kendaraan_id, tanggal, jenis, bengkel, odometer, biaya, keterangan, berikutnya_tanggal, berikutnya_km, kas_transaksi_id)
    values (cid, kend, v_tgl, p->>'jenis', nullif(p->>'bengkel', ''), v_odo, v_biaya, nullif(p->>'keterangan', ''),
            nullif(p->>'berikutnya_tanggal', '')::date, nullif(p->>'berikutnya_km', '')::int, kid) returning id into did;
  else
    update kd_servis set kendaraan_id = kend, tanggal = v_tgl, jenis = p->>'jenis', bengkel = nullif(p->>'bengkel', ''), odometer = v_odo,
      biaya = v_biaya, keterangan = nullif(p->>'keterangan', ''), berikutnya_tanggal = nullif(p->>'berikutnya_tanggal', '')::date,
      berikutnya_km = nullif(p->>'berikutnya_km', '')::int, kas_transaksi_id = kid
    where id = did and company_id = cid;
  end if;
  update kd_servis set rekening_id = case when kid is null then null else nullif(p->>'rekening_id', '')::uuid end where id = did;
  if v_odo is not null then update kd_kendaraan set odometer = greatest(odometer, v_odo) where id = kend; end if;
  return did;
end $$;

create or replace function public.kd_simpan_bbm(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid := nullif(p->>'id', '')::uuid; cid uuid := (p->>'company_id')::uuid; kend uuid := (p->>'kendaraan_id')::uuid;
  v_plat text; old_k uuid; kid uuid; v_tgl date := (p->>'tanggal')::date;
  v_biaya numeric := coalesce(nullif(p->>'biaya', '')::numeric, 0); v_odo int := nullif(p->>'odometer', '')::int;
begin
  if not public.has_perm(cid, 'kendaraan', case when did is null then 'create' else 'edit' end) then raise exception 'Tidak punya izin'; end if;
  select plat into v_plat from kd_kendaraan where id = kend and company_id = cid;
  if not found then raise exception 'Kendaraan tidak valid'; end if;
  if did is not null then
    select kas_transaksi_id into old_k from kd_bbm where id = did and company_id = cid;
    if not found then raise exception 'Data tidak ditemukan'; end if;
  end if;
  kid := public.kd_kas(cid, old_k, v_tgl, v_biaya, nullif(p->>'rekening_id', '')::uuid, 'BBM', 'BBM ' || v_plat || coalesce(' - ' || nullif(p->>'spbu', ''), ''));
  if did is null then
    insert into kd_bbm (company_id, kendaraan_id, tanggal, liter, biaya, odometer, spbu, jenis_bbm, kas_transaksi_id)
    values (cid, kend, v_tgl, (p->>'liter')::numeric, v_biaya, v_odo, nullif(p->>'spbu', ''), nullif(p->>'jenis_bbm', ''), kid) returning id into did;
  else
    update kd_bbm set kendaraan_id = kend, tanggal = v_tgl, liter = (p->>'liter')::numeric, biaya = v_biaya, odometer = v_odo,
      spbu = nullif(p->>'spbu', ''), jenis_bbm = nullif(p->>'jenis_bbm', ''), kas_transaksi_id = kid
    where id = did and company_id = cid;
  end if;
  update kd_bbm set rekening_id = case when kid is null then null else nullif(p->>'rekening_id', '')::uuid end where id = did;
  if v_odo is not null then update kd_kendaraan set odometer = greatest(odometer, v_odo) where id = kend; end if;
  return did;
end $$;

create or replace function public.kd_hapus_biaya(p_tabel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid; k uuid;
begin
  if p_tabel = 'servis' then select company_id, kas_transaksi_id into c, k from kd_servis where id = p_id;
  elsif p_tabel = 'bbm' then select company_id, kas_transaksi_id into c, k from kd_bbm where id = p_id;
  else raise exception 'Jenis data tidak valid'; end if;
  if c is null then raise exception 'Data tidak ditemukan'; end if;
  if not public.has_perm(c, 'kendaraan', 'delete') then raise exception 'Tidak punya izin'; end if;
  if p_tabel = 'servis' then delete from kd_servis where id = p_id; else delete from kd_bbm where id = p_id; end if;
  if k is not null then delete from kas_transaksi where id = k and company_id = c; end if;
end $$;

-- Rekening untuk form (staf kendaraan tidak perlu akses modul Kas)
create or replace function public.kd_rekening_pilihan(cid uuid) returns table (id uuid, nama text, aktif boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.nama, r.aktif from kas_rekening r where r.company_id = cid and public.has_perm(cid, 'kendaraan', 'view') order by r.nama
$$;

create or replace function public.kd_reset_token(p_id uuid) returns text language plpgsql as $$
declare t text;
begin
  update kd_kendaraan set track_token = replace(gen_random_uuid()::text, '-', '') where id = p_id returning track_token into t;
  if not found then raise exception 'Tidak punya izin atau kendaraan tidak ditemukan'; end if;
  return t;
end $$;

grant execute on function public.kd_simpan_servis(jsonb), public.kd_simpan_bbm(jsonb), public.kd_hapus_biaya(text, uuid),
  public.kd_rekening_pilihan(uuid), public.kd_reset_token(uuid) to authenticated;

-- ---------- Pengingat otomatis (modul Reminder) ----------
create unique index if not exists rm_pengingat_sumber_uq on public.rm_pengingat (sumber, sumber_id) where sumber is not null;

create or replace function public.kd_sync_pajak() returns trigger language plpgsql security definer set search_path = public as $$
declare v_plat text;
begin
  if tg_op = 'DELETE' then
    delete from rm_pengingat where sumber = 'kendaraan_pajak' and sumber_id = old.id;
    return old;
  end if;
  select plat into v_plat from kd_kendaraan where id = new.kendaraan_id;
  insert into rm_pengingat (company_id, judul, catatan, tanggal, ingatkan_hari, ulang, status, sumber, sumber_id)
  values (new.company_id,
    case new.jenis when 'pajak_tahunan' then 'Pajak kendaraan' when 'stnk' then 'Perpanjang STNK' when 'kir' then 'KIR'
                   when 'asuransi' then 'Perpanjang asuransi' else 'Jatuh tempo kendaraan' end || ' ' || v_plat,
    new.catatan, new.berlaku_sampai, 30, 'tidak', 'aktif', 'kendaraan_pajak', new.id)
  on conflict (sumber, sumber_id) where sumber is not null do update
    set judul = excluded.judul, catatan = excluded.catatan, tanggal = excluded.tanggal,
        status = case when rm_pengingat.tanggal is distinct from excluded.tanggal then 'aktif' else rm_pengingat.status end,
        selesai_pada = case when rm_pengingat.tanggal is distinct from excluded.tanggal then null else rm_pengingat.selesai_pada end;
  -- perpanjangan baru: pengingat periode sebelumnya otomatis selesai
  update rm_pengingat r set status = 'selesai', selesai_pada = now()
  from kd_pajak p
  where r.sumber = 'kendaraan_pajak' and r.sumber_id = p.id and p.kendaraan_id = new.kendaraan_id and p.jenis = new.jenis
    and p.id <> new.id and p.berlaku_sampai < new.berlaku_sampai and r.status = 'aktif';
  return new;
end $$;
create trigger kd_sync_pajak after insert or update or delete on public.kd_pajak for each row execute function public.kd_sync_pajak();

create or replace function public.kd_sync_servis() returns trigger language plpgsql security definer set search_path = public as $$
declare v_plat text;
begin
  if tg_op = 'DELETE' then
    delete from rm_pengingat where sumber = 'kendaraan_servis' and sumber_id = old.id;
    return old;
  end if;
  if new.berikutnya_tanggal is null then
    delete from rm_pengingat where sumber = 'kendaraan_servis' and sumber_id = new.id;
    return new;
  end if;
  select plat into v_plat from kd_kendaraan where id = new.kendaraan_id;
  insert into rm_pengingat (company_id, judul, catatan, tanggal, ingatkan_hari, ulang, status, sumber, sumber_id)
  values (new.company_id, 'Servis berikutnya ' || v_plat, new.jenis, new.berikutnya_tanggal, 7, 'tidak', 'aktif', 'kendaraan_servis', new.id)
  on conflict (sumber, sumber_id) where sumber is not null do update
    set judul = excluded.judul, catatan = excluded.catatan, tanggal = excluded.tanggal,
        status = case when rm_pengingat.tanggal is distinct from excluded.tanggal then 'aktif' else rm_pengingat.status end,
        selesai_pada = case when rm_pengingat.tanggal is distinct from excluded.tanggal then null else rm_pengingat.selesai_pada end;
  update rm_pengingat r set status = 'selesai', selesai_pada = now()
  from kd_servis s
  where r.sumber = 'kendaraan_servis' and r.sumber_id = s.id and s.kendaraan_id = new.kendaraan_id
    and s.id <> new.id and s.tanggal < new.tanggal and r.status = 'aktif';
  return new;
end $$;
create trigger kd_sync_servis after insert or update or delete on public.kd_servis for each row execute function public.kd_sync_servis();
