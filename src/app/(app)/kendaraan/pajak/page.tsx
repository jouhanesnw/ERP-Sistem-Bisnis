import Denied from '@/components/Denied'
import { getKdContext, loadKd } from '@/modules/kendaraan/data'
import PajakManager from '@/modules/kendaraan/PajakManager'
export default async function Page() {
  const k = await getKdContext()
  if (!k) return <Denied module="Kendaraan" />
  const { kendaraan, rekening } = await loadKd(k.companyId)
  void rekening
  return <PajakManager companyId={k.companyId} kendaraan={kendaraan} perm={k.perm} />
}
