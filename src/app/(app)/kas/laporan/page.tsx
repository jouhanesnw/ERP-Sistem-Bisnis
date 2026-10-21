import Denied from '@/components/Denied'
import { getKasContext, loadKasBase } from '@/modules/kas/data'
import LaporanKas from '@/modules/kas/LaporanKas'
export default async function Page() {
  const k = await getKasContext()
  if (!k) return <Denied module="Kas" />
  const { rekening, kategori } = await loadKasBase(k.companyId)
  return <LaporanKas companyId={k.companyId} rekening={rekening} kategori={kategori} />
}
