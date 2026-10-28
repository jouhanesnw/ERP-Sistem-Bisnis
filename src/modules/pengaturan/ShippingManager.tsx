'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Pencil, Plus, Search, Trash2, Truck, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

export type ShippingMethod = {
  id: string
  company_id: string
  name: string
  pic: string | null
  phone: string | null
  address: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string
  active: boolean
  created_at?: string
}

export default function ShippingManager({ companyId, initial, initialError }: {
  companyId: string
  initial: ShippingMethod[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [editing, setEditing] = useState<ShippingMethod | 'new' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setRows(initial), [initial])

  async function remove(row: ShippingMethod) {
    if (!confirm(`Hapus ekspedisi "${row.name}"?`)) return
    setDeleting(row.id); setError(null); setNotice(null)
    const { error: removeError } = await sb.rpc('company_shipping_method_delete', { p_company: companyId, p_shipping_method: row.id })
    setDeleting(null)
    if (removeError) return setError(removeError.message)
    setRows((current) => current.filter((item) => item.id !== row.id))
    setNotice(`Ekspedisi "${row.name}" berhasil dihapus.`)
    router.refresh()
  }

  function saved(row: ShippingMethod) {
    setRows((current) => {
      const exists = current.some((item) => item.id === row.id)
      return (exists ? current.map((item) => item.id === row.id ? row : item) : [row, ...current])
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    })
    setEditing(null); setError(null); setNotice(`Ekspedisi "${row.name}" berhasil disimpan.`)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Pengiriman / Ekspedisi</h1>
          <p className="mt-1 text-sm text-ink/60">Simpan data ekspedisi agar dapat dipilih pada transaksi penjualan dan pembelian.</p>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => { setError(null); setNotice(null); setEditing('new') }}>
          <Plus size={16} /> Tambah pengiriman
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      {rows.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead><tr className="border-b border-line bg-canvas text-ink/60">
              <th className="p-3 font-medium">Nama Pengiriman / Ekspedisi</th>
              <th className="p-3 font-medium">PIC</th>
              <th className="p-3 font-medium">No. Telepon</th>
              <th className="p-3 font-medium">Alamat Pengiriman</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3" />
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={`border-b border-line last:border-0 align-top ${row.active ? '' : 'text-ink/45'}`}>
                  <td className="p-3"><span className="font-medium text-ink">{row.name}</span></td>
                  <td className="p-3">{row.pic || '—'}</td>
                  <td className="whitespace-nowrap p-3">{row.phone || '—'}</td>
                  <td className="p-3">
                    {row.address || '—'}
                    <span className="mt-1 block text-xs text-ink/55">{[row.city, row.province, row.postal_code, row.country].filter(Boolean).join(', ')}</span>
                  </td>
                  <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{row.active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="whitespace-nowrap p-3 text-right"><div className="flex justify-end gap-1">
                    <button type="button" className="btn px-2" title="Ubah" aria-label={`Ubah ${row.name}`} onClick={() => { setError(null); setNotice(null); setEditing(row) }}><Pencil size={15} /></button>
                    <button type="button" className="btn px-2" title="Hapus" aria-label={`Hapus ${row.name}`} disabled={deleting === row.id} onClick={() => remove(row)}><Trash2 size={15} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink/60"><Truck size={27} /></div>
          <h2 className="mt-4 font-semibold">Belum ada data pengiriman</h2>
          <p className="mt-1 max-w-md text-sm text-ink/60">Tambahkan ekspedisi atau jasa pengiriman yang digunakan perusahaan. Data ini nantinya dapat dipilih saat membuat transaksi pembelian maupun penjualan.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => { setError(null); setNotice(null); setEditing('new') }}><Plus size={16} /> Tambah pengiriman</button>
        </div>
      )}

      {editing && <ShippingForm key={editing === 'new' ? 'new' : editing.id} companyId={companyId} row={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}

function ShippingForm({ companyId, row, onCancel, onSaved }: {
  companyId: string
  row: ShippingMethod | null
  onCancel: () => void
  onSaved: (row: ShippingMethod) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [name, setName] = useState(row?.name ?? '')
  const [pic, setPic] = useState(row?.pic ?? '')
  const [phone, setPhone] = useState(row?.phone ?? '')
  const [address, setAddress] = useState(row?.address ?? '')
  const [city, setCity] = useState(row?.city ?? '')
  const [province, setProvince] = useState(row?.province ?? '')
  const [postalCode, setPostalCode] = useState(row?.postal_code ?? '')
  const [country, setCountry] = useState(row?.country ?? 'Indonesia')
  const [active, setActive] = useState(row?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    const payload = {
      id: row?.id ?? null,
      company_id: companyId,
      name: name.trim(),
      pic: pic.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      province: province.trim(),
      postal_code: postalCode.trim(),
      country: country.trim() || 'Indonesia',
      active,
    }
    const { data, error: saveError } = await sb.rpc('company_shipping_method_save', { p: payload })
    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'Nama pengiriman/ekspedisi sudah digunakan. Gunakan nama yang berbeda.' : saveError.message)
      return
    }
    onSaved({
      id: data as string,
      company_id: companyId,
      name: name.trim(),
      pic: pic.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      province: province.trim() || null,
      postal_code: postalCode.trim() || null,
      country: country.trim() || 'Indonesia',
      active,
      created_at: row?.created_at,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="shipping-form-title"
        style={{ width: 'min(760px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', backgroundColor: '#ffffff' }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="shipping-form-title" className="text-lg font-semibold">{row ? 'Ubah pengiriman / ekspedisi' : 'Tambah pengiriman / ekspedisi'}</h2>
            <p className="mt-1 text-sm text-ink/60">Informasi ini menjadi data master untuk transaksi penjualan dan pembelian.</p>
          </div>
          <button type="button" className="btn px-2" aria-label="Tutup popup" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Nama Pengiriman / Ekspedisi <span className="text-red-600">*</span>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} autoFocus placeholder="Contoh: JNE, J&T, ekspedisi internal" />
              </label>
              <label className="text-sm font-medium">PIC (Person in Charge)
                <input className="input mt-1" value={pic} onChange={(e) => setPic(e.target.value)} maxLength={120} placeholder="Nama penanggung jawab" />
              </label>
              <label className="text-sm font-medium">No. Telepon
                <input className="input mt-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="Nomor yang bisa dihubungi" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Alamat Pengiriman
                <textarea className="input mt-1 min-h-20" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="Nama jalan, nomor, gedung" />
              </label>
              <label className="text-sm font-medium">Kota<input className="input mt-1" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} /></label>
              <label className="text-sm font-medium">Provinsi<input className="input mt-1" value={province} onChange={(e) => setProvince(e.target.value)} maxLength={100} /></label>
              <label className="text-sm font-medium">Kode Pos<input className="input mt-1" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} /></label>
              <label className="text-sm font-medium">Negara<input className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} /></label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ekspedisi aktif</label>
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
