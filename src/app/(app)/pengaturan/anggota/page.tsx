import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import { ASSIGNABLE } from '@/config/modules'
import MembersManager from '@/modules/pengaturan/MembersManager'

export default async function MembersPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Hanya owner dan admin yang bisa mengatur anggota.</p></div>
  }
  const { data } = await supabaseServer()
    .from('memberships')
    .select('id, role, user_id, profiles(full_name, email), module_access(module, can_view, can_create, can_edit, can_delete)')
    .eq('company_id', ctx.active.companyId)
    .order('created_at')
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Anggota & Akses</h1>
      <MembersManager companyId={ctx.active.companyId} initial={(data ?? []) as any} modules={ASSIGNABLE} />
    </div>
  )
}
