import Denied from '@/components/Denied'
import { getKasContext, loadKasBase } from '@/modules/kas/data'
import TransaksiManager from '@/modules/kas/TransaksiManager'
export default async function Page() {
  const k = await getKasContext()
  if (!k) return <Denied module="Kas" />
  const { rekening, kategori } = await loadKasBase(k.companyId)
  return <TransaksiManager companyId={k.companyId} jenis="transfer" rekening={rekening} kategori={kategori} perm={k.perm} />
}
