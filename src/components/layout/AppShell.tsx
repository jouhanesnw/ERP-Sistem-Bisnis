'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut, UserRound, ChevronDown, Settings2, Building2, LoaderCircle } from 'lucide-react'
import Sidebar from './Sidebar'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { ModuleDef } from '@/config/modules'

type Company = { id: string; name: string; role: string }

export default function AppShell({ modules, companies, activeId, email, fullName, children }: {
  modules: ModuleDef[]; companies: Company[]; activeId: string; email: string; fullName: string; children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
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

  function switchCompany(id: string) {
    if (id === '__new') {
      router.push('/onboarding?new=1')
      return
    }
    document.cookie = `company_id=${id}; path=/; max-age=31536000; samesite=lax`
    setPendingPath('/dashboard')
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => setPendingPath(null), 12000)
    router.push('/dashboard')
    router.refresh()
  }

  async function logout() {
    setAccountOpen(false)
    await supabaseBrowser().auth.signOut()
    document.cookie = 'company_id=; path=/; max-age=0; samesite=lax'
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen lg:pl-64" onClickCapture={trackNavigation}>
      {pendingPath && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-brand/10" role="status" aria-label="Sedang membuka halaman">
          <div className="h-full w-1/3 animate-pulse rounded-r-full bg-brand" />
        </div>
      )}
      <Sidebar modules={modules} companyName={active.name} open={open} onClose={() => setOpen(false)} pendingPath={pendingPath} />
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <button className="btn px-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={18} /></button>
        <select className="input w-auto max-w-[14rem] sm:max-w-[20rem]" value={activeId} onChange={(e) => switchCompany(e.target.value)} aria-label="Pilih perusahaan">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new">+ Tambah data usaha</option>
        </select>
        <div className="relative ml-auto">
          <button
            type="button"
            className="flex max-w-[15rem] items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left hover:bg-canvas"
            onClick={() => setAccountOpen((value) => !value)}
            aria-expanded={accountOpen}
            aria-label="Menu akun"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><UserRound size={17} /></span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-medium text-ink">{fullName}</span>
              <span className="block truncate text-xs text-ink/60">{email}</span>
            </span>
            <ChevronDown size={16} className={accountOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {accountOpen && <>
            <button className="fixed inset-0 z-20 cursor-default" aria-label="Tutup menu akun" onClick={() => setAccountOpen(false)} />
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-xl">
              <div className="border-b border-line px-3 py-2">
                <p className="truncate text-sm font-semibold text-ink">{fullName}</p>
                <p className="truncate text-xs text-ink/60">{email}</p>
                <p className="mt-1 text-xs text-ink/50">Peran di data usaha ini: {active.role}</p>
              </div>
              <Link prefetch href="/data-usaha" onClick={() => setAccountOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas">
                <Building2 size={16} /> Data Usaha Saya
              </Link>
              <Link prefetch href="/akun" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas">
                <Settings2 size={16} /> Akun & Profil
              </Link>
              <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                <LogOut size={16} /> Keluar
              </button>
            </div>
          </>}
        </div>
      </header>
      {pendingPath && (
        <div className="fixed right-4 top-[4.25rem] z-50 flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs text-ink shadow-md" role="status" aria-live="polite">
          <LoaderCircle size={14} className="animate-spin text-brand" />
          Membuka halaman…
        </div>
      )}
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  )
}
