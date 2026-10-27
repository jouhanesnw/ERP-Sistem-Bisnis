import Denied from '@/components/Denied'
import { getKasContext, loadKasBase } from '@/modules/kas/data'
import RekeningManager from '@/modules/kas/RekeningManager'
export default async function Page() {
  const k = await getKasContext()
  if (!k) return <Denied module="Kas" />
  const { rekening, currencies } = await loadKasBase(k.companyId)
  return <RekeningManager companyId={k.companyId} rekening={rekening} perm={k.perm} currencies={currencies} />
}
