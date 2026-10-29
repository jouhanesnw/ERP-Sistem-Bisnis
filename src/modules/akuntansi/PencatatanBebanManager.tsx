'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronDown, FileText, Loader2, Pencil, Plus, Receipt, Trash2, Wallet, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/modules/pengaturan/currencies'
import TransactionFavoriteControls, { type FavoritePayload } from '@/modules/pengaturan/TransactionFavoriteControls'

type MainAccountType = 'aset' | 'kewajiban' | 'modal' | 'pendapatan' | 'beban'
type Account = {
  id: string; company_id: string; kode: string; nama: string; tipe: MainAccountType
  normal: 'debit' | 'kredit'; induk_id: string | null; sistem: boolean; aktif: boolean
  kode_tipe: string; currency_code: string; catatan: string | null
}
type Currency = { code: string; name: string; symbol: string; is_default: boolean }
type Branch = { id: string; name: string; active: boolean }
type CashAccount = { id: string; nama: string; tipe: 'tunai' | 'bank' | 'ewallet'; nomor: string | null; aktif: boolean; currency_code: string }
type ExpenseLine = { id?: string; akun_beban_id: string; deskripsi: string; jumlah: string }
export type ExpenseRow = {
  id: string; company_id: string; nomor: string; tanggal: string; jatuh_tempo: string
  hutang_akun_id: string; currency_code: string; total: number | string; branch_id: string | null
  catatan: string | null; created_by: string | null; created_at: string; updated_at: string
  hutang_akun_kode: string; hutang_akun_nama: string; branch_name: string | null
  dibayar: number | string; sisa: number | string
  status: 'Sedang Diproses' | 'Sebagian Dibayar' | 'Terbayar'
  nomor_pembayaran: string | null
}
type ExpenseFormData = { id?: string; tanggal: string; jatuh_tempo: string; hutang_akun_id: string; currency_code: string; branch_id: string; catatan: string; items: ExpenseLine[] }
type PaymentFormData = { id: string; nomor: string; sisa: number | string; currency_code: string; tanggal: string }

const money = (value: number | string, code: string) => formatCurrency(Number(value) || 0, code)
function isoDate(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10) }
function dateLabel(value: string) { return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value + 'T12:00:00+07:00')) }
function todayStartMonth() { const d = new Date(); d.setDate(1); return isoDate(d) }

export default function PencatatanBebanManager({
  companyId, initialRows, accounts, currencies, branches, cashAccounts, perm, canPay, initialError,
}: {
  companyId: string
  initialRows: ExpenseRow[]
  accounts: Account[]
  currencies: Currency[]
  branches: Branch[]
  cashAccounts: CashAccount[]
  perm: { create: boolean; edit: boolean; delete: boolean }
  canPay: boolean
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const db = sb as any
  const router = useRouter()
  const [rows, setRows] = useState<ExpenseRow[]>(initialRows)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [editingLines, setEditingLines] = useState<ExpenseLine[]>([])
  const [formInstance, setFormInstance] = useState(0)
  const [payment, setPayment] = useState<PaymentFormData | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await db.from('ak_pencatatan_beban_v')
      .select('*').eq('company_id', companyId)
      .order('tanggal', { ascending: false }).order('created_at', { ascending: false })
      .limit(500)
    setLoading(false)
    if (queryError) { setError(queryError.message); return }
    setError(null)
    setRows((data ?? []) as ExpenseRow[])
  }, [db, companyId])
  useEffect(() => { if (!initialRows.length) void load() }, [initialRows.length, load])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    return rows.filter((row) => {
      if (from && row.tanggal < from) return false
      if (to && row.tanggal > to) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return [row.nomor, row.catatan, row.hutang_akun_kode, row.hutang_akun_nama, row.branch_name, row.nomor_pembayaran]
        .filter(Boolean).join(' ').toLocaleLowerCase('id').includes(query)
    })
  }, [rows, from, to, statusFilter, search])

  const totals = useMemo(() => filtered.reduce((result, row) => {
    const code = row.currency_code || 'IDR'
    result[code] ??= { total: 0, paid: 0, remaining: 0 }
    result[code].total += Number(row.total) || 0
    result[code].paid += Number(row.dibayar) || 0
    result[code].remaining += Number(row.sisa) || 0
    return result
  }, {} as Record<string, { total: number; paid: number; remaining: number }>), [filtered])

  function newExpense() {
    setEditing(null); setEditingLines([]); setFormInstance((n) => n + 1)
    setFormOpen(true); setError(null); setNotice(null)
  }
  async function editExpense(row: ExpenseRow) {
    if (!perm.edit || Number(row.dibayar) > 0) return
    setBusy(true); setError(null)
    const { data, error: lineError } = await db.from('ak_pencatatan_beban_baris')
      .select('id, akun_beban_id, deskripsi, jumlah, urutan')
      .eq('company_id', companyId).eq('beban_id', row.id).order('urutan')
    setBusy(false)
    if (lineError) { setError(lineError.message); return }
    setEditing(row)
    setEditingLines((data ?? []).map((item: any) => ({ id: item.id, akun_beban_id: item.akun_beban_id, deskripsi: item.deskripsi, jumlah: String(item.jumlah) })))
    setFormInstance((n) => n + 1); setFormOpen(true); setNotice(null)
  }
  async function deleteExpense(row: ExpenseRow) {
    if (!perm.delete) return
    if (!confirm(`Hapus pencatatan beban ${row.nomor}? Jurnal pengakuan bebannya juga akan dihapus.`)) return
    setBusy(true); setError(null)
    const { error: deleteError } = await db.rpc('ak_pencatatan_beban_hapus', { p_id: row.id })
    setBusy(false)
    if (deleteError) { setError(deleteError.message); return }
    setNotice(`Pencatatan beban ${row.nomor} berhasil dihapus.`)
    await load(); router.refresh()
  }
  async function saveExpense(payload: Omit<ExpenseFormData, 'id'>) {
    setBusy(true); setError(null); setNotice(null)
    const args = {
      company_id: companyId, ...(editing ? { id: editing.id } : {}),
      tanggal: payload.tanggal, jatuh_tempo: payload.jatuh_tempo,
      hutang_akun_id: payload.hutang_akun_id, currency_code: payload.currency_code,
      branch_id: payload.branch_id || null, catatan: payload.catatan,
      items: payload.items.map((item) => ({ akun_beban_id: item.akun_beban_id, deskripsi: item.deskripsi, jumlah: Number(item.jumlah) })),
    }
    const { error: saveError } = await db.rpc('ak_pencatatan_beban_simpan', { p: args })
    setBusy(false)
    if (saveError) { setError(saveError.message); return }
    setFormOpen(false); setEditing(null)
    setNotice(editing ? 'Pencatatan beban berhasil diperbarui.' : 'Pencatatan beban berhasil disimpan dan jurnal otomatis dibuat.')
    await load(); router.refresh()
  }
  async function savePayment(payload: { tanggal: string; jumlah: string; rekening_id: string; catatan: string }) {
    if (!payment) return
    setBusy(true); setError(null); setNotice(null)
    const { error: paymentError } = await db.rpc('ak_beban_bayar', {
      p: { company_id: companyId, beban_id: payment.id, tanggal: payload.tanggal, jumlah: Number(payload.jumlah), rekening_id: payload.rekening_id, catatan: payload.catatan },
    })
    setBusy(false)
    if (paymentError) { setError(paymentError.message); return }
    setPayment(null)
    setNotice('Pembayaran berhasil dicatat pada Kas & Bank dan nomor pembayaran telah dibuat.')
    await load(); router.refresh()
  }

  const activeCurrencies = currencies.length ? currencies : [{ code: 'IDR', name: 'Rupiah Indonesia', symbol: 'Rp', is_default: true }]
  const accountNames = useMemo(() => new Map(accounts.map((account) => [account.id, `${account.kode} · ${account.nama}`])), [accounts])

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 xl:flex-row xl:items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><Receipt size={25} className="text-brand" /><h1 className="text-2xl font-semibold">Pencatatan Beban</h1></div>
        <p className="mt-1 max-w-3xl text-sm text-ink/60">Catat beban dan hutangnya saat diakui. Pelunasan dapat dilakukan penuh atau sebagian melalui Kas & Bank tanpa membebankan biaya dua kali.</p>
      </div>
      {perm.create && <button className="btn btn-primary xl:ml-auto" type="button" onClick={newExpense}><Plus size={16} /> Buat Pencatatan Beban</button>}
    </header>

    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      Saat disimpan, sistem membuat jurnal otomatis: Debit akun beban dan Kredit Hutang Beban. Saat dibayar, sistem mengurangi Hutang Beban serta Kas/Bank. Nomor transaksi dibuat otomatis.
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

    <section className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm">Cari nomor / akun / cabang<input className="input mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="BEBAN/2026/0001…" /></label>
        <label className="text-sm">Tanggal dari<input className="input mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Tanggal sampai<input className="input mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Status<select className="input mt-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Semua status</option><option>Sedang Diproses</option><option>Sebagian Dibayar</option><option>Terbayar</option></select></label>
        <div className="flex items-end text-sm text-ink/60">{filtered.length} pencatatan beban</div>
      </div>
      {Object.keys(totals).length > 0 && <div className="flex flex-wrap gap-3 border-t border-line pt-3">
        {Object.entries(totals).map(([code, value]) => <div key={code} className="rounded-lg bg-canvas px-3 py-2 text-sm"><span className="text-ink/60">{code} · Total tercatat </span><b>{money(value.total, code)}</b><span className="ml-2 text-ink/55">Sisa {money(value.remaining, code)}</span></div>)}
      </div>}
    </section>

    <section className="card overflow-x-auto">
      <table className="w-full min-w-[1250px] text-left text-sm">
        <thead><tr className="border-b border-line text-ink/60">
          <th className="p-3 font-medium">No Beban #</th><th className="p-3 font-medium">Tanggal</th><th className="p-3 font-medium">Jatuh Tempo</th>
          <th className="p-3 font-medium">Hutang Beban</th><th className="p-3 text-right font-medium">Total</th>
          <th className="p-3 text-right font-medium">Dibayar</th><th className="p-3 text-right font-medium">Sisa</th>
          <th className="p-3 font-medium">Status</th><th className="p-3 font-medium">No. Pembayaran</th><th className="p-3" />
        </tr></thead>
        <tbody>
          {filtered.map((row) => {
            const isLate = row.status !== 'Terbayar' && row.jatuh_tempo < isoDate()
            return <tr key={row.id} className="border-b border-line align-top last:border-0">
              <td className="p-3 whitespace-nowrap"><span className="font-medium">{row.nomor}</span>{row.catatan && <span className="mt-1 block max-w-[14rem] truncate text-xs text-ink/50">{row.catatan}</span>}{row.branch_name && <span className="mt-1 block text-xs text-ink/50">{row.branch_name}</span>}</td>
              <td className="p-3 whitespace-nowrap">{dateLabel(row.tanggal)}</td>
              <td className={`p-3 whitespace-nowrap ${isLate ? 'font-semibold text-red-600' : ''}`}>{dateLabel(row.jatuh_tempo)}{isLate && <span className="mt-1 flex items-center gap-1 text-xs"><AlertTriangle size={12} /> Lewat jatuh tempo</span>}</td>
              <td className="p-3">{row.hutang_akun_kode} · {row.hutang_akun_nama}</td>
              <td className="p-3 text-right tabular-nums">{money(row.total, row.currency_code)}</td>
              <td className="p-3 text-right tabular-nums">{money(row.dibayar, row.currency_code)}</td>
              <td className="p-3 text-right tabular-nums font-medium">{money(row.sisa, row.currency_code)}</td>
              <td className="p-3"><StatusChip status={row.status} /></td>
              <td className="p-3 max-w-[15rem] whitespace-normal break-words text-xs">{row.nomor_pembayaran || '—'}</td>
              <td className="p-3 text-right">
                <div className="flex justify-end gap-1">
                  {row.status !== 'Terbayar' && canPay && <button className="btn px-2" type="button" onClick={() => setPayment({ id: row.id, nomor: row.nomor, sisa: row.sisa, currency_code: row.currency_code, tanggal: isoDate() })} title="Catat pembayaran"><Wallet size={15} /><span className="hidden xl:inline">Bayar</span></button>}
                  {perm.edit && Number(row.dibayar) === 0 && <button className="btn px-2" type="button" onClick={() => void editExpense(row)} title="Ubah"><Pencil size={15} /></button>}
                  {perm.delete && Number(row.dibayar) === 0 && <button className="btn px-2 text-red-600" type="button" onClick={() => void deleteExpense(row)} title="Hapus"><Trash2 size={15} /></button>}
                  <button className="btn px-2" type="button" onClick={() => setExpanded((value) => ({ ...value, [row.id]: !value[row.id] }))} aria-expanded={!!expanded[row.id]} title="Detail"><ChevronDown size={15} /></button>
                </div>
              </td>
            </tr>
          })}
          {filtered.map((row) => expanded[row.id] && <tr key={row.id + '-detail'} className="border-b border-line bg-canvas/40"><td colSpan={10} className="p-4">
            <ExpenseDetail sb={db} companyId={companyId} row={row} accountNames={accountNames} />
          </td></tr>)}
          {!filtered.length && <tr><td colSpan={10} className="p-8 text-center text-ink/55">{loading ? 'Memuat…' : 'Belum ada pencatatan beban yang sesuai filter.'}</td></tr>}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3 text-xs text-ink/55"><span>Menampilkan maksimal 500 transaksi terbaru. Detail membuka akun beban per baris dan riwayat pembayaran.</span><button className="btn" type="button" onClick={() => void load()} disabled={loading}><FileText size={14} /> Muat ulang</button></div>
    </section>

    {formOpen && <ExpenseForm
      key={formInstance}
      companyId={companyId} accounts={accounts} currencies={activeCurrencies} branches={branches}
      initial={editing ? { ...editing, branch_id: editing.branch_id ?? '', items: editingLines } : null} busy={busy}
      onClose={() => { setFormOpen(false); setEditing(null) }}
      onSave={saveExpense}
    />}
    {payment && <PaymentModal bill={payment} cashAccounts={cashAccounts.filter((account) => account.aktif && account.currency_code === payment.currency_code)} busy={busy}
      onClose={() => setPayment(null)} onSave={savePayment} />}
    {!canPay && <p className="text-xs text-ink/50">Pelunasan memerlukan izin Buat pada modul Kas & Bank serta izin Buat pada Akuntansi.</p>}
  </div>
}

function StatusChip({ status }: { status: string }) {
  const classes = status === 'Terbayar' ? 'bg-emerald-50 text-emerald-800'
    : status === 'Sebagian Dibayar' ? 'bg-amber-50 text-amber-800'
      : 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{status}</span>
}

function ExpenseDetail({ sb, companyId, row, accountNames }: { sb: any; companyId: string; row: ExpenseRow; accountNames: Map<string, string> }) {
  const [items, setItems] = useState<ExpenseLine[]>([])
  const [payments, setPayments] = useState<{ id: string; nomor: string; tanggal: string; jumlah: number | string; catatan: string | null; rekening_id: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([
      sb.from('ak_pencatatan_beban_baris').select('id, akun_beban_id, deskripsi, jumlah, urutan').eq('company_id', companyId).eq('beban_id', row.id).order('urutan'),
      sb.from('ak_beban_pembayaran').select('id, nomor, tanggal, jumlah, catatan, rekening_id').eq('company_id', companyId).eq('beban_id', row.id).order('tanggal', { ascending: false }),
    ]).then(([lineResult, paymentResult]: any[]) => {
      if (!alive) return
      if (lineResult.error) setError(lineResult.error.message)
      else setItems((lineResult.data ?? []).map((item: any) => ({ id: item.id, akun_beban_id: item.akun_beban_id, deskripsi: item.deskripsi, jumlah: String(item.jumlah) })))
      if (paymentResult.error) setError(paymentResult.error.message)
      else setPayments(paymentResult.data ?? [])
    })
    return () => { alive = false }
  }, [sb, companyId, row.id])
  return <div className="grid gap-4 lg:grid-cols-2">
    <div><h3 className="mb-2 font-semibold">Detail akun beban</h3>{error && <p className="text-sm text-red-600">{error}</p>}<div className="overflow-x-auto rounded-lg border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line text-ink/55"><th className="p-2 text-left">Akun</th><th className="p-2 text-left">Keterangan</th><th className="p-2 text-right">Jumlah</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id ?? index} className="border-b border-line last:border-0"><td className="p-2">{accountNames.get(item.akun_beban_id) ?? item.akun_beban_id}</td><td className="p-2">{item.deskripsi}</td><td className="p-2 text-right">{money(item.jumlah, row.currency_code)}</td></tr>)}<tr><td colSpan={2} className="p-2 font-semibold">Total</td><td className="p-2 text-right font-semibold">{money(row.total, row.currency_code)}</td></tr></tbody></table></div>{row.catatan && <p className="mt-2 text-sm text-ink/60">Catatan: {row.catatan}</p>}</div>
    <div><h3 className="mb-2 font-semibold">Riwayat pembayaran</h3>{payments.length ? <div className="space-y-2">{payments.map((p) => <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-white p-3"><div><p className="font-medium">{p.nomor}</p><p className="text-xs text-ink/55">{dateLabel(p.tanggal)}{p.catatan ? ' · ' + p.catatan : ''}</p></div><p className="whitespace-nowrap font-medium">{money(p.jumlah, row.currency_code)}</p></div>)}</div> : <p className="rounded-lg border border-line bg-white p-3 text-sm text-ink/50">Belum ada pembayaran.</p>}</div>
  </div>
}

function ExpenseForm({ companyId, accounts, currencies, branches, initial, busy, onClose, onSave }: {
  companyId: string
  accounts: Account[]
  currencies: Currency[]
  branches: Branch[]
  initial: ExpenseFormData | null
  busy: boolean
  onClose: () => void
  onSave: (payload: Omit<ExpenseFormData, 'id'>) => Promise<void>
}) {
  const defaultCurrency = initial?.currency_code ?? currencies.find((item) => item.is_default)?.code ?? 'IDR'
  const defaultPayable = initial?.hutang_akun_id ?? accounts.find((account) => account.kode === '2210' && account.currency_code === defaultCurrency)?.id
    ?? accounts.find((account) => account.tipe === 'kewajiban' && account.kode_tipe === 'OCLY' && account.currency_code === defaultCurrency)?.id ?? ''
  const [tanggal, setTanggal] = useState(initial?.tanggal ?? isoDate())
  const [due, setDue] = useState(initial?.jatuh_tempo ?? isoDate(new Date(Date.now() + 7 * 86400000)))
  const [currency, setCurrency] = useState(defaultCurrency)
  const [payable, setPayable] = useState(defaultPayable)
  const [branchId, setBranchId] = useState(initial?.branch_id ?? '')
  const [catatan, setCatatan] = useState(initial?.catatan ?? '')
  const defaultExpense = accounts.find((account) => account.tipe === 'beban' && account.aktif && account.currency_code === defaultCurrency)?.id ?? ''
  const [items, setItems] = useState<ExpenseLine[]>(initial?.items?.length ? initial.items : [{ akun_beban_id: defaultExpense, deskripsi: '', jumlah: '' }])
  const [formError, setFormError] = useState<string | null>(null)

  const availablePayables = accounts.filter((account) => account.tipe === 'kewajiban' && account.kode_tipe === 'OCLY' && account.aktif && account.currency_code === currency)
  const availableExpenses = accounts.filter((account) => account.tipe === 'beban' && account.aktif && account.currency_code === currency)
  const total = items.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0)

  function changeCurrency(value: string) {
    setCurrency(value)
    const nextPayable = accounts.find((account) => account.kode === '2210' && account.currency_code === value && account.aktif)
      ?? accounts.find((account) => account.tipe === 'kewajiban' && account.kode_tipe === 'OCLY' && account.currency_code === value && account.aktif)
    setPayable(nextPayable?.id ?? '')
    const nextExpense = accounts.find((account) => account.tipe === 'beban' && account.aktif && account.currency_code === value)?.id ?? ''
    setItems((old) => old.map((item) => ({ ...item, akun_beban_id: accounts.some((account) => account.id === item.akun_beban_id && account.currency_code === value && account.aktif) ? item.akun_beban_id : nextExpense })))
  }
  function updateLine(index: number, patch: Partial<ExpenseLine>) {
    setItems((old) => old.map((item, i) => i === index ? { ...item, ...patch } : item))
  }
  function applyFavorite(payload: FavoritePayload) {
    if (payload.currency_code && currencies.some((item) => item.code === payload.currency_code)) changeCurrency(payload.currency_code)
    if (payload.hutang_akun_id && accounts.some((account) => account.id === payload.hutang_akun_id)) setPayable(payload.hutang_akun_id)
    if (payload.branch_id !== undefined) setBranchId(payload.branch_id ?? '')
    if (payload.catatan !== undefined) setCatatan(payload.catatan ?? '')
    if (payload.jatuh_tempo) setDue(payload.jatuh_tempo)
    if (payload.beban_items?.length) {
      setItems(payload.beban_items.map((item) => ({
        akun_beban_id: item.akun_beban_id,
        deskripsi: item.deskripsi,
        jumlah: String(item.jumlah ?? ''),
      })))
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    if (!payable) { setFormError('Pilih akun Hutang Beban dengan tipe Kewajiban Jangka Pendek.'); return }
    if (!items.length || items.some((item) => !item.akun_beban_id || !item.deskripsi.trim() || !Number.isFinite(Number(item.jumlah)) || Number(item.jumlah) <= 0)) {
      setFormError('Setiap baris harus memiliki akun beban, keterangan, dan jumlah lebih dari nol.'); return
    }
    if (new Date(due) < new Date(tanggal)) { setFormError('Tanggal jatuh tempo tidak boleh sebelum tanggal beban.'); return }
    onSave({ tanggal, jatuh_tempo: due, hutang_akun_id: payable, currency_code: currency, branch_id: branchId, catatan, items })
  }

  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <form onSubmit={submit} className="my-auto max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#102f59] px-5 py-4 text-white"><div><h2 className="text-lg font-semibold">{initial ? `Ubah Pencatatan Beban` : 'Form Pencatatan Beban'}</h2><p className="mt-0.5 text-xs text-white/65">{initial ? 'Nomor ' + initial.nomor : 'Nomor transaksi dibuat otomatis saat disimpan.'}</p></div><button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Tutup"><X size={20} /></button></div>
      <div className="space-y-5 p-4 sm:p-6">
        <TransactionFavoriteControls companyId={companyId} favoriteType="expense_recording"
          payload={{ hutang_akun_id: payable, currency_code: currency, branch_id: branchId || null, catatan, jatuh_tempo: due, beban_items: items.map((item) => ({ akun_beban_id: item.akun_beban_id, deskripsi: item.deskripsi, jumlah: item.jumlah })) }}
          onApply={applyFavorite} />
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">Tanggal <span className="text-red-600">*</span><input className="input" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
          <label className="space-y-1 text-sm font-medium">Jatuh Tempo <span className="text-red-600">*</span><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} required /></label>
          <label className="space-y-1 text-sm font-medium">Mata Uang<select className="input" value={currency} onChange={(e) => changeCurrency(e.target.value)}>{currencies.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium sm:col-span-2 xl:col-span-3">Hutang Beban <span className="text-red-600">*</span>
            <select className="input" value={payable} onChange={(e) => setPayable(e.target.value)} required><option value="">Pilih akun kewajiban jangka pendek…</option>{availablePayables.map((account) => <option key={account.id} value={account.id}>{account.kode} · {account.nama}</option>)}</select>
            <span className="block text-xs font-normal text-ink/50">Hanya akun kelompok Kewajiban dengan tipe detail OCLY (Kewajiban Jangka Pendek) dan mata uang yang sama.</span>
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-canvas text-ink/60"><tr><th className="p-3">Akun Beban</th><th className="p-3">Keterangan</th><th className="p-3 text-right">Jumlah ({currency})</th><th className="p-3" /></tr></thead>
            <tbody>{items.map((item, index) => <tr key={index} className="border-t border-line">
              <td className="p-2"><select className="input min-w-[15rem]" value={item.akun_beban_id} onChange={(e) => updateLine(index, { akun_beban_id: e.target.value })} required><option value="">Pilih akun beban…</option>{availableExpenses.map((account) => <option key={account.id} value={account.id}>{account.kode} · {account.nama}</option>)}</select></td>
              <td className="p-2"><input className="input min-w-[14rem]" value={item.deskripsi} onChange={(e) => updateLine(index, { deskripsi: e.target.value })} placeholder="Contoh: Beban listrik Oktober" required /></td>
              <td className="p-2"><input className="input min-w-[9rem] text-right tabular-nums" type="number" min="0.01" step="0.01" value={item.jumlah} onChange={(e) => updateLine(index, { jumlah: e.target.value })} required /></td>
              <td className="p-2"><button type="button" className="btn px-2" disabled={items.length <= 1} onClick={() => setItems((old) => old.filter((_, i) => i !== index))} aria-label="Hapus baris"><Trash2 size={15} /></button></td>
            </tr>)}</tbody>
            <tfoot><tr className="border-t border-line bg-canvas"><td colSpan={2} className="p-3 text-right font-semibold">Total Beban</td><td className="p-3 text-right font-semibold tabular-nums">{money(total, currency)}</td><td /></tr></tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button className="btn" type="button" onClick={() => setItems((old) => [...old, { akun_beban_id: availableExpenses[0]?.id ?? '', deskripsi: '', jumlah: '' }])}><Plus size={15} /> Tambah Baris</button><p className="text-xs text-ink/55">Setiap baris akan masuk jurnal sebagai debit ke akun beban yang dipilih.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Cabang (opsional)<select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Tanpa cabang</option>{branches.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Info Lainnya / Catatan<textarea className="input min-h-20" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan transaksi beban…" /></label>
        </div>
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-white p-4"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{initial ? 'Simpan Perubahan' : 'Simpan Beban'}</button></div>
    </form>
  </div>
}

function PaymentModal({ bill, cashAccounts, busy, onClose, onSave }: {
  bill: PaymentFormData; cashAccounts: CashAccount[]; busy: boolean; onClose: () => void
  onSave: (payload: { tanggal: string; jumlah: string; rekening_id: string; catatan: string }) => Promise<void>
}) {
  const [tanggal, setTanggal] = useState(bill.tanggal)
  const [jumlah, setJumlah] = useState(String(bill.sisa))
  const [rekening, setRekening] = useState(cashAccounts.find((account) => account.tipe === 'bank')?.id ?? cashAccounts[0]?.id ?? '')
  const [catatan, setCatatan] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  function submit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    if (!rekening) { setFormError(`Belum ada rekening Kas/Bank aktif bermata uang ${bill.currency_code}.`); return }
    const value = Number(jumlah)
    if (!Number.isFinite(value) || value <= 0 || value > Number(bill.sisa)) { setFormError('Jumlah pembayaran harus lebih dari nol dan tidak melebihi sisa beban.'); return }
    onSave({ tanggal, jumlah, rekening_id: rekening, catatan })
  }
  return <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <form onSubmit={submit} className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#102f59] px-5 py-4 text-white"><div><h2 className="font-semibold">Pembayaran Beban</h2><p className="text-xs text-white/70">{bill.nomor}</p></div><button className="rounded-md p-1 hover:bg-white/10" type="button" onClick={onClose} aria-label="Tutup"><X size={19} /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-ink/55">Sisa yang harus dibayar</p><p className="mt-1 text-xl font-semibold">{money(bill.sisa, bill.currency_code)}</p></div>
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        <label className="block space-y-1 text-sm font-medium">Tanggal Pembayaran<input type="date" className="input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
        <label className="block space-y-1 text-sm font-medium">Rekening Kas/Bank<select className="input" value={rekening} onChange={(e) => setRekening(e.target.value)} required><option value="">Pilih rekening…</option>{cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.nama} · {account.currency_code}</option>)}</select></label>
        <label className="block space-y-1 text-sm font-medium">Jumlah Pembayaran<input type="number" className="input" min="0.01" step="0.01" max={Number(bill.sisa)} value={jumlah} onChange={(e) => setJumlah(e.target.value)} required /></label>
        <label className="block space-y-1 text-sm font-medium">Catatan Pembayaran<input className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" /></label>
        <p className="text-xs text-ink/55">Pembayaran dicatat otomatis sebagai Kas Keluar dan akan menghasilkan jurnal pelunasan hutang beban.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-line p-4"><button className="btn" type="button" onClick={onClose}>Batal</button><button className="btn btn-primary" disabled={busy || !cashAccounts.length}>{busy ? 'Menyimpan…' : 'Proses Pembayaran'}</button></div>
    </form>
  </div>
}
