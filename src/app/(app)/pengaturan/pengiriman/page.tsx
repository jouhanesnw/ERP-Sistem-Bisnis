import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import ShippingManager, { type ShippingMethod } from '@/modules/pengaturan/ShippingManager'

export default async function PengirimanPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur data pengiriman perusahaan.</p></div>
  }

  const { data, error } = await supabaseServer()
    .from('company_shipping_methods')
    .select('id, company_id, name, pic, phone, address, city, province, postal_code, country, active, created_at')
    .eq('company_id', ctx.active.companyId)
    .order('name')

  return <ShippingManager companyId={ctx.active.companyId} initial={(data ?? []) as ShippingMethod[]} initialError={error?.message ?? null} />
}
