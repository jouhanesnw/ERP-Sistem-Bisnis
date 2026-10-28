import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import DepartmentManager from '@/modules/pengaturan/DepartmentManager'

export default async function DepartemenPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur departemen perusahaan.</p></div>
  }

  const sb = supabaseServer()
  const [departmentResult, memberResult, assignmentResult, accountResult] = await Promise.all([
    sb.from('company_departments')
      .select('id, company_id, name, description, parent_department_id, opening_balance, opening_balance_date, coa_id, active, created_at')
      .eq('company_id', ctx.active.companyId)
      .order('name'),
    sb.from('memberships')
      .select('id, user_id, role, profiles(full_name, email)')
      .eq('company_id', ctx.active.companyId)
      .order('created_at'),
    sb.from('department_members')
      .select('department_id, membership_id')
      .eq('company_id', ctx.active.companyId),
    sb.from('ak_akun')
      .select('id, kode, nama, tipe, aktif')
      .eq('company_id', ctx.active.companyId)
      .eq('aktif', true)
      .order('kode'),
  ])

  const memberships = ((memberResult.data ?? []) as any[]).map((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
    return {
      id: member.id as string,
      user_id: member.user_id as string,
      role: member.role as string,
      full_name: (profile?.full_name ?? '') as string,
      email: (profile?.email ?? '') as string,
    }
  })
  const assignments = (assignmentResult.data ?? []) as { department_id: string; membership_id: string }[]
  const accounts = (accountResult.data ?? []) as { id: string; kode: string; nama: string; tipe: string; aktif: boolean }[]
  const rawDepartments = (departmentResult.data ?? []) as any[]
  const departments = rawDepartments.map((department) => ({
    ...department,
    parentName: rawDepartments.find((item) => item.id === department.parent_department_id)?.name ?? null,
    coa: accounts.find((account) => account.id === department.coa_id) ?? null,
    membershipIds: assignments.filter((assignment) => assignment.department_id === department.id).map((assignment) => assignment.membership_id),
  }))
  const error = departmentResult.error?.message ?? memberResult.error?.message ?? assignmentResult.error?.message ?? accountResult.error?.message ?? null

  return <DepartmentManager companyId={ctx.active.companyId} initial={departments} members={memberships} accounts={accounts} initialError={error} />
}
