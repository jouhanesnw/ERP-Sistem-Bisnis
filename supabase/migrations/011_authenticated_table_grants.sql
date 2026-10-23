-- Grant database privileges required by authenticated ERP users.
-- RLS remains enabled; these grants do NOT bypass row-level policies.
-- Apply once after migrations 001-010 have been applied.

grant usage on schema public to authenticated;

-- Account and multi-company foundation. Reads/writes remain restricted by existing RLS policies.
grant select, update on table public.profiles to authenticated;
grant select, update on table public.companies to authenticated;
grant select, insert, update, delete on table public.memberships to authenticated;
grant select, insert, update, delete on table public.module_access to authenticated;

-- Cash module: direct CRUD is restricted by the existing company/module RLS policies.
grant select, insert, update, delete on table
  public.kas_rekening,
  public.kas_kategori,
  public.kas_transaksi
to authenticated;
grant select on table public.kas_saldo to authenticated;

-- Sales: master documents use RLS; payments/counters are managed through approved RPCs.
grant select, insert, update, delete on table
  public.pj_pelanggan,
  public.pj_dokumen,
  public.pj_dokumen_item
to authenticated;
grant select on table public.pj_pembayaran, public.pj_dokumen_v to authenticated;

-- Purchasing: master documents use RLS; payments/counters are managed through approved RPCs.
grant select, insert, update, delete on table
  public.pb_pemasok,
  public.pb_dokumen,
  public.pb_dokumen_item
to authenticated;
grant select on table public.pb_pembayaran, public.pb_dokumen_v to authenticated;

-- Reminders are direct CRUD with existing module/company RLS checks.
grant select, insert, update, delete on table public.rm_pengingat to authenticated;

-- Vehicles: direct CRUD is allowed only on tables with matching RLS policies.
-- Service/fuel and live location rows are read-only to clients; writes use SECURITY DEFINER RPC/server paths.
grant select, insert, update, delete on table
  public.kd_kendaraan,
  public.kd_pajak,
  public.kd_lokasi
to authenticated;
grant select on table
  public.kd_servis,
  public.kd_bbm,
  public.kd_posisi_terakhir
to authenticated;

-- Products and warehouse: stock mutations/transfers use RPCs; direct reads remain RLS-filtered.
grant select, insert, update, delete on table public.pd_produk, public.pd_gudang to authenticated;
grant select on table
  public.pd_stok_mutasi,
  public.pd_transfer,
  public.pd_produk_v,
  public.pd_gudang_stok_v
to authenticated;

-- Accounting: chart of accounts has direct RLS-managed CRUD. Journals are read-only to clients;
-- journal writes must go through the balanced-journal RPC.
grant select, insert, update, delete on table public.ak_akun to authenticated;
grant select on table
  public.ak_jurnal,
  public.ak_jurnal_baris,
  public.ak_jurnal_v,
  public.ak_buku_besar_v
to authenticated;
