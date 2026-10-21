import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { Pemasok, PbPerm, RekeningPilihan } from './types'

export async function getPbContext(): Promise<{ companyId: string; perm: PbPerm } | null> {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'pembelian')) return null
  return {
    companyId: ctx.active.companyId,
    perm: { create: can(ctx.perms, 'pembelian', 'create'), edit: can(ctx.perms, 'pembelian', 'edit'), delete: can(ctx.perms, 'pembelian', 'delete') },
  }
}

export async function loadPbBase(companyId: string) {
  const sb = supabaseServer()
  const [p, r] = await Promise.all([
    sb.from('pb_pemasok').select('*').eq('company_id', companyId).order('nama'),
    sb.rpc('pb_rekening_pilihan', { cid: companyId }),
  ])
  return { pemasok: (p.data ?? []) as Pemasok[], rekening: (r.data ?? []) as RekeningPilihan[] }
}
