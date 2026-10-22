import Denied from '@/components/Denied'
import { getKdContext, loadKd } from '@/modules/kendaraan/data'
import { supabaseServer } from '@/lib/supabase/server'
import PetaArmada from '@/modules/kendaraan/PetaArmada'
import type { Lokasi, Posisi } from '@/modules/kendaraan/types'
export default async function Page() {
  const k = await getKdContext()
  if (!k) return <Denied module="Kendaraan" />
  const { kendaraan, rekening } = await loadKd(k.companyId)
  void rekening
  const sb = supabaseServer()
  const [l, p] = await Promise.all([
    sb.from('kd_lokasi').select('*').eq('company_id', k.companyId).order('nama'),
    sb.from('kd_posisi_terakhir').select('*').eq('company_id', k.companyId),
  ])
  return <PetaArmada companyId={k.companyId} kendaraan={kendaraan} lokasiAwal={(l.data ?? []) as Lokasi[]} posisiAwal={(p.data ?? []) as Posisi[]} perm={k.perm}
    apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID'} />
}
