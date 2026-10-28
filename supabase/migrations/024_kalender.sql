-- KALENDER PERUSAHAAN, EVENT, HAK AKSES, DAN PENGINGAT
-- Prasyarat: tabel perusahaan, memberships, company_branches, serta company_employees dari migrasi sebelumnya.

create table public.company_calendars (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  calendar_type text not null default 'Kegiatan',
  name text not null check (length(trim(name)) > 0),
  description text,
  access_all boolean not null default false,
  access_user_ids uuid[] not null default '{}'::uuid[],
  access_branch_ids uuid[] not null default '{}'::uuid[],
  event_edit_all boolean not null default false,
  event_edit_user_ids uuid[] not null default '{}'::uuid[],
  event_edit_branch_ids uuid[] not null default '{}'::uuid[],
  admin_all boolean not null default false,
  admin_user_ids uuid[] not null default '{}'::uuid[],
  admin_branch_ids uuid[] not null default '{}'::uuid[],
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create index company_calendars_company_name_idx on public.company_calendars(company_id, lower(name));

-- A user receives a branch-scoped right when their active employee record uses the
-- same email address as the signed-in account and belongs to one of the selected branches.
create or replace function public.company_calendar_user_in_branch_ids(
  p_company_id uuid, p_user_id uuid, p_branch_ids uuid[]
) returns boolean
language sql stable security definer set search_path = public
as $fn$
  select p_user_id = auth.uid() and exists (
    select 1
    from public.company_employees e
    join auth.users u on lower(trim(u.email)) = lower(trim(e.email))
    where e.company_id = p_company_id
      and e.active = true
      and e.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and u.id = p_user_id
  );
$fn$;
grant execute on function public.company_calendar_user_in_branch_ids(uuid, uuid, uuid[]) to authenticated;

create or replace function public.company_calendar_current_user_branch_ids(p_company_id uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $fn$
  select coalesce(array_agg(distinct e.branch_id) filter (where e.branch_id is not null), '{}'::uuid[])
  from public.company_employees e
  join auth.users u on lower(trim(u.email)) = lower(trim(e.email))
  where e.company_id = p_company_id and e.active = true
    and e.branch_id is not null and u.id = auth.uid()
    and public.is_member(p_company_id);
$fn$;
grant execute on function public.company_calendar_current_user_branch_ids(uuid) to authenticated;

alter table public.company_calendars enable row level security;
grant select, insert, update, delete on public.company_calendars to authenticated;

create policy company_calendars_select on public.company_calendars for select using (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or access_all or auth.uid() = any(access_user_ids)
    or public.company_calendar_user_in_branch_ids(company_id, auth.uid(), access_branch_ids)
    or event_edit_all or auth.uid() = any(event_edit_user_ids)
    or public.company_calendar_user_in_branch_ids(company_id, auth.uid(), event_edit_branch_ids)
    or admin_all or auth.uid() = any(admin_user_ids)
    or public.company_calendar_user_in_branch_ids(company_id, auth.uid(), admin_branch_ids)
  )
);
create policy company_calendars_insert on public.company_calendars for insert with check (
  public.is_member(company_id) and created_by = auth.uid()
);
create policy company_calendars_update on public.company_calendars for update using (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or admin_all or auth.uid() = any(admin_user_ids)
    or public.company_calendar_user_in_branch_ids(company_id, auth.uid(), admin_branch_ids)
  )
) with check (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or admin_all or auth.uid() = any(admin_user_ids)
    or public.company_calendar_user_in_branch_ids(company_id, auth.uid(), admin_branch_ids)
  )
);
create policy company_calendars_delete on public.company_calendars for delete using (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or admin_all or auth.uid() = any(admin_user_ids)
    or public.company_calendar_user_in_branch_ids(company_id, auth.uid(), admin_branch_ids)
  )
);

create table public.company_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  calendar_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  description text,
  start_at timestamptz not null,
  due_at timestamptz,
  reminder_at timestamptz,
  repeat_rule text not null default 'none' check (repeat_rule in ('none','daily','weekly','monthly','yearly')),
  attachment_links jsonb not null default '[]'::jsonb check (jsonb_typeof(attachment_links) = 'array'),
  reminder_channels text[] not null default '{}'::text[],
  reminder_recipients jsonb not null default '{}'::jsonb check (jsonb_typeof(reminder_recipients) = 'object'),
  reminder_status text not null default 'pending' check (reminder_status in ('pending','sending','sent','failed','not_configured')),
  reminder_attempts integer not null default 0 check (reminder_attempts >= 0),
  reminder_last_error text,
  reminder_sent_at timestamptz,
  repeat_processed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (calendar_id, company_id)
    references public.company_calendars(id, company_id) on delete cascade,
  check (due_at is null or due_at >= start_at),
  check (reminder_at is null or reminder_at <= start_at)
);

create index company_calendar_events_calendar_start_idx on public.company_calendar_events(calendar_id, start_at);
create index company_calendar_events_reminder_idx on public.company_calendar_events(reminder_at)
  where reminder_at is not null and reminder_status = 'pending';
create index company_calendar_events_repeat_idx on public.company_calendar_events(start_at)
  where repeat_rule <> 'none' and repeat_processed_at is null;

alter table public.company_calendar_events enable row level security;
grant select, insert, update, delete on public.company_calendar_events to authenticated;

create policy company_calendar_events_select on public.company_calendar_events for select using (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or exists (
      select 1 from public.company_calendars c
      where c.id = company_calendar_events.calendar_id
        and c.company_id = company_calendar_events.company_id
        and (
          c.access_all or auth.uid() = any(c.access_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.access_branch_ids)
          or c.event_edit_all or auth.uid() = any(c.event_edit_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.event_edit_branch_ids)
          or c.created_by = auth.uid()
          or c.admin_all or auth.uid() = any(c.admin_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.admin_branch_ids)
        )
    )
  )
);
create policy company_calendar_events_insert on public.company_calendar_events for insert with check (
  public.is_member(company_id)
  and created_by = auth.uid()
  and exists (
    select 1 from public.company_calendars c
    where c.id = company_calendar_events.calendar_id
      and c.company_id = company_calendar_events.company_id
      and (
        public.is_admin(company_calendar_events.company_id)
        or c.created_by = auth.uid()
        or c.event_edit_all or auth.uid() = any(c.event_edit_user_ids)
        or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.event_edit_branch_ids)
        or c.admin_all or auth.uid() = any(c.admin_user_ids)
        or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.admin_branch_ids)
      )
  )
);
create policy company_calendar_events_update on public.company_calendar_events for update using (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or exists (
      select 1 from public.company_calendars c
      where c.id = company_calendar_events.calendar_id
        and c.company_id = company_calendar_events.company_id
        and (
          c.created_by = auth.uid()
          or c.event_edit_all or auth.uid() = any(c.event_edit_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.event_edit_branch_ids)
          or c.admin_all or auth.uid() = any(c.admin_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.admin_branch_ids)
        )
    )
  )
) with check (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or exists (
      select 1 from public.company_calendars c
      where c.id = company_calendar_events.calendar_id
        and c.company_id = company_calendar_events.company_id
        and (
          c.created_by = auth.uid()
          or c.event_edit_all or auth.uid() = any(c.event_edit_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.event_edit_branch_ids)
          or c.admin_all or auth.uid() = any(c.admin_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.admin_branch_ids)
        )
    )
  )
);
create policy company_calendar_events_delete on public.company_calendar_events for delete using (
  public.is_member(company_id) and (
    public.is_admin(company_id)
    or created_by = auth.uid()
    or exists (
      select 1 from public.company_calendars c
      where c.id = company_calendar_events.calendar_id
        and c.company_id = company_calendar_events.company_id
        and (
          c.created_by = auth.uid()
          or c.event_edit_all or auth.uid() = any(c.event_edit_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.event_edit_branch_ids)
          or c.admin_all or auth.uid() = any(c.admin_user_ids)
          or public.company_calendar_user_in_branch_ids(c.company_id, auth.uid(), c.admin_branch_ids)
        )
    )
  )
);

comment on table public.company_calendar_events is
'Pengingat hanya dikirim ketika dispatcher terjadwal dan kredensial penyedia pesan telah dikonfigurasi.';
