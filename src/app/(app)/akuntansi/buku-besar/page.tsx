import Denied from '@/components/Denied'
import { getAkContext,loadAkun } from '@/modules/akuntansi/data'
import BukuBesarManager from '@/modules/akuntansi/BukuBesarManager'
export default async function Page(){const k=await getAkContext();if(!k)return <Denied module="Akuntansi"/>;const akun=await loadAkun(k.companyId);return <BukuBesarManager companyId={k.companyId} akun={akun}/>}
