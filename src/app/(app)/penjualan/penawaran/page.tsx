import Denied from '@/components/Denied'
import { getPjContext, loadPjBase } from '@/modules/penjualan/data'
import DokumenManager from '@/modules/penjualan/DokumenManager'
export default async function Page() {
  const k = await getPjContext()
  if (!k) return <Denied module="Penjualan" />
  const { pelanggan, rekening } = await loadPjBase(k.companyId)
  return <DokumenManager companyId={k.companyId} jenis="penawaran" pelanggan={pelanggan} rekening={rekening} perm={k.perm} />
}
