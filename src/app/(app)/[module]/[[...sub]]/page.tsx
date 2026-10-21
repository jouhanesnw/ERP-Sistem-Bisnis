import { notFound } from 'next/navigation'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { MODULES } from '@/config/modules'

// Halaman sementara untuk semua submenu yang belum dibuat.
// Saat modul dibuat, tambahkan folder statis, misalnya src/app/(app)/kas/masuk/page.tsx. Folder statis otomatis menggantikan halaman ini.
export default async function ModulePage({ params }: { params: { module: string; sub?: string[] } }) {
  const mod = MODULES.find((m) => m.key === params.module)
  if (!mod) notFound()
  const ctx = await getAppContext()
  if (!can(ctx.perms, mod.key)) {
    return (
      <div className="card max-w-lg p-6">
        <h1 className="text-lg font-semibold">Akses ditolak</h1>
        <p className="mt-1 text-sm text-ink/60">Anda tidak punya akses ke modul {mod.label}. Minta admin perusahaan untuk membukanya.</p>
      </div>
    )
  }
  const href = '/' + [params.module, ...(params.sub ?? [])].join('/')
  const child = mod.children?.find((c) => c.href === href)
  return (
    <div className="card max-w-lg p-6">
      <h1 className="text-lg font-semibold">{child?.label ?? mod.label}</h1>
      <p className="mt-1 text-sm text-ink/60">Halaman ini belum dibuat. Kode modulnya nanti ditaruh di src/modules/{mod.key}/.</p>
    </div>
  )
}
