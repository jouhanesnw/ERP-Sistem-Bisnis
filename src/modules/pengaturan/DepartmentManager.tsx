'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/modules/pengaturan/currencies'

type Account = { id: string; kode: string; nama: string; tipe: string; aktif: boolean }
type CompanyMember = { id: string; user_id: string; role: string; full_name: string; email: string }
type Department = {
  id: string
  company_id: string
  name: string
  description: string | null
  parent_department_id: string | null
  opening_balance: number | string
  opening_balance_date: string
  coa_id: string | null
  active: boolean
  created_at?: string
  membershipIds: string[]
}
type DepartmentRow = Department & { parentName: string | null; coa: Account | null }

function todayLocal() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}
function dateLabel(value: string) {
  if (!value) return '—'
  const date = new Date(value + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export default function DepartmentManager({ companyId, initial, members, accounts, initialError }: {
  companyId: string
  initial: DepartmentRow[]
  members: CompanyMember[]
  accounts: Account[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [departments, setDepartments] = useState(initial)
  const [editing, setEditing] = useState<DepartmentRow | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setDepartments(initial), [initial])

  async function remove(department: DepartmentRow) {
    if (!confirm(`Hapus departemen "${department.name}"? Penugasan penggunanya juga akan dihapus.`)) return
    setDeleting(department.id)
    setError(null)
    setNotice(null)
    const { error: deleteError } = await sb.rpc('company_department_delete', {
      p_company: companyId,
      p_department: department.id,
    })
    setDeleting(null)
    if (deleteError) return setError(deleteError.message)
    setDepartments((rows) => rows.filter((row) => row.id !== department.id))
    setNotice(`Departemen "${department.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(department: Department) {
    const row: DepartmentRow = {
      ...department,
      parentName: departments.find((item) => item.id === department.parent_department_id)?.name ?? null,
      coa: accounts.find((account) => account.id === department.coa_id) ?? null,
    }
    setDepartments((rows) => {
      const exists = rows.some((item) => item.id === row.id)
      return (exists ? rows.map((item) => item.id === row.id ? row : item) : [row, ...rows])
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    })
    setEditing(null)
    setNotice(`Departemen "${row.name}" berhasil disimpan.`)
    setError(null)
    router.refresh()
  }

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Departemen</h1>
          <p className="mt-1 text-sm text-ink/60">Kelola hierarki departemen, COA, saldo awal, dan anggota yang ditugaskan.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah departemen
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Data departemen, akun, atau pengguna belum dapat dimuat: {initialError}</p>}

      {departments.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-ink/60">
                <th className="p-3 font-medium">Departemen</th>
                <th className="p-3 font-medium">Sub departemen dari</th>
                <th className="p-3 font-medium">COA / Nama akun</th>
                <th className="p-3 text-right font-medium">Saldo awal</th>
                <th className="p-3 font-medium">Pengguna</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => {
                const assigned = department.membershipIds.map((id) => memberMap.get(id)).filter((member): member is CompanyMember => !!member)
                return (
                  <tr key={department.id} className="border-b border-line last:border-0 align-top">
                    <td className="p-3">
                      <p className="font-medium">{department.name}</p>
                      {department.description && <p className="mt-1 max-w-[240px] whitespace-normal text-xs text-ink/60">{department.description}</p>}
                    </td>
                    <td className="p-3">{department.parentName || <span className="text-ink/40">Departemen utama</span>}</td>
                    <td className="p-3">
                      {department.coa
                        ? <><span className="font-medium">{department.coa.kode}</span><span className="block text-xs text-ink/60">{department.coa.nama}</span></>
                        : <span className="text-ink/40">Belum dipilih</span>}
                    </td>
                    <td className="whitespace-nowrap p-3 text-right tabular-nums">
                      {formatCurrency(Number(department.opening_balance), 'IDR')}
                      <span className="mt-1 block text-xs text-ink/50">{dateLabel(department.opening_balance_date)}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex max-w-[200px] flex-wrap gap-1">
                        {assigned.length ? assigned.map((member) => (
                          <span key={member.id} title={member.full_name || member.email} className="max-w-[150px] truncate rounded-full bg-canvas px-2 py-1 text-xs">{member.full_name || member.email}</span>
                        )) : <span className="text-xs text-ink/40">Belum ada</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${department.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{department.active ? 'Aktif' : 'Nonaktif'}</span>
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn px-2" onClick={() => { setError(null); setNotice(null); setEditing(department) }} aria-label={`Ubah ${department.name}`} title="Ubah"><Pencil size={15} /></button>
                        <button type="button" className="btn px-2" disabled={deleting === department.id} onClick={() => remove(department)} aria-label={`Hapus ${department.name}`} title="Hapus"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink/60"><Building2 size={27} /></div>
          <h2 className="mt-4 font-semibold">Belum ada departemen</h2>
          <p className="mt-1 max-w-md text-sm text-ink/60">Buat departemen pertama, hubungkan ke akun COA bila diperlukan, atur saldo awal, dan pilih anggota perusahaan yang ditugaskan.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => { setError(null); setNotice(null); setEditing('new') }}><Plus size={16} /> Tambah departemen</button>
        </div>
      )}

      {editing && (
        <DepartmentForm
          key={editing === 'new' ? 'new' : editing.id}
          companyId={companyId}
          department={editing === 'new' ? null : editing}
          departments={departments}
          members={members}
          accounts={accounts}
          onCancel={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}

function DepartmentForm({ companyId, department, departments, members, accounts, onCancel, onSaved }: {
  companyId: string
  department: DepartmentRow | null
  departments: DepartmentRow[]
  members: CompanyMember[]
  accounts: Account[]
  onCancel: () => void
  onSaved: (department: Department) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(department?.name ?? '')
  const [description, setDescription] = useState(department?.description ?? '')
  const [parentId, setParentId] = useState(department?.parent_department_id ?? '')
  const [openingBalance, setOpeningBalance] = useState(String(department?.opening_balance ?? '0'))
  const [openingDate, setOpeningDate] = useState(department?.opening_balance_date ?? todayLocal())
  const [coaId, setCoaId] = useState(department?.coa_id ?? '')
  const [active, setActive] = useState(department?.active ?? true)
  const [selectedIds, setSelectedIds] = useState<string[]>(department?.membershipIds ?? [])
  const [query, setQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedMembers = selectedIds.map((id) => members.find((member) => member.id === id)).filter((member): member is CompanyMember => !!member)
  const candidates = members.filter((member) =>
    !selectedIds.includes(member.id) &&
    [member.full_name, member.email, member.role].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))
  )
  function isDescendant(candidateId: string, ancestorId: string) {
    let current = departments.find((item) => item.id === candidateId)
    const visited = new Set<string>()
    while (current?.parent_department_id && !visited.has(current.id)) {
      if (current.parent_department_id === ancestorId) return true
      visited.add(current.id)
      current = departments.find((item) => item.id === current?.parent_department_id)
    }
    return false
  }
  const parentOptions = departments.filter((item) =>
    item.id !== department?.id && (!department || !isDescendant(item.id, department.id)) && item.active
  )

  function selectMember(member: CompanyMember) {
    setSelectedIds((ids) => ids.includes(member.id) ? ids : [...ids, member.id])
    setQuery('')
    setPickerOpen(false)
  }
  function removeMember(id: string) {
    setSelectedIds((ids) => ids.filter((memberId) => memberId !== id))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      id: department?.id ?? null,
      company_id: companyId,
      name: name.trim(),
      description: description.trim(),
      parent_department_id: parentId || null,
      opening_balance: Number(openingBalance || 0),
      opening_balance_date: openingDate,
      coa_id: coaId || null,
      active,
      membership_ids: selectedIds,
    }
    const { data, error: saveError } = await sb.rpc('company_department_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama departemen ini sudah digunakan. Pilih nama yang berbeda.' : saveError.message)
      return
    }
    onSaved({
      id: data as string,
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      parent_department_id: parentId || null,
      opening_balance: Number(openingBalance || 0),
      opening_balance_date: openingDate,
      coa_id: coaId || null,
      active,
      membershipIds: selectedIds,
      created_at: department?.created_at,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="department-form-title"
        style={{ width: 'min(768px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="department-form-title" className="text-lg font-semibold">{department ? 'Ubah departemen' : 'Tambah departemen baru'}</h2>
            <p className="mt-1 text-sm text-ink/60">Isi informasi departemen, pilih COA dan atur anggota yang ditugaskan.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Nama Departemen <span className="text-red-600">*</span>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="Contoh: Keuangan" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Keterangan
                <textarea className="input mt-1 min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Deskripsi atau fungsi departemen" rows={3} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Sub departemen / Departemen induk
                <select className="input mt-1" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">Tidak ada — departemen utama</option>
                  {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-ink/50">Daftar diambil dari departemen yang sudah dibuat.</span>
              </label>
              <label className="text-sm font-medium">Saldo awal
                <input className="input mt-1" type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} required />
              </label>
              <label className="text-sm font-medium">Saldo awal per tanggal
                <input className="input mt-1" type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} required />
              </label>
              <label className="text-sm font-medium sm:col-span-2">COA / Nama akun
                <select className="input mt-1" value={coaId} onChange={(e) => setCoaId(e.target.value)}>
                  <option value="">Belum ditentukan</option>
                  {accounts.filter((account) => account.aktif).map((account) => <option key={account.id} value={account.id}>{account.kode} — {account.nama}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-ink/50">Pilihan diambil dari Akun Perkiraan yang aktif pada perusahaan ini.</span>
              </label>
            </div>

            <div className="space-y-2">
              <div>
                <h3 className="font-medium">Daftar pengguna</h3>
                <p className="mt-1 text-sm text-ink/60">Pilih anggota yang ditugaskan ke departemen ini. Klik × pada chip nama untuk menghapusnya.</p>
              </div>
              <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-2.5">
                {selectedMembers.map((member) => (
                  <span key={member.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3 py-1.5 text-sm text-brand-dark">
                    <span className="max-w-[190px] truncate">{member.full_name || member.email}</span>
                    <button type="button" className="rounded-full p-0.5 hover:bg-black/10" onClick={() => removeMember(member.id)} aria-label={`Hapus ${member.full_name || member.email} dari departemen`} title="Hapus dari departemen"><X size={14} /></button>
                  </span>
                ))}
                <div className="relative min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <Search size={16} className="shrink-0 text-ink/50" />
                    <input className="w-full min-w-0 bg-transparent py-1 text-sm outline-none placeholder:text-ink/50" value={query} onFocus={() => setPickerOpen(true)} onChange={(e) => { setQuery(e.target.value); setPickerOpen(true) }} placeholder="Cari nama pengguna untuk ditambahkan…" aria-label="Cari pengguna perusahaan" aria-expanded={pickerOpen} />
                    <button type="button" className="rounded p-1 text-ink/50 hover:bg-black/5" onClick={() => setPickerOpen((open) => !open)} aria-label="Tampilkan daftar pengguna"><ChevronDown size={16} /></button>
                  </div>
                  {pickerOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 max-h-56 w-full min-w-[260px] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-xl">
                      {candidates.length ? candidates.map((member) => (
                        <button type="button" key={member.id} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-canvas" onClick={() => selectMember(member)}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-dark">{(member.full_name || member.email || '?').slice(0, 1).toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{member.full_name || 'Tanpa nama'}</span>
                            <span className="block truncate text-xs text-ink/60">{member.email}</span>
                          </span>
                          <Plus size={15} className="text-ink/50" />
                        </button>
                      )) : <p className="px-3 py-3 text-sm text-ink/60">{members.length ? 'Tidak ada pengguna yang cocok atau semua sudah dipilih.' : 'Belum ada anggota terdaftar pada perusahaan ini.'}</p>}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-ink/50">{selectedIds.length} pengguna dipilih dari {members.length} anggota perusahaan</div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Departemen aktif</label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}><Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan departemen'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
