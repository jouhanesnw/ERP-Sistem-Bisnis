import { getAppContext } from '@/lib/context'
import { supabaseServer } from '@/lib/supabase/server'
import CalendarManager from '@/modules/pengaturan/CalendarManager'

export default async function KalenderPage() {
  const ctx = await getAppContext()
  const sb = supabaseServer()
  const [calendarResult, eventResult, memberResult, branchResult] = await Promise.all([
    sb.from('company_calendars')
      .select('id, company_id, calendar_type, name, description, access_all, access_user_ids, event_edit_all, event_edit_user_ids, admin_all, admin_user_ids, created_by, created_at')
      .eq('company_id', ctx.active.companyId).order('name'),
    sb.from('company_calendar_events')
      .select('id, company_id, calendar_id, title, description, start_at, due_at, reminder_at, repeat_rule, attachment_links, reminder_channels, reminder_recipients, reminder_status, created_by')
      .eq('company_id', ctx.active.companyId).order('start_at'),
    sb.from('memberships')
      .select('user_id, role, profiles(full_name)')
      .eq('company_id', ctx.active.companyId),
    sb.from('company_branches')
      .select('id, name')
      .eq('company_id', ctx.active.companyId).order('name'),
  ])

  const members = ((memberResult.data ?? []) as any[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      userId: String(row.user_id),
      name: String(profile?.full_name?.trim() || 'Pengguna'),
      role: String(row.role ?? 'member'),
    }
  })
  const initialError = calendarResult.error?.message
    ?? eventResult.error?.message
    ?? memberResult.error?.message
    ?? branchResult.error?.message
    ?? null

  return (
    <CalendarManager
      companyId={ctx.active.companyId}
      currentUserId={ctx.user.id}
      initialCalendars={(calendarResult.data ?? []) as any}
      initialEvents={(eventResult.data ?? []) as any}
      members={members}
      branches={(branchResult.data ?? []) as { id: string; name: string }[]}
      initialError={initialError}
    />
  )
}
