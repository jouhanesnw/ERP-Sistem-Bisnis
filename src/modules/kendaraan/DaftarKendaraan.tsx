'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { tglID } from '@/lib/format'
import { JENIS_PAJAK, waktuLabel } from './util'
import type { KdPerm, Kendaraan, Pajak, ServisRow } from './types'

const JENIS = ['mobil', 'motor', 'truk', 'pickup', 'bus', 'lainnya']
const km = (n: number) => new Intl.NumberFormat('id-ID').format(n) + ' km'

export default function DaftarKendaraan({ companyId, kendaraan, servis, pajak, perm }: {
  companyId: string; kendaraan: Kendaraan[]; servis: ServisRow[]; pajak: Pajak[]; perm: KdPerm
}) {
  const sb = supabaseBrowser()
  const router = useRouter()
  const [form, setForm] = useState<Kendaraan | 'new' | null>(null)
  const [linkId, setLinkId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(k: Kendaraan) {
    const { error } = await sb.from('kd_kendaraan').update({ aktif: !k.aktif }).eq('id', k.id)
    if (error) return setError(error.message)
    router.refresh()
  }
  async function remove(k: Kendaraan) {
    if (!confirm(`Hapus ${k.nama} (${k.plat})?`)) return
    const { error } = await sb.from('kd_kendaraan').delete().eq('id', k.id)
    if (error) return setError(error.code === '23503' ? 'Kendaraan sudah punya riwayat servis, BBM, atau pajak. Nonaktifkan saja.' : error.message)
    setError(null); router.refresh()
  }

  function infoServis(k: Kendaraan) {
    const s = servis.find((x) => x.kendaraan_id === k.id && (x.berikutnya_tanggal || x.berikutnya_km))   // servis sudah urut terbaru
    if (!s) return null
    return { tgl: s.berikutnya_tanggal, km: s.berikutnya_km }
  }
  function infoPajak(k: Kendaraan) {
    const terbaru = new Map<string, Pajak>()
    pajak.filter((p) => p.kendaraan_id === k.id).forEach((p) => { const c = terbaru.get(p.jenis); if (!c || p.berlaku_sampai > c.berlaku_sampai) terbaru.set(p.jenis, p) })
    return [...terbaru.values()].sort((a, b) => a.berlaku_sampai.localeCompare(b.berlaku_sampai))[0] ?? null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Daftar Kendaraan</h1>
        {perm.create && <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}>Tambah kendaraan</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && <KendaraanForm key={form === 'new' ? 'new' : form.id} companyId={companyId} initial={form === 'new' ? null : form}
        onDone={() => { setForm(null); router.refresh() }} onCancel={() => setForm(null)} />}

      <div className="space-y-3">
        {kendaraan.map((k) => {
          const s = infoServis(k), p = infoPajak(k)
          const sisaKm = s?.km != null ? s.km - k.odometer : null
          return (
            <section key={k.id} className={`card p-4 ${k.aktif ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.nama} <span className="ml-1 rounded bg-canvas px-2 py-0.5 text-xs">{k.plat}</span>{!k.aktif && <span className="ml-2 text-xs text-ink/50">(nonaktif)</span>}</p>
                  <p className="text-sm text-ink/60">{[k.jenis, k.merek, k.tahun].filter(Boolean).join(' · ')} · Odometer {km(k.odometer)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn" onClick={() => setLinkId(linkId === k.id ? null : k.id)}>Pelacakan</button>
                  {perm.edit && <button className="btn" onClick={() => setForm(k)}>Ubah</button>}
                  {perm.edit && <button className="btn" onClick={() => toggle(k)}>{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                  {perm.delete && <button className="btn" onClick={() => remove(k)}>Hapus</button>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {s?.tgl && <Chip label={`Servis ${tglID(s.tgl)}`} {...waktuLabel(s.tgl, 14)} />}
                {sisaKm != null && <Chip label={`Servis di ${km(s!.km!)}`} t={sisaKm < 0 ? `Lewat ${km(-sisaKm)}` : `${km(sisaKm)} lagi`} c={sisaKm < 0 ? 'bg-red-100 text-red-800' : sisaKm <= 500 ? 'bg-amber-100 text-amber-800' : 'bg-canvas text-ink/70'} />}
                {p && <Chip label={`${JENIS_PAJAK[p.jenis] ?? p.jenis} ${tglID(p.berlaku_sampai)}`} {...waktuLabel(p.berlaku_sampai, 30)} />}
                {!s && !p && <span className="text-ink/50">Belum ada jadwal servis atau pajak.</span>}
              </div>
              {linkId === k.id && <LinkPelacakan k={k} canEdit={perm.edit} onReset={() => router.refresh()} />}
            </section>
          )
        })}
        {!kendaraan.length && <p className="card p-6 text-center text-sm text-ink/60">Belum ada kendaraan. Tambahkan kendaraan pertama.</p>}
      </div>
    </div>
  )
}

const Chip = ({ label, t, c }: { label: string; t: string; c: string }) => (
  <span className="inline-flex items-center gap-2 rounded border border-line px-2 py-1">{label}<span className={`rounded px-1.5 py-0.5 font-medium ${c}`}>{t}</span></span>
)

function LinkPelacakan({ k, canEdit, onReset }: { k: Kendaraan; canEdit: boolean; onReset: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const sopir = `${origin}/lacak/${k.track_token}`
  const gps = `${origin}/api/lokasi?token=${k.track_token}&lat={LAT}&lng={LNG}&speed={SPEED}`
  async function copy(key: string, v: string) { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied(null), 1500) }
  async function reset() {
    if (!confirm('Buat token baru? Link sopir dan pengaturan GPS yang lama berhenti bekerja.')) return
    const { error } = await supabaseBrowser().rpc('kd_reset_token', { p_id: k.id })
    if (error) return setError(error.message)
    onReset()
  }
  return (
    <div className="mt-3 space-y-3 rounded border border-line bg-canvas p-3 text-sm">
      <div>
        <p className="font-medium">Link untuk sopir (HP)</p>
        <p className="text-ink/60">Buka link ini di HP sopir, lalu tekan Mulai. Halaman harus tetap terbuka dan layar menyala selama perjalanan.</p>
        <div className="mt-1 flex gap-2"><input readOnly className="input" value={sopir} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copy('s', sopir)}>{copied === 's' ? 'Disalin' : 'Salin'}</button></div>
      </div>
      <div>
        <p className="font-medium">URL untuk perangkat GPS tracker</p>
        <p className="text-ink/60">Masukkan di pengaturan tracker (HTTP/webhook). Ganti {'{LAT}'}, {'{LNG}'}, {'{SPEED}'} dengan variabel dari vendor Anda.</p>
        <div className="mt-1 flex gap-2"><input readOnly className="input" value={gps} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copy('g', gps)}>{copied === 'g' ? 'Disalin' : 'Salin'}</button></div>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {canEdit && <button className="btn" onClick={reset}>Buat ulang token</button>}
    </div>
  )
}

function KendaraanForm({ companyId, initial, onDone, onCancel }: { companyId: string; initial: Kendaraan | null; onDone: () => void; onCancel: () => void }) {
  const sb = supabaseBrowser()
  const [f, setF] = useState({ nama: initial?.nama ?? '', plat: initial?.plat ?? '', jenis: initial?.jenis ?? 'mobil', merek: initial?.merek ?? '', tahun: String(initial?.tahun ?? ''), odometer: String(initial?.odometer ?? 0), catatan: initial?.catatan ?? '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { company_id: companyId, nama: f.nama, plat: f.plat.toUpperCase().trim(), jenis: f.jenis, merek: f.merek || null, tahun: f.tahun ? Number(f.tahun) : null, odometer: Number(f.odometer || 0), catatan: f.catatan || null }
    const { error } = initial ? await sb.from('kd_kendaraan').update(payload).eq('id', initial.id) : await sb.from('kd_kendaraan').insert(payload)
    if (error) return setError(error.code === '23505' ? 'Plat nomor sudah terdaftar.' : error.message)
    onDone()
  }
  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-3">
      <label className="text-sm">Nama kendaraan<input className="input mt-1" value={f.nama} onChange={set('nama')} required placeholder="Contoh: Pickup Operasional 1" /></label>
      <label className="text-sm">Plat nomor<input className="input mt-1" value={f.plat} onChange={set('plat')} required placeholder="L 1234 AB" /></label>
      <label className="text-sm">Jenis<select className="input mt-1" value={f.jenis} onChange={set('jenis')}>{JENIS.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
      <label className="text-sm">Merek / tipe<input className="input mt-1" value={f.merek} onChange={set('merek')} /></label>
      <label className="text-sm">Tahun<input type="number" className="input mt-1" value={f.tahun} onChange={set('tahun')} /></label>
      <label className="text-sm">Odometer saat ini (km)<input type="number" min="0" className="input mt-1" value={f.odometer} onChange={set('odometer')} /></label>
      <label className="text-sm sm:col-span-3">Catatan<input className="input mt-1" value={f.catatan} onChange={set('catatan')} /></label>
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-3"><button className="btn btn-primary">Simpan</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
    </form>
  )
}
