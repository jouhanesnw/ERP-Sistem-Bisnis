import Denied from '@/components/Denied'
import { getAkContext,loadAkun } from '@/modules/akuntansi/data'
import AkunManager from '@/modules/akuntansi/AkunManager'
export default async function Page(){const k=await getAkContext();if(!k)return <Denied module="Akuntansi"/>;const akun=await loadAkun(k.companyId);return <AkunManager companyId={k.companyId} akun={akun} perm={k.perm}/>}
