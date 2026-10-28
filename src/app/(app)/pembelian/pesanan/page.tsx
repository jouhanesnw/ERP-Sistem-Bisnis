import Denied from '@/components/Denied'
import { getPbContext, loadPbBase } from '@/modules/pembelian/data'
import DokumenManager from '@/modules/pembelian/DokumenManager'
export default async function Page() {
  const k = await getPbContext()
  if (!k) return <Denied module="Pembelian" />
  const { pemasok, rekening, currencies, shippingMethods } = await loadPbBase(k.companyId)
  return <DokumenManager companyId={k.companyId} jenis="pesanan" pemasok={pemasok} rekening={rekening} perm={k.perm} currencies={currencies} shippingMethods={shippingMethods} />
}
