import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import EmployeeManager from '@/modules/pengaturan/EmployeeManager'
import type { Employee, EmployeeBranchOption, EmployeeDepartmentOption } from '@/modules/pengaturan/employees'

export default async function KaryawanPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur data karyawan perusahaan.</p></div>
  }

  const sb = supabaseServer()
  const [employeeResult, branchResult, departmentResult] = await Promise.all([
    sb.from('company_employees')
      .select('id, company_id, employee_code, employee_code_auto, employee_code_series, name_prefix, full_name, identity_number, email, mobile_phone, business_phone, home_phone, whatsapp, website, position_title, start_date, branch_id, department_id, is_salesperson, notes, address_line, city, postal_code, province, country, subject_to_pph21, npwp, employment_status, ptkp_status, tax_start_month, tax_start_year, previous_income, previous_pph, bank_name, bank_account_number, bank_account_name, active, created_at')
      .eq('company_id', ctx.active.companyId)
      .order('full_name'),
    sb.from('company_branches')
      .select('id, name, active')
      .eq('company_id', ctx.active.companyId)
      .order('name'),
    sb.from('company_departments')
      .select('id, name, active')
      .eq('company_id', ctx.active.companyId)
      .order('name'),
  ])

  const branches = (branchResult.data ?? []) as EmployeeBranchOption[]
  const departments = (departmentResult.data ?? []) as EmployeeDepartmentOption[]
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]))
  const departmentMap = new Map(departments.map((department) => [department.id, department]))
  const employees = ((employeeResult.data ?? []) as Employee[]).map((employee) => ({
    ...employee,
    branch: employee.branch_id ? branchMap.get(employee.branch_id) ?? null : null,
    department: employee.department_id ? departmentMap.get(employee.department_id) ?? null : null,
  }))
  const initialError = employeeResult.error?.message ?? branchResult.error?.message ?? departmentResult.error?.message ?? null

  return <EmployeeManager companyId={ctx.active.companyId} initial={employees} branches={branches} departments={departments} initialError={initialError} />
}
