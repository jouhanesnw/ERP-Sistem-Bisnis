import Link from 'next/link'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { MODULES } from '@/config/modules'

export default async function DashboardPage() {
  const ctx = await getAppContext()
  const mods = MODULES.filter((m) => m.children && can(ctx.perms, m.key))
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{ctx.active.name}</h1>
        <p className="text-sm text-ink/60">Pilih modul untuk mulai bekerja.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mods.map((m) => (
          <Link key={m.key} href={m.children![0].href} className="card p-4 hover:border-brand">
            <h2 className="font-medium">{m.label}</h2>
            <p className="mt-1 text-sm text-ink/60">{m.children!.map((c) => c.label).join(', ')}</p>
          </Link>
        ))}
        {!mods.length && <p className="text-sm text-ink/60">Anda belum punya akses ke modul apa pun. Hubungi admin perusahaan.</p>}
      </div>
    </div>
  )
}
