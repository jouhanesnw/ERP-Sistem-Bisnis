'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, type MouseEvent, type SyntheticEvent } from 'react'
import {
  Building2, BookOpen, Wallet, ShoppingCart, Package, Boxes, Landmark,
  ClipboardList, Settings, Database, Power, ChevronRight, Loader2,
  type LucideIcon,
} from 'lucide-react'
import type { ModuleDef, NavChild } from '@/config/modules'

type SidebarItem = {
  key: string
  label: string
  icon: LucideIcon
  href?: string
  children?: NavChild[]
  disabled?: boolean
  separatorBefore?: boolean
}

export default function Sidebar({ modules, companyName, open, onClose, onLogout, pendingPath }: {
  modules: ModuleDef[]
  companyName: string
  open: boolean
  onClose: () => void
  onLogout: () => void
  pendingPath?: string | null
}) {
  const path = usePathname()
  const [flyout, setFlyout] = useState<{ key: string; top: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null)
  const byKey = useMemo(() => Object.fromEntries(modules.map((module) => [module.key, module])), [modules])

  const items = useMemo<SidebarItem[]>(() => {
    const result: SidebarItem[] = []
    if (byKey.pengaturan) {
      result.push({ key: 'perusahaan', label: 'Perusahaan', icon: Building2, href: '/pengaturan/perusahaan' })
    }
    if (byKey.akuntansi) {
      result.push({ key: 'buku-besar', label: 'Buku Besar', icon: BookOpen, href: '/akuntansi/buku-besar' })
    }
    if (byKey.kas) {
      result.push({ key: 'kas', label: 'Kas & Bank', icon: Wallet, children: byKey.kas.children ?? [] })
    }
    if (byKey.penjualan) {
      result.push({ key: 'penjualan', label: 'Penjualan', icon: ShoppingCart, children: byKey.penjualan.children ?? [] })
    }
    if (byKey.pembelian) {
      result.push({ key: 'pembelian', label: 'Pembelian', icon: Package, children: byKey.pembelian.children ?? [] })
    }
    if (byKey.produk) {
      result.push({ key: 'persediaan', label: 'Persediaan', icon: Boxes, children: byKey.produk.children ?? [] })
    }
    result.push({ key: 'aset-tetap', label: 'Aset Tetap', icon: Landmark, disabled: true })
    const reports: NavChild[] = [
      ...(byKey.kas?.children?.filter((child) => child.href === '/kas/laporan') ?? []),
      ...(byKey.akuntansi?.children?.filter((child) => child.href === '/akuntansi/laporan') ?? []),
    ]
    if (reports.length) {
      result.push({ key: 'laporan', label: 'Daftar Laporan', icon: ClipboardList, children: reports })
    }
    if (byKey.pengaturan) {
      result.push({
        key: 'pengaturan',
        label: 'Pengaturan',
        icon: Settings,
        separatorBefore: true,
        children: byKey.pengaturan.children ?? [],
      })
    }
    return result
  }, [byKey])

  const activeFlyout = flyout ? items.find((item) => item.key === flyout.key) : undefined

  useEffect(() => {
    setFlyout(null)
  }, [path])

  useEffect(() => {
    if (!flyout) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFlyout(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flyout])

  function showTooltip(event: SyntheticEvent<HTMLElement>, label: string) {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }

  function toggleFlyout(event: MouseEvent<HTMLButtonElement>, item: SidebarItem) {
    if (!item.children?.length) return
    if (flyout?.key === item.key) {
      setFlyout(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const estimatedHeight = Math.min(window.innerHeight - 16, item.children.length * 40 + 64)
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8))
    setFlyout({ key: item.key, top })
  }

  function closeMenus() {
    setFlyout(null)
    onClose()
  }

  function isItemActive(item: SidebarItem) {
    if (item.href) return path === item.href
    return item.children?.some((child) => path === child.href || path.startsWith(child.href + '/')) ?? false
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={closeMenus} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-20 flex-col border-r border-white/10 bg-gradient-to-b from-[#193f70] to-[#10294e] text-white shadow-lg transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label={`Navigasi ERP untuk ${companyName}`}
      >
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3" aria-label="Menu utama">
          {items.map((item) => {
            const Icon = item.icon
            const active = isItemActive(item)
            const pending = !!item.href && pendingPath === item.href
            const selected = flyout?.key === item.key

            return (
              <div key={item.key}>
                {item.separatorBefore && <div className="mx-2 my-3 border-t border-white/20" aria-hidden="true" />}
                {item.children?.length ? (
                  <button
                    type="button"
                    onClick={(event) => toggleFlyout(event, item)}
                    aria-label={item.label}
                    aria-expanded={selected}
                    onMouseEnter={(event) => showTooltip(event, item.label)}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(event) => showTooltip(event, item.label)}
                    onBlur={() => setTooltip(null)}
                    className={`group relative flex h-12 w-full items-center justify-center rounded-xl transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active || selected ? 'bg-white/15 text-white' : 'text-white/85'}`}
                  >
                    {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[#ef466b]" />}
                    <Icon size={23} strokeWidth={1.8} />
                    {pending && <Loader2 size={12} className="absolute right-1 top-1 animate-spin" />}
                  </button>
                ) : item.disabled ? (
                  <button
                    type="button"
                    disabled
                    aria-label={item.label + ', belum tersedia'}
                    onMouseEnter={(event) => showTooltip(event, item.label + ' · Belum tersedia')}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(event) => showTooltip(event, item.label + ' · Belum tersedia')}
                    onBlur={() => setTooltip(null)}
                    className="group relative flex h-12 w-full cursor-not-allowed items-center justify-center rounded-xl text-white/35"
                  >
                    <Icon size={23} strokeWidth={1.8} />
                  </button>
                ) : (
                  <Link
                    href={item.href!}
                    prefetch
                    onClick={closeMenus}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    onMouseEnter={(event) => showTooltip(event, item.label)}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(event) => showTooltip(event, item.label)}
                    onBlur={() => setTooltip(null)}
                    className={`group relative flex h-12 items-center justify-center rounded-xl transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? 'bg-white/15 text-white' : 'text-white/85'} ${pending ? 'bg-white/10' : ''}`}
                  >
                    {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[#ef466b]" />}
                    <Icon size={23} strokeWidth={1.8} />
                    {pending && <Loader2 size={12} className="absolute right-1 top-1 animate-spin" />}
                  </Link>
                )}
              </div>
            )
          })}
        </nav>

        <div className="space-y-1 border-t border-white/15 px-2 py-3">
          <Link
            href="/data-usaha"
            prefetch
            onClick={closeMenus}
            aria-label="Data Usaha"
            onMouseEnter={(event) => showTooltip(event, "Data Usaha")}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event, "Data Usaha")}
            onBlur={() => setTooltip(null)}
            className="group relative flex h-12 items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Database size={22} strokeWidth={1.8} />
          </Link>
          <button
            type="button"
            onClick={() => { setFlyout(null); onLogout() }}
            aria-label="Keluar"
            onMouseEnter={(event) => showTooltip(event, "Keluar")}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event, "Keluar")}
            onBlur={() => setTooltip(null)}
            className="group relative flex h-12 w-full items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-red-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Power size={23} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      {tooltip ? <div className="pointer-events-none fixed left-[5.25rem] z-[70] -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg" style={{ top: tooltip.top }}>{tooltip.label}</div> : null}

      {activeFlyout?.children?.length ? (
        <div
          className="fixed left-20 z-50 w-60 overflow-hidden rounded-r-xl rounded-bl-xl border border-line bg-white text-ink shadow-2xl"
          style={{ top: flyout?.top ?? 8, maxHeight: 'calc(100vh - 16px)' }}
          aria-label={activeFlyout.label}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <activeFlyout.icon size={18} className="text-brand" />
              <p className="text-sm font-semibold">{activeFlyout.label}</p>
            </div>
            <button type="button" onClick={() => setFlyout(null)} aria-label="Tutup submenu" className="rounded-md p-1 text-ink/60 hover:bg-canvas">
              <ChevronRight size={16} />
            </button>
          </div>
          <ul className="max-h-[calc(100vh-4rem)] space-y-0.5 overflow-y-auto p-2">
            {activeFlyout.children.map((child) => {
              const active = path === child.href || path.startsWith(child.href + '/')
              const pending = pendingPath === child.href
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    prefetch
                    onClick={closeMenus}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-canvas ${active ? 'bg-brand/10 font-medium text-brand' : 'text-ink'}`}
                  >
                    <span>{child.label}</span>
                    {pending && <Loader2 size={14} className="shrink-0 animate-spin text-brand" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </>
  )
}
