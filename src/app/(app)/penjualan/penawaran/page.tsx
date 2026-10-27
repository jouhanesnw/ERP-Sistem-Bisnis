import Denied from '@/components/Denied'
import { getPjContext, loadPelanggan, loadPjDocuments } from '@/modules/penjualan/data'
import DokumenManager from '@/modules/penjualan/DokumenManager'
export default async function Page() {
  const k = await getPjContext()
  if (!k) return <Denied module="Penjualan" />
  const [pelanggan, initialDocs] = await Promise.all([
    loadPelanggan(k.companyId),
    loadPjDocuments(k.companyId, 'penawaran'),
  ])
  return <DokumenManager companyId={k.companyId} jenis="penawaran" pelanggan={pelanggan} initialRows={initialDocs.rows} initialError={initialDocs.error} perm={k.perm} />
}
