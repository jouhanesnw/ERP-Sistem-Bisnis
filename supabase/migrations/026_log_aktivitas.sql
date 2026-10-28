-- AUDIT TRAIL TERPERINCI UNTUK SELURUH PERUBAHAN DATA PERUSAHAAN
-- Jalankan setelah migration 025. Log dibuat oleh trigger database, bukan hanya dari form UI.

create table public.company_activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_name text not null default 'Sistem/Proses Otomatis',
  actor_email text,
  actor_type text not null default 'system' check (actor_type in ('user','system')),
  action text not null check (action in ('INSERT','UPDATE','DELETE','VIEW','EXPORT','LOGIN','OTHER')),
  module_name text not null,
  table_name text not null,
  record_key jsonb not null default '{}'::jsonb,
  record_label text,
  summary text not null,
  changed_fields text[] not null default '{}'::text[],
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  request_id text
);

create index company_activity_logs_company_time_idx
  on public.company_activity_logs(company_id, occurred_at desc);
create index company_activity_logs_company_module_idx
  on public.company_activity_logs(company_id, module_name, occurred_at desc);
create index company_activity_logs_company_actor_idx
  on public.company_activity_logs(company_id, actor_id, occurred_at desc);
create index company_activity_logs_company_action_idx
  on public.company_activity_logs(company_id, action, occurred_at desc);

alter table public.company_activity_logs enable row level security;
grant select on public.company_activity_logs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.company_activity_logs from anon, authenticated;

create policy company_activity_logs_select on public.company_activity_logs
  for select to authenticated
  using (company_id is not null and public.is_admin(company_id));

-- Return a compact text diff so changes such as "." -> "!" are explicitly recorded.
create or replace function public.company_activity_text_diff(p_before text, p_after text)
returns jsonb
language plpgsql immutable
set search_path = pg_catalog
as $fn$
declare
  before_len integer := char_length(coalesce(p_before, ''));
  after_len integer := char_length(coalesce(p_after, ''));
  prefix_len integer := 0;
  suffix_len integer := 0;
begin
  while prefix_len < least(before_len, after_len)
    and substr(p_before, prefix_len + 1, 1) = substr(p_after, prefix_len + 1, 1)
  loop
    prefix_len := prefix_len + 1;
  end loop;

  while suffix_len < before_len - prefix_len
    and suffix_len < after_len - prefix_len
    and substr(p_before, before_len - suffix_len, 1) = substr(p_after, after_len - suffix_len, 1)
  loop
    suffix_len := suffix_len + 1;
  end loop;

  return jsonb_build_object(
    'prefix', substr(coalesce(p_before, ''), 1, prefix_len),
    'removed', substr(coalesce(p_before, ''), prefix_len + 1, before_len - prefix_len - suffix_len),
    'added', substr(coalesce(p_after, ''), prefix_len + 1, after_len - prefix_len - suffix_len),
    'suffix', case when suffix_len = 0 then '' else substr(coalesce(p_after, ''), after_len - suffix_len + 1, suffix_len) end
  );
end
$fn$;

create or replace function public.company_activity_module_for_table(p_table_name text)
returns text
language sql immutable
set search_path = pg_catalog
as $fn$
  select case
    when p_table_name in ('companies','profiles','memberships','module_access','company_branches','branch_members',
      'company_departments','department_members','company_taxes','company_payment_terms',
      'company_shipping_methods','company_shipping_terms','company_salary_items','company_employees',
      'company_transaction_favorites','company_calendars','company_calendar_events') then 'Pengaturan'
    when p_table_name like 'kas_%' then 'Kas & Bank'
    when p_table_name like 'pj_%' then 'Penjualan'
    when p_table_name like 'pb_%' then 'Pembelian'
    when p_table_name like 'pd_%' then 'Persediaan'
    when p_table_name like 'ak_%' then 'Akuntansi'
    when p_table_name like 'kd_%' then 'Kendaraan'
    when p_table_name like 'rm_%' then 'Reminder'
    else 'Lainnya'
  end
$fn$;

create or replace function public.company_activity_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  before_row jsonb;
  after_row jsonb;
  row_data jsonb;
  key_name text;
  key_columns text[];
  row_key jsonb := '{}'::jsonb;
  changes_json jsonb := '[]'::jsonb;
  changed_names text[] := '{}'::text[];
  company_ids uuid[] := '{}'::uuid[];
  log_company_id uuid;
  target_user_id uuid;
  actor uuid := auth.uid();
  actor_display text;
  actor_mail text;
  action_value text;
  module_value text;
  label_value text;
  summary_value text;
  headers_text text;
  headers_json jsonb := '{}'::jsonb;
  claims_text text;
  claims_json jsonb := '{}'::jsonb;
  before_value jsonb;
  after_value jsonb;
  row_key_value text;
begin
  if TG_OP in ('UPDATE','DELETE') then before_row := to_jsonb(old); end if;
  if TG_OP in ('INSERT','UPDATE') then after_row := to_jsonb(new); end if;
  row_data := coalesce(after_row, before_row);

  if TG_OP = 'UPDATE' and before_row = after_row then
    return new;
  end if;

  action_value := TG_OP;
  module_value := public.company_activity_module_for_table(TG_TABLE_NAME);
  label_value := coalesce(
    nullif(row_data->>'nomor',''),
    nullif(row_data->>'name',''),
    nullif(row_data->>'nama',''),
    nullif(row_data->>'full_name',''),
    nullif(row_data->>'judul',''),
    nullif(row_data->>'title',''),
    nullif(row_data->>'employee_code',''),
    nullif(row_data->>'kode',''),
    nullif(row_data->>'email',''),
    nullif(row_data->>'id',''),
    TG_TABLE_NAME
  );

  key_columns := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  foreach key_name in array key_columns loop
    if key_name <> '' then
      row_key := row_key || jsonb_build_object(key_name, row_data->key_name);
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'field', diff.field_name,
        'change_type', case
          when before_row is null then 'added'
          when after_row is null then 'removed'
          when not (before_row ? diff.field_name) then 'added'
          when not (after_row ? diff.field_name) then 'removed'
          else 'changed'
        end,
        'before', diff.old_value,
        'after', diff.new_value
      ) || case
        when jsonb_typeof(diff.old_value) = 'string' and jsonb_typeof(diff.new_value) = 'string'
        then jsonb_build_object(
          'text_diff',
          public.company_activity_text_diff(diff.old_value #>> '{}', diff.new_value #>> '{}')
        )
        else '{}'::jsonb
      end
      order by diff.field_name
    ),
    '[]'::jsonb
  )
  into changes_json
  from (
    select k.key as field_name,
      before_row->k.key as old_value,
      after_row->k.key as new_value
    from jsonb_object_keys(coalesce(before_row, '{}'::jsonb) || coalesce(after_row, '{}'::jsonb)) as k(key)
    where (before_row->k.key) is distinct from (after_row->k.key)
  ) as diff;

  select coalesce(array_agg(change_item->>'field' order by change_item->>'field'), '{}'::text[])
    into changed_names
  from jsonb_array_elements(changes_json) as change_rows(change_item);

  -- Tables without company_id are mapped to the company that owns the changed entity.
  if row_data ? 'company_id' and nullif(row_data->>'company_id','') is not null then
    company_ids := array[(row_data->>'company_id')::uuid];
  elsif TG_TABLE_NAME = 'companies' then
    company_ids := array[nullif(row_data->>'id','')::uuid];
  elsif TG_TABLE_NAME = 'module_access' then
    select coalesce(array_agg(distinct m.company_id), '{}'::uuid[])
      into company_ids
    from public.memberships m
    where m.id = nullif(row_data->>'membership_id','')::uuid;
  elsif TG_TABLE_NAME = 'profiles' then
    target_user_id := nullif(row_data->>'id','')::uuid;
    select coalesce(array_agg(distinct m.company_id), '{}'::uuid[])
      into company_ids
    from public.memberships m
    where m.user_id = target_user_id;
  else
    company_ids := '{}'::uuid[];
  end if;

  select p.full_name, p.email into actor_display, actor_mail
  from public.profiles p where p.id = actor;
  actor_display := coalesce(nullif(actor_display,''), nullif(actor_mail,''), case when actor is null then 'Sistem/Proses Otomatis' else actor::text end);

  begin
    headers_text := nullif(current_setting('request.headers', true), '');
    if headers_text is not null then headers_json := headers_text::jsonb; end if;
  exception when others then headers_json := '{}'::jsonb;
  end;

  begin
    claims_text := nullif(current_setting('request.jwt.claims', true), '');
    if claims_text is not null then claims_json := claims_text::jsonb; end if;
  exception when others then claims_json := '{}'::jsonb;
  end;

  summary_value := case action_value
    when 'INSERT' then 'Membuat ' || module_value || ' · ' || TG_TABLE_NAME
    when 'UPDATE' then 'Mengubah ' || module_value || ' · ' || TG_TABLE_NAME
    when 'DELETE' then 'Menghapus ' || module_value || ' · ' || TG_TABLE_NAME
    else action_value || ' ' || TG_TABLE_NAME
  end || ' · ' || label_value;

  if coalesce(array_length(company_ids, 1), 0) > 0 then
    foreach log_company_id in array company_ids loop
      insert into public.company_activity_logs(
        company_id, actor_id, actor_name, actor_email, actor_type, action, module_name,
        table_name, record_key, record_label, summary, changed_fields, changes,
        old_data, new_data, ip_address, user_agent, request_id
      ) values (
        log_company_id, actor, actor_display, actor_mail,
        case when actor is null then 'system' else 'user' end,
        action_value, module_value, TG_TABLE_NAME, row_key, label_value,
        summary_value, changed_names, changes_json, before_row, after_row,
        nullif(headers_json->>'x-forwarded-for',''),
        nullif(headers_json->>'user-agent',''),
        coalesce(nullif(headers_json->>'x-request-id',''), nullif(claims_json->>'request_id',''))
      );
    end loop;
  end if;

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end
$fn$;

-- Attach one row-level audit trigger to every company-scoped public table with a primary key.
do $install$
declare
  tbl record;
  pk_cols text;
  trigger_name text;
begin
  for tbl in
    select t.table_name
    from information_schema.tables t
    join information_schema.columns c
      on c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'company_id'
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and t.table_name <> 'company_activity_logs'
  loop
    select string_agg(a.attname, ',' order by k.ord)
      into pk_cols
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    where i.indrelid = format('public.%I', tbl.table_name)::regclass
      and i.indisprimary and k.ord <= i.indnkeyatts;

    if pk_cols is not null then
      trigger_name := left('audit_change_' || tbl.table_name, 63);
      execute format('drop trigger if exists %I on public.%I', trigger_name, tbl.table_name);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.company_activity_audit_row(%L)',
        trigger_name, tbl.table_name, pk_cols
      );
    end if;
  end loop;
end
$install$;

-- Include global identity and permission changes that do not contain company_id.
do $install_global$
declare
  tbl record;
  pk_cols text;
  trigger_name text;
begin
  for tbl in
    select unnest(array['companies','profiles','module_access']) as table_name
  loop
    select string_agg(a.attname, ',' order by k.ord)
      into pk_cols
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    where i.indrelid = format('public.%I', tbl.table_name)::regclass
      and i.indisprimary and k.ord <= i.indnkeyatts;

    if pk_cols is not null then
      trigger_name := left('audit_change_' || tbl.table_name, 63);
      execute format('drop trigger if exists %I on public.%I', trigger_name, tbl.table_name);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.company_activity_audit_row(%L)',
        trigger_name, tbl.table_name, pk_cols
      );
    end if;
  end loop;
end
$install_global$;

comment on table public.company_activity_logs is
'Append-only audit trail for changes to public company data. UPDATE entries retain exact old/new values for each changed column, including punctuation-only changes.';
