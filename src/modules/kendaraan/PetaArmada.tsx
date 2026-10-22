'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { loadGoogleMaps } from './gmaps'
import { jamLalu } from './util'
import type { KdPerm, Kendaraan, Lokasi, Posisi } from './types'

const JENIS_LOKASI: Record<string, { label: string; warna: string }> = {
  pool: { label: 'Pool / garasi', warna: '#1F2937' }, bengkel: { label: 'Bengkel', warna: '#B45309' },
  spbu: { label: 'SPBU', warna: '#1D4ED8' }, lainnya: { label: 'Lainnya', warna: '#6D28D9' },
}
const pill = (text: string, bg: string) => {
  const d = document.createElement('div')
  d.textContent = text
  d.style.cssText = `background:${bg};color:#fff;padding:3px 8px;border-radius:999px;font:600 12px system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap`
  return d
}
const linkMaps = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`

export default function PetaArmada({ companyId, kendaraan, lokasiAwal, posisiAwal, perm, apiKey, mapId }: {
  companyId: string; kendaraan: Kendaraan[]; lokasiAwal: Lokasi[]; posisiAwal: Posisi[]; perm: KdPerm; apiKey: string; mapId: string
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const AME = useRef<any>(null)
  const mV = useRef(new Map<string, any>())
  const mL = useRef(new Map<string, any>())
  const addRef = useRef(false)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [posisi, setPosisi] = useState<Record<string, Posisi>>(Object.fromEntries(posisiAwal.map((p) => [p.kendaraan_id, p])))
  const [lokasi, setLokasi] = useState(lokasiAwal)
  const [tick, setTick] = useState(0)
  const [addMode, setAddMode] = useState(false)
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const aktif = kendaraan.filter((k) => k.aktif)

  // Muat peta
  useEffect(() => {
    if (!apiKey) return
    let dead = false
    loadGoogleMaps(apiKey).then(async () => {
      const g = (window as any).google
      const { Map } = await g.maps.importLibrary('maps')
      const { AdvancedMarkerElement } = await g.maps.importLibrary('marker')
      if (dead || !mapEl.current) return
      AME.current = AdvancedMarkerElement
      map.current = new Map(mapEl.current, { center: { lat: -7.25, lng: 112.75 }, zoom: 11, mapId, streetViewControl: false, mapTypeControl: false })
      map.current.addListener('click', (e: any) => { if (addRef.current) setDraft({ lat: e.latLng.lat(), lng: e.latLng.lng() }) })
      setReady(true)
    }).catch((e) => setMapError(e.message))
    return () => { dead = true }
  }, [apiKey, mapId])

  // Posisi live (Supabase Realtime) + penyegar warna "terakhir update"
  useEffect(() => {
    const ch = sb.channel(`posisi-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kd_posisi_terakhir', filter: `company_id=eq.${companyId}` },
        (pl: any) => { const r = pl.new as Posisi; if (r?.kendaraan_id) setPosisi((p) => ({ ...p, [r.kendaraan_id]: r })) })
      .subscribe()
    const t = setInterval(() => setTick((x) => x + 1), 30000)
    return () => { sb.removeChannel(ch); clearInterval(t) }
  }, [sb, companyId])

  useEffect(() => { addRef.current = addMode; map.current?.setOptions({ draggableCursor: addMode ? 'crosshair' : null }) }, [addMode])

  // Sinkronkan marker
  useEffect(() => {
    if (!ready) return
    const bounds = new (window as any).google.maps.LatLngBounds()
    let n = 0
    const sync = (store: Map<string, any>, items: { id: string; lat: number; lng: number; text: string; bg: string }[]) => {
      const ids = new Set(items.map((i) => i.id))
      store.forEach((m, id) => { if (!ids.has(id)) { m.map = null; store.delete(id) } })
      items.forEach((i) => {
        const pos = { lat: i.lat, lng: i.lng }
        const m = store.get(i.id)
        if (m) { m.position = pos; m.content = pill(i.text, i.bg) }
        else store.set(i.id, new AME.current({ map: map.current, position: pos, content: pill(i.text, i.bg), title: i.text }))
        bounds.extend(pos); n++
      })
    }
    sync(mV.current, aktif.filter((k) => posisi[k.id]).map((k) => {
      const p = posisi[k.id]; const baru = Date.now() - new Date(p.waktu).getTime() < 5 * 60000
      return { id: k.id, lat: p.lat, lng: p.lng, text: k.plat, bg: baru ? '#0B7A75' : '#6B7B7D' }
    }))
    sync(mL.current, lokasi.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, text: l.nama, bg: JENIS_LOKASI[l.jenis]?.warna ?? '#6D28D9' })))
    if (!fitted.current && n > 0) { fitted.current = true; map.current.fitBounds(bounds, 60); if (n === 1) map.current.setZoom(15) }
  }, [ready, posisi, lokasi, kendaraan, tick])   // eslint-disable-line react-hooks/exhaustive-deps

  const fokus = (lat: number, lng: number) => { map.current?.panTo({ lat, lng }); map.current?.setZoom(15) }

  async function simpanLokasi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!draft) return
    const f = new FormData(e.currentTarget)
    const { data, error } = await sb.from('kd_lokasi').insert({
      company_id: companyId, nama: String(f.get('nama')), jenis: String(f.get('jenis')), lat: draft.lat, lng: draft.lng,
      alamat: String(f.get('alamat') || '') || null, catatan: String(f.get('catatan') || '') || null,
    }).select().single()
    if (error) return setError(error.message)
    setLokasi((l) => [...l, data as Lokasi]); setDraft(null); setAddMode(false); setError(null)
  }
  async function hapusLokasi(l: Lokasi) {
    if (!confirm(`Hapus lokasi ${l.nama}?`)) return
    const { error } = await sb.from('kd_lokasi').delete().eq('id', l.id)
    if (error) return setError(error.message)
    setLokasi((x) => x.filter((i) => i.id !== l.id))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Peta Armada</h1>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {apiKey ? (
          <div className="card relative h-[26rem] overflow-hidden lg:h-[calc(100vh-10rem)]">
            <div ref={mapEl} className="h-full w-full" />
            {!ready && !mapError && <p className="absolute inset-0 grid place-items-center text-sm text-ink/60">Memuat peta…</p>}
            {mapError && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-600">{mapError}</p>}
            {addMode && !draft && <p className="absolute left-3 top-3 rounded bg-ink px-3 py-1.5 text-sm text-white">Klik peta untuk menentukan titik lokasi</p>}
          </div>
        ) : (
          <div className="card p-6 text-sm">
            <p className="font-medium">Google Maps belum dikonfigurasi</p>
            <p className="mt-1 text-ink/60">Isi NEXT_PUBLIC_GOOGLE_MAPS_API_KEY di Vercel lalu redeploy. Sementara itu daftar posisi di samping tetap bisa dibuka lewat tautan Google Maps.</p>
          </div>
        )}

        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 font-medium">Kendaraan</h2>
            <ul className="divide-y divide-line text-sm">
              {aktif.map((k) => {
                const p = posisi[k.id]
                const baru = p && Date.now() - new Date(p.waktu).getTime() < 5 * 60000
                return (
                  <li key={k.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${baru ? 'bg-brand' : 'bg-ink/30'}`} aria-hidden />
                      <button className="flex-1 text-left hover:underline disabled:no-underline" disabled={!p || !ready} onClick={() => p && fokus(p.lat, p.lng)}>{k.nama} <span className="text-ink/50">{k.plat}</span></button>
                    </div>
                    <p className="ml-4 text-xs text-ink/50">
                      {p ? <>{jamLalu(p.waktu)}{p.kecepatan != null && ` · ${Math.round(p.kecepatan * 3.6)} km/jam`} · <a className="text-brand hover:underline" href={linkMaps(p.lat, p.lng)} target="_blank" rel="noreferrer">Buka di Google Maps</a></> : 'Belum ada posisi. Lihat menu Pelacakan di Daftar Kendaraan.'}
                    </p>
                  </li>
                )
              })}
              {!aktif.length && <li className="py-3 text-ink/60">Belum ada kendaraan aktif.</li>}
            </ul>
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex-1 font-medium">Lokasi tersimpan</h2>
              {perm.create && apiKey && <button className="btn" onClick={() => { setAddMode(!addMode); setDraft(null) }}>{addMode ? 'Batal' : 'Tambah lokasi'}</button>}
            </div>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            {draft && (
              <form onSubmit={simpanLokasi} className="mb-3 space-y-2 rounded border border-line bg-canvas p-3 text-sm">
                <p className="text-xs text-ink/60">Titik: {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</p>
                <input name="nama" className="input" placeholder="Nama lokasi" required />
                <select name="jenis" className="input">{Object.entries(JENIS_LOKASI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                <input name="alamat" className="input" placeholder="Alamat (opsional)" />
                <input name="catatan" className="input" placeholder="Catatan (opsional)" />
                <button className="btn btn-primary">Simpan lokasi</button>
              </form>
            )}
            <ul className="divide-y divide-line text-sm">
              {lokasi.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <button className="flex-1 text-left hover:underline" disabled={!ready} onClick={() => fokus(l.lat, l.lng)}>{l.nama}
                    <span className="block text-xs text-ink/50">{JENIS_LOKASI[l.jenis]?.label}{l.alamat && ` · ${l.alamat}`}</span></button>
                  <a className="text-xs text-brand hover:underline" href={linkMaps(l.lat, l.lng)} target="_blank" rel="noreferrer">Peta</a>
                  {perm.delete && <button className="btn px-2 py-1 text-xs" onClick={() => hapusLokasi(l)}>Hapus</button>}
                </li>
              ))}
              {!lokasi.length && <li className="py-3 text-ink/60">Belum ada lokasi. Simpan pool, bengkel langganan, atau SPBU favorit.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
