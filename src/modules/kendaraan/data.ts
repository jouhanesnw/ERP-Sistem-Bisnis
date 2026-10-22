import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { Kendaraan, KdPerm, RekeningPilihan } from './types'

export async function getKdContext(): Promise<{ companyId: string; perm: KdPerm } | null> {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'kendaraan')) return null
  return {
    companyId: ctx.active.companyId,
    perm: { create: can(ctx.perms, 'kendaraan', 'create'), edit: can(ctx.perms, 'kendaraan', 'edit'), delete: can(ctx.perms, 'kendaraan', 'delete') },
  }
}

export async function loadKd(companyId: string) {
  const sb = supabaseServer()
  const [k, r] = await Promise.all([
    sb.from('kd_kendaraan').select('*').eq('company_id', companyId).order('nama'),
    sb.rpc('kd_rekening_pilihan', { cid: companyId }),
  ])
  return { kendaraan: (k.data ?? []) as Kendaraan[], rekening: (r.data ?? []) as RekeningPilihan[] }
}
