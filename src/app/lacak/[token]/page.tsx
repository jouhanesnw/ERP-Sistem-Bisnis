'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type Info = { nama: string; plat: string }

export default function LacakPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [jalan, setJalan] = useState(false)
  const [terakhir, setTerakhir] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const watch = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pos = useRef<GeolocationPosition | null>(null)
  const lock = useRef<any>(null)

  useEffect(() => {
    fetch(`/api/lokasi?token=${token}&info=1`).then(async (r) => {
      const d = await r.json()
      if (r.ok) setInfo(d); else setInvalid(d.error ?? 'Link tidak valid')
    }).catch(() => setInvalid('Tidak bisa menghubungi server'))
    return () => stop()
  }, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  async function kirim() {
    const p = pos.current
    if (!p) return
    try {
      const r = await fetch('/api/lokasi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed, sumber: 'hp' }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Gagal mengirim')
      setTerakhir(new Date()); setError(null)
    } catch (e: any) { setError(e.message) }
  }

  async function mulai() {
    if (!navigator.geolocation) return setError('Browser ini tidak mendukung lokasi.')
    setError(null)
    try { lock.current = await (navigator as any).wakeLock?.request('screen') } catch {}
    let pertama = true
    watch.current = navigator.geolocation.watchPosition(
      (p) => { pos.current = p; if (pertama) { pertama = false; kirim() } },
      (e) => setError(e.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk halaman ini.' : 'Lokasi belum tersedia. Pastikan GPS menyala.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    )
    timer.current = setInterval(kirim, 15000)
    setJalan(true)
  }
  function stop() {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    if (timer.current) clearInterval(timer.current)
    lock.current?.release?.().catch?.(() => {})
    watch.current = null; timer.current = null; setJalan(false)
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-sm space-y-4 p-6 text-center">
        {invalid ? <p className="text-red-600">{invalid}</p> : !info ? <p className="text-ink/60">Memuat…</p> : (<>
          <div><p className="text-sm text-ink/60">Pelacakan kendaraan</p><h1 className="text-xl font-semibold">{info.nama}</h1><p className="text-ink/60">{info.plat}</p></div>
          <p className={`rounded px-3 py-2 text-sm ${jalan ? 'bg-brand-soft text-brand-dark' : 'bg-canvas text-ink/70'}`}>
            {jalan ? (terakhir ? `Posisi terkirim ${terakhir.toLocaleTimeString('id-ID')}` : 'Mencari lokasi…') : 'Pelacakan mati'}
          </p>
          {jalan ? <button className="btn w-full" onClick={stop}>Berhenti</button> : <button className="btn btn-primary w-full" onClick={mulai}>Mulai pelacakan</button>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-ink/50">Biarkan halaman ini terbuka dan layar menyala selama perjalanan. Posisi dikirim setiap 15 detik.</p>
        </>)}
      </div>
    </main>
  )
}
