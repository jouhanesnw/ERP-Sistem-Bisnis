import Denied from '@/components/Denied'
import { getPdContext } from '@/modules/produk/data'
import GudangManager from '@/modules/produk/GudangManager'
import { supabaseServer } from '@/lib/supabase/server'
import type { Gudang } from '@/modules/produk/GudangManager'
export default async function Page(){
 const k=await getPdContext()
 if(!k)return <Denied module="Produk & Stok"/>
 const {data,error}=await supabaseServer().from('pd_gudang').select('*').eq('company_id',k.companyId).order('is_default',{ascending:false}).order('nama')
 if(error)throw new Error(error.message)
 return <GudangManager companyId={k.companyId} gudang={(data??[]) as Gudang[]} perm={k.perm}/>
}
