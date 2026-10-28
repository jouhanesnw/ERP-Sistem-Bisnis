'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2, Clock3, Repeat2,
  Link2, Bell, X, Pencil, Trash2, Check, Loader2, CalendarRange,
} from 'lucide-react'

type View = 'year' | 'month' | 'week' | 'day'
type Member = { userId: string; name: string; role: string }
type Branch = { id: string; name: string }
type CalendarRow = {
  id: string; company_id: string; calendar_type: string; name: string; description: string | null
  access_all: boolean; access_user_ids: string[]; event_edit_all: boolean; event_edit_user_ids: string[]
  admin_all: boolean; admin_user_ids: string[]; created_by: string; created_at: string
}
type CalendarEvent = {
  id: string; company_id: string; calendar_id: string; title: string; description: string | null
  start_at: string; due_at: string | null; reminder_at: string | null; repeat_rule: string
  attachment_links: { url: string; label?: string }[]; reminder_channels: string[]
  reminder_recipients: { email?: string; whatsapp?: string; telegram_chat_id?: string }
  reminder_status: string; created_by: string
}
const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'gmail', label: 'Gmail / Email' },
]
const REPEAT_OPTIONS = [
  { value: 'none', label: 'Tidak berulang' },
  { value: 'daily', label: 'Setiap hari' },
  { value: 'weekly', label: 'Setiap minggu' },
  { value: 'monthly', label: 'Setiap bulan' },
  { value: 'yearly', label: 'Setiap tahun' },
]
const SETTINGS_TABS = [
  { id: 'setup', label: 'Pengaturan' },
  { id: 'access', label: 'Hak Mengakses' },
  { id: 'event', label: 'Hak Tambah/Ubah Event' },
  { id: 'admin', label: 'Hak Administrasi' },
] as const
type SettingsTab = typeof SETTINGS_TABS[number]['id']

function localInput(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}
function fmtDate(date: Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('id-ID', options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
function startOfDay(date: Date) { const result = new Date(date); result.setHours(0, 0, 0, 0); return result }
function addDays(date: Date, amount: number) { const result = new Date(date); result.setDate(result.getDate() + amount); return result }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function startOfWeek(date: Date) { const d = startOfDay(date); d.setDate(d.getDate() - d.getDay()); return d }
function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }
function safeDate(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? new Date() : d }

export default function CalendarManager({
  companyId, currentUserId, initialCalendars, initialEvents, members, branches, initialError,
}: {
  companyId: string
  currentUserId: string
  initialCalendars: CalendarRow[]
  initialEvents: CalendarEvent[]
  members: Member[]
  branches: Branch[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [calendars, setCalendars] = useState(initialCalendars)
  const [events, setEvents] = useState(initialEvents)
  const [calendarId, setCalendarId] = useState(initialCalendars[0]?.id ?? '')
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [eventOpen, setEventOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editingCalendar, setEditingCalendar] = useState<CalendarRow | null>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('setup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)

  const currentCalendar = calendars.find((item) => item.id === calendarId) ?? calendars[0] ?? null
  const visibleEvents = events.filter((item) => item.calendar_id === currentCalendar?.id)
    .sort((a, b) => safeDate(a.start_at).getTime() - safeDate(b.start_at).getTime())
  const isAdmin = !!currentCalendar && (currentCalendar.created_by === currentUserId || currentCalendar.admin_all || currentCalendar.admin_user_ids.includes(currentUserId))
  const canEditEvents = !!currentCalendar && (isAdmin || currentCalendar.event_edit_all || currentCalendar.event_edit_user_ids.includes(currentUserId))
  const selectedEvents = (date: Date) => visibleEvents.filter((event) => sameDay(safeDate(event.start_at), date))
  const title = view === 'year' ? String(cursor.getFullYear())
    : view === 'month' ? fmtDate(cursor, { month: 'long', year: 'numeric' })
      : view === 'week' ? `Minggu ${fmtDate(startOfWeek(cursor))} – ${fmtDate(addDays(startOfWeek(cursor), 6))}`
        : fmtDate(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  function move(amount: number) {
    setCursor((current) => {
      const next = new Date(current)
      if (view === 'year') next.setFullYear(next.getFullYear() + amount)
      else if (view === 'month') next.setMonth(next.getMonth() + amount)
      else if (view === 'week') next.setDate(next.getDate() + amount * 7)
      else next.setDate(next.getDate() + amount)
      return next
    })
  }
  function openNewEvent(date = selectedDay) {
    if (!currentCalendar || !canEditEvents) return
    setEditingEvent(null); setSelectedDay(date); setEventOpen(true); setNotice(null); setError(null)
  }
  function openEditEvent(item: CalendarEvent) {
    setEditingEvent(item); setSelectedDay(safeDate(item.start_at)); setEventOpen(true); setNotice(null); setError(null)
  }
  async function deleteEvent(item: CalendarEvent) {
    if (!confirm(`Hapus event "${item.title}"?`)) return
    setBusy(true); setError(null)
    const { error: deleteError } = await sb.from('company_calendar_events').delete().eq('id', item.id).eq('company_id', companyId)
    setBusy(false)
    if (deleteError) { setError(deleteError.message); return }
    setEvents((all) => all.filter((row) => row.id !== item.id))
    setNotice('Event dihapus.'); router.refresh()
  }
  async function saveCalendar(form: {
    calendar_type: string; name: string; description: string; access_all: boolean; access_user_ids: string[]
    event_edit_all: boolean; event_edit_user_ids: string[]; admin_all: boolean; admin_user_ids: string[]
  }) {
    setBusy(true); setError(null); setNotice(null)
    const payload = {
      company_id: companyId, ...form,
      created_by: editingCalendar?.created_by ?? currentUserId,
    }
    const query = editingCalendar
      ? await sb.from('company_calendars').update(payload).eq('id', editingCalendar.id).eq('company_id', companyId)
        .select('id, company_id, calendar_type, name, description, access_all, access_user_ids, event_edit_all, event_edit_user_ids, admin_all, admin_user_ids, created_by, created_at').single()
      : await sb.from('company_calendars').insert(payload)
        .select('id, company_id, calendar_type, name, description, access_all, access_user_ids, event_edit_all, event_edit_user_ids, admin_all, admin_user_ids, created_by, created_at').single()
    setBusy(false)
    if (query.error) { setError(query.error.message); return }
    const row = query.data as CalendarRow
    setCalendars((all) => editingCalendar ? all.map((item) => item.id === row.id ? row : item) : [...all, row].sort((a, b) => a.name.localeCompare(b.name, 'id')))
    setCalendarId(row.id); setSettingsOpen(false); setEditingCalendar(null)
    setNotice('Pengaturan kalender tersimpan.'); router.refresh()
  }
  async function deleteCalendar() {
    if (!currentCalendar || !isAdmin) return
    if (!confirm(`Hapus kalender "${currentCalendar.name}" beserta semua event di dalamnya?`)) return
    setBusy(true); setError(null)
    const { error: deleteError } = await sb.from('company_calendars').delete().eq('id', currentCalendar.id).eq('company_id', companyId)
    setBusy(false)
    if (deleteError) { setError(deleteError.message); return }
    const next = calendars.filter((row) => row.id !== currentCalendar.id)
    setCalendars(next); setEvents((all) => all.filter((row) => row.calendar_id !== currentCalendar.id))
    setCalendarId(next[0]?.id ?? ''); setNotice('Kalender dihapus.'); router.refresh()
  }
  async function saveEvent(form: {
    title: string; description: string; start_at: string; due_at: string; reminder_at: string; repeat_rule: string
    attachment_links: { url: string; label?: string }[]; reminder_channels: string[]
    reminder_recipients: { email?: string; whatsapp?: string; telegram_chat_id?: string }
  }) {
    if (!currentCalendar) return
    setBusy(true); setError(null); setNotice(null)
    const payload = {
      company_id: companyId, calendar_id: currentCalendar.id, title: form.title.trim(),
      description: form.description.trim() || null, start_at: new Date(form.start_at).toISOString(),
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      reminder_at: form.reminder_at ? new Date(form.reminder_at).toISOString() : null,
      repeat_rule: form.repeat_rule, attachment_links: form.attachment_links,
      reminder_channels: form.reminder_channels, reminder_recipients: form.reminder_recipients,
      reminder_status: form.reminder_channels.length && form.reminder_at ? 'pending' : 'not_configured',
      reminder_sent_at: null, created_by: editingEvent?.created_by ?? currentUserId,
    }
    const query = editingEvent
      ? await sb.from('company_calendar_events').update(payload).eq('id', editingEvent.id).eq('company_id', companyId)
        .select('id, company_id, calendar_id, title, description, start_at, due_at, reminder_at, repeat_rule, attachment_links, reminder_channels, reminder_recipients, reminder_status, created_by').single()
      : await sb.from('company_calendar_events').insert(payload)
        .select('id, company_id, calendar_id, title, description, start_at, due_at, reminder_at, repeat_rule, attachment_links, reminder_channels, reminder_recipients, reminder_status, created_by').single()
    setBusy(false)
    if (query.error) { setError(query.error.message); return }
    const saved = query.data as CalendarEvent
    setEvents((all) => editingEvent ? all.map((row) => row.id === saved.id ? saved : row) : [...all, saved])
    setEventOpen(false); setEditingEvent(null); setNotice('Event tersimpan. Pengiriman pengingat memerlukan konfigurasi layanan dan proses terjadwal.')
    router.refresh()
  }

  const monthCells = useMemo(() => {
    const first = startOfWeek(monthStart(cursor))
    return Array.from({ length: 42 }, (_, index) => addDays(first, index))
  }, [cursor])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor])
  const years = useMemo(() => Array.from({ length: 12 }, (_, index) => new Date(cursor.getFullYear(), index, 1)), [cursor])

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><CalendarDays className="text-brand" size={25} /><h1 className="text-2xl font-semibold">Kalender</h1></div>
          <p className="mt-1 max-w-3xl text-sm text-ink/60">Kelola kegiatan, tenggat, pengingat, dan hak akses kalender dalam satu tempat.</p>
        </div>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          <select className="input min-w-[190px] flex-1 xl:flex-none" value={currentCalendar?.id ?? ''} onChange={(e) => setCalendarId(e.target.value)} aria-label="Pilih kalender">
            {calendars.length ? calendars.map((row) => <option value={row.id} key={row.id}>{row.name}</option>) : <option value="">Belum ada kalender</option>}
          </select>
          <button className="btn" type="button" onClick={() => { setEditingCalendar(null); setSettingsTab('setup'); setSettingsOpen(true); setError(null) }}><Plus size={16} /> Kalender</button>
          {currentCalendar && <button className="btn" type="button" onClick={() => { setEditingCalendar(currentCalendar); setSettingsTab('setup'); setSettingsOpen(true); setError(null) }}><Settings2 size={16} /> Pengaturan</button>}
          <button className="btn-primary" type="button" disabled={!currentCalendar || !canEditEvents} onClick={() => openNewEvent(cursor)}><Plus size={16} /> Tambah Event</button>
        </div>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!currentCalendar ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CalendarRange size={36} className="text-ink/35" /><h2 className="text-lg font-semibold">Mulai dengan membuat kalender</h2>
          <p className="max-w-lg text-sm text-ink/60">Buat kalender seperti Kegiatan, Proyek, atau Pengingat. Kamu bisa menentukan siapa yang dapat melihat, mengubah event, dan mengelola kalender.</p>
          <button className="btn-primary" onClick={() => { setEditingCalendar(null); setSettingsTab('setup'); setSettingsOpen(true) }}><Plus size={16} /> Buat Kalender</button>
        </div>
      ) : (
        <>
          <div className="card p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button className="btn-icon" onClick={() => move(-1)} aria-label="Periode sebelumnya"><ChevronLeft size={18} /></button>
                <button className="btn" onClick={() => { setCursor(new Date()); setSelectedDay(new Date()) }}>Hari ini</button>
                <button className="btn-icon" onClick={() => move(1)} aria-label="Periode berikutnya"><ChevronRight size={18} /></button>
              </div>
              <h2 className="min-w-0 flex-1 text-lg font-semibold capitalize">{title}</h2>
              <div className="flex rounded-lg border border-line bg-canvas p-1">
                {(['year', 'month', 'week', 'day'] as View[]).map((item) => <button key={item} className={`rounded-md px-3 py-1.5 text-sm ${view === item ? 'bg-white font-semibold text-brand shadow-sm' : 'text-ink/65 hover:text-ink'}`} onClick={() => setView(item)}>{({ year: 'Tahun', month: 'Bulan', week: 'Minggu', day: 'Hari' } as Record<View, string>)[item]}</button>)}
              </div>
            </div>
            <div className="mt-4">
              {view === 'month' && <div className="grid grid-cols-7 border-l border-t border-line">
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day) => <div key={day} className="border-b border-r border-line bg-canvas py-2 text-center text-xs font-semibold text-ink/60">{day}</div>)}
                {monthCells.map((date) => {
                  const dayEvents = selectedEvents(date)
                  const inMonth = date.getMonth() === cursor.getMonth()
                  return <button key={date.toISOString()} onClick={() => { setSelectedDay(date); setCursor(date); if (canEditEvents) setEventOpen(true); setEditingEvent(null) }} className={`min-h-[92px] border-b border-r border-line p-1.5 text-left transition hover:bg-brand-soft/50 sm:min-h-[115px] sm:p-2 ${inMonth ? 'bg-white' : 'bg-canvas/50'} ${sameDay(date, new Date()) ? 'ring-2 ring-inset ring-brand' : ''}`}>
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${inMonth ? 'text-ink' : 'text-ink/30'} ${sameDay(date, new Date()) ? 'bg-brand text-white' : ''}`}>{date.getDate()}</span>
                    <div className="mt-1 space-y-1">{dayEvents.slice(0, 3).map((item) => <span key={item.id} onClick={(e) => { e.stopPropagation(); openEditEvent(item) }} className="block truncate rounded bg-brand-soft px-1 py-0.5 text-left text-[10px] text-brand-dark sm:text-xs">{item.title}</span>)}{dayEvents.length > 3 && <span className="block text-[10px] text-ink/50">+{dayEvents.length - 3} lainnya</span>}</div>
                  </button>
                })}
              </div>}
              {view === 'week' && <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                {weekDays.map((date) => <div key={date.toISOString()} className={`min-h-40 rounded-lg border p-2 ${sameDay(date, new Date()) ? 'border-brand bg-brand-soft/20' : 'border-line'}`}>
                  <button className="mb-2 flex w-full items-center justify-between text-left" onClick={() => { setSelectedDay(date); setCursor(date); setView('day') }}><span className="text-xs text-ink/55">{fmtDate(date, { weekday: 'short' })}</span><span className="text-sm font-semibold">{date.getDate()}</span></button>
                  <div className="space-y-1">{selectedEvents(date).map((item) => <EventPill key={item.id} item={item} onClick={() => openEditEvent(item)} />)}</div>
                  {canEditEvents && <button className="mt-2 w-full rounded-md border border-dashed border-line py-1 text-xs text-ink/50 hover:text-brand" onClick={() => openNewEvent(date)}>+ Tambah</button>}
                </div>)}
              </div>}
              {view === 'day' && <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-canvas p-3"><div><p className="font-semibold">{fmtDate(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><p className="text-sm text-ink/55">{selectedEvents(cursor).length} event</p></div>{canEditEvents && <button className="btn-primary" onClick={() => openNewEvent(cursor)}><Plus size={15} /> Tambah Event</button>}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const entries = selectedEvents(cursor).filter((item) => safeDate(item.start_at).getHours() === hour)
                  return <div key={hour} className="grid min-h-11 grid-cols-[55px_1fr] border-b border-line last:border-0"><span className="pt-2 text-xs text-ink/45">{String(hour).padStart(2, '0')}:00</span><div className="min-w-0 space-y-1 py-1">{entries.map((item) => <EventPill key={item.id} item={item} onClick={() => openEditEvent(item)} />)}</div></div>
                })}
              </div>}
              {view === 'year' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {years.map((month) => {
                  const first = startOfWeek(monthStart(month))
                  const miniDays = Array.from({ length: 42 }, (_, i) => addDays(first, i))
                  const count = visibleEvents.filter((item) => safeDate(item.start_at).getFullYear() === month.getFullYear() && safeDate(item.start_at).getMonth() === month.getMonth()).length
                  return <div key={month.toISOString()} className="rounded-lg border border-line p-3">
                    <button className="mb-2 flex w-full items-center justify-between font-semibold capitalize hover:text-brand" onClick={() => { setCursor(month); setView('month') }}><span>{fmtDate(month, { month: 'long' })}</span><span className="text-xs font-normal text-ink/50">{count} event</span></button>
                    <div className="grid grid-cols-7 text-center text-[10px] text-ink/45">{['M', 'S', 'S', 'R', 'K', 'J', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
                    <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">{miniDays.map((date, i) => <button key={i} onClick={() => { setCursor(date); setSelectedDay(date); setView('day') }} className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${date.getMonth() === month.getMonth() ? 'text-ink' : 'text-ink/20'} ${selectedEvents(date).length ? 'bg-brand-soft font-semibold text-brand-dark' : ''} ${sameDay(date, new Date()) ? 'ring-1 ring-brand' : ''}`}>{date.getDate()}</button>)}</div>
                  </div>
                })}
              </div>}
            </div>
          </div>
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
              <div><h3 className="font-semibold">Daftar Event</h3><p className="mt-1 text-xs text-ink/55">{currentCalendar.name} · {visibleEvents.length} event</p></div>
              {currentCalendar.description && <p className="max-w-xl text-sm text-ink/60">{currentCalendar.description}</p>}
            </div>
            {visibleEvents.length ? <div className="divide-y divide-line">{visibleEvents.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-soft text-brand-dark"><span className="text-[10px] uppercase">{fmtDate(safeDate(item.start_at), { month: 'short' })}</span><span className="text-lg font-semibold leading-none">{safeDate(item.start_at).getDate()}</span></div>
              <div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="mt-0.5 text-xs text-ink/55">{fmtDate(safeDate(item.start_at), { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })} · {fmtDate(safeDate(item.start_at), { hour: '2-digit', minute: '2-digit' })}</p>{item.description && <p className="mt-1 line-clamp-2 text-sm text-ink/60">{item.description}</p>}<div className="mt-1 flex flex-wrap gap-2 text-xs text-ink/50">{item.due_at && <span>Jatuh tempo: {fmtDate(safeDate(item.due_at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}{item.reminder_at && <span className="inline-flex items-center gap-1"><Bell size={12} /> Pengingat: {fmtDate(safeDate(item.reminder_at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}{item.repeat_rule !== 'none' && <span className="inline-flex items-center gap-1"><Repeat2 size={12} /> {REPEAT_OPTIONS.find((x) => x.value === item.repeat_rule)?.label}</span>}</div></div>
              <div className="flex items-center gap-1">{item.attachment_links?.length > 0 && <a className="btn-icon" href={item.attachment_links[0].url} target="_blank" rel="noreferrer" aria-label="Buka lampiran atau link"><Link2 size={16} /></a>}{canEditEvents && <button className="btn-icon" onClick={() => openEditEvent(item)} aria-label="Ubah event"><Pencil size={16} /></button>}{canEditEvents && <button className="btn-icon text-red-600" onClick={() => deleteEvent(item)} aria-label="Hapus event"><Trash2 size={16} /></button>}</div>
            </article>)}</div> : <div className="p-8 text-center text-sm text-ink/55">Belum ada event di kalender ini. Tambahkan kegiatan atau pengingat pertama.</div>}
          </section>
        </>
      )}
      {eventOpen && currentCalendar && <EventModal
        initial={editingEvent} selectedDay={selectedDay} busy={busy} onClose={() => { setEventOpen(false); setEditingEvent(null) }} onSave={saveEvent}
      />}
      {settingsOpen && <CalendarSettingsModal
        initial={editingCalendar} members={members} branches={branches} currentUserId={currentUserId}
        busy={busy} tab={settingsTab} setTab={setSettingsTab} onClose={() => { setSettingsOpen(false); setEditingCalendar(null) }} onSave={saveCalendar}
        canDelete={!!editingCalendar && (editingCalendar.created_by === currentUserId || editingCalendar.admin_all || editingCalendar.admin_user_ids.includes(currentUserId))}
        onDelete={deleteCalendar}
      />}
      {busy && <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg"><Loader2 size={15} className="animate-spin" /> Menyimpan...</div>}
    </div>
  )
}

function EventPill({ item, onClick }: { item: CalendarEvent; onClick: () => void }) {
  return <button onClick={(e) => { e.stopPropagation(); onClick() }} className="block w-full truncate rounded-md border-l-2 border-brand bg-brand-soft px-2 py-1 text-left text-xs text-brand-dark hover:brightness-95"><span className="font-medium">{fmtDate(safeDate(item.start_at), { hour: '2-digit', minute: '2-digit' })}</span> {item.title}</button>
}

function EventModal({ initial, selectedDay, busy, onClose, onSave }: {
  initial: CalendarEvent | null; selectedDay: Date; busy: boolean; onClose: () => void
  onSave: (payload: { title: string; description: string; start_at: string; due_at: string; reminder_at: string; repeat_rule: string; attachment_links: { url: string; label?: string }[]; reminder_channels: string[]; reminder_recipients: { email?: string; whatsapp?: string; telegram_chat_id?: string } }) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const defaultStart = new Date(selectedDay); defaultStart.setHours(9, 0, 0, 0)
  const [startAt, setStartAt] = useState(initial ? localInput(safeDate(initial.start_at)) : localInput(defaultStart))
  const [dueEnabled, setDueEnabled] = useState(!!initial?.due_at)
  const [dueAt, setDueAt] = useState(initial?.due_at ? localInput(safeDate(initial.due_at)) : '')
  const [reminderEnabled, setReminderEnabled] = useState(!!initial?.reminder_at)
  const [reminderAt, setReminderAt] = useState(initial?.reminder_at ? localInput(safeDate(initial.reminder_at)) : '')
  const [repeatRule, setRepeatRule] = useState(initial?.repeat_rule ?? 'none')
  const [channels, setChannels] = useState<string[]>(initial?.reminder_channels ?? [])
  const [email, setEmail] = useState(initial?.reminder_recipients?.email ?? '')
  const [whatsapp, setWhatsapp] = useState(initial?.reminder_recipients?.whatsapp ?? '')
  const [telegram, setTelegram] = useState(initial?.reminder_recipients?.telegram_chat_id ?? '')
  const [links, setLinks] = useState((initial?.attachment_links ?? []).map((item) => item.url).join('\n'))
  const [timePreset, setTimePreset] = useState('pick')
  const [duePreset, setDuePreset] = useState('pick')
  const [formError, setFormError] = useState<string | null>(null)

  function setQuickTime(kind: 'reminder' | 'due', mode: string) {
    const now = new Date()
    let target = new Date(now)
    if (mode === 'later') { target.setHours(target.getHours() + 1, 0, 0, 0); if (target.getHours() < 9) target.setHours(9, 0, 0, 0) }
    if (mode === 'tomorrow') { target = addDays(startOfDay(now), 1); target.setHours(9, 0, 0, 0) }
    if (mode === 'next_week') { target = addDays(startOfDay(now), 7); target.setHours(9, 0, 0, 0) }
    if (mode === 'pick') { if (kind === 'reminder') target = reminderAt ? safeDate(reminderAt) : defaultStart; else target = dueAt ? safeDate(dueAt) : safeDate(startAt) }
    if (kind === 'reminder') { setReminderEnabled(true); setTimePreset(mode); setReminderAt(localInput(target)) }
    else { setDueEnabled(true); setDuePreset(mode); setDueAt(localInput(target)) }
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setFormError(null)
    if (!title.trim()) { setFormError('Nama event wajib diisi.'); return }
    if (!startAt) { setFormError('Tanggal dan jam event wajib diisi.'); return }
    if (dueEnabled && dueAt && new Date(dueAt) < new Date(startAt)) { setFormError('Tenggat tidak boleh lebih awal daripada waktu event.'); return }
    if (reminderEnabled && reminderAt && new Date(reminderAt) > new Date(startAt)) { setFormError('Waktu pengingat harus sama atau sebelum waktu event.'); return }
    if (channels.includes('gmail') && !email.trim()) { setFormError('Isi email penerima untuk pengingat Gmail.'); return }
    if (channels.includes('whatsapp') && !whatsapp.trim()) { setFormError('Isi nomor WhatsApp penerima. Gunakan kode negara, misalnya +62.'); return }
    if (channels.includes('telegram') && !telegram.trim()) { setFormError('Isi Telegram Chat ID penerima.'); return }
    const attachment_links = links.split('\n').map((line) => line.trim()).filter(Boolean).map((url) => ({ url, label: url }))
    onSave({
      title, description, start_at: startAt, due_at: dueEnabled ? dueAt : '', reminder_at: reminderEnabled ? reminderAt : '',
      repeat_rule: repeatRule, attachment_links, reminder_channels: channels,
      reminder_recipients: { email: email.trim() || undefined, whatsapp: whatsapp.trim() || undefined, telegram_chat_id: telegram.trim() || undefined },
    })
  }
  const quickOptions = [{ value: 'later', label: 'Later today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'next_week', label: 'Next Week' }, { value: 'pick', label: 'Pick a date' }]
  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <form onSubmit={submit} className="my-auto max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#102f59] px-5 py-4 text-white"><div><h2 className="text-lg font-semibold">{initial ? 'Ubah Event' : 'Tambah Event Kalender'}</h2><p className="text-xs text-white/70">Isi kegiatan, tanggal, tenggat, dan pengingat</p></div><button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Tutup"><X size={21} /></button></div>
      <div className="space-y-5 p-4 sm:p-6">
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium sm:col-span-2">Nama event / kegiatan <span className="text-red-600">*</span><input autoFocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Rapat evaluasi mingguan" required /></label>
          <label className="space-y-1 text-sm font-medium sm:col-span-2">Keterangan / deskripsi<textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tujuan kegiatan, agenda, catatan..." /></label>
          <label className="space-y-1 text-sm font-medium sm:col-span-2">Tanggal dan jam event <span className="text-red-600">*</span><input type="datetime-local" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} required /></label>
        </div>
        <section className="rounded-xl border border-line p-4">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} /> <Bell size={17} /> Remind me at</label>
          {reminderEnabled && <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">{quickOptions.map((item) => <button key={item.value} type="button" onClick={() => setQuickTime('reminder', item.value)} className={`rounded-full border px-3 py-1.5 text-sm ${timePreset === item.value ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line hover:bg-canvas'}`}>{item.label}</button>)}</div>
            <label className="block space-y-1 text-sm">Tanggal dan jam pengingat<input type="datetime-local" className="input" value={reminderAt} onChange={(e) => { setReminderAt(e.target.value); setTimePreset('pick') }} required /></label>
            <p className="text-xs text-ink/55">Pilihan cepat mengisi jam default pukul 09.00 (Later today mengisi sekitar satu jam dari sekarang); waktu bisa kamu ubah sendiri.</p>
          </div>}
        </section>
        <section className="rounded-xl border border-line p-4">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={dueEnabled} onChange={(e) => setDueEnabled(e.target.checked)} /> <Clock3 size={17} /> Add due date</label>
          {dueEnabled && <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">{quickOptions.map((item) => <button key={item.value} type="button" onClick={() => setQuickTime('due', item.value)} className={`rounded-full border px-3 py-1.5 text-sm ${duePreset === item.value ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line hover:bg-canvas'}`}>{item.label}</button>)}</div>
            <label className="block space-y-1 text-sm">Tanggal dan jam tenggat<input type="datetime-local" className="input" value={dueAt} onChange={(e) => { setDueAt(e.target.value); setDuePreset('pick') }} required /></label>
          </div>}
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Repeat<select className="input" value={repeatRule} onChange={(e) => setRepeatRule(e.target.value)}>{REPEAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="block text-xs font-normal text-ink/50">Pilihan ini menyimpan pola pengulangan; pembuatan event berikutnya otomatis memerlukan scheduler lanjutan.</span></label>
          <label className="space-y-1 text-sm font-medium">Add file/link<textarea className="input min-h-24" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Tempel URL dokumen/file, satu URL tiap baris" /><span className="block text-xs font-normal text-ink/50">Versi ini menyimpan tautan; unggah file langsung memerlukan penyimpanan berkas yang dikonfigurasi.</span></label>
        </section>
        <section className="rounded-xl border border-line p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Bell size={17} /> Kirim pengingat ke penerima</h3>
          <p className="mt-1 text-xs text-ink/55">Pilih kanal dan isikan tujuan. Pesan belum terkirim sampai integrasi provider dan scheduler dikonfigurasi.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{CHANNELS.map((channel) => <label key={channel.id} className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm"><input type="checkbox" checked={channels.includes(channel.id)} onChange={(e) => setChannels((current) => e.target.checked ? [...current, channel.id] : current.filter((x) => x !== channel.id))} />{channel.label}</label>)}</div>
          {channels.includes('whatsapp') && <label className="mt-3 block space-y-1 text-sm">Nomor WhatsApp penerima<input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+6281234567890" /></label>}
          {channels.includes('telegram') && <label className="mt-3 block space-y-1 text-sm">Telegram Chat ID penerima<input className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Chat ID / group ID" /></label>}
          {channels.includes('gmail') && <label className="mt-3 block space-y-1 text-sm">Alamat Gmail / email penerima<input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="penerima@contoh.com" /></label>}
        </section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white p-4"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Simpan Event</button></div>
    </form>
  </div>
}

function CalendarSettingsModal({ initial, members, branches, currentUserId, busy, tab, setTab, onClose, onSave, canDelete, onDelete }: {
  initial: CalendarRow | null; members: Member[]; branches: Branch[]; currentUserId: string; busy: boolean; tab: SettingsTab; setTab: (tab: SettingsTab) => void; onClose: () => void
  onSave: (payload: { calendar_type: string; name: string; description: string; access_all: boolean; access_user_ids: string[]; event_edit_all: boolean; event_edit_user_ids: string[]; admin_all: boolean; admin_user_ids: string[] }) => Promise<void>
  canDelete: boolean; onDelete: () => Promise<void>
}) {
  const [calendarType, setCalendarType] = useState(initial?.calendar_type ?? 'Kegiatan')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [accessAll, setAccessAll] = useState(initial?.access_all ?? true)
  const [accessUsers, setAccessUsers] = useState<string[]>(initial?.access_user_ids ?? [currentUserId])
  const [editAll, setEditAll] = useState(initial?.event_edit_all ?? true)
  const [editUsers, setEditUsers] = useState<string[]>(initial?.event_edit_user_ids ?? [currentUserId])
  const [adminAll, setAdminAll] = useState(initial?.admin_all ?? false)
  const [adminUsers, setAdminUsers] = useState<string[]>(initial?.admin_user_ids ?? [currentUserId])
  const [searchAccess, setSearchAccess] = useState('')
  const [searchEdit, setSearchEdit] = useState('')
  const [searchAdmin, setSearchAdmin] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function toggleUser(userId: string, list: string[], setList: (list: string[]) => void) {
    setList(list.includes(userId) ? list.filter((item) => item !== userId) : [...list, userId])
  }
  function memberPicker(list: string[], setList: (list: string[]) => void, all: boolean, setAll: (value: boolean) => void, search: string, setSearch: (value: string) => void, descriptionText: string) {
    const results = members.filter((member) => member.name.toLowerCase().includes(search.toLowerCase()) || member.role.toLowerCase().includes(search.toLowerCase()))
    return <div className="space-y-4"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Semua Pengguna</label><div><h3 className="mb-2 font-semibold">{descriptionText}</h3><p className="mb-3 text-xs text-ink/55">Pilih pengguna yang memiliki hak. Pengguna owner/admin perusahaan mengikuti hak administrasi perusahaan.</p><input className="input mb-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pengguna..." /><div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2">{results.map((member) => <label key={member.userId} className="flex items-center gap-2 rounded-md p-2 hover:bg-canvas"><input type="checkbox" checked={list.includes(member.userId)} onChange={() => toggleUser(member.userId, list, setList)} /><span className="min-w-0 flex-1 truncate text-sm">{member.name}</span><span className="text-xs text-ink/45">{member.role}</span></label>)}{!results.length && <p className="p-3 text-sm text-ink/50">Pengguna tidak ditemukan.</p>}</div></div></div>
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) { setFormError('Nama Kalender wajib diisi.'); return }
    onSave({ calendar_type: calendarType, name: name.trim(), description, access_all: accessAll, access_user_ids: accessUsers, event_edit_all: editAll, event_edit_user_ids: editUsers, admin_all: adminAll, admin_user_ids: adminUsers })
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <form onSubmit={submit} className="my-auto max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#102f59] px-5 py-4 text-white"><h2 className="text-lg font-semibold">Form Kalender</h2><button type="button" onClick={onClose} aria-label="Tutup"><X size={22} /></button></div>
      <div className="flex flex-wrap border-b border-line px-3 pt-3 sm:px-5">{SETTINGS_TABS.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`border-b-2 px-3 py-3 text-sm sm:px-4 sm:text-base ${tab === item.id ? 'border-red-500 text-red-500' : 'border-transparent text-ink/60 hover:text-ink'}`}>{item.label}</button>)}</div>
      <div className="min-h-[270px] space-y-4 p-4 sm:p-6">
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        {tab === 'setup' && <div className="space-y-4">
          <label className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center"><span className="font-medium">Jenis Kalender <span className="text-red-600">*</span></span><select className="input" value={calendarType} onChange={(e) => setCalendarType(e.target.value)}><option>Kegiatan</option><option>Pribadi</option><option>Proyek</option><option>Pengingat</option><option>Operasional</option></select></label>
          <label className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center"><span className="font-medium">Nama Kalender <span className="text-red-600">*</span></span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Kegiatan Tim" required /></label>
          <label className="grid gap-2 sm:grid-cols-[220px_1fr]"><span className="pt-2 font-medium">Keterangan</span><textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi kalender..." /></label>
          <div className="rounded-lg bg-canvas p-3 text-sm text-ink/60">Kalender ini menyimpan event di tingkat perusahaan. Atur pengguna yang dapat melihat, menambah/mengubah event, atau mengelola kalender melalui tab hak akses.</div>
          {branches.length > 0 && <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Referensi Grup/Cabang ({branches.length})</summary><p className="mt-2 text-xs text-ink/55">Cabang tersedia: {branches.map((branch) => branch.name).join(', ')}. Hak saat ini diberikan per pengguna; penentuan akses otomatis berdasarkan keanggotaan cabang memerlukan relasi pengguna-cabang.</p></details>}
        </div>}
        {tab === 'access' && memberPicker(accessUsers, setAccessUsers, accessAll, setAccessAll, searchAccess, setSearchAccess, 'Hak untuk melihat event-event yang ada pada kalender ini')}
        {tab === 'event' && memberPicker(editUsers, setEditUsers, editAll, setEditAll, searchEdit, setSearchEdit, 'Hak untuk menambah, mengubah ataupun menghapus event pada kalender')}
        {tab === 'admin' && memberPicker(adminUsers, setAdminUsers, adminAll, setAdminAll, searchAdmin, setSearchAdmin, 'Hak untuk mengganti nama, deskripsi, parameter lain, dan menghapus kalender')}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-white p-4"><div>{canDelete && <button type="button" className="btn text-red-600" onClick={onDelete} disabled={busy}><Trash2 size={15} /> Hapus Kalender</button>}</div><div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Simpan</button></div></div>
    </form>
  </div>
}
