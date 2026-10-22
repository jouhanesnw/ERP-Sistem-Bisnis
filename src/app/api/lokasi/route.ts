import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const TOKEN = /^[0-9a-f]{32}$/
const num = (v: unknown) => (v === undefined || v === null || v === '' ? NaN : Number(v))
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function cari(token: string) {
  const { data } = await admin().from('kd_kendaraan').select('id, company_id, nama, plat, aktif').eq('track_token', token).maybeSingle()
  return data && data.aktif ? data : null
}

async function simpan(p: { token?: unknown; lat?: unknown; lng?: unknown; speed?: unknown; sumber?: unknown }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY)' }, 503)
  const token = String(p.token ?? '')
  const lat = num(p.lat), lng = num(p.lng), speed = num(p.speed)
  if (!TOKEN.test(token)) return json({ error: 'Token tidak valid' }, 401)
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) return json({ error: 'Koordinat tidak valid' }, 400)
  const k = await cari(token)
  if (!k) return json({ error: 'Kendaraan tidak ditemukan atau nonaktif' }, 404)
  const { error } = await admin().from('kd_posisi_terakhir').upsert({
    kendaraan_id: k.id, company_id: k.company_id, lat, lng, kecepatan: Number.isFinite(speed) ? speed : null,
    waktu: new Date().toISOString(), sumber: p.sumber === 'hp' ? 'hp' : 'gps',
  }, { onConflict: 'kendaraan_id' })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// GET: ?token=...&info=1 untuk info kendaraan (halaman sopir); ?token=...&lat=..&lng=..&speed=.. untuk tracker sederhana
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  if (q.get('info')) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Server belum dikonfigurasi' }, 503)
    const token = q.get('token') ?? ''
    const k = TOKEN.test(token) ? await cari(token) : null
    return k ? json({ nama: k.nama, plat: k.plat }) : json({ error: 'Link tidak valid atau kendaraan nonaktif' }, 404)
  }
  return simpan({ token: q.get('token'), lat: q.get('lat'), lng: q.get('lng'), speed: q.get('speed') ?? q.get('kecepatan') })
}

export async function POST(req: Request) {
  let b: any = {}
  try { b = await req.json() } catch { return json({ error: 'Body harus JSON' }, 400) }
  return simpan({ token: b.token, lat: b.lat ?? b.latitude, lng: b.lng ?? b.lon ?? b.longitude, speed: b.speed ?? b.kecepatan, sumber: b.sumber })
}
