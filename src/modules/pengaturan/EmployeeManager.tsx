'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import type {
  Employee,
  EmployeeBranchOption,
  EmployeeDepartmentOption,
  EmployeePTKPStatus,
  EmployeeTaxStatus,
} from './employees'

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]
const EMPLOYMENT_STATUSES: EmployeeTaxStatus[] = ['Pegawai Tetap', 'Pegawai Tidak Tetap', 'Bukan Pegawai', 'Penerima Pensiun']
const PTKP_OPTIONS: { value: EmployeePTKPStatus; label: string }[] = [
  { value: 'TK/0', label: 'Tidak Kawin (Tidak ada tanggungan)' },
  { value: 'TK/1', label: 'Tidak Kawin (1 tanggungan)' },
  { value: 'TK/2', label: 'Tidak Kawin (2 tanggungan)' },
  { value: 'TK/3', label: 'Tidak Kawin (3 tanggungan)' },
  { value: 'K/0', label: 'Kawin (Tidak ada tanggungan)' },
  { value: 'K/1', label: 'Kawin (1 tanggungan)' },
  { value: 'K/2', label: 'Kawin (2 tanggungan)' },
  { value: 'K/3', label: 'Kawin (3 tanggungan)' },
]
const BANK_OPTIONS = ['BCA', 'BRI', 'BNI', 'Bank Mandiri', 'BTN', 'CIMB Niaga', 'Danamon', 'PermataBank', 'Bank Syariah Indonesia (BSI)', 'Bank Jago', 'Lainnya']

type EmployeeFormState = {
  employee_code: string
  employee_code_auto: boolean
  employee_code_series: string
  name_prefix: string
  full_name: string
  identity_number: string
  email: string
  mobile_phone: string
  business_phone: string
  home_phone: string
  whatsapp: string
  website: string
  position_title: string
  start_date: string
  branch_id: string
  department_id: string
  is_salesperson: boolean
  notes: string
  address_line: string
  city: string
  postal_code: string
  province: string
  country: string
  subject_to_pph21: boolean
  npwp: string
  employment_status: EmployeeTaxStatus
  ptkp_status: EmployeePTKPStatus
  tax_start_month: string
  tax_start_year: string
  previous_income: string
  previous_pph: string
  bank_name: string
  bank_account_number: string
  bank_account_name: string
  active: boolean
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function blankForm(): EmployeeFormState {
  const today = localToday()
  return {
    employee_code: '', employee_code_auto: true, employee_code_series: 'Karyawan',
    name_prefix: '', full_name: '', identity_number: '', email: '', mobile_phone: '',
    business_phone: '', home_phone: '', whatsapp: '', website: '', position_title: '',
    start_date: today, branch_id: '', department_id: '', is_salesperson: false, notes: '',
    address_line: '', city: '', postal_code: '', province: '', country: 'Indonesia',
    subject_to_pph21: true, npwp: '', employment_status: 'Pegawai Tetap', ptkp_status: 'TK/0',
    tax_start_month: String(Number(today.slice(5, 7))), tax_start_year: today.slice(0, 4),
    previous_income: '0', previous_pph: '0', bank_name: '', bank_account_number: '',
    bank_account_name: '', active: true,
  }
}
function formFromEmployee(employee: Employee): EmployeeFormState {
  const blank = blankForm()
  return {
    employee_code: employee.employee_code ?? '',
    employee_code_auto: employee.employee_code_auto ?? true,
    employee_code_series: employee.employee_code_series || 'Karyawan',
    name_prefix: employee.name_prefix ?? '', full_name: employee.full_name ?? '',
    identity_number: employee.identity_number ?? '', email: employee.email ?? '',
    mobile_phone: employee.mobile_phone ?? '', business_phone: employee.business_phone ?? '',
    home_phone: employee.home_phone ?? '', whatsapp: employee.whatsapp ?? '', website: employee.website ?? '',
    position_title: employee.position_title ?? '', start_date: employee.start_date ?? blank.start_date,
    branch_id: employee.branch_id ?? '', department_id: employee.department_id ?? '',
    is_salesperson: employee.is_salesperson ?? false, notes: employee.notes ?? '',
    address_line: employee.address_line ?? '', city: employee.city ?? '', postal_code: employee.postal_code ?? '',
    province: employee.province ?? '', country: employee.country ?? 'Indonesia',
    subject_to_pph21: employee.subject_to_pph21 ?? true, npwp: employee.npwp ?? '',
    employment_status: employee.employment_status ?? 'Pegawai Tetap',
    ptkp_status: employee.ptkp_status ?? 'TK/0',
    tax_start_month: String(employee.tax_start_month ?? Number(blank.tax_start_month)),
    tax_start_year: String(employee.tax_start_year ?? blank.tax_start_year),
    previous_income: String(employee.previous_income ?? 0),
    previous_pph: String(employee.previous_pph ?? 0),
    bank_name: employee.bank_name ?? '', bank_account_number: employee.bank_account_number ?? '',
    bank_account_name: employee.bank_account_name ?? '', active: employee.active ?? true,
  }
}
type FieldProps = { label: string; children: React.ReactNode; required?: boolean; className?: string }

function Field({ label, children, required = false, className = '' }: FieldProps) {
  return (
    <div className={`grid min-w-0 gap-1.5 sm:grid-cols-[minmax(145px,0.7fr)_minmax(0,1.3fr)] sm:items-center ${className}`}>
      <div className="text-sm font-medium">{label}{required && <span className="ml-1 text-red-600">*</span>}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 space-y-1">
      <h3 className="text-xl font-medium text-brand">{children}</h3>
      <div className="h-px bg-line" />
    </div>
  )
}

export default function EmployeeManager({ companyId, initial, branches, departments, initialError }: {
  companyId: string
  initial: Employee[]
  branches: EmployeeBranchOption[]
  departments: EmployeeDepartmentOption[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setRows(initial), [initial])

  async function remove(employee: Employee) {
    if (!confirm(`Hapus data karyawan "${employee.full_name}" (${employee.employee_code})?`)) return
    setDeleting(employee.id); setError(null); setNotice(null)
    const { error: removeError } = await sb.rpc('company_employee_delete', { p_company: companyId, p_employee: employee.id })
    setDeleting(null)
    if (removeError) return setError(removeError.message)
    setRows((current) => current.filter((row) => row.id !== employee.id))
    setNotice(`Data karyawan "${employee.full_name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(employee: Employee) {
    setRows((current) => {
      const exists = current.some((row) => row.id === employee.id)
      return (exists ? current.map((row) => row.id === employee.id ? employee : row) : [employee, ...current])
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'))
    })
    setEditing(null); setError(null); setNotice(`Data karyawan "${employee.full_name}" berhasil disimpan.`)
    router.refresh()
  }

  const filtered = rows.filter((employee) => [
    employee.employee_code, employee.full_name, employee.identity_number, employee.email,
    employee.mobile_phone, employee.position_title, employee.branch?.name, employee.department?.name,
  ].some((value) => (value ?? '').toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id'))))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Karyawan</h1>
          <p className="mt-1 text-sm text-ink/60">Kelola data pribadi, penempatan, pajak penghasilan, alamat, dan rekening gaji karyawan.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah Karyawan
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Data karyawan, cabang, atau departemen belum dapat dimuat: {initialError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
          <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, ID, email, cabang..." />
        </div>
        <span className="text-sm text-ink/60">{filtered.length} karyawan</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead><tr className="border-b border-line bg-canvas text-ink/60">
            <th className="p-3 font-medium">ID Karyawan</th>
            <th className="p-3 font-medium">Nama Lengkap</th>
            <th className="p-3 font-medium">Posisi Jabatan</th>
            <th className="p-3 font-medium">Cabang / Departemen</th>
            <th className="p-3 font-medium">Kontak</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {filtered.map((employee) => (
              <tr key={employee.id} className={`border-b border-line last:border-0 align-top ${employee.active ? '' : 'text-ink/45'}`}>
                <td className="whitespace-nowrap p-3 font-medium">{employee.employee_code}</td>
                <td className="p-3"><div className="font-medium text-ink">{[employee.name_prefix, employee.full_name].filter(Boolean).join(' ')}</div><div className="mt-1 text-xs text-ink/55">{employee.identity_number || 'KTP belum diisi'}</div></td>
                <td className="p-3">{employee.position_title || '—'}</td>
                <td className="p-3"><div>{employee.branch?.name || '—'}</div><div className="mt-1 text-xs text-ink/55">{employee.department?.name || 'Tanpa departemen'}</div></td>
                <td className="p-3"><div>{employee.mobile_phone || '—'}</div><div className="mt-1 text-xs text-ink/55">{employee.email || ''}</div></td>
                <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${employee.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{employee.active ? 'Aktif' : 'Nonaktif'}</span></td>
                <td className="whitespace-nowrap p-3 text-right"><div className="flex justify-end gap-1">
                  <button type="button" className="btn px-2" title="Ubah" aria-label={`Ubah ${employee.full_name}`} onClick={() => { setError(null); setNotice(null); setEditing(employee) }}><Pencil size={15} /></button>
                  <button type="button" className="btn px-2" title="Hapus" aria-label={`Hapus ${employee.full_name}`} disabled={deleting === employee.id} onClick={() => remove(employee)}><Trash2 size={15} /></button>
                </div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-ink/60">{search ? 'Tidak ada karyawan yang cocok dengan pencarian.' : 'Belum ada data karyawan. Pilih Tambah Karyawan untuk membuat data pertama.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <EmployeeForm key={editing === 'new' ? 'new' : editing.id} companyId={companyId} employee={editing === 'new' ? null : editing} branches={branches} departments={departments} onCancel={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}

function EmployeeForm({ companyId, employee, branches, departments, onCancel, onSaved }: {
  companyId: string
  employee: Employee | null
  branches: EmployeeBranchOption[]
  departments: EmployeeDepartmentOption[]
  onCancel: () => void
  onSaved: (employee: Employee) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [form, setForm] = useState<EmployeeFormState>(() => employee ? formFromEmployee(employee) : blankForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bankSearch, setBankSearch] = useState(employee?.bank_name ?? '')
  const [bankOpen, setBankOpen] = useState(false)
  const set = <K extends keyof EmployeeFormState,>(key: K, value: EmployeeFormState[K]) => setForm((current) => ({ ...current, [key]: value }))
  const matchingBanks = BANK_OPTIONS.filter((bank) => bank.toLocaleLowerCase('id').includes(bankSearch.toLocaleLowerCase('id')))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.full_name.trim()) return setError('Nama lengkap wajib diisi.')
    if (!form.employee_code_auto && !form.employee_code.trim()) return setError('ID karyawan wajib diisi jika tidak menggunakan ID otomatis.')
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Format email tidak valid.')
    if (!form.start_date) return setError('Tanggal masuk wajib diisi.')
    if (!Number.isInteger(Number(form.tax_start_month)) || Number(form.tax_start_month) < 1 || Number(form.tax_start_month) > 12) return setError('Pilih bulan mulai perhitungan PPh yang valid.')
    if (!Number.isInteger(Number(form.tax_start_year)) || Number(form.tax_start_year) < 2000 || Number(form.tax_start_year) > 2200) return setError('Tahun mulai perhitungan PPh tidak valid.')
    if (Number(form.previous_income) < 0 || Number(form.previous_pph) < 0) return setError('Penghasilan sebelumnya dan PPh sebelumnya tidak boleh negatif.')
    setBusy(true)
    const payload = {
      id: employee?.id ?? null,
      company_id: companyId,
      employee_code: form.employee_code.trim(),
      employee_code_auto: form.employee_code_auto,
      employee_code_series: form.employee_code_series,
      name_prefix: form.name_prefix,
      full_name: form.full_name.trim(),
      identity_number: form.identity_number.trim(),
      email: form.email.trim(),
      mobile_phone: form.mobile_phone.trim(),
      business_phone: form.business_phone.trim(),
      home_phone: form.home_phone.trim(),
      whatsapp: form.whatsapp.trim(),
      website: form.website.trim(),
      position_title: form.position_title.trim(),
      start_date: form.start_date,
      branch_id: form.branch_id || null,
      department_id: form.department_id || null,
      is_salesperson: form.is_salesperson,
      notes: form.notes.trim(),
      address_line: form.address_line.trim(),
      city: form.city.trim(),
      postal_code: form.postal_code.trim(),
      province: form.province.trim(),
      country: form.country.trim() || 'Indonesia',
      subject_to_pph21: form.subject_to_pph21,
      npwp: form.npwp.trim(),
      employment_status: form.employment_status,
      ptkp_status: form.ptkp_status,
      tax_start_month: Number(form.tax_start_month),
      tax_start_year: Number(form.tax_start_year),
      previous_income: form.previous_income.trim() || '0',
      previous_pph: form.previous_pph.trim() || '0',
      bank_name: form.bank_name.trim(),
      bank_account_number: form.bank_account_number.trim(),
      bank_account_name: form.bank_account_name.trim(),
      active: form.active,
    }
    const { data, error: saveError } = await sb.rpc('company_employee_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505'
        ? saveError.message.toLowerCase().includes('identity') || saveError.message.toLowerCase().includes('ktp')
          ? 'Nomor KTP sudah digunakan oleh karyawan lain di perusahaan ini.'
          : 'ID karyawan atau data unik lainnya sudah digunakan. Periksa kembali.'
        : saveError.message)
      return
    }
    const chosenBranch = branches.find((branch) => branch.id === form.branch_id) ?? null
    const chosenDepartment = departments.find((department) => department.id === form.department_id) ?? null
    onSaved({
      id: data as string,
      company_id: companyId,
      employee_code: form.employee_code_auto ? employee?.employee_code || 'Dibuat otomatis' : form.employee_code.trim(),
      employee_code_auto: form.employee_code_auto,
      employee_code_series: form.employee_code_series,
      name_prefix: form.name_prefix || null,
      full_name: form.full_name.trim(),
      identity_number: form.identity_number.trim() || null,
      email: form.email.trim() || null,
      mobile_phone: form.mobile_phone.trim() || null,
      business_phone: form.business_phone.trim() || null,
      home_phone: form.home_phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      website: form.website.trim() || null,
      position_title: form.position_title.trim() || null,
      start_date: form.start_date,
      branch_id: form.branch_id || null,
      department_id: form.department_id || null,
      is_salesperson: form.is_salesperson,
      notes: form.notes.trim() || null,
      address_line: form.address_line.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      province: form.province.trim() || null,
      country: form.country.trim() || 'Indonesia',
      subject_to_pph21: form.subject_to_pph21,
      npwp: form.npwp.trim() || null,
      employment_status: form.employment_status,
      ptkp_status: form.ptkp_status,
      tax_start_month: Number(form.tax_start_month),
      tax_start_year: Number(form.tax_start_year),
      previous_income: Number(form.previous_income || 0),
      previous_pph: Number(form.previous_pph || 0),
      bank_name: form.bank_name.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      active: form.active,
      created_at: employee?.created_at,
      branch: chosenBranch,
      department: chosenDepartment,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-2 sm:p-5" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="employee-form-title"
        style={{ width: 'min(1500px, calc(100vw - 16px))', maxWidth: 'calc(100vw - 16px)', maxHeight: '94vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="employee-form-title" className="text-lg font-semibold">{employee ? 'Ubah Karyawan' : 'Data Baru'}</h2>
            <p className="mt-1 text-sm text-ink/60">Semua bagian ada dalam satu popup. Gulir ke bawah untuk melengkapi alamat, pajak penghasilan, dan rekening gaji.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-7 overflow-y-auto px-5 py-5">
            <div className="grid gap-8 xl:grid-cols-2">
              <section>
                <SectionTitle>Data Pribadi</SectionTitle>
                <div className="space-y-3.5">
                  <Field label="Nama Lengkap" required>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                      <select className="input w-full" value={form.name_prefix} onChange={(e) => set('name_prefix', e.target.value)}>
                        <option value="">- Sapa -</option><option value="Bapak">Bapak</option><option value="Ibu">Ibu</option><option value="Tuan">Tuan</option><option value="Nyonya">Nyonya</option><option value="Saudara">Saudara</option><option value="Saudari">Saudari</option><option value="Dr.">Dr.</option>
                      </select>
                      <input className="input w-full" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required maxLength={180} placeholder="Nama lengkap" />
                    </div>
                  </Field>
                  <Field label="No. KTP"><input className="input w-full" value={form.identity_number} onChange={(e) => set('identity_number', e.target.value)} maxLength={40} /></Field>
                  <Field label="Email"><input className="input w-full" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={180} /></Field>
                  <Field label="Handphone"><input className="input w-full" value={form.mobile_phone} onChange={(e) => set('mobile_phone', e.target.value)} maxLength={40} /></Field>
                  <Field label="No. Telp. Bisnis"><input className="input w-full" value={form.business_phone} onChange={(e) => set('business_phone', e.target.value)} maxLength={40} /></Field>
                  <Field label="No. Telp. Rumah"><input className="input w-full" value={form.home_phone} onChange={(e) => set('home_phone', e.target.value)} maxLength={40} /></Field>
                  <Field label="No. WhatsApp"><input className="input w-full" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} maxLength={40} /></Field>
                  <Field label="Website"><input className="input w-full" value={form.website} onChange={(e) => set('website', e.target.value)} maxLength={200} placeholder="https://" /></Field>
                </div>
              </section>

              <section>
                <SectionTitle>Data Karyawan</SectionTitle>
                <div className="space-y-3.5">
                  <Field label="ID Karyawan" required>
                    <div className="flex min-w-0 items-center gap-2">
                      <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink/70" title="Buat ID secara otomatis">
                        <input type="checkbox" className="h-4 w-4 accent-brand" checked={form.employee_code_auto} onChange={(e) => set('employee_code_auto', e.target.checked)} />
                        Otomatis
                      </label>
                      {form.employee_code_auto
                        ? <select className="input min-w-0 flex-1" value={form.employee_code_series} onChange={(e) => set('employee_code_series', e.target.value)}><option value="Karyawan">Karyawan (KRY-00001, dst.)</option></select>
                        : <input className="input min-w-0 flex-1" value={form.employee_code} onChange={(e) => set('employee_code', e.target.value)} maxLength={60} required placeholder="Masukkan ID karyawan" />}
                    </div>
                  </Field>
                  {form.employee_code_auto && <p className="pl-[calc(0.7fr+145px)] text-xs text-ink/55">ID berikutnya dibuat otomatis saat disimpan.</p>}
                  <Field label="Posisi Jabatan"><input className="input w-full" value={form.position_title} onChange={(e) => set('position_title', e.target.value)} maxLength={120} /></Field>
                  <Field label="Tgl Masuk" required><input className="input w-full" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required /></Field>
                  <Field label="Cabang">
                    <select className="input w-full" value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
                      <option value="">Pilih cabang…</option>
                      {branches.filter((branch) => branch.active || branch.id === form.branch_id).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{!branch.active ? ' (nonaktif)' : ''}</option>)}
                    </select>
                  </Field>
                  <Field label="Departemen">
                    <select className="input w-full" value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
                      <option value="">Cari/Pilih…</option>
                      {departments.filter((department) => department.active || department.id === form.department_id).map((department) => <option key={department.id} value={department.id}>{department.name}{!department.active ? ' (nonaktif)' : ''}</option>)}
                    </select>
                  </Field>
                  <Field label="Penjual">
                    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={form.is_salesperson} onChange={(e) => set('is_salesperson', e.target.checked)} /> Ya</label>
                  </Field>
                  <Field label="Catatan"><textarea className="input min-h-20 w-full" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} /></Field>
                </div>
              </section>
            </div>

            <section>
              <SectionTitle>Info Alamat</SectionTitle>
              <div className="grid gap-3.5 xl:max-w-3xl">
                <Field label="Alamat">
                  <textarea className="input min-h-24 w-full" rows={3} value={form.address_line} onChange={(e) => set('address_line', e.target.value)} maxLength={1000} placeholder="Jalan" />
                </Field>
                <Field label="Kota / Kode Pos">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.6fr)] gap-2">
                    <input className="input w-full" value={form.city} onChange={(e) => set('city', e.target.value)} maxLength={120} placeholder="Kota" />
                    <input className="input w-full" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} maxLength={20} placeholder="K.Pos" />
                  </div>
                </Field>
                <Field label="Provinsi"><input className="input w-full" value={form.province} onChange={(e) => set('province', e.target.value)} maxLength={120} placeholder="Provinsi" /></Field>
                <Field label="Negara"><input className="input w-full" value={form.country} onChange={(e) => set('country', e.target.value)} maxLength={120} placeholder="Negara" /></Field>
              </div>
            </section>

            <section>
              <SectionTitle>Pajak Penghasilan</SectionTitle>
              <div className="grid gap-8 xl:grid-cols-2">
                <div className="space-y-3.5">
                  <Field label="Dikenakan PPh 21">
                    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={form.subject_to_pph21} onChange={(e) => set('subject_to_pph21', e.target.checked)} /> Ya</label>
                  </Field>
                  <Field label="No. NPWP"><input className="input w-full" value={form.npwp} onChange={(e) => set('npwp', e.target.value)} maxLength={40} placeholder="NPWP (opsional)" /></Field>
                  <Field label="Status Pekerja">
                    <select className="input w-full" value={form.employment_status} onChange={(e) => set('employment_status', e.target.value as EmployeeTaxStatus)}>
                      {EMPLOYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                  <Field label="Dikenakan PTKP"><input className="input w-full bg-slate-50 text-ink/65" value={form.subject_to_pph21 ? 'Ya' : 'Tidak'} readOnly aria-readonly="true" /></Field>
                  <Field label="Status PTKP">
                    <select className="input w-full" value={form.ptkp_status} onChange={(e) => set('ptkp_status', e.target.value as EmployeePTKPStatus)} disabled={!form.subject_to_pph21}>
                      {PTKP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <div className="text-sm font-medium">Perhitungan PPh</div>
                    <div className="h-px bg-line" />
                  </div>
                  <Field label="PPh mulai dihitung">
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <select className="input w-full" value={form.tax_start_month} onChange={(e) => set('tax_start_month', e.target.value)}>
                        {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                      </select>
                      <input className="input w-full" type="number" min="2000" max="2200" value={form.tax_start_year} onChange={(e) => set('tax_start_year', e.target.value)} required />
                    </div>
                  </Field>
                  <Field label="Penghasilan Sebelumnya">
                    <input className="input w-full" type="number" min="0" step="0.01" value={form.previous_income} onChange={(e) => set('previous_income', e.target.value)} />
                  </Field>
                  <Field label="PPh Sebelumnya">
                    <input className="input w-full" type="number" min="0" step="0.01" value={form.previous_pph} onChange={(e) => set('previous_pph', e.target.value)} />
                  </Field>
                  <p className="border-l-4 border-slate-300 pl-3 text-sm italic text-ink/60">Penghasilan dan PPh sebelumnya diisi jika perhitungan sudah berjalan sejak awal tahun tetapi pencatatan gaji di sistem dimulai pada bulan berikutnya.</p>
                </div>
              </div>
            </section>

            <section>
              <SectionTitle>Rekening Gaji — Info Akun</SectionTitle>
              <div className="grid gap-3.5 xl:max-w-3xl">
                <Field label="Nama Bank">
                  <div className="relative">
                    <div className="relative">
                      <input className="input w-full pr-10" value={bankSearch} onChange={(e) => { setBankSearch(e.target.value); set('bank_name', e.target.value); setBankOpen(true) }} onFocus={() => setBankOpen(true)} maxLength={120} autoComplete="off" placeholder="Cari/Pilih nama bank..." aria-expanded={bankOpen} aria-controls="employee-bank-options" />
                      <button type="button" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink/70" aria-label="Cari nama bank" onClick={() => setBankOpen((open) => !open)}><Search size={18} /></button>
                    </div>
                    {bankOpen && <div id="employee-bank-options" className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
                      {matchingBanks.map((bank) => <button key={bank} type="button" className="block w-full border-b border-line px-3 py-2.5 text-left text-sm last:border-0 hover:bg-canvas" onClick={() => { set('bank_name', bank); setBankSearch(bank); setBankOpen(false) }}>{bank}</button>)}
                      <button type="button" className="sticky bottom-0 w-full border-t border-line bg-canvas px-3 py-2 text-sm text-ink/70" onClick={() => setBankOpen(false)}><ChevronDown size={14} className="mr-1 inline" /> Tutup daftar</button>
                    </div>}
                  </div>
                </Field>
                <Field label="No Rekening"><input className="input w-full" value={form.bank_account_number} onChange={(e) => set('bank_account_number', e.target.value)} maxLength={100} /></Field>
                <Field label="Atas Nama Rekening"><input className="input w-full" value={form.bank_account_name} onChange={(e) => set('bank_account_name', e.target.value)} maxLength={180} /></Field>
              </div>
            </section>

            <section className="border-t border-line pt-4">
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Karyawan Aktif</label>
            </section>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-white px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !form.full_name.trim()}><Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan Karyawan'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
