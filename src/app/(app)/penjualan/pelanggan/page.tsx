import Denied from '@/components/Denied'
import { getPjContext, loadPelanggan } from '@/modules/penjualan/data'
import PelangganManager from '@/modules/penjualan/PelangganManager'
export default async function Page() {
  const k = await getPjContext()
  if (!k) return <Denied module="Penjualan" />
  const pelanggan = await loadPelanggan(k.companyId)
  return <PelangganManager companyId={k.companyId} pelanggan={pelanggan} perm={k.perm} />
}
