import Denied from '@/components/Denied'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import PencatatanGajiManager, { type PayrollRow } from '@/modules/akuntansi/PencatatanGajiManager'
import type { Employee } from '@/modules/pengaturan/employees'
import type { SalaryItem } from '@/modules/pengaturan/salaryItems'

export default async function PencatatanGajiPage() {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'akuntansi')) return <Denied module="Akuntansi" />

  const sb = supabaseServer()
  const db = sb as any
  const canPay = can(ctx.perms, 'akuntansi', 'create') && can(ctx.perms, 'kas', 'view') && can(ctx.perms, 'kas', 'create')
  const [rowsResult, employeeResult, branchResult, departmentResult, salaryResult, cashResult] = await Promise.all([
    db.from('ak_pencatatan_gaji_v').select('*').eq('company_id', ctx.active.companyId)
      .order('periode_tahun', { ascending: false }).order('periode_bulan', { ascending: false })
      .order('created_at', { ascending: false }).limit(500),
    db.from('company_employees')
      .select('id,company_id,employee_code,employee_code_auto,employee_code_series,name_prefix,full_name,identity_number,email,mobile_phone,business_phone,home_phone,whatsapp,website,position_title,start_date,branch_id,department_id,is_salesperson,notes,address_line,city,postal_code,province,country,subject_to_pph21,npwp,employment_status,ptkp_status,tax_start_month,tax_start_year,previous_income,previous_pph,bank_name,bank_account_number,bank_account_name,active,created_at')
      .eq('company_id', ctx.active.companyId).order('full_name'),
    db.from('company_branches').select('id,name,active').eq('company_id', ctx.active.companyId).order('name'),
    db.from('company_departments').select('id,name,active').eq('company_id', ctx.active.companyId).order('name'),
    db.from('company_salary_items')
      .select('id,company_id,name,item_type,pay_type,percentage_of_salary,maximum_salary_enabled,account_id,active,created_at')
      .eq('company_id', ctx.active.companyId).order('name'),
    canPay
      ? db.from('kas_rekening').select('id,nama,tipe,nomor,aktif,currency_code')
          .eq('company_id', ctx.active.companyId).eq('aktif', true).order('nama')
      : Promise.resolve({ data: [], error: null }),
  ])

  const branches = (branchResult.data ?? []) as { id: string; name: string; active: boolean }[]
  const departments = (departmentResult.data ?? []) as { id: string; name: string; active: boolean }[]
  const branchMap = new Map(branches.map((item) => [item.id, item]))
  const departmentMap = new Map(departments.map((item) => [item.id, item]))
  const employees = ((employeeResult.data ?? []) as Employee[]).map((employee) => ({
    ...employee,
    branch: employee.branch_id ? branchMap.get(employee.branch_id) ?? null : null,
    department: employee.department_id ? departmentMap.get(employee.department_id) ?? null : null,
  }))
  const initialError = rowsResult.error?.message
    ?? employeeResult.error?.message
    ?? branchResult.error?.message
    ?? departmentResult.error?.message
    ?? salaryResult.error?.message
    ?? (canPay ? cashResult.error?.message : null)
    ?? null

  return <PencatatanGajiManager
    companyId={ctx.active.companyId}
    initialRows={(rowsResult.data ?? []) as PayrollRow[]}
    employees={employees}
    salaryItems={(salaryResult.data ?? []) as SalaryItem[]}
    branches={branches}
    cashAccounts={(cashResult.data ?? []) as any[]}
    perm={{
      create: can(ctx.perms, 'akuntansi', 'create'),
      edit: can(ctx.perms, 'akuntansi', 'edit'),
      delete: can(ctx.perms, 'akuntansi', 'delete'),
    }}
    canPay={canPay}
    initialError={initialError}
  />
}
