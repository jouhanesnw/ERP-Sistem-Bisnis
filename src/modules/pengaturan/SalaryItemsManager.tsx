'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, Wallet, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { getSalaryPayType, SALARY_ITEM_TYPES, type ExpenseAccountOption, type SalaryItem, type SalaryItemType } from './salaryItems'

export default function SalaryItemsManager({ companyId, initial, accounts, initialError }: {
  companyId: string
  initial: SalaryItem[]
  accounts: ExpenseAccountOption[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [editing, setEditing] = useState<SalaryItem | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setRows(initial), [initial])

  async function remove(item: SalaryItem) {
    if (!confirm(`Hapus gaji/tunjangan "${item.name}"?`)) return
    setDeleting(item.id); setError(null); setNotice(null)
    const { error: removeError } = await sb.rpc('company_salary_item_delete', { p_company: companyId, p_item: item.id })
    setDeleting(null)
    if (removeError) return setError(removeError.message)
    setRows((current) => current.filter((row) => row.id !== item.id))
    setNotice(`Gaji/tunjangan "${item.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(item: SalaryItem) {
    setRows((current) => {
      const exists = current.some((row) => row.id === item.id)
      return (exists ? current.map((row) => row.id === item.id ? item : row) : [item, ...current])
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    })
    setEditing(null); setError(null); setNotice(`Gaji/tunjangan "${item.name}" berhasil disimpan.`)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Gaji/Tunjangan</h1>
          <p className="mt-1 text-sm text-ink/60">Atur komponen gaji, tunjangan, dan potongan beserta akun bebannya untuk pencatatan penggajian.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah Baru
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Data gaji/tunjangan atau akun beban belum dapat dimuat: {initialError}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead><tr className="border-b border-line bg-canvas text-ink/60">
            <th className="p-3 font-medium">Nama</th>
            <th className="p-3 font-medium">Tipe Gaji/Tunjangan</th>
            <th className="p-3 font-medium">Bayar/Potong</th>
            <th className="p-3 font-medium">Akun Beban</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className={`border-b border-line last:border-0 align-top ${item.active ? '' : 'text-ink/45'}`}>
                <td className="p-3 font-medium text-ink">{item.name}</td>
                <td className="p-3"><span className="block max-w-[330px] whitespace-normal">{item.item_type}</span></td>
                <td className="whitespace-nowrap p-3">{item.pay_type}</td>
                <td className="p-3"><span className="block max-w-[250px] whitespace-normal">{item.account ? `${item.account.kode} · ${item.account.nama}` : 'Akun tidak tersedia/nonaktif'}</span></td>
                <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{item.active ? 'Aktif' : 'Nonaktif'}</span></td>
                <td className="whitespace-nowrap p-3 text-right"><div className="flex justify-end gap-1">
                  <button type="button" className="btn px-2" title="Ubah" aria-label={`Ubah ${item.name}`} onClick={() => { setError(null); setNotice(null); setEditing(item) }}><Pencil size={15} /></button>
                  <button type="button" className="btn px-2" title="Hapus" aria-label={`Hapus ${item.name}`} disabled={deleting === item.id} onClick={() => remove(item)}><Trash2 size={15} /></button>
                </div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-ink/60">Belum ada komponen gaji/tunjangan. Pilih Tambah Baru untuk membuat komponen pertama.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <SalaryItemForm key={editing === 'new' ? 'new' : editing.id} companyId={companyId} item={editing === 'new' ? null : editing} accounts={accounts} onCancel={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}

function SalaryItemForm({ companyId, item, accounts, onCancel, onSaved }: {
  companyId: string
  item: SalaryItem | null
  accounts: ExpenseAccountOption[]
  onCancel: () => void
  onSaved: (item: SalaryItem) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(item?.name ?? '')
  const [itemType, setItemType] = useState<SalaryItemType>(item?.item_type ?? SALARY_ITEM_TYPES[0])
  const [accountId, setAccountId] = useState(item?.account_id ?? '')
  const [accountSearch, setAccountSearch] = useState(() => {
    const account = accounts.find((row) => row.id === item?.account_id)
    return account ? `${account.kode} · ${account.nama}` : ''
  })
  const [accountOpen, setAccountOpen] = useState(false)
  const [active, setActive] = useState(item?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const payType = getSalaryPayType(itemType)
  const matchingAccounts = accounts.filter((account) => `${account.kode} ${account.nama}`.toLocaleLowerCase('id').includes(accountSearch.toLocaleLowerCase('id')))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Nama gaji/tunjangan wajib diisi.')
    if (!accountId || !accounts.some((account) => account.id === accountId)) return setError('Pilih akun beban aktif yang tersedia.')
    setBusy(true)
    const payload = { id: item?.id ?? null, company_id: companyId, name: name.trim(), item_type: itemType, account_id: accountId, active }
    const { data, error: saveError } = await sb.rpc('company_salary_item_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama gaji/tunjangan sudah digunakan. Gunakan nama lain.' : saveError.message)
      return
    }
    const account = accounts.find((row) => row.id === accountId)!
    onSaved({
      id: data as string, company_id: companyId, name: name.trim(), item_type: itemType,
      pay_type: payType, account_id: accountId, active, account,
      created_at: item?.created_at,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="salary-item-title"
        style={{ width: 'min(920px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="salary-item-title" className="text-lg font-semibold">{item ? 'Ubah Gaji/Tunjangan' : 'Data Baru'}</h2>
            <p className="mt-1 text-sm text-ink/60">Tentukan nama komponen, tipe, dan akun beban yang digunakan.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <div className="space-y-1">
              <h3 className="text-xl font-medium text-brand">Info Umum</h3>
              <div className="h-px bg-line" />
            </div>

            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-[minmax(170px,0.65fr)_minmax(0,1.35fr)] sm:items-center">
              <label htmlFor="salary-name" className="text-sm font-medium">Nama <span className="text-red-600">*</span></label>
              <input id="salary-name" className="input w-full" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="Contoh: Gaji Pokok, Tunjangan Makan" />

              <label htmlFor="salary-item-type" className="text-sm font-medium">Tipe Gaji/Tunjangan</label>
              <select id="salary-item-type" className="input w-full" value={itemType} onChange={(e) => setItemType(e.target.value as SalaryItemType)}>
                {SALARY_ITEM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>

              <label htmlFor="salary-pay-type" className="text-sm font-medium">Bayar/Potong</label>
              <input id="salary-pay-type" className="input w-full bg-slate-50 text-ink/65" value={payType} readOnly aria-readonly="true" title="Diisi otomatis sesuai tipe gaji/tunjangan yang dipilih" />

              <label htmlFor="salary-account-search" className="self-start pt-2 text-sm font-medium">Akun Beban <span className="text-red-600">*</span></label>
              <div className="relative min-w-0">
                <div className="relative">
                  <input id="salary-account-search" className="input w-full pr-10" value={accountSearch}
                    onChange={(e) => { setAccountSearch(e.target.value); setAccountId(''); setAccountOpen(true) }}
                    onFocus={() => setAccountOpen(true)} maxLength={160} autoComplete="off" placeholder="Cari/Pilih Akun Perkiraan..." aria-expanded={accountOpen} aria-controls="salary-account-options" />
                  <button type="button" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink/70" aria-label="Cari akun beban" onClick={() => setAccountOpen((open) => !open)}><Search size={18} /></button>
                </div>
                {accountOpen && <div id="salary-account-options" className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
                  {matchingAccounts.length ? matchingAccounts.map((account) => (
                    <button key={account.id} type="button" className={`block w-full border-b border-line px-3 py-2.5 text-left text-sm last:border-0 hover:bg-canvas ${account.id === accountId ? 'bg-brand-soft' : ''}`}
                      onClick={() => { setAccountId(account.id); setAccountSearch(`${account.kode} · ${account.nama}`); setAccountOpen(false) }}>
                      <span className="block font-medium">{account.kode} · {account.nama}</span>
                    </button>
                  )) : <p className="p-3 text-sm text-ink/60">{accounts.length ? 'Akun tidak ditemukan.' : 'Belum ada akun beban aktif. Buat atau aktifkan akun beban di menu Akuntansi → Daftar Akun.'}</p>}
                  <button type="button" className="sticky bottom-0 w-full border-t border-line bg-canvas px-3 py-2 text-sm text-ink/70" onClick={() => setAccountOpen(false)}><ChevronDown size={14} className="mr-1 inline" /> Tutup daftar</button>
                </div>}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif</label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !accountId}><Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
