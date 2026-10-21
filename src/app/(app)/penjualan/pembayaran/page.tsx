import Denied from '@/components/Denied'
import { getPjContext, loadPjBase } from '@/modules/penjualan/data'
import PembayaranManager from '@/modules/penjualan/PembayaranManager'
export default async function Page() {
  const k = await getPjContext()
  if (!k) return <Denied module="Penjualan" />
  const { pelanggan, rekening } = await loadPjBase(k.companyId)
  return <PembayaranManager companyId={k.companyId} pelanggan={pelanggan} rekening={rekening} perm={k.perm} />
}
