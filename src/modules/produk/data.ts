import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { PdPerm, Produk } from './types'
export async function getPdContext():Promise<{companyId:string;perm:PdPerm}|null>{
 const ctx=await getAppContext()
 if(!can(ctx.perms,'produk')) return null
 return {companyId:ctx.active.companyId,perm:{create:can(ctx.perms,'produk','create'),edit:can(ctx.perms,'produk','edit'),delete:can(ctx.perms,'produk','delete')}}
}
export async function loadProduk(companyId:string){
 const {data,error}=await supabaseServer().from('pd_produk_v').select('*').eq('company_id',companyId).order('nama')
 if(error) throw new Error(error.message)
 return (data??[]) as Produk[]
}
