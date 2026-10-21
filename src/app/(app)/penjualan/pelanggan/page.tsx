import Denied from '@/components/Denied'
import { getPjContext, loadPjBase } from '@/modules/penjualan/data'
import PelangganManager from '@/modules/penjualan/PelangganManager'
export default async function Page() {
  const k = await getPjContext()
  if (!k) return <Denied module="Penjualan" />
  const { pelanggan, rekening } = await loadPjBase(k.companyId)
  return <PelangganManager companyId={k.companyId} pelanggan={pelanggan} perm={k.perm} />
}
