import AppShell from '@/components/layout/AppShell'
import ActivityPageTracker from '@/components/layout/ActivityPageTracker'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { MODULES } from '@/config/modules'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext()
  const visible = MODULES.filter((m) => can(ctx.perms, m.key))
  return (
    <AppShell modules={visible} companies={ctx.companies} activeId={ctx.active.companyId}>
      <ActivityPageTracker companyId={ctx.active.companyId} />
      {children}
    </AppShell>
  )
}
