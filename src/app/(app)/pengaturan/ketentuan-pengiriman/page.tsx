import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import ShippingTermsManager, { type ShippingTerm } from '@/modules/pengaturan/ShippingTermsManager'

export default async function KetentuanPengirimanPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur ketentuan pengiriman perusahaan.</p></div>
  }

  const { data, error } = await supabaseServer()
    .from('company_shipping_terms')
    .select('id, company_id, name, description, active, created_at')
    .eq('company_id', ctx.active.companyId)
    .order('name')

  return <ShippingTermsManager companyId={ctx.active.companyId} initial={(data ?? []) as ShippingTerm[]} initialError={error?.message ?? null} />
}
