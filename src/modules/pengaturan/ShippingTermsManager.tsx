'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, Trash2, Truck, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

export type ShippingTerm = {
  id: string
  company_id: string
  name: string
  description: string | null
  active: boolean
  created_at?: string
}


export default function ShippingTermsManager({ companyId, initial, initialError }: {
  companyId: string
  initial: ShippingTerm[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [editing, setEditing] = useState<ShippingTerm | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setRows(initial), [initial])

  async function remove(term: ShippingTerm) {
    if (!confirm(`Hapus ketentuan pengiriman "${term.name}"?`)) return
    setDeleting(term.id); setError(null); setNotice(null)
    const { error: removeError } = await sb.rpc('company_shipping_term_delete', { p_company: companyId, p_term: term.id })
    setDeleting(null)
    if (removeError) return setError(removeError.message)
    setRows((current) => current.filter((item) => item.id !== term.id))
    setNotice(`Ketentuan pengiriman "${term.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(term: ShippingTerm) {
    setRows((current) => {
      const exists = current.some((item) => item.id === term.id)
      return (exists ? current.map((item) => item.id === term.id ? term : item) : [term, ...current])
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    })
    setEditing(null); setError(null); setNotice(`Ketentuan "${term.name}" berhasil disimpan.`)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Ketentuan Pengiriman</h1>
          <p className="mt-1 text-sm text-ink/60">Kelola ketentuan penyerahan barang dan pembagian risiko untuk transaksi penjualan dan pembelian.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah jenis
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {initialError && <p className="text-sm text-red-600">Data ketentuan pengiriman tidak dapat dimuat: {initialError}</p>}

      {rows.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-line bg-canvas text-ink/60">
              <th className="p-3 font-medium">Nama Jenis</th>
              <th className="p-3 font-medium">Keterangan</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3" />
            </tr></thead>
            <tbody>
              {rows.map((term) => (
                <tr key={term.id} className={`border-b border-line last:border-0 align-top ${term.active ? '' : 'text-ink/45'}`}>
                  <td className="whitespace-nowrap p-3"><span className="font-semibold text-ink">{term.name}</span></td>
                  <td className="p-3"><span className="block max-w-[620px] whitespace-normal">{term.description || <span className="text-ink/35">—</span>}</span></td>
                  <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${term.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{term.active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="whitespace-nowrap p-3 text-right"><div className="flex justify-end gap-1">
                    <button type="button" className="btn px-2" title="Ubah" aria-label={`Ubah ${term.name}`} onClick={() => { setError(null); setNotice(null); setEditing(term) }}><Pencil size={15} /></button>
                    <button type="button" className="btn px-2" title="Hapus" aria-label={`Hapus ${term.name}`} disabled={deleting === term.id} onClick={() => remove(term)}><Trash2 size={15} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink/60"><Truck size={27} /></div>
          <h2 className="mt-4 font-semibold">Belum ada ketentuan pengiriman</h2>
          <p className="mt-1 max-w-md text-sm text-ink/60">Jenis FCA, FOB, CIF, dan DAP akan tersedia sebagai data awal setelah migrasi database dijalankan.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => { setError(null); setNotice(null); setEditing('new') }}><Plus size={16} /> Tambah jenis</button>
        </div>
      )}

      {editing && <ShippingTermForm key={editing === 'new' ? 'new' : editing.id} companyId={companyId} term={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}

function ShippingTermForm({ companyId, term, onCancel, onSaved }: {
  companyId: string
  term: ShippingTerm | null
  onCancel: () => void
  onSaved: (term: ShippingTerm) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(term?.name ?? '')
  const [description, setDescription] = useState(term?.description ?? '')
  const [active, setActive] = useState(term?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    const payload = { id: term?.id ?? null, company_id: companyId, name: name.trim(), description: description.trim(), active }
    const { data, error: saveError } = await sb.rpc('company_shipping_term_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama jenis ini sudah digunakan. Gunakan nama yang berbeda.' : saveError.message)
      return
    }
    onSaved({ id: data as string, company_id: companyId, name: name.trim(), description: description.trim() || null, active, created_at: term?.created_at })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="shipping-term-title"
        style={{ width: 'min(640px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="shipping-term-title" className="text-lg font-semibold">{term ? 'Ubah ketentuan pengiriman' : 'Tambah ketentuan pengiriman'}</h2>
            <p className="mt-1 text-sm text-ink/60">Masukkan nama jenis dan keterangan ketentuan penyerahan barang.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium">Nama Jenis <span className="text-red-600">*</span>
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="Contoh: FCA, FOB, CIF, DAP" />
            </label>
            <label className="block text-sm font-medium">Keterangan
              <textarea className="input mt-1 min-h-24" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1500} placeholder="Jelaskan ketentuan penyerahan barang (opsional)" />
            </label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif</label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}><Check size={16} /> {busy ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
