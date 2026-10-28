-- TRANSAKSI FAVORIT
-- Menyimpan templat isian formulir tanpa membuat transaksi/jurnal atau mengubah stok.
-- Dapat dipakai untuk formulir pembelian dan penjualan yang sudah tersedia.

create table public.company_transaction_favorites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  favorite_type text not null check (favorite_type in (
    'sales_quote', 'sales_invoice', 'purchase_order', 'purchase_invoice',
    'kas_in', 'kas_out', 'kas_transfer', 'journal_manual'
  )),
  name text not null check (length(trim(name)) > 0),
  visibility text not null default 'all_members' check (visibility in ('all_members', 'private')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create index company_transaction_favorites_lookup_idx
  on public.company_transaction_favorites(company_id, favorite_type, lower(name));

alter table public.company_transaction_favorites enable row level security;
grant select, insert, update, delete on public.company_transaction_favorites to authenticated;

create policy company_transaction_favorites_select on public.company_transaction_favorites
  for select using (
    public.is_member(company_id)
    and (visibility = 'all_members' or created_by = auth.uid() or public.is_admin(company_id))
  );

create policy company_transaction_favorites_insert on public.company_transaction_favorites
  for insert with check (
    public.is_member(company_id) and created_by = auth.uid()
  );

create policy company_transaction_favorites_update on public.company_transaction_favorites
  for update using (
    public.is_member(company_id)
    and (created_by = auth.uid() or public.is_admin(company_id))
  ) with check (
    public.is_member(company_id)
    and (created_by = auth.uid() or public.is_admin(company_id))
  );

create policy company_transaction_favorites_delete on public.company_transaction_favorites
  for delete using (
    public.is_member(company_id)
    and (created_by = auth.uid() or public.is_admin(company_id))
  );

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
  if type_value not in ('sales_quote','sales_invoice','purchase_order','purchase_invoice','kas_in','kas_out','kas_transfer','journal_manual') then
    raise exception 'Jenis transaksi favorit belum didukung';
  end if;
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
