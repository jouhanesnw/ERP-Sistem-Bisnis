import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { Kategori, KasPerm, Rekening } from './types'

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
  const [r, k] = await Promise.all([
    sb.from('kas_saldo').select('*').eq('company_id', companyId).order('nama'),
    sb.from('kas_kategori').select('*').eq('company_id', companyId).order('nama'),
  ])
  return { rekening: (r.data ?? []) as Rekening[], kategori: (k.data ?? []) as Kategori[] }
}
