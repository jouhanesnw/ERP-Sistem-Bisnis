import Denied from '@/components/Denied'
import { getKdContext, loadKd } from '@/modules/kendaraan/data'
import BiayaManager from '@/modules/kendaraan/BiayaManager'
export default async function Page() {
  const k = await getKdContext()
  if (!k) return <Denied module="Kendaraan" />
  const { kendaraan, rekening } = await loadKd(k.companyId)
  return <BiayaManager companyId={k.companyId} tipe="servis" kendaraan={kendaraan} rekening={rekening} perm={k.perm} />
}
