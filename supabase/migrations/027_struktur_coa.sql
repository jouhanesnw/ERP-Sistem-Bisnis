-- PENYEMPURNAAN STRUKTUR COA BERDASARKAN REFERENSI DAFTAR AKUN
-- Tidak mengimpor COA, saldo, rekening, cabang, atau nama lokasi dari workbook contoh.
-- Migration ini hanya menambah metadata pada daftar akun yang sudah menjadi milik perusahaan.

alter table public.ak_akun
  add column if not exists kode_tipe text not null default 'UMUM',
  add column if not exists currency_code text not null default 'IDR',
  add column if not exists catatan text;

alter table public.ak_akun
  drop constraint if exists ak_akun_kode_tipe_check;
alter table public.ak_akun
  add constraint ak_akun_kode_tipe_check
  check (kode_tipe in ('UMUM','BANK','DEPR','OCAS','OASS','FASS','EXPS','COGS','OEXP','OCLY','EQTY','APAY','LTLY','OINC','REVE','INTR','AREC'));

alter table public.ak_akun
  drop constraint if exists ak_akun_company_currency_fk;
alter table public.ak_akun
  add constraint ak_akun_company_currency_fk
  foreign key (company_id, currency_code)
  references public.company_currencies(company_id, code);

-- Label jenis untuk 13 akun sistem bawaan. Kode lama tetap dipertahankan karena
-- jurnal otomatis modul kas, penjualan, dan pembelian masih merujuk ke kode tersebut.
update public.ak_akun
set kode_tipe = case kode
  when '1100' then 'BANK'
  when '1200' then 'AREC'
  when '1300' then 'INTR'
  when '1400' then 'OCAS'
  when '2100' then 'APAY'
  when '2200' then 'OCLY'
  when '3000' then 'EQTY'
  when '3100' then 'EQTY'
  when '4000' then 'REVE'
  when '4100' then 'OINC'
  when '5000' then 'COGS'
  when '6000' then 'EXPS'
  when '6100' then 'OEXP'
  else kode_tipe
end
where sistem = true;

create index if not exists ak_akun_company_currency_idx
  on public.ak_akun(company_id, currency_code);
create index if not exists ak_akun_company_induk_idx
  on public.ak_akun(company_id, induk_id);

comment on column public.ak_akun.kode_tipe is
'Subtipe akun terinspirasi dari kolom Tipe Akun pada referensi COA. Berbeda dari tipe utama aset/kewajiban/modal/pendapatan/beban.';
comment on column public.ak_akun.currency_code is
'Mata uang akun, hanya memilih mata uang yang dikonfigurasi untuk perusahaan tersebut.';
comment on column public.ak_akun.catatan is
'Catatan konfigurasi akun. Saldo awal dicatat melalui jurnal saldo awal yang seimbang, bukan disimpan sebagai saldo master akun.';
