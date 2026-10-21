'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { Pelanggan, PjPerm } from './types'

export default function PelangganManager({ companyId, pelanggan, perm }: { companyId: string; pelanggan: Pelanggan[]; perm: PjPerm }) {
  const sb = supabaseBrowser()
  const router = useRouter()
  const [form, setForm] = useState<Pelanggan | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(p: Pelanggan) {
    const { error } = await sb.from('pj_pelanggan').update({ aktif: !p.aktif }).eq('id', p.id)
    if (error) return setError(error.message)
    router.refresh()
  }
  async function remove(p: Pelanggan) {
    if (!confirm(`Hapus pelanggan ${p.nama}?`)) return
    const { error } = await sb.from('pj_pelanggan').delete().eq('id', p.id)
    if (error) return setError(error.code === '23503' ? 'Pelanggan sudah dipakai di penawaran atau faktur. Nonaktifkan saja.' : error.message)
    setError(null); router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Pelanggan</h1>
        {perm.create && <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}>Tambah pelanggan</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && <PelangganForm key={form === 'new' ? 'new' : form.id} companyId={companyId} initial={form === 'new' ? null : form}
        onDone={() => { setForm(null); router.refresh() }} onCancel={() => setForm(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Nama</th><th className="p-3 font-medium">Kontak</th><th className="p-3 font-medium">Alamat</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {pelanggan.map((p) => (
              <tr key={p.id} className={`border-b border-line last:border-0 ${p.aktif ? '' : 'text-ink/40'}`}>
                <td className="p-3">{p.nama}{!p.aktif && ' (nonaktif)'}</td>
                <td className="p-3">{[p.telepon, p.email].filter(Boolean).join(' · ') || '—'}</td>
                <td className="p-3">{p.alamat || '—'}</td>
                <td className="space-x-2 whitespace-nowrap p-3 text-right">
                  {perm.edit && <button className="btn" onClick={() => setForm(p)}>Ubah</button>}
                  {perm.edit && <button className="btn" onClick={() => toggle(p)}>{p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                  {perm.delete && <button className="btn" onClick={() => remove(p)}>Hapus</button>}
                </td>
              </tr>
            ))}
            {!pelanggan.length && <tr><td colSpan={4} className="p-6 text-center text-ink/60">Belum ada pelanggan. Tambahkan pelanggan pertama untuk mulai membuat penawaran dan faktur.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PelangganForm({ companyId, initial, onDone, onCancel }: { companyId: string; initial: Pelanggan | null; onDone: () => void; onCancel: () => void }) {
  const sb = supabaseBrowser()
  const [f, setF] = useState({ nama: initial?.nama ?? '', telepon: initial?.telepon ?? '', email: initial?.email ?? '', alamat: initial?.alamat ?? '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { company_id: companyId, nama: f.nama, telepon: f.telepon || null, email: f.email || null, alamat: f.alamat || null }
    const { error } = initial ? await sb.from('pj_pelanggan').update(payload).eq('id', initial.id) : await sb.from('pj_pelanggan').insert(payload)
    if (error) return setError(error.message)
    onDone()
  }
  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Nama pelanggan<input className="input mt-1" value={f.nama} onChange={set('nama')} required /></label>
      <label className="text-sm">Telepon<input className="input mt-1" value={f.telepon} onChange={set('telepon')} /></label>
      <label className="text-sm">Email<input type="email" className="input mt-1" value={f.email} onChange={set('email')} /></label>
      <label className="text-sm sm:col-span-2">Alamat<input className="input mt-1" value={f.alamat} onChange={set('alamat')} /></label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary">Simpan</button><button type="button" className="btn" onClick={onCancel}>Batal</button>
      </div>
    </form>
  )
}
