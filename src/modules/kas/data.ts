import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { Kategori, KasPerm, Rekening } from './types'
import type { ActiveCurrency } from '@/modules/pengaturan/currencies'

export async function getKasContext(): Promise<{ companyId: string; perm: KasPerm } | null> {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'kas')) return null
  return {
    companyId: ctx.active.companyId,
    perm: { create: can(ctx.perms, 'kas', 'create'), edit: can(ctx.perms, 'kas', 'edit'), delete: can(ctx.perms, 'kas', 'delete') },
  }
}

export async function loadKasBase(companyId: string) {
  const sb = supabaseServer()
  const [r, k, c] = await Promise.all([
    sb.from('kas_saldo').select('*').eq('company_id', companyId).order('nama'),
    sb.from('kas_kategori').select('*').eq('company_id', companyId).order('nama'),
    sb.from('company_currencies').select('code, name, symbol, is_default').eq('company_id', companyId).eq('is_active', true).order('code'),
  ])
  return {
    rekening: (r.data ?? []) as Rekening[],
    kategori: (k.data ?? []) as Kategori[],
    currencies: (c.data ?? []) as ActiveCurrency[],
  }
}
