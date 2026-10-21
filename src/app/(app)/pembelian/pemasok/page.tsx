import Denied from '@/components/Denied'
import { getPbContext, loadPbBase } from '@/modules/pembelian/data'
import PemasokManager from '@/modules/pembelian/PemasokManager'
export default async function Page() {
  const k = await getPbContext()
  if (!k) return <Denied module="Pembelian" />
  const { pemasok } = await loadPbBase(k.companyId)
  return <PemasokManager companyId={k.companyId} pemasok={pemasok} perm={k.perm} />
}
