-- INTEGRASI OTOMATIS KALENDER DENGAN JADWAL TRANSAKSI YANG SUDAH TERSEDIA
-- Jalankan setelah 024_kalender.sql. Modul lain dihubungkan saat tabel/form transaksinya tersedia.

alter table public.company_calendars
  add column default_reminder_minutes_before integer not null default 1440
    check (default_reminder_minutes_before between 0 and 525600),
  add column default_reminder_channels text[] not null default '{}'::text[],
  add column default_reminder_recipients jsonb not null default '{}'::jsonb
    check (jsonb_typeof(default_reminder_recipients) = 'object');

alter table public.company_calendar_events
  add column if not exists reminder_attempts integer not null default 0 check (reminder_attempts >= 0),
  add column if not exists reminder_last_error text,
  add column if not exists repeat_processed_at timestamptz,
  add column if not exists source_table text,
  add column if not exists source_id uuid,
  add column if not exists source_url text,
  add column if not exists event_type text not null default 'Kegiatan'
    check (event_type in (
      'Kegiatan',
      'Jadwal Pembayaran Gaji',
      'Jadwal Pembayaran Beban',
      'Jadwal Penerimaan Barang',
      'Jadwal Pengiriman Barang',
      'Jadwal Stok Opname',
      'Jatuh Tempo Giro Keluar',
      'Jatuh Tempo Giro Masuk',
      'Jatuh Tempo Hutang',
      'Jatuh Tempo No. Produksi',
      'Jatuh Tempo PPh Pembelian',
      'Jatuh Tempo PPh Penjualan',
      'Jatuh Tempo Pembayaran',
      'Jatuh Tempo Penerimaan',
      'Jatuh Tempo Permintaan Barang',
      'Jatuh Tempo Piutang',
      'Transaksi Terjadwal',
      'Tukar Faktur'
    ));

alter table public.company_calendar_events
  drop constraint if exists company_calendar_events_reminder_status_check;
alter table public.company_calendar_events
  add constraint company_calendar_events_reminder_status_check
  check (reminder_status in ('pending','sending','sent','failed','not_configured'));

create unique index company_calendar_events_source_uq
  on public.company_calendar_events(company_id, source_table, source_id, event_type)
  where source_table is not null and source_id is not null;

create index company_calendar_events_type_idx
  on public.company_calendar_events(company_id, event_type, start_at);

-- Default shared calendar is created lazily by the transaction trigger.
-- All settings are company-scoped; the transaction record remains the system of record.
create or replace function public.calendar_sync_document_schedule()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  doc jsonb;
  cid uuid;
  did uuid;
  doc_type text;
  doc_status text;
  doc_number text;
  due_date date;
  description_text text;
  creator_id uuid;
  calendar_id_value uuid;
  calendar_row public.company_calendars%rowtype;
  type_value text;
  title_value text;
  source_url_value text;
  start_value timestamptz;
  reminder_value timestamptz;
  channels_value text[];
  recipients_value jsonb;
begin
  if TG_OP = 'DELETE' then
    delete from public.company_calendar_events
    where company_id = old.company_id and source_table = TG_TABLE_NAME and source_id = old.id;
    return old;
  end if;

  doc := to_jsonb(new);
  cid := nullif(doc->>'company_id','')::uuid;
  did := nullif(doc->>'id','')::uuid;
  doc_type := coalesce(doc->>'jenis','');
  doc_status := coalesce(doc->>'status','');
  doc_number := coalesce(doc->>'nomor','Dokumen');
  due_date := nullif(doc->>'batas_tanggal','')::date;
  description_text := nullif(trim(coalesce(doc->>'catatan','')),'');
  creator_id := nullif(doc->>'created_by','')::uuid;

  type_value := null;
  source_url_value := null;
  if TG_TABLE_NAME = 'pj_dokumen' and doc_type = 'faktur' and doc_status = 'terbit' then
    type_value := 'Jatuh Tempo Piutang';
    source_url_value := '/penjualan/faktur';
  elsif TG_TABLE_NAME = 'pb_dokumen' and doc_type = 'faktur' and doc_status = 'terbit' then
    type_value := 'Jatuh Tempo Hutang';
    source_url_value := '/pembelian/faktur';
  elsif TG_TABLE_NAME = 'pb_dokumen' and doc_type = 'pesanan' and doc_status = 'dipesan' then
    type_value := 'Jadwal Penerimaan Barang';
    source_url_value := '/pembelian/pesanan';
  end if;

  if type_value is null or due_date is null or doc_status = 'batal' then
    delete from public.company_calendar_events
    where company_id = cid and source_table = TG_TABLE_NAME and source_id = did;
    return new;
  end if;

  select coalesce(c.created_by, creator_id, auth.uid()) into creator_id
    from public.companies c where c.id = cid;
  select c.* into calendar_row
    from public.company_calendars c
    where c.company_id = cid and c.name = 'Jadwal Transaksi'
    order by c.created_at asc limit 1;

  if not found then
    if creator_id is null then
      raise exception 'Tidak dapat menentukan pembuat kalender transaksi untuk perusahaan %', cid;
    end if;
    insert into public.company_calendars(
      company_id, calendar_type, name, description, access_all, event_edit_all,
      admin_all, created_by
    ) values (
      cid, 'Kegiatan', 'Jadwal Transaksi',
      'Kalender otomatis untuk jadwal penerimaan barang dan jatuh tempo transaksi.',
      true, false, false, creator_id
    ) returning * into calendar_row;
  end if;

  calendar_id_value := calendar_row.id;
  channels_value := coalesce(calendar_row.default_reminder_channels, '{}'::text[]);
  recipients_value := coalesce(calendar_row.default_reminder_recipients, '{}'::jsonb);
  start_value := due_date::timestamp at time zone 'Asia/Jakarta';
  reminder_value := start_value - make_interval(mins => calendar_row.default_reminder_minutes_before);
  title_value := type_value || ' · ' || doc_number;

  if description_text is null then
    description_text := 'Dibuat otomatis dari ' || case TG_TABLE_NAME when 'pj_dokumen' then 'Faktur Penjualan' else 'transaksi Pembelian' end || ' ' || doc_number || '.';
  else
    description_text := description_text || ' · Sumber: ' || doc_number;
  end if;

  insert into public.company_calendar_events(
    company_id, calendar_id, event_type, title, description,
    start_at, due_at, reminder_at, repeat_rule, attachment_links,
    reminder_channels, reminder_recipients, reminder_status,
    reminder_attempts, reminder_last_error, source_table, source_id, source_url,
    created_by
  ) values (
    cid, calendar_id_value, type_value, title_value, description_text,
    start_value, start_value, reminder_value, 'none', '[]'::jsonb,
    channels_value, recipients_value,
    case when cardinality(channels_value) > 0 then 'pending' else 'not_configured' end,
    0, null, TG_TABLE_NAME, did, source_url_value,
    coalesce(creator_id, auth.uid())
  )
  on conflict (company_id, source_table, source_id, event_type)
    where source_table is not null and source_id is not null
  do update set
    calendar_id = excluded.calendar_id,
    title = excluded.title,
    description = excluded.description,
    start_at = excluded.start_at,
    due_at = excluded.due_at,
    reminder_at = excluded.reminder_at,
    reminder_channels = excluded.reminder_channels,
    reminder_recipients = excluded.reminder_recipients,
    reminder_status = case when cardinality(excluded.reminder_channels) > 0 then 'pending' else 'not_configured' end,
    reminder_attempts = 0,
    reminder_last_error = null,
    reminder_sent_at = null,
    repeat_processed_at = null,
    source_url = excluded.source_url,
    updated_at = now();

  return new;
end
$fn$;

create trigger calendar_sync_sales_document
after insert or update or delete on public.pj_dokumen
for each row execute function public.calendar_sync_document_schedule();

create trigger calendar_sync_purchase_document
after insert or update or delete on public.pb_dokumen
for each row execute function public.calendar_sync_document_schedule();

-- Backfill open invoices and outstanding purchase orders already in the database.
-- Fully paid invoices and received/cancelled orders are deliberately excluded.
update public.pj_dokumen d
set catatan = d.catatan
where d.jenis = 'faktur'
  and d.status = 'terbit'
  and d.batas_tanggal is not null
  and (
    select round(coalesce(sum(i.qty * i.harga), 0) * (1 + coalesce(d.ppn_persen, 0) / 100), 2)
    from public.pj_dokumen_item i where i.dokumen_id = d.id
  ) > coalesce((select sum(p.jumlah) from public.pj_pembayaran p where p.dokumen_id = d.id), 0);

update public.pb_dokumen d
set catatan = d.catatan
where d.batas_tanggal is not null
  and ((d.jenis = 'faktur' and d.status = 'terbit')
    or (d.jenis = 'pesanan' and d.status = 'dipesan'))
  and (
    d.jenis = 'pesanan'
    or (
      select round(coalesce(sum(i.qty * i.harga), 0) * (1 + coalesce(d.ppn_persen, 0) / 100), 2)
      from public.pb_dokumen_item i where i.dokumen_id = d.id
    ) > coalesce((select sum(p.jumlah) from public.pb_pembayaran p where p.dokumen_id = d.id), 0)
  );

-- When an invoice is settled completely, remove its outstanding due-date reminder.
-- Partial payments keep the source event. Deleting a payment re-runs document sync.
create or replace function public.calendar_refresh_invoice_after_payment()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  doc_id uuid;
  cid uuid;
  total_value numeric(16,2);
  paid_value numeric(16,2);
begin
  if TG_OP = 'DELETE' then
    doc_id := old.dokumen_id;
    cid := old.company_id;
  else
    doc_id := new.dokumen_id;
    cid := new.company_id;
  end if;

  if TG_TABLE_NAME = 'pj_pembayaran' then
    select round(coalesce(sum(i.qty * i.harga),0) * (1 + coalesce(d.ppn_persen,0) / 100), 2)
      into total_value
      from public.pj_dokumen d left join public.pj_dokumen_item i on i.dokumen_id = d.id
      where d.id = doc_id and d.company_id = cid group by d.id;
    select coalesce(sum(p.jumlah),0) into paid_value from public.pj_pembayaran p
      where p.dokumen_id = doc_id and p.company_id = cid;
    if total_value is not null and paid_value >= total_value then
      delete from public.company_calendar_events
        where company_id = cid and source_table = 'pj_dokumen' and source_id = doc_id and event_type = 'Jatuh Tempo Piutang';
    elsif not exists (select 1 from public.company_calendar_events e where e.company_id = cid and e.source_table = 'pj_dokumen' and e.source_id = doc_id and e.event_type = 'Jatuh Tempo Piutang') then
      update public.pj_dokumen set catatan = catatan where id = doc_id and company_id = cid;
    end if;
  elsif TG_TABLE_NAME = 'pb_pembayaran' then
    select round(coalesce(sum(i.qty * i.harga),0) * (1 + coalesce(d.ppn_persen,0) / 100), 2)
      into total_value
      from public.pb_dokumen d left join public.pb_dokumen_item i on i.dokumen_id = d.id
      where d.id = doc_id and d.company_id = cid group by d.id;
    select coalesce(sum(p.jumlah),0) into paid_value from public.pb_pembayaran p
      where p.dokumen_id = doc_id and p.company_id = cid;
    if total_value is not null and paid_value >= total_value then
      delete from public.company_calendar_events
        where company_id = cid and source_table = 'pb_dokumen' and source_id = doc_id and event_type = 'Jatuh Tempo Hutang';
    elsif not exists (select 1 from public.company_calendar_events e where e.company_id = cid and e.source_table = 'pb_dokumen' and e.source_id = doc_id and e.event_type = 'Jatuh Tempo Hutang') then
      update public.pb_dokumen set catatan = catatan where id = doc_id and company_id = cid;
    end if;
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end
$fn$;

create trigger calendar_refresh_sales_payment
after insert or update or delete on public.pj_pembayaran
for each row execute function public.calendar_refresh_invoice_after_payment();

create trigger calendar_refresh_purchase_payment
after insert or update or delete on public.pb_pembayaran
for each row execute function public.calendar_refresh_invoice_after_payment();
