import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { Pemasok, PbPerm, RekeningPilihan } from './types'
import type { ActiveCurrency } from '@/modules/pengaturan/currencies'

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
  const [p, r, c] = await Promise.all([
    sb.from('pb_pemasok').select('*').eq('company_id', companyId).order('nama'),
    sb.rpc('pb_rekening_pilihan', { cid: companyId }),
    sb.from('company_currencies').select('code, name, symbol, is_default').eq('company_id', companyId).eq('is_active', true).order('code'),
  ])
  return {
    pemasok: (p.data ?? []) as Pemasok[],
    rekening: (r.data ?? []) as RekeningPilihan[],
    currencies: (c.data ?? []) as ActiveCurrency[],
  }
}
