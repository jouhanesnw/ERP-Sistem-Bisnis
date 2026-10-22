'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, LayoutDashboard, Wallet, ShoppingCart, Package, BellRing, Car, Settings, Boxes, BookOpen, type LucideIcon } from 'lucide-react'
import type { ModuleDef } from '@/config/modules'

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, Wallet, ShoppingCart, Package, BellRing, Car, Settings, Boxes, BookOpen }

export default function Sidebar({ modules, companyName, open, onClose }: {
  modules: ModuleDef[]; companyName: string; open: boolean; onClose: () => void
}) {
  const path = usePathname()
  const [expanded, setExpanded] = useState<string[]>(() =>
    modules.filter((m) => m.children?.some((c) => path.startsWith(c.href))).map((m) => m.key))
  const toggle = (k: string) => setExpanded((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]))

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink text-white/80 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="truncate text-sm font-semibold text-white">{companyName}</p>
          <p className="text-xs text-white/50">ERP</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Menu utama">
          {modules.map((m) => {
            const Icon = ICONS[m.icon]
            if (!m.children) {
              const active = path === m.href
              return (
                <Link key={m.key} href={m.href!} onClick={onClose}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10 ${active ? 'bg-white/10 text-white' : ''}`}>
                  {Icon && <Icon size={18} />}{m.label}
                </Link>
              )
            }
            const isOpen = expanded.includes(m.key)
            return (
              <div key={m.key}>
                <button onClick={() => toggle(m.key)} aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10">
                  {Icon && <Icon size={18} />}
                  <span className="flex-1 text-left">{m.label}</span>
                  <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-white/15 pl-3">
                    {m.children.map((c) => (
                      <li key={c.href}>
                        <Link href={c.href} onClick={onClose}
                          className={`block rounded-md px-3 py-1.5 text-sm hover:bg-white/10 ${path === c.href ? 'bg-brand text-white' : ''}`}>
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
