import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import BranchManager from '@/modules/pengaturan/BranchManager'

export default async function CabangPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur cabang perusahaan.</p></div>
  }

  const sb = supabaseServer()
  const [branchResult, memberResult, assignmentResult] = await Promise.all([
    sb.from('company_branches')
      .select('id, company_id, name, phone, address, city, postal_code, province, country, active, created_at')
      .eq('company_id', ctx.active.companyId)
      .order('name'),
    sb.from('memberships')
      .select('id, user_id, role, profiles(full_name, email)')
      .eq('company_id', ctx.active.companyId)
      .order('created_at'),
    sb.from('branch_members')
      .select('branch_id, membership_id')
      .eq('company_id', ctx.active.companyId),
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
  const assignments = (assignmentResult.data ?? []) as { branch_id: string; membership_id: string }[]
  const branches = ((branchResult.data ?? []) as any[]).map((branch) => ({
    ...branch,
    membershipIds: assignments.filter((assignment) => assignment.branch_id === branch.id).map((assignment) => assignment.membership_id),
  }))
  const error = branchResult.error?.message ?? memberResult.error?.message ?? assignmentResult.error?.message ?? null

  return <BranchManager companyId={ctx.active.companyId} initial={branches} members={memberships} initialError={error} />
}
