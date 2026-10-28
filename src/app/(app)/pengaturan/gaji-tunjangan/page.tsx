import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import SalaryItemsManager from '@/modules/pengaturan/SalaryItemsManager'
import type { ExpenseAccountOption, SalaryItem } from '@/modules/pengaturan/salaryItems'

export default async function GajiTunjanganPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur gaji/tunjangan perusahaan.</p></div>
  }

  const sb = supabaseServer()
  const [itemsResult, accountsResult] = await Promise.all([
    sb.from('company_salary_items')
      .select('id, company_id, name, item_type, pay_type, percentage_of_salary, maximum_salary_enabled, account_id, active, created_at')
      .eq('company_id', ctx.active.companyId)
      .order('name'),
    sb.from('ak_akun')
      .select('id, company_id, kode, nama, tipe, aktif')
      .eq('company_id', ctx.active.companyId)
      .eq('tipe', 'beban')
      .eq('aktif', true)
      .order('kode'),
  ])

  const accounts = (accountsResult.data ?? []) as ExpenseAccountOption[]
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const items = ((itemsResult.data ?? []) as SalaryItem[]).map((item) => ({
    ...item,
    account: item.account_id ? accountMap.get(item.account_id) ?? null : null,
  }))

  return (
    <SalaryItemsManager
      companyId={ctx.active.companyId}
      initial={items}
      accounts={accounts}
      initialError={itemsResult.error?.message ?? accountsResult.error?.message ?? null}
    />
  )
}
