'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { ModuleDef } from '@/config/modules'

type Company = { id: string; name: string; role: string }

export default function AppShell({ modules, companies, activeId, email, children }: {
  modules: ModuleDef[]; companies: Company[]; activeId: string; email: string; children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const active = companies.find((c) => c.id === activeId)!

  function switchCompany(id: string) {
    if (id === '__new') return router.push('/onboarding')
    document.cookie = `company_id=${id}; path=/; max-age=31536000`
    router.push('/dashboard'); router.refresh()
  }
  async function logout() {
    await supabaseBrowser().auth.signOut()
    router.push('/login'); router.refresh()
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar modules={modules} companyName={active.name} open={open} onClose={() => setOpen(false)} />
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <button className="btn px-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={18} /></button>
        <select className="input w-auto max-w-[14rem]" value={activeId} onChange={(e) => switchCompany(e.target.value)} aria-label="Pilih perusahaan">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new">+ Tambah perusahaan</option>
        </select>
        <span className="ml-auto hidden text-sm text-ink/60 sm:block">{email} · {active.role}</span>
        <button className="btn" onClick={logout}><LogOut size={16} />Keluar</button>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  )
}
