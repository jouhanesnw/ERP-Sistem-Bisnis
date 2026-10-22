import Denied from '@/components/Denied'
import { getAkContext,loadAkun } from '@/modules/akuntansi/data'
import JurnalManager from '@/modules/akuntansi/JurnalManager'
import { supabaseServer } from '@/lib/supabase/server'
import type { Jurnal } from '@/modules/akuntansi/types'
export default async function Page(){const k=await getAkContext();if(!k)return <Denied module="Akuntansi"/>;const [akun,j]=await Promise.all([loadAkun(k.companyId),supabaseServer().from('ak_jurnal_v').select('*').eq('company_id',k.companyId).order('tanggal',{ascending:false}).order('nomor',{ascending:false}).limit(200)]);if(j.error)throw new Error(j.error.message);return <JurnalManager companyId={k.companyId} akun={akun} jurnal={(j.data??[]) as Jurnal[]} perm={k.perm}/>}
