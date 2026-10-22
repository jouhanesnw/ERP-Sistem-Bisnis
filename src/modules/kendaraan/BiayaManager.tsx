'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate, monthStart, rupiah, tglID } from '@/lib/format'
import type { KdPerm, Kendaraan, RekeningPilihan } from './types'

type Tipe = 'servis' | 'bbm'
const SARAN_SERVIS = ['Ganti oli', 'Servis berkala', 'Rem', 'Ban', 'Aki', 'Tune up', 'Perbaikan lain']
const SARAN_BBM = ['Pertalite', 'Pertamax', 'Pertamax Turbo', 'Solar', 'Dexlite', 'Pertamina Dex']
const fmt = (n: number, d = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n)

export default function BiayaManager({ companyId, tipe, kendaraan, rekening, perm }: {
  companyId: string; tipe: Tipe; kendaraan: Kendaraan[]; rekening: RekeningPilihan[]; perm: KdPerm
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const tabel = tipe === 'servis' ? 'kd_servis' : 'kd_bbm'
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(isoDate(new Date()))
  const [kend, setKend] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<any | 'new' | null>(null)
  const nama = useMemo(() => Object.fromEntries(kendaraan.map((k) => [k.id, `${k.nama} (${k.plat})`])), [kendaraan])

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from(tabel).select('*').eq('company_id', companyId).gte('tanggal', from).lte('tanggal', to)
      .order('tanggal', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (kend) q = q.eq('kendaraan_id', kend)
    const { data, error } = await q
    setLoading(false)
    if (error) return setError(error.message)
    setError(null); setRows(data ?? [])
  }, [sb, tabel, companyId, from, to, kend])
  useEffect(() => { load() }, [load])

  async function remove(r: any) {
    if (!confirm('Hapus data ini? Kas keluar yang terhubung juga ikut terhapus.')) return
    const { error } = await sb.rpc('kd_hapus_biaya', { p_tabel: tipe, p_id: r.id })
    if (error) return setError(error.message)
    load()
  }

  // Perkiraan km/l: selisih odometer dengan pengisian sebelumnya dibagi liter (asumsi tangki diisi penuh)
  const efisiensi = useMemo(() => {
    if (tipe !== 'bbm') return {} as Record<string, number>
    const out: Record<string, number> = {}
    const per = new Map<string, any[]>()
    rows.filter((r) => r.odometer).forEach((r) => per.set(r.kendaraan_id, [...(per.get(r.kendaraan_id) ?? []), r]))
    per.forEach((l) => {
      l.sort((a, b) => a.odometer - b.odometer)
      for (let i = 1; i < l.length; i++) { const d = l[i].odometer - l[i - 1].odometer; if (d > 0 && l[i].liter > 0) out[l[i].id] = d / Number(l[i].liter) }
    })
    return out
  }, [rows, tipe])

  const total = rows.reduce((s, r) => s + Number(r.biaya), 0)
  const liter = rows.reduce((s, r) => s + Number(r.liter ?? 0), 0)
  const aktif = kendaraan.filter((k) => k.aktif)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{tipe === 'servis' ? 'Servis Kendaraan' : 'Bahan Bakar'}</h1>
        {perm.create && (aktif.length
          ? <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}><Plus size={16} />Tambah</button>
          : <Link href="/kendaraan/daftar" className="btn ml-auto">Tambah kendaraan dulu</Link>)}
      </div>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Kendaraan
          <select className="input mt-1" value={kend} onChange={(e) => setKend(e.target.value)}>
            <option value="">Semua</option>{kendaraan.map((k) => <option key={k.id} value={k.id}>{k.nama} ({k.plat})</option>)}
          </select>
        </label>
        <p className="ml-auto text-sm text-ink/60">{rows.length} data · Total <b className="text-ink">{rupiah(total)}</b>{tipe === 'bbm' && <> · {fmt(liter, 1)} liter</>}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && <BiayaForm key={form === 'new' ? 'new' : form.id} sb={sb} companyId={companyId} tipe={tipe}
        kendaraan={kendaraan.filter((k) => k.aktif || (form !== 'new' && k.id === form.kendaraan_id))} rekening={rekening}
        initial={form === 'new' ? null : form} onDone={() => { setForm(null); load() }} onCancel={() => setForm(null)} />}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Tanggal</th><th className="p-3 font-medium">Kendaraan</th>
            <th className="p-3 font-medium">{tipe === 'servis' ? 'Servis' : 'BBM'}</th>
            <th className="p-3 text-right font-medium">Odometer</th><th className="p-3 text-right font-medium">Biaya</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap p-3">{tglID(r.tanggal)}</td>
                <td className="p-3">{nama[r.kendaraan_id] ?? '—'}</td>
                <td className="p-3">
                  {tipe === 'servis'
                    ? <>{r.jenis}{r.bengkel && <span className="block text-xs text-ink/50">{r.bengkel}</span>}{(r.berikutnya_tanggal || r.berikutnya_km) && <span className="block text-xs text-ink/50">Berikutnya: {[r.berikutnya_tanggal && tglID(r.berikutnya_tanggal), r.berikutnya_km && `${fmt(r.berikutnya_km)} km`].filter(Boolean).join(' / ')}</span>}</>
                    : <>{fmt(Number(r.liter), 2)} liter{r.jenis_bbm && ` ${r.jenis_bbm}`}<span className="block text-xs text-ink/50">{[r.spbu, Number(r.liter) > 0 && Number(r.biaya) > 0 ? `${rupiah(Number(r.biaya) / Number(r.liter))}/liter` : null, efisiensi[r.id] ? `≈ ${fmt(efisiensi[r.id], 1)} km/l` : null].filter(Boolean).join(' · ')}</span></>}
                  {r.kas_transaksi_id && <span className="block text-xs text-brand-dark">Tercatat di Kas</span>}
                </td>
                <td className="p-3 text-right tabular-nums">{r.odometer ? fmt(r.odometer) : '—'}</td>
                <td className="p-3 text-right tabular-nums">{rupiah(Number(r.biaya))}</td>
                <td className="space-x-1 whitespace-nowrap p-3 text-right">
                  {perm.edit && <button className="btn px-2" onClick={() => setForm(r)} aria-label="Ubah"><Pencil size={15} /></button>}
                  {perm.delete && <button className="btn px-2" onClick={() => remove(r)} aria-label="Hapus"><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-ink/60">{loading ? 'Memuat…' : 'Belum ada data pada periode ini.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {tipe === 'bbm' && <p className="text-xs text-ink/50">Angka km/l adalah perkiraan dari selisih odometer antar pengisian, dengan asumsi tangki diisi penuh.</p>}
    </div>
  )
}

function BiayaForm({ sb, companyId, tipe, kendaraan, rekening, initial, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; companyId: string; tipe: Tipe; kendaraan: Kendaraan[]; rekening: RekeningPilihan[]
  initial: any | null; onDone: () => void; onCancel: () => void
}) {
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [f, setF] = useState({
    kendaraan_id: initial?.kendaraan_id ?? kendaraan[0]?.id ?? '', tanggal: initial?.tanggal ?? isoDate(new Date()),
    odometer: s(initial?.odometer), biaya: s(initial?.biaya), rekening_id: s(initial?.rekening_id),
    jenis: s(initial?.jenis), bengkel: s(initial?.bengkel), keterangan: s(initial?.keterangan), berikutnya_tanggal: s(initial?.berikutnya_tanggal), berikutnya_km: s(initial?.berikutnya_km),
    liter: s(initial?.liter), spbu: s(initial?.spbu), jenis_bbm: s(initial?.jenis_bbm),
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const terhubung = !!initial?.kas_transaksi_id

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const rpc = tipe === 'servis' ? 'kd_simpan_servis' : 'kd_simpan_bbm'
    const { error } = await sb.rpc(rpc, { p: { ...f, id: initial?.id ?? null, company_id: companyId, rekening_id: f.rekening_id || null } })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-3">
      <label className="text-sm">Kendaraan
        <select className="input mt-1" value={f.kendaraan_id} onChange={set('kendaraan_id')} required>{kendaraan.map((k) => <option key={k.id} value={k.id}>{k.nama} ({k.plat})</option>)}</select>
      </label>
      <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={f.tanggal} onChange={set('tanggal')} required /></label>
      <label className="text-sm">Odometer (km)<input type="number" min="0" className="input mt-1" value={f.odometer} onChange={set('odometer')} /></label>

      {tipe === 'servis' ? (<>
        <label className="text-sm">Jenis servis<input list="saran-servis" className="input mt-1" value={f.jenis} onChange={set('jenis')} required /><datalist id="saran-servis">{SARAN_SERVIS.map((x) => <option key={x} value={x} />)}</datalist></label>
        <label className="text-sm">Bengkel<input className="input mt-1" value={f.bengkel} onChange={set('bengkel')} /></label>
        <label className="text-sm">Biaya (Rp)<input type="number" min="0" step="1" className="input mt-1" value={f.biaya} onChange={set('biaya')} required /></label>
        <label className="text-sm">Servis berikutnya (tanggal)<input type="date" className="input mt-1" value={f.berikutnya_tanggal} onChange={set('berikutnya_tanggal')} /></label>
        <label className="text-sm">Servis berikutnya (km)<input type="number" min="0" className="input mt-1" value={f.berikutnya_km} onChange={set('berikutnya_km')} /></label>
        <label className="text-sm">Keterangan<input className="input mt-1" value={f.keterangan} onChange={set('keterangan')} /></label>
      </>) : (<>
        <label className="text-sm">Jumlah (liter)<input type="number" min="0.01" step="any" className="input mt-1" value={f.liter} onChange={set('liter')} required /></label>
        <label className="text-sm">Total bayar (Rp)<input type="number" min="0" step="1" className="input mt-1" value={f.biaya} onChange={set('biaya')} required /></label>
        <label className="text-sm">Jenis BBM<input list="saran-bbm" className="input mt-1" value={f.jenis_bbm} onChange={set('jenis_bbm')} /><datalist id="saran-bbm">{SARAN_BBM.map((x) => <option key={x} value={x} />)}</datalist></label>
        <label className="text-sm sm:col-span-3">SPBU / lokasi<input className="input mt-1" value={f.spbu} onChange={set('spbu')} /></label>
      </>)}

      <label className="text-sm sm:col-span-3">Catat sebagai kas keluar dari rekening{terhubung && ' (sudah tercatat di Kas. Pilih "Tidak dicatat di Kas" untuk menghapusnya dari Kas)'}
        <select className="input mt-1" value={f.rekening_id} onChange={set('rekening_id')}>
          <option value="">Tidak dicatat di Kas</option>
          {rekening.filter((r) => r.aktif || r.id === initial?.rekening_id).map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="btn" onClick={onCancel}>Batal</button>
      </div>
    </form>
  )
}
