'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Loader2 } from 'lucide-react'
import Sidebar from './Sidebar'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { ModuleDef } from '@/config/modules'

type Company = { id: string; name: string; role: string }

export default function AppShell({ modules, companies, activeId, children }: {
  modules: ModuleDef[]; companies: Company[]; activeId: string; children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const active = companies.find((c) => c.id === activeId)!

  useEffect(() => {
    setPendingPath(null)
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current)
      pendingTimer.current = null
    }
  }, [pathname])

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
  }, [])

  function trackNavigation(e: React.MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const target = e.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]') as HTMLAnchorElement | null
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

    const destination = new URL(anchor.href, window.location.origin)
    if (destination.origin !== window.location.origin || destination.pathname === pathname) return

    setPendingPath(destination.pathname)
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => {
      setPendingPath(null)
      pendingTimer.current = null
    }, 12000)
  }

  async function logout() {
    await supabaseBrowser().auth.signOut()
    document.cookie = 'company_id=; path=/; max-age=0; samesite=lax'
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen lg:pl-20" onClickCapture={trackNavigation}>
      {pendingPath && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-brand/10" role="status" aria-label="Sedang membuka halaman">
          <div className="h-full w-1/3 animate-pulse rounded-r-full bg-brand" />
        </div>
      )}
      <Sidebar modules={modules} companyName={active.name} open={open} onClose={() => setOpen(false)} onLogout={logout} pendingPath={pendingPath} />
      <div className="sticky top-0 z-20 flex h-12 items-center border-b border-line bg-white px-3 lg:hidden">
        <button className="btn px-2" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={18} /></button>
      </div>
      {pendingPath && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs text-ink shadow-md" role="status" aria-live="polite">
          <Loader2 size={14} className="animate-spin text-brand" />
          Membuka halaman…
        </div>
      )}
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  )
}
