import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import TaxManager from '@/modules/pengaturan/TaxManager'

export default async function PajakPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur pajak perusahaan.</p></div>
  }

  const sb = supabaseServer()
  const [taxResult, accountResult] = await Promise.all([
    sb.from('company_taxes')
      .select('id, company_id, name, tax_type, rate, description, sales_account_id, purchase_account_id, active, created_at')
      .eq('company_id', ctx.active.companyId)
      .order('name'),
    sb.from('ak_akun')
      .select('id, kode, nama, tipe, aktif')
      .eq('company_id', ctx.active.companyId)
      .order('kode'),
  ])

  const accounts = (accountResult.data ?? []) as { id: string; kode: string; nama: string; tipe: string; aktif: boolean }[]
  const error = taxResult.error?.message ?? accountResult.error?.message ?? null

  return <TaxManager companyId={ctx.active.companyId} initial={(taxResult.data ?? []) as any[]} accounts={accounts} initialError={error} />
}
