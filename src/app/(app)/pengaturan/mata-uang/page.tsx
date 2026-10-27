import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import CurrencyManager from '@/modules/pengaturan/CurrencyManager'
import type { CompanyCurrency } from '@/modules/pengaturan/currencies'

export default async function MataUangPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur mata uang perusahaan.</p></div>
  }

  const { data, error } = await supabaseServer()
    .from('company_currencies')
    .select('id, company_id, code, name, symbol, is_default, is_active')
    .eq('company_id', ctx.active.companyId)
    .order('code')

  return <CurrencyManager companyId={ctx.active.companyId} initial={(data ?? []) as CompanyCurrency[]} initialError={error?.message ?? null} />
}
