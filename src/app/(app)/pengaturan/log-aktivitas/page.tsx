import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import ActivityLogManager, { type ActivityLogRow } from '@/modules/pengaturan/ActivityLogManager'

export default async function ActivityLogPage() {
  const ctx = await getAppContext()
  if (ctx.active.role === 'member') {
    return <div className="card max-w-lg p-6"><h1 className="text-lg font-semibold">Akses ditolak</h1><p className="mt-1 text-sm text-ink/60">Log aktivitas berisi riwayat perubahan data perusahaan, sehingga hanya owner dan admin yang dapat membukanya.</p></div>
  }

  const sb = supabaseServer()
  const { data, error } = await sb.from('company_activity_logs')
    .select('id, company_id, occurred_at, actor_id, actor_name, actor_email, actor_type, action, module_name, table_name, record_key, record_label, summary, changed_fields, changes, old_data, new_data, ip_address, user_agent, request_id')
    .eq('company_id', ctx.active.companyId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(100)

  return <ActivityLogManager
    companyId={ctx.active.companyId}
    initial={(data ?? []) as unknown as ActivityLogRow[]}
    initialError={error?.message ?? null}
  />
}
