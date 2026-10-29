'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Loader2, Pencil, Plus, Receipt, Search, Trash2, Wallet, X, Calculator, Users } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/modules/pengaturan/currencies'
import type { Employee } from '@/modules/pengaturan/employees'
import type { SalaryItem, SalaryItemType } from '@/modules/pengaturan/salaryItems'

type PayrollComponent = {
  salary_item_id: string
  jumlah: string
  nama?: string
  item_type?: SalaryItemType
}
type PayrollLine = {
  employee_id: string
  nama_karyawan: string
  kode_karyawan: string
  ptkp_status: string
  pph: string
  komponen: PayrollComponent[]
  info_lainnya: { catatan?: string }
}
export type PayrollRow = {
  id: string
  company_id: string
  nomor: string
  tipe_pembayaran: string
  branch_id: string | null
  branch_name: string | null
  periode_bulan: number
  periode_tahun: number
  tanggal: string
  jatuh_tempo: string
  akun_hutang_id: string
  total_bruto: number | string
  total_pph: number | string
  total_premi_kesehatan_perusahaan: number | string
  total_premi_pensiun_perusahaan: number | string
  total_potongan_karyawan: number | string
  total_gaji_dibayarkan: number | string
  total_biaya: number | string
  catatan: string | null
  dibayar: number | string
  sisa: number | string
  status: 'Belum Dibayar' | 'Sebagian Dibayar' | 'Terbayar'
  nomor_pembayaran: string | null
}
type Branch = { id: string; name: string; active: boolean }
type CashAccount = { id: string; nama: string; tipe: string; nomor: string | null; aktif: boolean; currency_code: string }
type PayrollPayment = { id: string; nomor: string; tanggal: string; jumlah: number | string; catatan: string | null; rekening_id: string }

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const EMPLOYEE_DEDUCTION_TYPES: string[] = [
  'Potongan Gaji (Tidak Mengurangi PPh)',
  'Pengurangan Gaji (Mengurangi PPh)',
  'Premi asuransi kesehatan dibayarkan pekerja',
  'Iuran Pensiun/THT/JHT dibayarkan Pekerja',
]
const EMPLOYER_CONTRIBUTION_TYPES: string[] = [
  'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
  'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
  'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja',
]
const money = (value: number | string, code = 'IDR') => formatCurrency(Number(value) || 0, code)
function isoDate(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10) }
function dateLabel(value: string) { return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value + 'T12:00:00+07:00')) }
function monthLabel(month: number, year: number) { return (MONTHS[month - 1] ?? '') + ' ' + year }
function componentType(component: PayrollComponent, items: SalaryItem[]) { return component.item_type ?? items.find((item) => item.id === component.salary_item_id)?.item_type ?? 'Gaji/Pensiun atau THT/JHT' }
function componentName(component: PayrollComponent, items: SalaryItem[]) { return component.nama ?? items.find((item) => item.id === component.salary_item_id)?.name ?? 'Komponen gaji' }
function lineTotals(line: PayrollLine, items: SalaryItem[]) {
  let gross = 0, deductions = 0, health = 0, pension = 0, employer = 0
  for (const component of line.komponen) {
    const amount = Math.max(0, Number(component.jumlah) || 0)
    const type = componentType(component, items)
    if (EMPLOYEE_DEDUCTION_TYPES.includes(type)) deductions += amount
    else if (EMPLOYER_CONTRIBUTION_TYPES.includes(type)) {
      employer += amount
      if (type === 'Premi asuransi kesehatan yang dibayarkan pemberi kerja') health += amount
      if (type === 'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja') pension += amount
    } else gross += amount
  }
  const pph = Math.max(0, Number(line.pph) || 0)
  return { gross, deductions, pph, net: Math.max(0, gross - deductions - pph), health, pension, employer, totalCost: gross + employer }
}
function blankLine(employee: Employee, items: SalaryItem[], payType: string): PayrollLine {
  return {
    employee_id: employee.id, nama_karyawan: employee.full_name, kode_karyawan: employee.employee_code,
    ptkp_status: employee.ptkp_status, pph: employee.subject_to_pph21 ? '0' : '0',
    komponen: items.filter((item) => item.active && item.pay_type === payType).map((item) => ({
      salary_item_id: item.id, jumlah: '0', nama: item.name, item_type: item.item_type,
    })),
    info_lainnya: { catatan: '' },
  }
}

export default function PencatatanGajiManager({
  companyId, initialRows, employees, salaryItems, branches, cashAccounts, perm, canPay, initialError,
}: {
  companyId: string
  initialRows: PayrollRow[]
  employees: Employee[]
  salaryItems: SalaryItem[]
  branches: Branch[]
  cashAccounts: CashAccount[]
  perm: { create: boolean; edit: boolean; delete: boolean }
  canPay: boolean
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const db = sb as any
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PayrollRow | null>(null)
  const [formInstance, setFormInstance] = useState(0)
  const [payment, setPayment] = useState<PayrollRow | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await db.from('ak_pencatatan_gaji_v').select('*')
      .eq('company_id', companyId).order('periode_tahun', { ascending: false })
      .order('periode_bulan', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    setLoading(false)
    if (queryError) { setError(queryError.message); return }
    setError(null); setRows((data ?? []) as PayrollRow[])
  }, [db, companyId])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return [row.nomor, row.branch_name, row.catatan, monthLabel(row.periode_bulan, row.periode_tahun), row.nomor_pembayaran]
        .filter(Boolean).join(' ').toLocaleLowerCase('id').includes(query)
    })
  }, [rows, search, statusFilter])

  function newPayroll() {
    setEditing(null); setFormInstance((n) => n + 1); setFormOpen(true); setError(null); setNotice(null)
  }
  async function editPayroll(row: PayrollRow) {
    if (!perm.edit || Number(row.dibayar) > 0) return
    setBusy(true); setError(null)
    const { data, error: detailError } = await db.from('ak_pencatatan_gaji_baris')
      .select('employee_id,nama_karyawan,kode_karyawan,ptkp_status,pph,komponen,info_lainnya')
      .eq('company_id', companyId).eq('gaji_id', row.id).order('nama_karyawan')
    setBusy(false)
    if (detailError) { setError(detailError.message); return }
    setEditing({ ...row, _lines: data } as any)
    setFormInstance((n) => n + 1); setFormOpen(true); setNotice(null)
  }
  async function deletePayroll(row: PayrollRow) {
    if (!perm.delete) return
    if (!confirm('Hapus pencatatan gaji ' + row.nomor + '? Jurnal pencatatan gajinya juga akan dihapus.')) return
    setBusy(true); setError(null)
    const { error: deleteError } = await db.rpc('ak_pencatatan_gaji_hapus', { p_id: row.id })
    setBusy(false)
    if (deleteError) { setError(deleteError.message); return }
    setNotice('Pencatatan gaji ' + row.nomor + ' berhasil dihapus.')
    await load(); router.refresh()
  }
  async function savePayroll(payload: {
    id?: string; tipe_pembayaran: string; branch_id: string; periode_bulan: number; periode_tahun: number
    tanggal: string; jatuh_tempo: string; catatan: string; karyawan: { employee_id: string; pph: string; komponen: { salary_item_id: string; jumlah: string }[]; info_lainnya: { catatan?: string } }[]
  }) {
    setBusy(true); setError(null); setNotice(null)
    const { error: saveError } = await db.rpc('ak_pencatatan_gaji_simpan', { p: { ...payload, company_id: companyId } })
    setBusy(false)
    if (saveError) { setError(saveError.message); return }
    setFormOpen(false); setEditing(null)
    setNotice(payload.id ? 'Pencatatan gaji berhasil diperbarui.' : 'Pencatatan gaji berhasil disimpan dan jurnal otomatis dibuat.')
    await load(); router.refresh()
  }
  async function savePayment(payload: { tanggal: string; jumlah: string; rekening_id: string; catatan: string }) {
    if (!payment) return
    setBusy(true); setError(null); setNotice(null)
    const { error: payError } = await db.rpc('ak_gaji_bayar', { p: { company_id: companyId, gaji_id: payment.id, ...payload, jumlah: Number(payload.jumlah) } })
    setBusy(false)
    if (payError) { setError(payError.message); return }
    setPayment(null); setNotice('Pembayaran gaji berhasil dicatat pada Kas & Bank.')
    await load(); router.refresh()
  }

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 xl:flex-row xl:items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><Receipt size={25} className="text-brand" /><h1 className="text-2xl font-semibold">Pencatatan Gaji</h1></div>
        <p className="mt-1 max-w-3xl text-sm text-ink/60">Susun gaji karyawan per periode, tinjau komponen dan potongan, lalu catat pembayarannya melalui Kas &amp; Bank.</p>
      </div>
      {perm.create && <button className="btn btn-primary xl:ml-auto" type="button" onClick={newPayroll}><Plus size={16} /> Buat Pencatatan Gaji</button>}
    </header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">Cari nomor / cabang / periode<input className="input mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="EPY.2026.10…" /></label>
        <label className="text-sm">Status<select className="input mt-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Semua status</option><option>Belum Dibayar</option><option>Sebagian Dibayar</option><option>Terbayar</option></select></label>
        <div className="flex items-end text-sm text-ink/60">{filtered.length} pencatatan gaji</div>
        <div className="flex items-end justify-end"><button className="btn" type="button" disabled={loading} onClick={() => void load()}><FileText size={15} /> Muat ulang</button></div>
      </div>
    </section>
    <section className="card overflow-x-auto">
      <table className="w-full min-w-[1250px] text-left text-sm">
        <thead><tr className="border-b border-line text-ink/60">
          <th className="p-3 font-medium">Nomor #</th><th className="p-3 font-medium">Periode</th><th className="p-3 font-medium">Tanggal</th>
          <th className="p-3 font-medium">Cabang</th><th className="p-3 text-right font-medium">Pendapatan Bruto</th>
          <th className="p-3 text-right font-medium">Pajak Penghasilan</th><th className="p-3 text-right font-medium">Gaji dibayarkan</th>
          <th className="p-3 text-right font-medium">Dibayar</th><th className="p-3 font-medium">Status</th><th className="p-3" />
        </tr></thead>
        <tbody>
          {filtered.map((row) => <tr key={row.id} className="border-b border-line align-top last:border-0">
            <td className="p-3 whitespace-nowrap"><span className="font-medium">{row.nomor}</span>{row.catatan && <span className="mt-1 block max-w-[12rem] truncate text-xs text-ink/50">{row.catatan}</span>}</td>
            <td className="p-3 whitespace-nowrap">{monthLabel(row.periode_bulan, row.periode_tahun)}<span className="mt-1 block text-xs text-ink/50">{row.tipe_pembayaran}</span></td>
            <td className="p-3 whitespace-nowrap">{dateLabel(row.tanggal)}<span className="mt-1 block text-xs text-ink/50">Tempo {dateLabel(row.jatuh_tempo)}</span></td>
            <td className="p-3">{row.branch_name || '—'}</td>
            <td className="p-3 text-right tabular-nums">{money(row.total_bruto)}</td>
            <td className="p-3 text-right tabular-nums">{money(row.total_pph)}</td>
            <td className="p-3 text-right tabular-nums font-medium">{money(row.total_gaji_dibayarkan)}</td>
            <td className="p-3 text-right tabular-nums">{money(row.dibayar)}<span className="mt-1 block text-xs text-ink/50">Sisa {money(row.sisa)}</span></td>
            <td className="p-3"><StatusChip status={row.status} /></td>
            <td className="p-3 text-right"><div className="flex justify-end gap-1">
              {row.status !== 'Terbayar' && canPay && <button className="btn px-2" type="button" onClick={() => { setError(null); setPayment(row) }} title="Bayar gaji"><Wallet size={15} /><span className="hidden xl:inline">Bayar</span></button>}
              {perm.edit && Number(row.dibayar) === 0 && <button className="btn px-2" type="button" onClick={() => void editPayroll(row)} title="Ubah"><Pencil size={15} /></button>}
              {perm.delete && Number(row.dibayar) === 0 && <button className="btn px-2 text-red-600" type="button" onClick={() => void deletePayroll(row)} title="Hapus"><Trash2 size={15} /></button>}
              <button className="btn px-2" type="button" onClick={() => setExpanded((old) => ({ ...old, [row.id]: !old[row.id] }))} title="Detail" aria-expanded={!!expanded[row.id]}>{expanded[row.id] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
            </div></td>
          </tr>)}
          {filtered.map((row) => expanded[row.id] && <tr key={row.id + '-detail'} className="border-b border-line bg-canvas/40"><td colSpan={10} className="p-4"><PayrollDetail sb={db} companyId={companyId} row={row} /></td></tr>)}
          {!filtered.length && <tr><td colSpan={10} className="p-8 text-center text-ink/55">{loading ? 'Memuat…' : 'Belum ada pencatatan gaji yang sesuai filter.'}</td></tr>}
        </tbody>
      </table>
      <div className="border-t border-line p-3 text-xs text-ink/55">Menampilkan maksimal 500 pencatatan terbaru. Nominal ditampilkan dalam Rupiah (IDR).</div>
    </section>

    {formOpen && <PayrollForm
      key={formInstance}
      companyId={companyId} initial={editing as any} employees={employees} salaryItems={salaryItems} branches={branches} busy={busy} serverError={error}
      onClose={() => { if (!busy) { setFormOpen(false); setEditing(null) } }}
      onSave={savePayroll}
    />}
    {payment && <PayrollPaymentModal bill={payment} cashAccounts={cashAccounts} busy={busy} serverError={error}
      onClose={() => { if (!busy) setPayment(null) }} onSave={savePayment} />}
  </div>
}

function StatusChip({ status }: { status: string }) {
  const cls = status === 'Terbayar' ? 'bg-emerald-50 text-emerald-800' : status === 'Sebagian Dibayar' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'
  return <span className={'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ' + cls}>{status}</span>
}

function PayrollDetail({ sb, companyId, row }: { sb: any; companyId: string; row: PayrollRow }) {
  const [lines, setLines] = useState<any[]>([])
  const [payments, setPayments] = useState<PayrollPayment[]>([])
  const [error, setError] = useState<string | null>(null)
  useState(() => {
    void Promise.all([
      sb.from('ak_pencatatan_gaji_baris').select('id,nama_karyawan,kode_karyawan,pendapatan_bruto,pph,potongan_karyawan,gaji_dibayarkan,premi_kesehatan_perusahaan,premi_pensiun_perusahaan').eq('company_id', companyId).eq('gaji_id', row.id).order('nama_karyawan'),
      sb.from('ak_gaji_pembayaran').select('id,nomor,tanggal,jumlah,catatan,rekening_id').eq('company_id', companyId).eq('gaji_id', row.id).order('tanggal', { ascending: false }),
    ]).then(([lineResult, paymentResult]: any[]) => {
      if (lineResult.error) setError(lineResult.error.message); else setLines(lineResult.data ?? [])
      if (paymentResult.error) setError(paymentResult.error.message); else setPayments(paymentResult.data ?? [])
    })
  })
  return <div className="grid gap-4 xl:grid-cols-2">
    <div><h3 className="mb-2 font-semibold">Rincian Karyawan ({lines.length})</h3>{error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line text-ink/55"><th className="p-2 text-left">Nama Karyawan</th><th className="p-2 text-right">Pendapatan Bruto</th><th className="p-2 text-right">Pajak Penghasilan</th><th className="p-2 text-right">Gaji dibayarkan</th></tr></thead><tbody>
        {lines.map((line) => <tr key={line.id} className="border-b border-line last:border-0"><td className="p-2">{line.nama_karyawan}<span className="block text-xs text-ink/50">{line.kode_karyawan}</span></td><td className="p-2 text-right">{money(line.pendapatan_bruto)}</td><td className="p-2 text-right">{money(line.pph)}</td><td className="p-2 text-right font-medium">{money(line.gaji_dibayarkan)}</td></tr>)}
        {!lines.length && <tr><td colSpan={4} className="p-4 text-center text-ink/50">Belum ada rincian.</td></tr>}
      </tbody></table></div>
    </div>
    <div><h3 className="mb-2 font-semibold">Ringkasan dan Riwayat Pembayaran</h3>
      <div className="rounded-lg border border-line bg-white p-3 text-sm">
        <div className="flex justify-between gap-3 border-b border-line py-2"><span>Pendapatan Bruto</span><b>{money(row.total_bruto)}</b></div>
        <div className="flex justify-between gap-3 border-b border-line py-2"><span>Pajak Penghasilan</span><b>{money(row.total_pph)}</b></div>
        <div className="flex justify-between gap-3 border-b border-line py-2"><span>Premi Kesehatan Perusahaan</span><b>{money(row.total_premi_kesehatan_perusahaan)}</b></div>
        <div className="flex justify-between gap-3 border-b border-line py-2"><span>Premi Pensiun Perusahaan</span><b>{money(row.total_premi_pensiun_perusahaan)}</b></div>
        <div className="flex justify-between gap-3 border-b border-line py-2"><span>Gaji dibayarkan</span><b>{money(row.total_gaji_dibayarkan)}</b></div>
        <div className="flex justify-between gap-3 py-2"><span>Status</span><b>{row.status}</b></div>
      </div>
      <h4 className="mb-2 mt-4 font-medium">Riwayat Pembayaran</h4>
      {payments.length ? <div className="space-y-2">{payments.map((item) => <div key={item.id} className="flex justify-between gap-3 rounded-lg border border-line bg-white p-3 text-sm"><div><p className="font-medium">{item.nomor}</p><p className="text-xs text-ink/50">{dateLabel(item.tanggal)}{item.catatan ? ' · ' + item.catatan : ''}</p></div><b className="whitespace-nowrap">{money(item.jumlah)}</b></div>)}</div> : <p className="rounded-lg border border-line bg-white p-3 text-sm text-ink/50">Belum ada pembayaran.</p>}
    </div>
  </div>
}

function PayrollForm({ companyId, initial, employees, salaryItems, branches, busy, serverError, onClose, onSave }: {
  companyId: string
  initial: (PayrollRow & { _lines?: any[] }) | null
  employees: Employee[]
  salaryItems: SalaryItem[]
  branches: Branch[]
  busy: boolean
  serverError: string | null
  onClose: () => void
  onSave: (payload: {
    id?: string; tipe_pembayaran: string; branch_id: string; periode_bulan: number; periode_tahun: number
    tanggal: string; jatuh_tempo: string; catatan: string; karyawan: { employee_id: string; pph: string; komponen: { salary_item_id: string; jumlah: string }[]; info_lainnya: { catatan?: string } }[]
  }) => Promise<void>
}) {
  const now = new Date()
  const [payType, setPayType] = useState(initial?.tipe_pembayaran ?? 'Bulanan')
  const [branchId, setBranchId] = useState(initial?.branch_id ?? '')
  const [periodMonth, setPeriodMonth] = useState(initial?.periode_bulan ?? now.getMonth() + 1)
  const [periodYear, setPeriodYear] = useState(initial?.periode_tahun ?? now.getFullYear())
  const [tanggal, setTanggal] = useState(initial?.tanggal ?? isoDate())
  const [due, setDue] = useState(initial?.jatuh_tempo ?? isoDate())
  const [note, setNote] = useState(initial?.catatan ?? '')
  const [lines, setLines] = useState<PayrollLine[]>(() => (initial?._lines ?? []).map((line: any) => ({
    employee_id: line.employee_id, nama_karyawan: line.nama_karyawan, kode_karyawan: line.kode_karyawan ?? '',
    ptkp_status: line.ptkp_status ?? 'TK/0', pph: String(line.pph ?? 0),
    komponen: (line.komponen ?? []).map((component: any) => ({
      salary_item_id: component.salary_item_id, jumlah: String(component.nominal ?? 0), nama: component.nama, item_type: component.item_type,
    })),
    info_lainnya: line.info_lainnya ?? { catatan: '' },
  })))
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [detailLine, setDetailLine] = useState<PayrollLine | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const currentEmployees = employees.filter((employee) => employee.active && (!branchId || employee.branch_id === branchId))
  const availableEmployees = currentEmployees.filter((employee) => !lines.some((line) => line.employee_id === employee.id)
    && [employee.employee_code, employee.full_name, employee.position_title].some((value) => (value ?? '').toLocaleLowerCase('id').includes(employeeSearch.trim().toLocaleLowerCase('id'))))
  const applicableItems = salaryItems.filter((item) => item.active && item.pay_type === payType)
  const totals = lines.reduce((result, line) => {
    const val = lineTotals(line, salaryItems)
    result.gross += val.gross; result.pph += val.pph; result.net += val.net
    result.health += val.health; result.pension += val.pension
    return result
  }, { gross: 0, pph: 0, net: 0, health: 0, pension: 0 })

  function addSelectedEmployee() {
    const employee = employees.find((item) => item.id === candidateId && item.active)
    if (!employee) { setFormError('Cari lalu pilih karyawan terlebih dahulu.'); return }
    if (branchId && employee.branch_id !== branchId) { setFormError('Karyawan harus berasal dari cabang yang dipilih.'); return }
    if (lines.some((line) => line.employee_id === employee.id)) { setFormError('Karyawan ini sudah ada di rincian.'); return }
    const newLine = blankLine(employee, applicableItems, payType)
    setLines((old) => [...old, newLine])
    setDetailLine(newLine)
    setEmployeeSearch(''); setCandidateId(''); setPickerOpen(false); setFormError(null)
  }
  function updateLine(updated: PayrollLine) { setLines((old) => old.map((line) => line.employee_id === updated.employee_id ? updated : line)) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    if (!branches.length) { setFormError('Tambahkan cabang aktif terlebih dahulu di pengaturan perusahaan.'); return }
    if (!branchId) { setFormError('Cabang wajib dipilih.'); return }
    if (!lines.length) { setFormError('Ambil minimal satu karyawan.'); return }
    if (due < tanggal) { setFormError('Jatuh tempo tidak boleh sebelum tanggal transaksi.'); return }
    const normalized = lines.map((line) => ({
      employee_id: line.employee_id,
      pph: line.pph.trim() === '' ? '0' : line.pph,
      komponen: line.komponen.map((component) => ({ salary_item_id: component.salary_item_id, jumlah: component.jumlah.trim() === '' ? '0' : component.jumlah })),
      info_lainnya: line.info_lainnya,
    }))
    onSave({ ...(initial?.id ? { id: initial.id } : {}), tipe_pembayaran: payType, branch_id: branchId,
      periode_bulan: periodMonth, periode_tahun: periodYear, tanggal, jatuh_tempo: due, catatan: note, karyawan: normalized })
  }

  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-2 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="payroll-form-title" className="my-auto flex max-h-[96vh] w-full max-w-[1500px] min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 bg-[#102f59] px-5 py-3 text-white"><div><h2 id="payroll-form-title" className="text-lg font-semibold">{initial ? 'Ubah Pencatatan Gaji' : 'Pencatatan Gaji · Data Baru'}</h2><p className="mt-0.5 text-xs text-white/70">{initial?.nomor ?? 'Nomor transaksi dibuat otomatis saat disimpan.'}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Tutup popup" className="rounded-md p-1 hover:bg-white/10"><X size={20} /></button></div>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <label className="grid gap-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Tipe Pembayaran</span><select className="input" value={payType} onChange={(e) => { setPayType(e.target.value); if (lines.length && e.target.value !== payType) setFormError('Tipe pembayaran berubah. Komponen yang tidak cocok perlu dipilih ulang.') }}><option>Bulanan</option><option>Non bulanan/setahun sekali</option></select></label>
            <label className="grid gap-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Nomor #</span><input className="input bg-canvas" readOnly value={initial?.nomor ?? 'Otomatis saat disimpan'} /></label>
            <label className="grid gap-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Cabang <b className="text-red-600">*</b></span><select className="input" value={branchId} onChange={(e) => { setBranchId(e.target.value); setCandidateId(''); setEmployeeSearch('') }} required><option value="">Pilih cabang…</option>{branches.filter((branch) => branch.active).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Tanggal <b className="text-red-600">*</b></span><input className="input" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
            <label className="grid gap-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Bulan</span><div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><select className="input" value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select><select className="input" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}>{Array.from({ length: 11 }, (_, index) => now.getFullYear() - 5 + index).map((year) => <option key={year} value={year}>{year}</option>)}</select></div></label>
            <label className="grid gap-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Jatuh Tempo <b className="text-red-600">*</b></span><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} required /></label>
          </div>
          {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
          <section className="overflow-visible rounded-lg border border-line">
            <div className="flex flex-col gap-3 border-b border-line p-3 md:flex-row md:items-center">
              <div className="relative w-full md:max-w-md">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
                <input className="input pl-9" value={employeeSearch} onFocus={() => setPickerOpen(true)} onChange={(e) => { setEmployeeSearch(e.target.value); setPickerOpen(true); setCandidateId('') }} placeholder="Cari/Pilih nama karyawan…" />
                {pickerOpen && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-xl">
                  {availableEmployees.slice(0, 50).map((employee) => <button key={employee.id} type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { setCandidateId(employee.id); setEmployeeSearch(employee.full_name); setPickerOpen(false); setFormError(null) }}><span><b>{employee.full_name}</b><span className="ml-2 text-xs text-ink/50">{employee.employee_code}</span><span className="block text-xs text-ink/50">{employee.position_title || 'Tanpa jabatan'}</span></span><span className="text-xs text-blue-700">Pilih</span></button>)}
                  {!availableEmployees.length && <p className="px-3 py-3 text-sm text-ink/55">Tidak ada karyawan aktif yang cocok di cabang ini.</p>}
                </div>}
              </div>
              <button className="btn" type="button" onClick={addSelectedEmployee}><Users size={15} /> Ambil</button>
              <div className="md:ml-auto text-lg font-medium">Rincian Karyawan ({lines.length}) <span className="text-red-600">*</span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#5b7189] text-white"><tr><th className="p-3">Nama Karyawan</th><th className="p-3 text-right">Pendapatan Bruto</th><th className="p-3 text-right">Pajak Penghasilan</th><th className="p-3 text-right">Gaji dibayarkan</th><th className="p-3" /></tr></thead>
                <tbody>
                  {lines.map((line) => { const amount = lineTotals(line, salaryItems); return <tr key={line.employee_id} className="border-t border-line odd:bg-white even:bg-canvas/40"><td className="p-3"><button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setDetailLine(line)}>{line.nama_karyawan}</button><span className="mt-1 block text-xs text-ink/50">{line.kode_karyawan} · [{line.ptkp_status}]</span></td><td className="p-3 text-right tabular-nums">{money(amount.gross)}</td><td className="p-3 text-right tabular-nums">{money(amount.pph)}</td><td className="p-3 text-right font-medium tabular-nums">{money(amount.net)}</td><td className="p-3 text-right"><div className="flex justify-end gap-1"><button type="button" className="btn px-2" title="Rincian karyawan" onClick={() => setDetailLine(line)}><Pencil size={14} /></button><button type="button" className="btn px-2 text-red-600" title="Hapus dari pencatatan" onClick={() => setLines((old) => old.filter((item) => item.employee_id !== line.employee_id))}><Trash2 size={14} /></button></div></td></tr> })}
                  {!lines.length && <tr><td colSpan={5} className="p-8 text-center text-ink/55">Belum ada data. Cari karyawan lalu tekan Ambil.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Summary label="Pendapatan Bruto" value={money(totals.gross)} />
            <Summary label="Pajak Penghasilan" value={money(totals.pph)} />
            <Summary label="Premi Kesehatan Perusahaan" value={money(totals.health)} />
            <Summary label="Premi Pensiun Perusahaan" value={money(totals.pension)} />
            <Summary label="Gaji dibayarkan" value={money(totals.net)} />
          </div>
          <label className="block text-sm font-medium">Catatan
            <textarea className="input mt-1 min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional: catatan periode gaji…" />
          </label>
          {!salaryItems.some((item) => item.active && item.pay_type === payType) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Belum ada komponen gaji aktif untuk tipe pembayaran ini. Atur komponen pada menu Pengaturan → Gaji/Tunjangan terlebih dahulu.</p>}
          <p className="text-xs text-ink/55">PPh 21 pada versi ini diisi atau ditinjau manual berdasarkan perhitungan pajak perusahaan; sistem menghitung gaji dibayarkan dari pendapatan bruto dikurangi PPh dan potongan karyawan.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-white p-4"><button type="button" className="btn" onClick={onClose} disabled={busy}>Batal</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{initial ? 'Simpan Perubahan' : 'Simpan Pencatatan Gaji'}</button></div>
      </form>
    </section>
    {detailLine && <PayrollEmployeeModal
      key={detailLine.employee_id}
      companyId={companyId} line={detailLine}
      employee={employees.find((employee) => employee.id === detailLine.employee_id) ?? null}
      salaryItems={applicableItems}
      year={periodYear} month={periodMonth}
      busy={busy}
      onClose={() => setDetailLine(null)}
      onSave={(updated) => { updateLine(updated); setDetailLine(null) }}
    />}
  </div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-white p-3"><p className="text-xs text-ink/55">{label}</p><p className="mt-1 text-right font-semibold tabular-nums">{value}</p></div>
}

function PayrollEmployeeModal({ companyId, line, employee, salaryItems, year, month, busy, onClose, onSave }: {
  companyId: string; line: PayrollLine; employee: Employee | null; salaryItems: SalaryItem[]; year: number; month: number; busy: boolean
  onClose: () => void; onSave: (line: PayrollLine) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [tab, setTab] = useState<'salary' | 'other'>('salary')
  const [components, setComponents] = useState<PayrollComponent[]>(line.komponen)
  const [pph, setPph] = useState(line.pph || '0')
  const [note, setNote] = useState(line.info_lainnya?.catatan ?? '')
  const [error, setError] = useState<string | null>(null)
  const totals = lineTotals({ ...line, komponen: components, pph }, salaryItems)
  const incomeItems = salaryItems.filter((item) => !EMPLOYEE_DEDUCTION_TYPES.includes(item.item_type) && !EMPLOYER_CONTRIBUTION_TYPES.includes(item.item_type))
  const employerItems = salaryItems.filter((item) => EMPLOYER_CONTRIBUTION_TYPES.includes(item.item_type))
  const deductionItems = salaryItems.filter((item) => EMPLOYEE_DEDUCTION_TYPES.includes(item.item_type))
  const baseSalary = components.reduce((sum, component) => sum + (componentType(component, salaryItems) === 'Gaji/Pensiun atau THT/JHT' ? Number(component.jumlah || 0) : 0), 0)

  function updateAmount(item: SalaryItem, value: string) {
    setComponents((old) => old.some((c) => c.salary_item_id === item.id)
      ? old.map((c) => c.salary_item_id === item.id ? { ...c, jumlah: value, nama: item.name, item_type: item.item_type } : c)
      : [...old, { salary_item_id: item.id, jumlah: value, nama: item.name, item_type: item.item_type }])
  }
  function getAmount(item: SalaryItem) { return components.find((c) => c.salary_item_id === item.id)?.jumlah ?? '0' }
  function calcPercentage(item: SalaryItem) {
    const pct = Number(item.percentage_of_salary) || 0
    updateAmount(item, (baseSalary * pct / 100).toFixed(2))
  }
  async function importPrevious() {
    setError(null)
    const { data, error: loadError } = await sb.rpc('ak_gaji_ambil_sebelumnya', {
      p_company: companyId, p_employee: line.employee_id, p_year: year, p_month: month,
    })
    if (loadError) { setError(loadError.message); return }
    if (!data) { setError('Belum ada pencatatan gaji periode sebelumnya untuk karyawan ini.'); return }
    const oldComponents = Array.isArray(data.komponen) ? data.komponen : []
    setComponents(oldComponents.map((item: any) => ({
      salary_item_id: item.salary_item_id, jumlah: String(item.nominal ?? 0), nama: item.nama, item_type: item.item_type,
    })))
    setPph(String(data.pph ?? 0))
    setNote(String(data.info_lainnya?.catatan ?? ''))
  }
  function continueSave() {
    if (components.some((item) => !item.salary_item_id)) { setError('Setiap rincian harus memiliki komponen gaji yang valid.'); return }
    if (!employee?.subject_to_pph21 && Number(pph) !== 0) { setError('Karyawan ini ditandai tidak dikenai PPh 21 pada master karyawan.'); return }
    if (Number(pph) < 0 || !Number.isFinite(Number(pph))) { setError('PPh harus berupa angka nol atau lebih.'); return }
    if (totals.gross <= 0) { setError('Pendapatan bruto harus lebih dari nol. Isi komponen pendapatan.'); return }
    if (Number(pph) + totals.deductions > totals.gross) { setError('PPh dan total potongan tidak boleh melebihi pendapatan bruto.'); return }
    onSave({ ...line, pph, komponen: components, info_lainnya: { catatan: note } })
  }
  function renderComponent(item: SalaryItem) {
    return <div key={item.id} className="grid gap-2 border-b border-line py-2 last:border-0 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,350px)_44px] sm:items-center">
      <label className="text-sm">{item.name}</label>
      <div className="flex min-w-0 items-center rounded-md border border-[#c9c9c9] bg-white focus-within:border-blue-500"><span className="border-r border-line bg-canvas px-2 py-2 text-sm text-ink/55">Rp</span><input className="min-w-0 flex-1 bg-transparent px-3 py-2 text-right text-sm tabular-nums outline-none" type="number" min="0" step="0.01" value={getAmount(item)} onChange={(e) => updateAmount(item, e.target.value)} /></div>
      {item.percentage_of_salary !== null && item.percentage_of_salary !== undefined
        ? <button type="button" className="btn justify-center px-2" title={'Hitung ' + item.percentage_of_salary + '% dari gaji pokok'} onClick={() => calcPercentage(item)}><Calculator size={17} /></button>
        : <span />}
    </div>
  }
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-2 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="payroll-employee-title" className="flex max-h-[96vh] w-full max-w-[980px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#102f59] px-5 py-3 text-white"><h2 id="payroll-employee-title" className="font-semibold"><Pencil size={17} className="mr-2 inline" />Rincian Karyawan</h2><button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Tutup rincian karyawan"><X size={20} /></button></div>
      <div className="flex gap-1 border-b border-line px-5 pt-3"><button type="button" className={'border-b-2 px-3 py-2 text-sm ' + (tab === 'salary' ? 'border-red-500 text-red-600' : 'border-transparent text-ink/55')} onClick={() => setTab('salary')}>Rincian Gaji</button><button type="button" className={'border-b-2 px-3 py-2 text-sm ' + (tab === 'other' ? 'border-red-500 text-red-600' : 'border-transparent text-ink/55')} onClick={() => setTab('other')}>Info lainnya</button></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {tab === 'salary' ? <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg"><i>{line.nama_karyawan}</i> <span className="text-sm text-ink/60">[{line.ptkp_status}]</span></h3><p className="text-xs text-ink/50">{line.kode_karyawan}</p></div><button type="button" className="btn" onClick={() => void importPrevious()}><ChevronDown size={15} /> Ambil Gaji bulan lalu</button></div>
          {!salaryItems.length && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Belum ada komponen gaji aktif untuk tipe pembayaran ini. Atur komponen pada menu Gaji/Tunjangan.</p>}
          {employerItems.some((item) => item.item_type === 'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja') && <section className="space-y-2"><h4 className="font-medium">Tunjangan Pensiun dibayarkan Perusahaan</h4><div className="rounded-lg border border-line px-3">{employerItems.filter((item) => item.item_type === 'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja').map(renderComponent)}</div></section>}
          <section className="space-y-2"><h4 className="font-medium">Pendapatan Bruto</h4><div className="rounded-lg border border-line px-3">{incomeItems.map(renderComponent)}{!incomeItems.length && <p className="py-4 text-sm text-ink/50">Belum ada komponen pendapatan. Buat komponen pada Pengaturan → Gaji/Tunjangan.</p>}</div></section>
          {employerItems.some((item) => item.item_type !== 'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja') && <section className="space-y-2"><h4 className="font-medium">Tunjangan yang dibayarkan Perusahaan</h4><div className="rounded-lg border border-line px-3">{employerItems.filter((item) => item.item_type !== 'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja').map(renderComponent)}</div></section>}
          <section className="space-y-2"><h4 className="font-medium">Potongan</h4><div className="rounded-lg border border-line px-3">{deductionItems.map(renderComponent)}{!deductionItems.length && <p className="py-4 text-sm text-ink/50">Belum ada komponen potongan yang dikonfigurasi.</p>}
            <div className="grid gap-2 border-t border-line py-2 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,350px)_44px] sm:items-center"><label className="text-sm">Pajak Penghasilan (PPh 21)</label><div className="flex min-w-0 items-center rounded-md border border-[#c9c9c9] bg-canvas"><span className="border-r border-line bg-white px-2 py-2 text-sm text-ink/55">Rp</span><input className="min-w-0 flex-1 bg-transparent px-3 py-2 text-right text-sm outline-none" type="number" min="0" step="0.01" value={pph} readOnly={!employee?.subject_to_pph21} onChange={(e) => setPph(e.target.value)} /></div><span /></div>
            <div className="grid gap-2 border-t border-line py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,350px)_44px] sm:items-center"><span className="text-sm font-medium">Gaji dibayarkan</span><div className="rounded-md border border-line bg-canvas px-3 py-2 text-right font-semibold tabular-nums">{money(totals.net)}</div><span /></div>
          </div></section>
          <p className="text-xs text-ink/55">PPh 21 tidak dihitung otomatis pada versi ini. Periksa nominal pajak sesuai ketentuan dan data payroll perusahaan sebelum menyimpan.</p>
        </> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="ID Karyawan" value={line.kode_karyawan} /><Info label="Nama Lengkap" value={line.nama_karyawan} />
            <Info label="Jabatan" value={employee?.position_title || '—'} /><Info label="Cabang" value={employee?.branch?.name || '—'} />
            <Info label="Departemen" value={employee?.department?.name || '—'} /><Info label="Status Pegawai" value={employee?.employment_status || '—'} />
            <Info label="Status PTKP" value={line.ptkp_status} /><Info label="NPWP" value={employee?.npwp || '—'} />
            <Info label="Rekening Bank" value={employee?.bank_name || '—'} /><Info label="Nomor Rekening" value={employee?.bank_account_number || '—'} />
            <Info label="Nama Pemilik Rekening" value={employee?.bank_account_name || '—'} />
          </div>
          <label className="block text-sm font-medium">Catatan karyawan pada periode ini<textarea className="input mt-1 min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" /></label>
        </>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line p-4"><button type="button" className="btn" onClick={onClose}>Batal</button><button type="button" className="btn btn-primary" onClick={continueSave}><Check size={15} /> Lanjut</button></div>
    </section>
  </div>
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line p-3"><p className="text-xs text-ink/55">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>
}

function PayrollPaymentModal({ bill, cashAccounts, busy, serverError, onClose, onSave }: {
  bill: PayrollRow; cashAccounts: CashAccount[]; busy: boolean; serverError: string | null; onClose: () => void
  onSave: (payload: { tanggal: string; jumlah: string; rekening_id: string; catatan: string }) => Promise<void>
}) {
  const [tanggal, setTanggal] = useState(isoDate())
  const [jumlah, setJumlah] = useState(String(bill.sisa))
  const [rekening, setRekening] = useState(cashAccounts.find((item) => item.tipe === 'bank')?.id ?? cashAccounts[0]?.id ?? '')
  const [catatan, setCatatan] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const eligible = cashAccounts.filter((item) => item.aktif && item.currency_code === 'IDR')
  function submit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    if (!rekening || !eligible.some((item) => item.id === rekening)) { setFormError('Pilih rekening Kas/Bank aktif bermata uang IDR.'); return }
    const amount = Number(jumlah)
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(bill.sisa)) { setFormError('Jumlah pembayaran harus lebih dari nol dan tidak melebihi sisa gaji.'); return }
    onSave({ tanggal, jumlah, rekening_id: rekening, catatan })
  }
  return <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-3 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <form onSubmit={submit} className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#102f59] px-5 py-4 text-white"><div><h2 className="font-semibold">Pembayaran Gaji</h2><p className="text-xs text-white/70">{bill.nomor}</p></div><button className="rounded-md p-1 hover:bg-white/10" type="button" onClick={onClose} aria-label="Tutup popup"><X size={19} /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-lg bg-canvas p-3"><p className="text-xs text-ink/55">Sisa gaji yang perlu dibayar</p><p className="mt-1 text-xl font-semibold">{money(bill.sisa)}</p></div>
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
        {!eligible.length && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Belum ada rekening Kas/Bank aktif bermata uang IDR.</p>}
        <label className="block space-y-1 text-sm font-medium">Tanggal Pembayaran<input type="date" className="input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
        <label className="block space-y-1 text-sm font-medium">Rekening Kas/Bank<select className="input" value={rekening} onChange={(e) => setRekening(e.target.value)} required><option value="">Pilih rekening…</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.nama} · IDR</option>)}</select></label>
        <label className="block space-y-1 text-sm font-medium">Jumlah Pembayaran<input type="number" className="input" min="0.01" step="0.01" max={Number(bill.sisa)} value={jumlah} onChange={(e) => setJumlah(e.target.value)} required /></label>
        <label className="block space-y-1 text-sm font-medium">Catatan Pembayaran<input className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" /></label>
        <p className="text-xs text-ink/55">Pembayaran dicatat sebagai Kas Keluar dan menghasilkan jurnal pelunasan hutang gaji.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-line p-4"><button className="btn" type="button" onClick={onClose}>Batal</button><button className="btn btn-primary" disabled={busy || !eligible.length}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{busy ? 'Menyimpan…' : 'Proses Pembayaran'}</button></div>
    </form>
  </div>
}
