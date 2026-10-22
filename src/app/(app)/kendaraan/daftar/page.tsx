import Denied from '@/components/Denied'
import { getKdContext, loadKd } from '@/modules/kendaraan/data'
import { supabaseServer } from '@/lib/supabase/server'
import DaftarKendaraan from '@/modules/kendaraan/DaftarKendaraan'
import type { Pajak, ServisRow } from '@/modules/kendaraan/types'
export default async function Page() {
  const k = await getKdContext()
  if (!k) return <Denied module="Kendaraan" />
  const { kendaraan, rekening } = await loadKd(k.companyId)
  void rekening
  const sb = supabaseServer()
  const [s, p] = await Promise.all([
    sb.from('kd_servis').select('kendaraan_id, tanggal, berikutnya_tanggal, berikutnya_km').eq('company_id', k.companyId).order('tanggal', { ascending: false }).limit(1000),
    sb.from('kd_pajak').select('id, kendaraan_id, jenis, berlaku_sampai, biaya, catatan').eq('company_id', k.companyId).limit(1000),
  ])
  return <DaftarKendaraan companyId={k.companyId} kendaraan={kendaraan} servis={(s.data ?? []) as ServisRow[]} pajak={(p.data ?? []) as Pajak[]} perm={k.perm} />
}
