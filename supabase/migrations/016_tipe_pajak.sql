-- TAMBAHAN TIPE PAJAK INDONESIA
-- Prasyarat: 015_pajak.sql sudah berhasil dijalankan.
-- Migrasi ini menjaga data pajak lama, sekaligus menambah tipe PPN/PPnBM/PPh.

alter table public.company_taxes
  drop constraint if exists company_taxes_tax_type_check;

alter table public.company_taxes
  add constraint company_taxes_tax_type_check check (
    tax_type in (
      'ppn',
      'ppnbm',
      'pph_4_2',
      'pph_15',
      'pph_21',
      'pph_22',
      'pph_23',
      -- Nilai lama tetap diterima agar data yang sudah tersimpan tidak rusak.
      'penjualan',
      'pembelian',
      'keduanya'
    )
  );

-- Semua tipe pajak baru memerlukan setidaknya satu akun COA.
-- Pajak lama mempertahankan aturan akun penjualan/pembelian sebelumnya.
alter table public.company_taxes
  add constraint company_taxes_at_least_one_account check (
    sales_account_id is not null or purchase_account_id is not null
  );

create or replace function public.company_tax_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id', '')::uuid;
  tid uuid := nullif(p->>'id', '')::uuid;
  tax_type_value text := nullif(p->>'tax_type','');
  sales_id uuid := nullif(p->>'sales_account_id', '')::uuid;
  purchase_id uuid := nullif(p->>'purchase_account_id', '')::uuid;
  rate_value numeric := coalesce((p->>'rate')::numeric, 0);
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur pajak';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Nama pajak wajib diisi'; end if;
  if tax_type_value is null or tax_type_value not in (
    'ppn','ppnbm','pph_4_2','pph_15','pph_21','pph_22','pph_23',
    'penjualan','pembelian','keduanya'
  ) then
    raise exception 'Pilih tipe pajak yang valid';
  end if;
  if rate_value < 0 or rate_value > 100 then raise exception 'Tarif pajak harus antara 0 dan 100 persen'; end if;

  -- Aturan kompatibilitas untuk data tipe pajak lama.
  if tax_type_value in ('penjualan','keduanya') and sales_id is null then
    raise exception 'Akun pajak penjualan wajib dipilih';
  end if;
  if tax_type_value in ('pembelian','keduanya') and purchase_id is null then
    raise exception 'Akun pajak pembelian wajib dipilih';
  end if;
  if sales_id is null and purchase_id is null then
    raise exception 'Pilih setidaknya satu akun COA untuk pencatatan pajak';
  end if;
  if sales_id is not null and not exists (
    select 1 from public.ak_akun a where a.id = sales_id and a.company_id = cid and a.aktif
  ) then raise exception 'Akun pajak penjualan harus berupa COA aktif milik perusahaan ini'; end if;
  if purchase_id is not null and not exists (
    select 1 from public.ak_akun a where a.id = purchase_id and a.company_id = cid and a.aktif
  ) then raise exception 'Akun pajak pembelian harus berupa COA aktif milik perusahaan ini'; end if;

  if tid is null then
    insert into public.company_taxes(company_id, name, tax_type, rate, description, sales_account_id, purchase_account_id, active)
    values (cid, trim(p->>'name'), tax_type_value, rate_value, nullif(trim(p->>'description'), ''),
      sales_id, purchase_id, coalesce((p->>'active')::boolean, true))
    returning id into tid;
  else
    update public.company_taxes
      set name = trim(p->>'name'),
          tax_type = tax_type_value,
          rate = rate_value,
          description = nullif(trim(p->>'description'), ''),
          sales_account_id = sales_id,
          purchase_account_id = purchase_id,
          active = coalesce((p->>'active')::boolean, true),
          updated_at = now()
    where id = tid and company_id = cid;
    if not found then raise exception 'Data pajak tidak ditemukan'; end if;
  end if;
  return tid;
end $$;

grant execute on function public.company_tax_save(jsonb) to authenticated;
