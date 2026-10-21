'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { KasPerm, Kategori } from './types'

export default function KategoriManager({ companyId, kategori, perm }: { companyId: string; kategori: Kategori[]; perm: KasPerm }) {
  const sb = supabaseBrowser()
  const router = useRouter()
  const [nama, setNama] = useState('')
  const [jenis, setJenis] = useState('keluar')
  const [error, setError] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await sb.from('kas_kategori').insert({ company_id: companyId, nama, jenis })
    if (error) return setError(error.message)
    setNama(''); setError(null); router.refresh()
  }
  async function toggle(k: Kategori) {
    const { error } = await sb.from('kas_kategori').update({ aktif: !k.aktif }).eq('id', k.id)
    if (error) return setError(error.message)
    router.refresh()
  }
  async function remove(k: Kategori) {
    if (!confirm(`Hapus kategori ${k.nama}?`)) return
    const { error } = await sb.from('kas_kategori').delete().eq('id', k.id)
    if (error) return setError(error.code === '23503' ? 'Kategori sudah dipakai transaksi. Nonaktifkan saja.' : error.message)
    setError(null); router.refresh()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Kategori Kas</h1>
      {perm.create && (
        <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-[12rem] flex-1 text-sm">Nama kategori<input className="input mt-1" value={nama} onChange={(e) => setNama(e.target.value)} required /></label>
          <label className="text-sm">Jenis
            <select className="input mt-1" value={jenis} onChange={(e) => setJenis(e.target.value)}>
              <option value="masuk">Kas masuk</option><option value="keluar">Kas keluar</option>
            </select>
          </label>
          <button className="btn btn-primary">Tambah</button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(['masuk', 'keluar'] as const).map((j) => (
          <section key={j} className="card p-4">
            <h2 className="mb-2 font-medium">{j === 'masuk' ? 'Kas masuk' : 'Kas keluar'}</h2>
            <ul className="divide-y divide-line text-sm">
              {kategori.filter((k) => k.jenis === j).map((k) => (
                <li key={k.id} className={`flex items-center gap-2 py-2 ${k.aktif ? '' : 'text-ink/40'}`}>
                  <span className="flex-1">{k.nama}{!k.aktif && ' (nonaktif)'}</span>
                  {perm.edit && <button className="btn" onClick={() => toggle(k)}>{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                  {perm.delete && <button className="btn" onClick={() => remove(k)}>Hapus</button>}
                </li>
              ))}
              {!kategori.some((k) => k.jenis === j) && <li className="py-3 text-ink/60">Belum ada kategori.</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
