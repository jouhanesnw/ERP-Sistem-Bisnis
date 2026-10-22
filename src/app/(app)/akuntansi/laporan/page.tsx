import Denied from '@/components/Denied'
import { getAkContext } from '@/modules/akuntansi/data'
import LaporanManager from '@/modules/akuntansi/LaporanManager'
export default async function Page(){const k=await getAkContext();if(!k)return <Denied module="Akuntansi"/>;return <LaporanManager companyId={k.companyId}/>}
