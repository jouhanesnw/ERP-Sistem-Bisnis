-- PENGATURAN PAJAK PER PERUSAHAAN
-- Prasyarat: migrasi 001-014 sudah berhasil dijalankan.

create table public.company_taxes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  tax_type text not null check (tax_type in ('penjualan','pembelian','keduanya')),
  rate numeric(8,4) not null default 0 check (rate >= 0 and rate <= 100),
  description text,
  sales_account_id uuid,
  purchase_account_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (sales_account_id, company_id)
    references public.ak_akun(id, company_id) on delete set null (sales_account_id),
  foreign key (purchase_account_id, company_id)
    references public.ak_akun(id, company_id) on delete set null (purchase_account_id),
  constraint company_taxes_required_accounts check (
    (tax_type not in ('penjualan','keduanya') or sales_account_id is not null)
    and (tax_type not in ('pembelian','keduanya') or purchase_account_id is not null)
  )
);

create unique index company_taxes_name_uq
  on public.company_taxes(company_id, lower(trim(name)));
create index company_taxes_type_idx on public.company_taxes(company_id, tax_type, active);
create index company_taxes_sales_account_idx on public.company_taxes(company_id, sales_account_id);
create index company_taxes_purchase_account_idx on public.company_taxes(company_id, purchase_account_id);

alter table public.company_taxes enable row level security;
grant select, insert, update, delete on public.company_taxes to authenticated;

create policy company_taxes_select on public.company_taxes
  for select using (public.is_member(company_id));
create policy company_taxes_insert on public.company_taxes
  for insert with check (public.is_admin(company_id));
create policy company_taxes_update on public.company_taxes
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));
create policy company_taxes_delete on public.company_taxes
  for delete using (public.is_admin(company_id));

create or replace function public.company_tax_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := nullif(p->>'company_id', '')::uuid;
  tid uuid := nullif(p->>'id', '')::uuid;
  tax_type_value text := coalesce(nullif(p->>'tax_type',''), 'penjualan');
  sales_id uuid := nullif(p->>'sales_account_id', '')::uuid;
  purchase_id uuid := nullif(p->>'purchase_account_id', '')::uuid;
  rate_value numeric := coalesce((p->>'rate')::numeric, 0);
begin
  if cid is null or not public.is_admin(cid) then
    raise exception 'Hanya owner/admin perusahaan yang bisa mengatur pajak';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Nama pajak wajib diisi'; end if;
  if tax_type_value not in ('penjualan','pembelian','keduanya') then raise exception 'Tipe pajak tidak valid'; end if;
  if rate_value < 0 or rate_value > 100 then raise exception 'Tarif pajak harus antara 0 dan 100 persen'; end if;
  if tax_type_value in ('penjualan','keduanya') and sales_id is null then
    raise exception 'Akun pajak penjualan wajib dipilih';
  end if;
  if tax_type_value in ('pembelian','keduanya') and purchase_id is null then
    raise exception 'Akun pajak pembelian wajib dipilih';
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

create or replace function public.company_tax_delete(p_company uuid, p_tax uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_company) then raise exception 'Hanya owner/admin perusahaan yang bisa menghapus pajak'; end if;
  delete from public.company_taxes where id = p_tax and company_id = p_company;
  if not found then raise exception 'Data pajak tidak ditemukan'; end if;
end $$;

grant execute on function public.company_tax_save(jsonb), public.company_tax_delete(uuid, uuid) to authenticated;
