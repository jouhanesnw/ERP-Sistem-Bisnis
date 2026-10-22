'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate, rupiah, tglID } from '@/lib/format'
import { JENIS_PAJAK, waktuLabel } from './util'
import type { KdPerm, Kendaraan, Pajak } from './types'

export default function PajakManager({ companyId, kendaraan, perm }: { companyId: string; kendaraan: Kendaraan[]; perm: KdPerm }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [kend, setKend] = useState('')
  const [rows, setRows] = useState<Pajak[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Pajak | 'new' | null>(null)
  const nama = useMemo(() => Object.fromEntries(kendaraan.map((k) => [k.id, `${k.nama} (${k.plat})`])), [kendaraan])

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('kd_pajak').select('*').eq('company_id', companyId).order('berlaku_sampai').limit(500)
    if (kend) q = q.eq('kendaraan_id', kend)
    const { data, error } = await q
    setLoading(false)
    if (error) return setError(error.message)
    setError(null); setRows((data ?? []) as Pajak[])
  }, [sb, companyId, kend])
  useEffect(() => { load() }, [load])

  // Hanya periode terbaru tiap kendaraan + jenis yang dianggap berlaku
  const terbaru = useMemo(() => {
    const m = new Map<string, string>()
    rows.forEach((r) => { const k = r.kendaraan_id + r.jenis; if (!m.has(k) || r.berlaku_sampai > m.get(k)!) m.set(k, r.berlaku_sampai) })
    return m
  }, [rows])

  async function remove(r: Pajak) {
    if (!confirm('Hapus data ini? Pengingatnya di modul Reminder juga ikut terhapus.')) return
    const { error } = await sb.from('kd_pajak').delete().eq('id', r.id)
    if (error) return setError(error.message)
    load()
  }
  const aktif = kendaraan.filter((k) => k.aktif)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-semibold">Pajak & STNK</h1>
          <p className="text-sm text-ink/60">Pengingat otomatis dibuat di modul Reminder, mulai 30 hari sebelum berakhir.</p></div>
        {perm.create && (aktif.length ? <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}><Plus size={16} />Tambah</button>
          : <Link href="/kendaraan/daftar" className="btn ml-auto">Tambah kendaraan dulu</Link>)}
      </div>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">Kendaraan
          <select className="input mt-1" value={kend} onChange={(e) => setKend(e.target.value)}>
            <option value="">Semua</option>{kendaraan.map((k) => <option key={k.id} value={k.id}>{k.nama} ({k.plat})</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && <PajakForm key={form === 'new' ? 'new' : form.id} sb={sb} companyId={companyId} kendaraan={aktif.concat(kendaraan.filter((k) => !k.aktif && form !== 'new' && k.id === form.kendaraan_id))}
        initial={form === 'new' ? null : form} onDone={() => { setForm(null); load() }} onCancel={() => setForm(null)} />}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Kendaraan</th><th className="p-3 font-medium">Jenis</th><th className="p-3 font-medium">Berlaku sampai</th>
            <th className="p-3 text-right font-medium">Biaya</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const berlaku = terbaru.get(r.kendaraan_id + r.jenis) === r.berlaku_sampai
              const w = berlaku ? waktuLabel(r.berlaku_sampai, 30) : { t: 'Riwayat', c: 'bg-canvas text-ink/50' }
              return (
                <tr key={r.id} className={`border-b border-line align-top last:border-0 ${berlaku ? '' : 'text-ink/50'}`}>
                  <td className="p-3">{nama[r.kendaraan_id] ?? '—'}</td>
                  <td className="p-3">{JENIS_PAJAK[r.jenis] ?? r.jenis}{r.catatan && <span className="block text-xs text-ink/50">{r.catatan}</span>}</td>
                  <td className="p-3"><span className="mr-2 whitespace-nowrap">{tglID(r.berlaku_sampai)}</span><span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${w.c}`}>{w.t}</span></td>
                  <td className="p-3 text-right tabular-nums">{r.biaya ? rupiah(Number(r.biaya)) : '—'}</td>
                  <td className="space-x-1 whitespace-nowrap p-3 text-right">
                    {perm.edit && <button className="btn px-2" onClick={() => setForm(r)} aria-label="Ubah"><Pencil size={15} /></button>}
                    {perm.delete && <button className="btn px-2" onClick={() => remove(r)} aria-label="Hapus"><Trash2 size={15} /></button>}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={5} className="p-6 text-center text-ink/60">{loading ? 'Memuat…' : 'Belum ada data pajak atau STNK.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PajakForm({ sb, companyId, kendaraan, initial, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; companyId: string; kendaraan: Kendaraan[]; initial: Pajak | null; onDone: () => void; onCancel: () => void
}) {
  const [f, setF] = useState({ kendaraan_id: initial?.kendaraan_id ?? kendaraan[0]?.id ?? '', jenis: initial?.jenis ?? 'pajak_tahunan', berlaku_sampai: initial?.berlaku_sampai ?? isoDate(new Date()), biaya: String(initial?.biaya ?? ''), catatan: initial?.catatan ?? '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { company_id: companyId, kendaraan_id: f.kendaraan_id, jenis: f.jenis, berlaku_sampai: f.berlaku_sampai, biaya: f.biaya ? Number(f.biaya) : null, catatan: f.catatan || null }
    const { error } = initial ? await sb.from('kd_pajak').update(payload).eq('id', initial.id) : await sb.from('kd_pajak').insert(payload)
    if (error) return setError(error.message)
    onDone()
  }
  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-3">
      <label className="text-sm">Kendaraan<select className="input mt-1" value={f.kendaraan_id} onChange={set('kendaraan_id')} required>{kendaraan.map((k) => <option key={k.id} value={k.id}>{k.nama} ({k.plat})</option>)}</select></label>
      <label className="text-sm">Jenis<select className="input mt-1" value={f.jenis} onChange={set('jenis')}>{Object.entries(JENIS_PAJAK).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="text-sm">Berlaku sampai<input type="date" className="input mt-1" value={f.berlaku_sampai} onChange={set('berlaku_sampai')} required /></label>
      <label className="text-sm">Biaya (Rp, opsional)<input type="number" min="0" className="input mt-1" value={f.biaya} onChange={set('biaya')} /></label>
      <label className="text-sm sm:col-span-2">Catatan<input className="input mt-1" value={f.catatan} onChange={set('catatan')} /></label>
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-3"><button className="btn btn-primary">Simpan</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
    </form>
  )
}
