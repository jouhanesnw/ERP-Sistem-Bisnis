import Denied from '@/components/Denied'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import PencatatanBebanManager, { type ExpenseRow } from '@/modules/akuntansi/PencatatanBebanManager'

export default async function PencatatanBebanPage() {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'akuntansi')) return <Denied module="Akuntansi" />

  const sb = supabaseServer()
  const db = sb as any
  const canPay = can(ctx.perms, 'akuntansi', 'create') && can(ctx.perms, 'kas', 'create')
  const [rowsResult, accountsResult, currenciesResult, branchesResult, cashResult] = await Promise.all([
    db.from('ak_pencatatan_beban_v').select('*').eq('company_id', ctx.active.companyId)
      .order('tanggal', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    db.from('ak_akun')
      .select('id, company_id, kode, nama, tipe, normal, induk_id, sistem, aktif, kode_tipe, currency_code, catatan')
      .eq('company_id', ctx.active.companyId).eq('aktif', true).order('kode'),
    db.from('company_currencies').select('code, name, symbol, is_default')
      .eq('company_id', ctx.active.companyId).eq('is_active', true).order('code'),
    db.from('company_branches').select('id, name, active')
      .eq('company_id', ctx.active.companyId).eq('active', true).order('name'),
    canPay
      ? db.from('kas_rekening').select('id, nama, tipe, nomor, aktif, currency_code')
          .eq('company_id', ctx.active.companyId).eq('aktif', true).order('nama')
      : Promise.resolve({ data: [], error: null }),
  ])

  const permissionError = rowsResult.error?.message || accountsResult.error?.message || currenciesResult.error?.message || branchesResult.error?.message || (canPay ? cashResult.error?.message : null) || null
  const perm = {
    create: can(ctx.perms, 'akuntansi', 'create'),
    edit: can(ctx.perms, 'akuntansi', 'edit'),
    delete: can(ctx.perms, 'akuntansi', 'delete'),
  }

  return <PencatatanBebanManager
    companyId={ctx.active.companyId}
    initialRows={(rowsResult.data ?? []) as ExpenseRow[]}
    accounts={(accountsResult.data ?? []) as any[]}
    currencies={(currenciesResult.data ?? []) as any[]}
    branches={(branchesResult.data ?? []) as any[]}
    cashAccounts={(cashResult.data ?? []) as any[]}
    perm={perm}
    canPay={canPay}
    initialError={permissionError}
  />
}
