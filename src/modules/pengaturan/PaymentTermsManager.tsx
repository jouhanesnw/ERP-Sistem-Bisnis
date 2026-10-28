'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { PaymentTerm } from './paymentTerms'

function numberText(value: number | string) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(value))
}
function daysLabel(days: number) {
  if (days === 0) return 'Hari yang sama'
  return `${days} hari`
}

export default function PaymentTermsManager({ companyId, initial, initialError }: {
  companyId: string
  initial: PaymentTerm[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [terms, setTerms] = useState(initial)
  const [editing, setEditing] = useState<PaymentTerm | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setTerms(initial), [initial])

  async function remove(term: PaymentTerm) {
    if (!confirm(`Hapus syarat pembayaran "${term.name}"? Jika sudah digunakan pada transaksi, syarat pembayaran tersebut mungkin tidak dapat dihapus.`)) return
    setDeleting(term.id)
    setError(null)
    setNotice(null)
    const { error: removeError } = await sb.rpc('company_payment_term_delete', { p_company: companyId, p_term: term.id })
    setDeleting(null)
    if (removeError) return setError(removeError.message)
    setTerms((rows) => rows.filter((row) => row.id !== term.id))
    setNotice(`Syarat pembayaran "${term.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(term: PaymentTerm) {
    setTerms((rows) => {
      const merged = rows.map((row) => term.is_default ? { ...row, is_default: false } : row)
      const exists = merged.some((row) => row.id === term.id)
      return (exists ? merged.map((row) => row.id === term.id ? term : row) : [term, ...merged])
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, 'id'))
    })
    setEditing(null)
    setError(null)
    setNotice(`Syarat pembayaran "${term.name}" berhasil disimpan.`)
    router.refresh()
  }

  const orderedTerms = [...terms].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, 'id'))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Syarat Pembayaran</h1>
          <p className="mt-1 text-sm text-ink/60">Atur masa diskon, jatuh tempo, dan syarat pembayaran default untuk transaksi perusahaan.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah syarat pembayaran
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Daftar syarat pembayaran belum dapat dimuat: {initialError}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-ink/60">
              <th className="p-3 font-medium">Nama Syarat Pembayaran</th>
              <th className="p-3 text-right font-medium">Diskon</th>
              <th className="p-3 font-medium">Masa Diskon</th>
              <th className="p-3 font-medium">Keterangan</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Default</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {orderedTerms.map((term) => (
              <tr key={term.id} className={`border-b border-line last:border-0 align-top ${term.active ? '' : 'text-ink/45'}`}>
                <td className="p-3">
                  <p className="font-medium text-ink">{term.name}</p>
                  <p className="mt-1 text-xs text-ink/55">Jatuh tempo: {daysLabel(term.due_days)}</p>
                </td>
                <td className="whitespace-nowrap p-3 text-right tabular-nums">{numberText(term.discount_percent)}%</td>
                <td className="whitespace-nowrap p-3">{daysLabel(term.discount_days)}</td>
                <td className="p-3"><span className="block max-w-[240px] whitespace-normal">{term.description || <span className="text-ink/35">—</span>}</span></td>
                <td className="p-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${term.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                    {term.active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="p-3">
                  {term.is_default
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-xs font-medium text-brand-dark"><Check size={13} /> Default</span>
                    : <span className="text-xs text-ink/40">—</span>}
                </td>
                <td className="whitespace-nowrap p-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn px-2" title="Ubah" aria-label={`Ubah ${term.name}`} onClick={() => { setError(null); setNotice(null); setEditing(term) }}><Pencil size={15} /></button>
                    <button type="button" className="btn px-2" title="Hapus" aria-label={`Hapus ${term.name}`} disabled={deleting === term.id} onClick={() => remove(term)}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!orderedTerms.length && <tr><td colSpan={7} className="p-8 text-center text-ink/60">Belum ada syarat pembayaran. Syarat default "Tunai" akan dibuat oleh migrasi database.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <PaymentTermForm
          key={editing === 'new' ? 'new' : editing.id}
          companyId={companyId}
          term={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}

function PaymentTermForm({ companyId, term, onCancel, onSaved }: {
  companyId: string
  term: PaymentTerm | null
  onCancel: () => void
  onSaved: (term: PaymentTerm) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(term?.name ?? '')
  const [discountDays, setDiscountDays] = useState(String(term?.discount_days ?? 0))
  const [discountPercent, setDiscountPercent] = useState(String(term?.discount_percent ?? 0))
  const [dueDays, setDueDays] = useState(String(term?.due_days ?? 0))
  const [description, setDescription] = useState(term?.description ?? '')
  const [isDefault, setIsDefault] = useState(term?.is_default ?? false)
  const [active, setActive] = useState(term?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const discountDaysValue = Number(discountDays)
    const discountPercentValue = Number(discountPercent)
    const dueDaysValue = Number(dueDays)
    if (!name.trim()) return setError('Nama syarat pembayaran wajib diisi.')
    if (!Number.isInteger(discountDaysValue) || discountDaysValue < 0) return setError('Masa diskon harus berupa jumlah hari nol atau lebih.')
    if (!Number.isFinite(discountPercentValue) || discountPercentValue < 0 || discountPercentValue > 100) return setError('Diskon harus antara 0 sampai 100%.')
    if (!Number.isInteger(dueDaysValue) || dueDaysValue < 0) return setError('Masa jatuh tempo harus berupa jumlah hari nol atau lebih.')
    if (isDefault && !active) return setError('Syarat pembayaran default harus Aktif.')

    setBusy(true)
    const payload = {
      id: term?.id ?? null,
      company_id: companyId,
      name: name.trim(),
      discount_days: discountDaysValue,
      discount_percent: discountPercentValue,
      due_days: dueDaysValue,
      description: description.trim(),
      is_default: isDefault,
      active,
    }
    const { data, error: saveError } = await sb.rpc('company_payment_term_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama syarat pembayaran sudah digunakan atau default sudah ditetapkan. Periksa kembali datanya.' : saveError.message)
      return
    }
    onSaved({
      id: data as string,
      company_id: companyId,
      name: name.trim(),
      discount_days: discountDaysValue,
      discount_percent: discountPercentValue,
      due_days: dueDaysValue,
      description: description.trim() || null,
      is_default: isDefault,
      active,
      created_at: term?.created_at,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="payment-term-title"
        style={{ width: 'min(760px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="payment-term-title" className="text-lg font-semibold">{term ? 'Ubah syarat pembayaran' : 'Tambah syarat pembayaran'}</h2>
            <p className="mt-1 text-sm text-ink/60">Semua pengaturan syarat pembayaran digabung dalam satu popup.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-brand">Info Umum</h3>
              <div className="h-px bg-line" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Nama Syarat Pembayaran <span className="text-red-600">*</span>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder="Contoh: Tunai, Net 30 Hari, Cicilan" />
              </label>

              <div className="space-y-1.5 rounded-lg border border-line p-3">
                <label className="block text-sm font-medium">Jika membayar dalam</label>
                <div className="flex items-center gap-2">
                  <input className="input max-w-[150px]" type="number" min="0" step="1" value={discountDays} onChange={(e) => setDiscountDays(e.target.value)} required />
                  <span className="text-sm text-ink/70">Hari</span>
                </div>
                <p className="text-xs text-ink/55">Batas hari untuk mendapatkan diskon pembayaran awal.</p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-line p-3">
                <label className="block text-sm font-medium">Akan mendapat diskon</label>
                <div className="flex items-center gap-2">
                  <input className="input max-w-[150px]" type="number" min="0" max="100" step="0.0001" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} required />
                  <span className="text-sm text-ink/70">%</span>
                </div>
                <p className="text-xs text-ink/55">Persentase potongan jika dibayar sebelum masa diskon berakhir.</p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-line p-3 sm:col-span-2">
                <label className="block text-sm font-medium">Masa Jatuh Tempo</label>
                <div className="flex items-center gap-2">
                  <input className="input max-w-[150px]" type="number" min="0" step="1" value={dueDays} onChange={(e) => setDueDays(e.target.value)} required />
                  <span className="text-sm text-ink/70">Hari</span>
                  <span className="text-xs text-ink/50">Jatuh tempo dihitung dari tanggal dokumen.</span>
                </div>
              </div>

              <label className="text-sm font-medium sm:col-span-2">Keterangan
                <textarea className="input mt-1 min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder="Keterangan (opsional)" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <h3 className="mb-2 text-sm font-medium">Default Syarat Pembayaran</h3>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                  Jadikan default perusahaan
                </label>
                <p className="mt-1 text-xs text-ink/55">Hanya satu syarat pembayaran yang dapat menjadi default.</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <h3 className="mb-2 text-sm font-medium">Status</h3>
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="payment-term-status" className="h-4 w-4 accent-brand" checked={active} onChange={() => setActive(true)} />
                    Aktif
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="payment-term-status" className="h-4 w-4 accent-brand" checked={!active} onChange={() => { setActive(false); setIsDefault(false) }} />
                    Nonaktif
                  </label>
                </div>
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              <Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
