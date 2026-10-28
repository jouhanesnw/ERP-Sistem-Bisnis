import { supabaseServer } from '@/lib/supabase/server'
import type { CurrencyOption } from './currencies'
import type { ShippingMethod } from './shipping'

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

export async function loadShippingMethods(companyId: string): Promise<ShippingMethod[]> {
  const { data, error } = await supabaseServer()
    .from('company_shipping_methods')
    .select('id, company_id, name, pic, phone, address, city, province, postal_code, country, active, created_at')
    .eq('company_id', companyId)
    .order('name')
  if (error) return []
  return (data ?? []) as ShippingMethod[]
}
