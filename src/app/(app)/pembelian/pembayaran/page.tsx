import Denied from '@/components/Denied'
import { getPbContext, loadPbBase } from '@/modules/pembelian/data'
import PembayaranManager from '@/modules/pembelian/PembayaranManager'
export default async function Page() {
  const k = await getPbContext()
  if (!k) return <Denied module="Pembelian" />
  const { pemasok, rekening } = await loadPbBase(k.companyId)
  return <PembayaranManager companyId={k.companyId} pemasok={pemasok} rekening={rekening} perm={k.perm} />
}
