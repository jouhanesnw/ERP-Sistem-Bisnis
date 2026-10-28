import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import TransactionFavoritesManager from '@/modules/pengaturan/TransactionFavoritesManager'
import type { TransactionFavorite } from '@/modules/pengaturan/TransactionFavoriteControls'

export default async function TransactionFavoritesPage() {
  const ctx = await getAppContext()
  const sb = supabaseServer()
  const { data, error } = await sb.from('company_transaction_favorites')
    .select('id, company_id, favorite_type, name, visibility, payload, created_by, created_at')
    .eq('company_id', ctx.active.companyId)
    .order('name')

  const admin = ctx.active.role !== 'member'
  const canSales = admin || can(ctx.perms, 'penjualan')
  const canPurchase = admin || can(ctx.perms, 'pembelian')
  const canCash = admin || can(ctx.perms, 'kas')
  const canJournal = admin || can(ctx.perms, 'akuntansi')
  const visibleRows = ((data ?? []) as TransactionFavorite[]).filter((row) => {
    if (row.favorite_type.startsWith('sales_')) return canSales
    if (row.favorite_type.startsWith('purchase_')) return canPurchase
    if (row.favorite_type.startsWith('kas_')) return canCash
    return canJournal
  })

  return <TransactionFavoritesManager companyId={ctx.active.companyId} initial={visibleRows} initialError={error?.message ?? null} />
}
