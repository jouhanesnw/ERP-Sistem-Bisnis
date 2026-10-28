-- SYARAT PEMBAYARAN PER PERUSAHAAN
-- Prasyarat: migrasi 001-016 sudah berhasil dijalankan.

create table public.company_payment_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  discount_days integer not null default 0 check (discount_days >= 0),
  discount_percent numeric(8,4) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  due_days integer not null default 0 check (due_days >= 0),
  description text,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index company_payment_terms_name_uq
  on public.company_payment_terms(company_id, lower(trim(name)));
create unique index company_payment_terms_one_default_uq
  on public.company_payment_terms(company_id) where is_default;
create index company_payment_terms_company_active_idx
  on public.company_payment_terms(company_id, active, name);

alter table public.company_payment_terms enable row level security;
grant select, insert, update, delete on public.company_payment_terms to authenticated;

create policy company_payment_terms_select on public.company_payment_terms
  for select using (public.is_member(company_id));
create policy company_payment_terms_insert on public.company_payment_terms
  for insert with check (public.is_admin(company_id));
create policy company_payment_terms_update on public.company_payment_terms
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_payment_terms_delete on public.company_payment_terms
  for delete using (public.is_admin(company_id));

-- Setiap perusahaan yang sudah ada mendapat satu default awal bernama "Tunai".
insert into public.company_payment_terms(company_id, name, discount_days, discount_percent, due_days, description, active, is_default)
select c.id, 'Tunai', 0, 0, 0, 'Pembayaran langsung', true, true
from public.companies c
where not exists (
  select 1 from public.company_payment_terms t
  where t.company_id = c.id and t.is_default
)
on conflict do nothing;

create or replace function public.company_payment_term_seed_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_payment_terms(company_id, name, discount_days, discount_percent, due_days, description, active, is_default)
  values (new.id, 'Tunai', 0, 0, 0, 'Pembayaran langsung', true, true)
  on conflict do nothing;
  return new;
end $$;
create trigger company_payment_terms_seed_default_after_insert
after insert on public.companies
for each row execute function public.company_payment_term_seed_default();

-- Add the selected payment term to purchase/sales documents and preserve old data.
alter table public.pb_dokumen add column payment_terms_id uuid;
alter table public.pj_dokumen add column payment_terms_id uuid;

update public.pb_dokumen d
set payment_terms_id = t.id
from public.company_payment_terms t
where t.company_id = d.company_id and t.is_default and d.payment_terms_id is null;

update public.pj_dokumen d
set payment_terms_id = t.id
from public.company_payment_terms t
where t.company_id = d.company_id and t.is_default and d.payment_terms_id is null;

alter table public.pb_dokumen alter column payment_terms_id set not null;
alter table public.pj_dokumen alter column payment_terms_id set not null;
alter table public.pb_dokumen add constraint pb_dokumen_payment_term_fk
  foreign key (payment_terms_id, company_id)
  references public.company_payment_terms(id, company_id) on delete restrict;
alter table public.pj_dokumen add constraint pj_dokumen_payment_term_fk
  foreign key (payment_terms_id, company_id)
  references public.company_payment_terms(id, company_id) on delete restrict;

-- Recreate views so payment_terms_id (and currency_code) are part of their output.
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

create or replace function public.company_payment_term_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id', '')::uuid;
  tid uuid := nullif(p->>'id', '')::uuid;
  name_value text := trim(coalesce(p->>'name',''));
  discount_days_value integer := coalesce((p->>'discount_days')::integer, 0);
  discount_percent_value numeric := coalesce((p->>'discount_percent')::numeric, 0);
  due_days_value integer := coalesce((p->>'due_days')::integer, 0);
  description_value text := nullif(trim(p->>'description'), '');
  active_value boolean := coalesce((p->>'active')::boolean, true);
  default_value boolean := coalesce((p->>'is_default')::boolean, false);
  was_default boolean := false;
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur syarat pembayaran';
  end if;
  if name_value = '' then raise exception 'Nama syarat pembayaran wajib diisi'; end if;
  if discount_days_value < 0 then raise exception 'Masa diskon tidak boleh negatif'; end if;
  if due_days_value < 0 then raise exception 'Masa jatuh tempo tidak boleh negatif'; end if;
  if discount_percent_value < 0 or discount_percent_value > 100 then raise exception 'Diskon harus antara 0 dan 100 persen'; end if;
  if default_value and not active_value then raise exception 'Syarat pembayaran default harus berstatus aktif'; end if;

  if tid is not null then
    select is_default into was_default
    from public.company_payment_terms where id = tid and company_id = cid for update;
    if not found then raise exception 'Syarat pembayaran tidak ditemukan'; end if;
    if was_default and not default_value and not exists (
      select 1 from public.company_payment_terms t
      where t.company_id = cid and t.is_default and t.id <> tid
    ) then
      raise exception 'Pilih syarat pembayaran default yang baru terlebih dahulu.';
    end if;
  end if;

  if default_value then
    update public.company_payment_terms
    set is_default = false, updated_at = now()
    where company_id = cid and is_default and (tid is null or id <> tid);
  end if;

  if tid is null then
    insert into public.company_payment_terms(company_id, name, discount_days, discount_percent, due_days, description, active, is_default)
    values(cid, name_value, discount_days_value, discount_percent_value, due_days_value, description_value, active_value, default_value)
    returning id into tid;
  else
    update public.company_payment_terms
    set name = name_value,
        discount_days = discount_days_value,
        discount_percent = discount_percent_value,
        due_days = due_days_value,
        description = description_value,
        active = active_value,
        is_default = default_value,
        updated_at = now()
    where id = tid and company_id = cid;
  end if;
  return tid;
end $$;

create or replace function public.company_payment_term_delete(p_company uuid, p_term uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_company) then raise exception 'Hanya owner/admin perusahaan yang bisa menghapus syarat pembayaran'; end if;
  if exists (
    select 1 from public.company_payment_terms
    where id = p_term and company_id = p_company and is_default
  ) then raise exception 'Syarat pembayaran default tidak bisa dihapus. Pilih default yang baru terlebih dahulu.'; end if;
  delete from public.company_payment_terms where id = p_term and company_id = p_company;
  if not found then raise exception 'Syarat pembayaran tidak ditemukan'; end if;
end $$;

-- Save purchase/sales document with the selected payment terms.
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
begin
  if jns not in ('pesanan','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'pembelian','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'pembelian','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then
    raise exception 'Isi minimal satu baris item'; end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then
    raise exception 'Mata uang belum disimpan atau tidak aktif'; end if;
  if ptid is null then select id into ptid from public.company_payment_terms where company_id=cid and is_default and active; end if;
  if not exists(select 1 from public.company_payment_terms where id=ptid and company_id=cid and active) then
    raise exception 'Syarat pembayaran belum dipilih, tidak aktif, atau berasal dari perusahaan lain'; end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pb_dokumen(company_id,jenis,nomor,no_referensi,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,gudang_id,currency_code,payment_terms_id)
    values(cid,jns,public.pb_nomor(cid,jns),nullif(p->>'no_referensi',''),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,
      (p->>'pemasok_id')::uuid,'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid,cur,ptid)
    returning id into did;
  else
    if not exists(select 1 from public.pb_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pb_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pb_dokumen set no_referensi=nullif(p->>'no_referensi',''),tanggal=(p->>'tanggal')::date,
      batas_tanggal=nullif(p->>'batas_tanggal','')::date,pemasok_id=(p->>'pemasok_id')::uuid,
      ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),catatan=nullif(p->>'catatan',''),gudang_id=gid,
      currency_code=cur,payment_terms_id=ptid
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
begin
  if jns not in ('penawaran','faktur') then raise exception 'Jenis dokumen tidak valid'; end if;
  if did is null and not public.has_perm(cid,'penjualan','create') then raise exception 'Tidak punya izin'; end if;
  if did is not null and not public.has_perm(cid,'penjualan','edit') then raise exception 'Tidak punya izin'; end if;
  if jsonb_typeof(coalesce(p->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p->'items','[]'::jsonb))=0 then
    raise exception 'Isi minimal satu baris item'; end if;
  if not exists(select 1 from public.company_currencies where company_id=cid and code=cur and is_active) then
    raise exception 'Mata uang belum disimpan atau tidak aktif'; end if;
  if ptid is null then select id into ptid from public.company_payment_terms where company_id=cid and is_default and active; end if;
  if not exists(select 1 from public.company_payment_terms where id=ptid and company_id=cid and active) then
    raise exception 'Syarat pembayaran belum dipilih, tidak aktif, atau berasal dari perusahaan lain'; end if;
  select coalesce(nullif(p->>'gudang_id','')::uuid,(select g.id from public.pd_gudang g where g.company_id=cid and g.is_default)) into gid;
  if not exists(select 1 from public.pd_gudang where id=gid and company_id=cid and aktif) then raise exception 'Gudang tidak valid'; end if;
  if did is null then
    insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,gudang_id,currency_code,payment_terms_id)
    values(cid,jns,public.pj_nomor(cid,jns),(p->>'tanggal')::date,nullif(p->>'batas_tanggal','')::date,(p->>'pelanggan_id')::uuid,
      'draft',coalesce((p->>'ppn_persen')::numeric,0),nullif(p->>'catatan',''),gid,cur,ptid)
    returning id into did;
  else
    if not exists(select 1 from public.pj_dokumen where id=did and company_id=cid and jenis=jns) then raise exception 'Dokumen tidak ditemukan'; end if;
    if exists(select 1 from public.pj_pembayaran where dokumen_id=did) then raise exception 'Faktur sudah ada pembayaran dan tidak bisa diubah.'; end if;
    update public.pj_dokumen set tanggal=(p->>'tanggal')::date,batas_tanggal=nullif(p->>'batas_tanggal','')::date,
      pelanggan_id=(p->>'pelanggan_id')::uuid,ppn_persen=coalesce((p->>'ppn_persen')::numeric,0),
      catatan=nullif(p->>'catatan',''),gudang_id=gid,currency_code=cur,payment_terms_id=ptid
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

-- Conversions retain the selected term and calculate the due date from it.
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
  insert into public.pj_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pelanggan_id,status,ppn_persen,catatan,sumber_id,gudang_id,currency_code,payment_terms_id)
  values(src.company_id,'faktur',public.pj_nomor(src.company_id,'faktur'),current_date,current_date+coalesce(due,0),src.pelanggan_id,
    'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id,src.currency_code,src.payment_terms_id) returning id into fid;
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
  insert into public.pb_dokumen(company_id,jenis,nomor,tanggal,batas_tanggal,pemasok_id,status,ppn_persen,catatan,sumber_id,gudang_id,currency_code,payment_terms_id)
  values(src.company_id,'faktur',public.pb_nomor(src.company_id,'faktur'),current_date,current_date+coalesce(due,0),src.pemasok_id,
    'draft',src.ppn_persen,src.catatan,src.id,src.gudang_id,src.currency_code,src.payment_terms_id) returning id into fid;
  insert into public.pb_dokumen_item(dokumen_id,company_id,urutan,deskripsi,qty,harga,produk_id)
  select fid,company_id,urutan,deskripsi,qty,harga,produk_id from public.pb_dokumen_item where dokumen_id=p_id;
  update public.pb_dokumen set status='diterima' where id=p_id;
  return fid;
end $$;

grant execute on function public.company_payment_term_save(jsonb), public.company_payment_term_delete(uuid, uuid) to authenticated;
grant execute on function public.pb_simpan_dokumen(jsonb), public.pj_simpan_dokumen(jsonb),
  public.pb_pesanan_ke_faktur(uuid), public.pj_penawaran_ke_faktur(uuid) to authenticated;
