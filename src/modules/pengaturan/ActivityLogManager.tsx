'use client'

import { useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Activity, ChevronDown, ChevronUp, Download, Loader2, RefreshCw, Search } from 'lucide-react'

type TextDiff = { prefix?: string; removed?: string; added?: string; suffix?: string }
type ActivityChange = {
  field: string
  change_type: 'added' | 'removed' | 'changed' | string
  before: unknown
  after: unknown
  text_diff?: TextDiff
}
export type ActivityLogRow = {
  id: string
  company_id: string
  occurred_at: string
  actor_id: string | null
  actor_name: string
  actor_email: string | null
  actor_type: 'user' | 'system'
  action: string
  module_name: string
  table_name: string
  record_key: Record<string, unknown>
  record_label: string | null
  summary: string
  changed_fields: string[]
  changes: ActivityChange[]
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
}
const PAGE_SIZE = 100
const ACTIONS = [
  { value: 'all', label: 'Semua aksi' },
  { value: 'INSERT', label: 'Dibuat' },
  { value: 'UPDATE', label: 'Diubah' },
  { value: 'DELETE', label: 'Dihapus' },
  { value: 'VIEW', label: 'Dibuka' },
  { value: 'EXPORT', label: 'Diekspor' },
]
const MODULES = ['Pengaturan', 'Kas & Bank', 'Penjualan', 'Pembelian', 'Persediaan', 'Akuntansi', 'Kendaraan', 'Reminder', 'Dashboard', 'Lainnya']

function dateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}
function fieldName(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function valueText(value: unknown) {
  if (value === undefined) return '—'
  if (value === null) return '∅ (kosong)'
  if (typeof value === 'string') return value.length ? value : '"" (teks kosong)'
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2) ?? String(value) } catch { return String(value) }
  }
  return String(value)
}
function actionLabel(action: string) {
  return ACTIONS.find((item) => item.value === action)?.label ?? action
}
function actionClass(action: string) {
  if (action === 'INSERT') return 'bg-emerald-50 text-emerald-800'
  if (action === 'UPDATE') return 'bg-amber-50 text-amber-800'
  if (action === 'DELETE') return 'bg-red-50 text-red-800'
  if (action === 'EXPORT') return 'bg-blue-50 text-blue-800'
  return 'bg-slate-100 text-slate-700'
}
function TextDifference({ diff }: { diff: TextDiff }) {
  return <code className="whitespace-pre-wrap break-all text-sm">
    {diff.prefix}
    {diff.removed ? <del className="rounded bg-red-100 px-0.5 text-red-800 decoration-red-700">{diff.removed}</del> : null}
    {diff.added ? <ins className="rounded bg-emerald-100 px-0.5 text-emerald-800 decoration-emerald-700">{diff.added}</ins> : null}
    {diff.suffix}
  </code>
}

export default function ActivityLogManager({
  companyId, initial, initialError,
}: { companyId: string; initial: ActivityLogRow[]; initialError: string | null }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [rows, setRows] = useState(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function loadMore(reset = false) {
    setLoading(true)
    setError(null)
    const offset = reset ? 0 : rows.length
    const { data, error: queryError } = await sb.from('company_activity_logs')
      .select('id, company_id, occurred_at, actor_id, actor_name, actor_email, actor_type, action, module_name, table_name, record_key, record_label, summary, changed_fields, changes, old_data, new_data, ip_address, user_agent, request_id')
      .eq('company_id', companyId)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    setLoading(false)
    if (queryError) { setError(queryError.message); return }
    const batch = (data ?? []) as unknown as ActivityLogRow[]
    setRows((current) => reset ? batch : [...current, ...batch])
    setHasMore(batch.length === PAGE_SIZE)
  }

  const loadedModuleOptions = useMemo(
    () => Array.from(new Set([...MODULES, ...rows.map((row) => row.module_name)])).sort((a, b) => a.localeCompare(b, 'id')),
    [rows],
  )
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    return rows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false
      if (moduleFilter !== 'all' && row.module_name !== moduleFilter) return false
      const time = row.occurred_at.slice(0, 10)
      if (dateFrom && time < dateFrom) return false
      if (dateTo && time > dateTo) return false
      if (!query) return true
      const changedText = (row.changes ?? []).map((change) =>
        [change.field, valueText(change.before), valueText(change.after)].join(' ')
      ).join(' ')
      const haystack = [
        row.actor_name, row.actor_email, row.action, row.module_name, row.table_name,
        row.record_label, row.summary, (row.changed_fields ?? []).join(' '), changedText,
      ].join(' ').toLocaleLowerCase('id')
      return haystack.includes(query)
    })
  }, [rows, search, actionFilter, moduleFilter, dateFrom, dateTo])

  function exportCsv() {
    const esc = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
    const lines = [
      ['Waktu (WIB)', 'Pelaku', 'Email', 'Aksi', 'Modul', 'Tabel', 'Record', 'Ringkasan', 'Field Berubah', 'Detail Perubahan'].map(esc).join(','),
      ...filtered.map((row) => [
        dateTime(row.occurred_at), row.actor_name, row.actor_email, row.action, row.module_name,
        row.table_name, row.record_label, row.summary, (row.changed_fields ?? []).join('; '),
        (row.changes ?? []).map((c) => fieldName(c.field) + ': ' + valueText(c.before) + ' -> ' + valueText(c.after)).join(' | '),
      ].map(esc).join(',')),
    ]
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'log-aktivitas-' + new Date().toISOString().slice(0, 10) + '.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><Activity size={25} className="text-brand" /><h1 className="text-2xl font-semibold">Log Aktivitas</h1></div>
        <p className="mt-1 max-w-3xl text-sm text-ink/60">Audit trail lintas modul: siapa melakukan apa, kapan, pada data mana, dan setiap field yang berubah beserta nilai sebelum–sesudah.</p>
      </div>
      <div className="flex flex-wrap gap-2 lg:ml-auto">
        <button className="btn" type="button" onClick={() => loadMore(true)} disabled={loading}><RefreshCw size={15} /> Muat ulang</button>
        <button className="btn" type="button" onClick={exportCsv} disabled={!filtered.length}><Download size={15} /> Ekspor CSV</button>
      </div>
    </header>

    <section className="card space-y-3 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm xl:col-span-2">Cari aktivitas atau detail perubahan
          <span className="relative mt-1 block"><Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-ink/45" /><input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama, tabel, record, field, nilai lama/baru…" /></span>
        </label>
        <label className="text-sm">Modul<select className="input mt-1" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">Semua modul</option>{loadedModuleOptions.map((module) => <option key={module} value={module}>{module}</option>)}</select></label>
        <label className="text-sm">Jenis aktivitas<select className="input mt-1" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>{ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
        <label className="text-sm">Dari tanggal<input className="input mt-1" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Sampai tanggal<input className="input mt-1" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <p className="ml-auto text-sm text-ink/60">Menampilkan <b className="text-ink">{filtered.length}</b> dari <b className="text-ink">{rows.length}</b> log yang telah dimuat.</p>
      </div>
      <p className="text-xs text-ink/50">Pencarian dan filter berlaku pada log yang sudah dimuat. Gunakan “Muat lebih banyak” untuk menelusuri catatan yang lebih lama.</p>
    </section>

    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Gagal memuat log aktivitas: {error}</div>}
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div><h2 className="font-semibold">Riwayat aktivitas</h2><p className="mt-1 text-xs text-ink/55">Detail perubahan tersedia pada setiap baris log.</p></div>
        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium">{rows.length} dimuat</span>
      </div>
      {filtered.length ? <div className="divide-y divide-line">{filtered.map((row) => {
        const isExpanded = !!expanded[row.id]
        return <article key={row.id} className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${actionClass(row.action)}`}>{actionLabel(row.action)}</span>
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{row.summary}</p>
              <p className="mt-1 text-sm text-ink/65">{row.actor_name}{row.actor_email ? ' · ' + row.actor_email : ''} <span className="text-ink/35">·</span> {dateTime(row.occurred_at)}</p>
              <p className="mt-1 break-words text-xs text-ink/50">{row.module_name} / {row.table_name}{row.record_key && Object.keys(row.record_key).length ? ' · Kunci: ' + JSON.stringify(row.record_key) : ''}</p>
              {row.changed_fields?.length > 0 && <p className="mt-2 text-xs text-ink/60">Field: {row.changed_fields.map(fieldName).join(', ')}</p>}
            </div>
            <button className="btn shrink-0 px-2.5" type="button" onClick={() => setExpanded((all) => ({ ...all, [row.id]: !all[row.id] }))} aria-expanded={isExpanded}>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}<span className="hidden sm:inline">{isExpanded ? 'Tutup detail' : 'Detail'}</span>
            </button>
          </div>
          {isExpanded && <div className="mt-4 space-y-3 border-t border-line pt-3">
            {row.changes?.length ? <div className="space-y-2">
              <h3 className="text-sm font-semibold">Perubahan per field ({row.changes.length})</h3>
              {row.changes.map((change, index) => <div key={change.field + ':' + index} className="rounded-lg border border-line bg-canvas/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{fieldName(change.field)}</p><span className="text-[11px] uppercase tracking-wide text-ink/50">{change.change_type === 'added' ? 'Ditambahkan' : change.change_type === 'removed' ? 'Dihapus' : 'Diubah'}</span></div>
                {change.text_diff ? <div className="mt-2 rounded-md bg-white p-2"><p className="mb-1 text-xs text-ink/55">Perbedaan karakter (teks merah dihapus, hijau ditambahkan)</p><TextDifference diff={change.text_diff} /></div> : null}
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="min-w-0 rounded-md border border-red-100 bg-red-50/60 p-2"><p className="text-[11px] font-semibold uppercase text-red-800">Sebelum</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-ink">{valueText(change.before)}</pre></div>
                  <div className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/60 p-2"><p className="text-[11px] font-semibold uppercase text-emerald-800">Sesudah</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-ink">{valueText(change.after)}</pre></div>
                </div>
              </div>)}
            </div> : <p className="text-sm text-ink/55">Tidak ada daftar field perubahan pada aktivitas ini.</p>}
            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium">Data mentah sebelum–sesudah</summary>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                <div><h4 className="mb-1 text-xs font-semibold uppercase text-ink/55">OLD</h4><pre className="max-h-80 overflow-auto rounded-md bg-canvas p-3 text-xs">{row.old_data ? JSON.stringify(row.old_data, null, 2) : 'Tidak ada data sebelum (record dibuat atau aktivitas UI).'}</pre></div>
                <div><h4 className="mb-1 text-xs font-semibold uppercase text-ink/55">NEW</h4><pre className="max-h-80 overflow-auto rounded-md bg-canvas p-3 text-xs">{row.new_data ? JSON.stringify(row.new_data, null, 2) : 'Tidak ada data sesudah (record dihapus).'}</pre></div>
              </div>
              {(row.ip_address || row.user_agent || row.request_id) && <div className="mt-3 space-y-1 text-xs text-ink/55">{row.ip_address && <p>IP / Forwarded for: {row.ip_address}</p>}{row.user_agent && <p className="break-all">Browser / user agent: {row.user_agent}</p>}{row.request_id && <p>Request ID: {row.request_id}</p>}</div>}
            </details>
          </div>}
        </article>
      })}</div> : <div className="p-10 text-center"><Activity size={32} className="mx-auto text-ink/30" /><p className="mt-3 font-medium">Tidak ada aktivitas yang cocok</p><p className="mt-1 text-sm text-ink/55">Coba ubah filter atau muat log yang lebih lama.</p></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
        <p className="text-xs text-ink/50">Log perubahan data berasal langsung dari trigger database; pembaruan tanda baca tetap disimpan sebagai perubahan field.</p>
        {hasMore && <button className="btn" type="button" disabled={loading} onClick={() => loadMore(false)}>{loading ? <><Loader2 size={15} className="animate-spin" /> Memuat…</> : 'Muat lebih banyak'}</button>}
        {!hasMore && rows.length > 0 && <span className="text-xs text-ink/45">Semua log yang tersedia telah dimuat.</span>}
      </div>
    </section>
  </div>
}
