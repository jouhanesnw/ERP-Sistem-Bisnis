'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, MapPin, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

type Branch = {
  id: string
  company_id: string
  name: string
  phone: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  province: string | null
  country: string
  active: boolean
  created_at?: string
  membershipIds: string[]
}
type CompanyMember = {
  id: string
  user_id: string
  role: string
  full_name: string
  email: string
}

export default function BranchManager({ companyId, initial, members, initialError }: {
  companyId: string
  initial: Branch[]
  members: CompanyMember[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [branches, setBranches] = useState(initial)
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setBranches(initial), [initial])

  async function remove(branch: Branch) {
    if (!confirm(`Hapus cabang "${branch.name}"? Daftar penugasan pengguna untuk cabang ini juga akan dihapus.`)) return
    setDeleting(branch.id)
    setError(null)
    setNotice(null)
    const { error: deleteError } = await sb.rpc('company_branch_delete', { p_company: companyId, p_branch: branch.id })
    setDeleting(null)
    if (deleteError) return setError(deleteError.message)
    setBranches((rows) => rows.filter((row) => row.id !== branch.id))
    setNotice(`Cabang "${branch.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(branch: Branch) {
    setBranches((rows) => {
      const exists = rows.some((row) => row.id === branch.id)
      return exists ? rows.map((row) => row.id === branch.id ? branch : row) : [branch, ...rows]
    })
    setEditing(null)
    setNotice(`Cabang "${branch.name}" berhasil disimpan.`)
    setError(null)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Cabang</h1>
          <p className="mt-1 text-sm text-ink/60">Kelola lokasi cabang perusahaan dan anggota yang ditugaskan ke setiap cabang.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah cabang
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Data cabang atau pengguna tidak dapat dimuat: {initialError}</p>}

      {branches.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch) => {
            const assigned = members.filter((member) => branch.membershipIds.includes(member.id))
            const location = [branch.city, branch.province, branch.country].filter(Boolean).join(', ')
            return (
              <article key={branch.id} className="card flex min-w-0 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark"><Building2 size={22} /></div>
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words font-semibold">{branch.name}</h2>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${branch.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{branch.active ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-ink/70">
                  {branch.phone && <p>Telepon: {branch.phone}</p>}
                  {branch.address && <p>{branch.address}</p>}
                  {(location || branch.postal_code) && <p className="flex items-start gap-1"><MapPin size={15} className="mt-0.5 shrink-0" />{[location, branch.postal_code].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="mt-1 border-t border-line pt-3">
                  <p className="mb-2 flex items-center gap-1 text-xs font-medium text-ink/60"><Users size={14} /> {assigned.length} pengguna ditugaskan</p>
                  <div className="flex flex-wrap gap-1.5">
                    {assigned.length ? assigned.map((member) => (
                      <span key={member.id} className="max-w-full truncate rounded-full bg-canvas px-2.5 py-1 text-xs text-ink">{member.full_name || member.email}</span>
                    )) : <span className="text-xs text-ink/50">Belum ada pengguna</span>}
                  </div>
                </div>
                <div className="mt-auto flex justify-end gap-2 border-t border-line pt-3">
                  <button type="button" className="btn" onClick={() => { setError(null); setNotice(null); setEditing(branch) }}><Pencil size={15} /> Ubah</button>
                  <button type="button" className="btn px-3" disabled={deleting === branch.id} onClick={() => remove(branch)} aria-label={`Hapus cabang ${branch.name}`} title="Hapus cabang"><Trash2 size={15} />{deleting === branch.id ? 'Menghapus…' : ''}</button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink/60"><Building2 size={27} /></div>
          <h2 className="mt-4 font-semibold">Belum ada cabang</h2>
          <p className="mt-1 max-w-md text-sm text-ink/60">Tambahkan cabang pertama, isi informasi lokasinya, lalu pilih pengguna perusahaan yang boleh ditugaskan ke cabang tersebut.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => { setError(null); setNotice(null); setEditing('new') }}><Plus size={16} /> Tambah cabang</button>
        </div>
      )}

      {editing && (
        <BranchForm
          key={editing === 'new' ? 'new' : editing.id}
          companyId={companyId}
          branch={editing === 'new' ? null : editing}
          members={members}
          onCancel={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}

function BranchForm({ companyId, branch, members, onCancel, onSaved }: {
  companyId: string
  branch: Branch | null
  members: CompanyMember[]
  onCancel: () => void
  onSaved: (branch: Branch) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(branch?.name ?? '')
  const [phone, setPhone] = useState(branch?.phone ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  const [city, setCity] = useState(branch?.city ?? '')
  const [postalCode, setPostalCode] = useState(branch?.postal_code ?? '')
  const [province, setProvince] = useState(branch?.province ?? '')
  const [country, setCountry] = useState(branch?.country ?? 'Indonesia')
  const [active, setActive] = useState(branch?.active ?? true)
  const [selectedIds, setSelectedIds] = useState<string[]>(branch?.membershipIds ?? [])
  const [query, setQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedMembers = selectedIds.map((id) => members.find((member) => member.id === id)).filter((member): member is CompanyMember => !!member)
  const candidates = members.filter((member) =>
    !selectedIds.includes(member.id) &&
    [member.full_name, member.email, member.role].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))
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
      id: branch?.id ?? null,
      company_id: companyId,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      postal_code: postalCode.trim(),
      province: province.trim(),
      country: country.trim() || 'Indonesia',
      active,
      membership_ids: selectedIds,
    }
    const { data, error: saveError } = await sb.rpc('company_branch_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama cabang ini sudah digunakan. Gunakan nama yang berbeda.' : saveError.message)
      return
    }
    onSaved({
      id: data as string,
      company_id: companyId,
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      postal_code: postalCode.trim() || null,
      province: province.trim() || null,
      country: country.trim() || 'Indonesia',
      active,
      membershipIds: selectedIds,
      created_at: branch?.created_at,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="branch-form-title" style={{ width: "min(768px, calc(100vw - 24px))", maxWidth: "calc(100vw - 24px)", maxHeight: "92vh", backgroundColor: "#ffffff" }} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="branch-form-title" className="text-lg font-semibold">{branch ? 'Ubah cabang' : 'Tambah cabang baru'}</h2>
            <p className="mt-1 text-sm text-ink/60">Lengkapi detail cabang dan pilih anggota perusahaan yang ditugaskan di sini.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Nama Cabang <span className="text-red-600">*</span><input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="Contoh: Cabang Surabaya" /></label>
              <label className="text-sm font-medium">No. telepon<input className="input mt-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="Nomor telepon cabang" /></label>
              <label className="text-sm font-medium">Negara<input className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} placeholder="Indonesia" /></label>
              <label className="text-sm font-medium sm:col-span-2">Alamat<input className="input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={250} placeholder="Nama jalan, nomor, gedung" /></label>
              <label className="text-sm font-medium">Kota<input className="input mt-1" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} /></label>
              <label className="text-sm font-medium">Kode Pos<input className="input mt-1" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} /></label>
              <label className="text-sm font-medium sm:col-span-2">Provinsi<input className="input mt-1" value={province} onChange={(e) => setProvince(e.target.value)} maxLength={100} /></label>
            </div>

            <div className="space-y-2">
              <div>
                <h3 className="font-medium">Daftar pengguna</h3>
                <p className="mt-1 text-sm text-ink/60">Pilih akun yang sudah terdaftar sebagai anggota perusahaan ini. Klik × pada nama untuk menghapusnya dari cabang.</p>
              </div>
              <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-2.5">
                {selectedMembers.map((member) => (
                  <span key={member.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3 py-1.5 text-sm text-brand-dark">
                    <span className="max-w-[190px] truncate">{member.full_name || member.email}</span>
                    <button type="button" className="rounded-full p-0.5 hover:bg-black/10" onClick={() => removeMember(member.id)} aria-label={`Hapus ${member.full_name || member.email} dari cabang`} title="Hapus dari cabang"><X size={14} /></button>
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

            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Cabang aktif</label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}><Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan cabang'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
