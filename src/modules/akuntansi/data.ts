import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { AkPerm,Akun } from './types'

export async function getAkContext():Promise<{companyId:string;perm:AkPerm}|null>{
 const ctx=await getAppContext()
 if(!can(ctx.perms,'akuntansi'))return null
 return {companyId:ctx.active.companyId,perm:{create:can(ctx.perms,'akuntansi','create'),edit:can(ctx.perms,'akuntansi','edit'),delete:can(ctx.perms,'akuntansi','delete')}}
}
export async function loadAkun(companyId:string){
 const {data,error}=await supabaseServer().from('ak_akun').select('*').eq('company_id',companyId).order('kode')
 if(error)throw new Error(error.message)
 return (data??[]) as Akun[]
}
