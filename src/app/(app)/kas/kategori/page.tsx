import Denied from '@/components/Denied'
import { getKasContext, loadKasBase } from '@/modules/kas/data'
import KategoriManager from '@/modules/kas/KategoriManager'
export default async function Page() {
  const k = await getKasContext()
  if (!k) return <Denied module="Kas" />
  const { rekening, kategori } = await loadKasBase(k.companyId)
  return <KategoriManager companyId={k.companyId} kategori={kategori} perm={k.perm} />
}
