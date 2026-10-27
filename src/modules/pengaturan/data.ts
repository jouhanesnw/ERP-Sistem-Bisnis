import { supabaseServer } from '@/lib/supabase/server'
import type { CurrencyOption } from './currencies'

export type ActiveCurrency = CurrencyOption & { is_default: boolean }

export async function loadActiveCurrencies(companyId: string): Promise<ActiveCurrency[]> {
  const { data, error } = await supabaseServer()
    .from('company_currencies')
    .select('code, name, symbol, is_default')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('code')
  if (error) return []
  return (data ?? []) as ActiveCurrency[]
}
