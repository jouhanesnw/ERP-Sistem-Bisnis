import Denied from '@/components/Denied'
import { getPjContext, loadPelanggan } from '@/modules/penjualan/data'
import DokumenManager from '@/modules/penjualan/DokumenManager'
export default async function Page() {
  const k = await getPjContext()
  if (!k) return <Denied module="Penjualan" />
  const pelanggan = await loadPelanggan(k.companyId)
  return <DokumenManager companyId={k.companyId} jenis="penawaran" pelanggan={pelanggan} perm={k.perm} />
}
