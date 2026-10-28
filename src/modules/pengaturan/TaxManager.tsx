'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

type Account = { id: string; kode: string; nama: string; tipe: string; aktif: boolean }
type TaxType = 'penjualan' | 'pembelian' | 'keduanya'
type Tax = {
  id: string
  company_id: string
  name: string
  tax_type: TaxType
  rate: number | string
  description: string | null
  sales_account_id: string | null
  purchase_account_id: string | null
  active: boolean
  created_at?: string
}
const TYPE_LABEL: Record<TaxType, string> = {
  penjualan: 'Pajak penjualan',
  pembelian: 'Pajak pembelian',
  keduanya: 'Penjualan & pembelian',
}
function formatRate(value: number | string) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(value))
}

export default function TaxManager({ companyId, initial, accounts, initialError }: {
  companyId: string
  initial: Tax[]
  accounts: Account[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [taxes, setTaxes] = useState(initial)
  const [editing, setEditing] = useState<Tax | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setTaxes(initial), [initial])
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])

  async function remove(tax: Tax) {
    if (!confirm(`Hapus pajak "${tax.name}"?`)) return
    setDeleting(tax.id)
    setError(null)
    setNotice(null)
    const { error: deleteError } = await sb.rpc('company_tax_delete', { p_company: companyId, p_tax: tax.id })
    setDeleting(null)
    if (deleteError) return setError(deleteError.message)
    setTaxes((rows) => rows.filter((row) => row.id !== tax.id))
    setNotice(`Pajak "${tax.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(tax: Tax) {
    setTaxes((rows) => {
      const exists = rows.some((row) => row.id === tax.id)
      return (exists ? rows.map((row) => row.id === tax.id ? tax : row) : [tax, ...rows])
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    })
    setEditing(null)
    setError(null)
    setNotice(`Pajak "${tax.name}" berhasil disimpan.`)
    router.refresh()
  }

  function accountLabel(id: string | null) {
    if (!id) return '—'
    const account = accountMap.get(id)
    return account ? `${account.kode} — ${account.nama}` : 'Akun tidak ditemukan'
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Pajak</h1>
          <p className="mt-1 text-sm text-ink/60">Kelola tarif pajak dan akun COA untuk pajak penjualan serta pembelian.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah pajak
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Daftar pajak atau COA tidak dapat dimuat: {initialError}</p>}

      {taxes.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-line bg-canvas text-ink/60">
              <th className="p-3 font-medium">Nama pajak</th>
              <th className="p-3 font-medium">Tipe pajak</th>
              <th className="p-3 text-right font-medium">Tarif</th>
              <th className="p-3 font-medium">Akun pajak penjualan</th>
              <th className="p-3 font-medium">Akun pajak pembelian</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3" />
            </tr></thead>
            <tbody>
              {taxes.map((tax) => (
                <tr key={tax.id} className="border-b border-line last:border-0 align-top">
                  <td className="p-3">
                    <p className="font-medium">{tax.name}</p>
                    {tax.description && <p className="mt-1 max-w-[220px] whitespace-normal text-xs text-ink/60">{tax.description}</p>}
                  </td>
                  <td className="p-3">{TYPE_LABEL[tax.tax_type]}</td>
                  <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatRate(tax.rate)}%</td>
                  <td className="p-3"><span className="block max-w-[210px] whitespace-normal">{accountLabel(tax.sales_account_id)}</span></td>
                  <td className="p-3"><span className="block max-w-[210px] whitespace-normal">{accountLabel(tax.purchase_account_id)}</span></td>
                  <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tax.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{tax.active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn px-2" title="Ubah" aria-label={`Ubah ${tax.name}`} onClick={() => { setError(null); setNotice(null); setEditing(tax) }}><Pencil size={15} /></button>
                      <button type="button" className="btn px-2" title="Hapus" aria-label={`Hapus ${tax.name}`} disabled={deleting === tax.id} onClick={() => remove(tax)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink/60"><Search size={27} /></div>
          <h2 className="mt-4 font-semibold">Belum ada pajak</h2>
          <p className="mt-1 max-w-md text-sm text-ink/60">Buat pajak pertama, tentukan tipenya, lalu pilih akun COA yang digunakan untuk pencatatan pajak penjualan dan/atau pembelian.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => { setError(null); setNotice(null); setEditing('new') }}><Plus size={16} /> Tambah pajak</button>
        </div>
      )}

      {editing && <TaxForm key={editing === 'new' ? 'new' : editing.id} companyId={companyId} tax={editing === 'new' ? null : editing} accounts={accounts} onCancel={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}

function TaxForm({ companyId, tax, accounts, onCancel, onSaved }: {
  companyId: string
  tax: Tax | null
  accounts: Account[]
  onCancel: () => void
  onSaved: (tax: Tax) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(tax?.name ?? '')
  const [taxType, setTaxType] = useState<TaxType>(tax?.tax_type ?? 'penjualan')
  const [rate, setRate] = useState(String(tax?.rate ?? '0'))
  const [description, setDescription] = useState(tax?.description ?? '')
  const [salesAccountId, setSalesAccountId] = useState(tax?.sales_account_id ?? '')
  const [purchaseAccountId, setPurchaseAccountId] = useState(tax?.purchase_account_id ?? '')
  const [active, setActive] = useState(tax?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsSales = taxType === 'penjualan' || taxType === 'keduanya'
  const needsPurchase = taxType === 'pembelian' || taxType === 'keduanya'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      id: tax?.id ?? null,
      company_id: companyId,
      name: name.trim(),
      tax_type: taxType,
      rate: Number(rate),
      description: description.trim(),
      sales_account_id: salesAccountId || null,
      purchase_account_id: purchaseAccountId || null,
      active,
    }
    const { data, error: saveError } = await sb.rpc('company_tax_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama pajak ini sudah digunakan. Gunakan nama yang berbeda.' : saveError.message)
      return
    }
    onSaved({
      id: data as string,
      company_id: companyId,
      name: name.trim(),
      tax_type: taxType,
      rate: Number(rate),
      description: description.trim() || null,
      sales_account_id: salesAccountId || null,
      purchase_account_id: purchaseAccountId || null,
      active,
      created_at: tax?.created_at,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="tax-form-title"
        style={{ width: 'min(820px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="tax-form-title" className="text-lg font-semibold">{tax ? 'Ubah pajak' : 'Tambah pajak baru'}</h2>
            <p className="mt-1 text-sm text-ink/60">Atur tipe pajak, keterangan, tarif, dan akun COA untuk penjualan/pembelian.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Nama Pajak <span className="text-red-600">*</span>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus required placeholder="Contoh: PPN 11%" />
              </label>
              <label className="text-sm font-medium">Tipe Pajak <span className="text-red-600">*</span>
                <select className="input mt-1" value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)} required>
                  <option value="penjualan">Pajak penjualan</option>
                  <option value="pembelian">Pajak pembelian</option>
                  <option value="keduanya">Pajak penjualan dan pembelian</option>
                </select>
              </label>
              <label className="text-sm font-medium">Tarif Pajak (%) <span className="text-red-600">*</span>
                <input className="input mt-1" type="number" min="0" max="100" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} required />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Keterangan
                <textarea className="input mt-1 min-h-20" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Keterangan pajak (opsional)" />
              </label>
            </div>

            <SearchableAccountSelect
              label="Akun Pajak Penjualan"
              accounts={accounts}
              value={salesAccountId}
              onChange={setSalesAccountId}
              required={needsSales}
              placeholder="Cari kode atau nama akun COA…"
              hint={needsSales ? 'Wajib untuk tipe pajak penjualan.' : 'Opsional untuk tipe pajak pembelian.'}
            />
            <SearchableAccountSelect
              label="Akun Pajak Pembelian"
              accounts={accounts}
              value={purchaseAccountId}
              onChange={setPurchaseAccountId}
              required={needsPurchase}
              placeholder="Cari kode atau nama akun COA…"
              hint={needsPurchase ? 'Wajib untuk tipe pajak pembelian.' : 'Opsional untuk tipe pajak penjualan.'}
            />

            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Pajak aktif</label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !rate.trim()}>
              <Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan pajak'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function SearchableAccountSelect({ label, accounts, value, onChange, required, placeholder, hint }: {
  label: string
  accounts: Account[]
  value: string
  onChange: (value: string) => void
  required: boolean
  placeholder: string
  hint: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = accounts.find((account) => account.id === value)
  const choices = accounts.filter((account) => account.aktif && [account.kode, account.nama, account.tipe].some((part) => part.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 80)

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}{required && <span className="ml-1 text-red-600">*</span>}</label>
      <div className="relative">
        <div className={`flex min-h-11 items-center gap-2 rounded-md border border-line bg-white px-3 ${open ? 'ring-2 ring-brand/20' : ''}`}>
          <Search size={16} className="shrink-0 text-ink/50" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none placeholder:text-ink/45"
            value={open ? query : selected ? `${selected.kode} — ${selected.nama}` : query}
            onFocus={() => { setQuery(''); setOpen(true) }}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            placeholder={placeholder}
            aria-label={label}
            aria-expanded={open}
            aria-autocomplete="list"
            required={required && !value}
          />
          <button type="button" className="rounded p-1 text-ink/50 hover:bg-canvas" onClick={() => { setOpen((current) => !current); setQuery('') }} aria-label={`Cari ${label}`}><ChevronDown size={16} /></button>
          {value && <button type="button" className="rounded p-1 text-ink/50 hover:bg-canvas" onClick={() => { onChange(''); setQuery(''); setOpen(false) }} aria-label={`Kosongkan ${label}`}><X size={15} /></button>}
        </div>
        {open && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-white py-1 shadow-xl" role="listbox">
            {choices.length ? choices.map((account) => (
              <button type="button" key={account.id} role="option" aria-selected={value === account.id}
                className={`flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-canvas ${value === account.id ? 'bg-brand-soft' : ''}`}
                onClick={() => { onChange(account.id); setQuery(''); setOpen(false) }}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{account.kode} — {account.nama}</span>
                  <span className="block text-xs text-ink/55">{account.tipe}{account.aktif ? '' : ' · Nonaktif'}</span>
                </span>
                {value === account.id && <Check size={16} className="mt-0.5 shrink-0 text-brand" />}
              </button>
            )) : <p className="px-3 py-3 text-sm text-ink/60">{accounts.length ? 'Tidak ada akun COA aktif yang cocok.' : 'Belum ada akun COA. Buat dahulu melalui Akun Perkiraan.'}</p>}
          </div>
        )}
      </div>
      <p className="text-xs text-ink/55">{hint}</p>
    </div>
  )
}
