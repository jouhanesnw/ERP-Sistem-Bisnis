import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import PaymentTermsManager from '@/modules/pengaturan/PaymentTermsManager'
import type { PaymentTerm } from '@/modules/pengaturan/paymentTerms'

export default async function SyaratPembayaranPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur syarat pembayaran perusahaan.</p></div>
  }

  const { data, error } = await supabaseServer()
    .from('company_payment_terms')
    .select('id, company_id, name, discount_days, discount_percent, due_days, description, is_default, active, created_at')
    .eq('company_id', ctx.active.companyId)
    .order('name')

  return <PaymentTermsManager companyId={ctx.active.companyId} initial={(data ?? []) as PaymentTerm[]} initialError={error?.message ?? null} />
}
