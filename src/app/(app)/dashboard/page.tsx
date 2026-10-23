import Link from 'next/link'
import {
  ArrowRight, ArrowUpRight, Banknote, BellRing, BookOpen, Boxes, Building2,
  CarFront, LayoutDashboard, Package, Settings, ShoppingCart, Users, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { MODULES } from '@/config/modules'

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Wallet, ShoppingCart, Package, Boxes, BookOpen, BellRing, Car: CarFront, Settings,
}
const DESCRIPTIONS: Record<string, string> = {
  kas: 'Pantau rekening, uang masuk dan keluar, transfer, serta laporan kas.',
  penjualan: 'Kelola pelanggan, penawaran, faktur penjualan, dan pembayaran masuk.',
  pembelian: 'Kelola pemasok, pesanan pembelian, faktur, dan pembayaran ke pemasok.',
  produk: 'Atur produk, stok per gudang, transfer persediaan, dan penyesuaian stok.',
  akuntansi: 'Kelola daftar akun, jurnal umum, buku besar, serta laporan keuangan.',
  reminder: 'Pantau pengingat pekerjaan, jadwal jatuh tempo, dan notifikasi.',
  kendaraan: 'Kelola kendaraan, servis, bahan bakar, pajak, dan peta armada.',
  pengaturan: 'Atur anggota, peran, dan hak akses dalam data usaha.',
}

export default async function DashboardPage() {
  const ctx = await getAppContext()
  const mods = MODULES.filter((m) => m.children && can(ctx.perms, m.key))
  const shortcuts = mods.flatMap((m) => (m.children ?? []).slice(0, 1).map((child) => ({
    key: m.key,
    label: child.label,
    href: child.href,
    moduleLabel: m.label,
    icon: ICONS[m.icon] ?? LayoutDashboard,
  }))).slice(0, 4)

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <section className="relative overflow-hidden rounded-2xl bg-ink px-6 py-7 text-white sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border-[32px] border-white/[0.04]" />
        <div className="pointer-events-none absolute -bottom-24 right-32 h-48 w-48 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <LayoutDashboard size={16} />
            <span>ERP Sistem Bisnis</span>
            <span aria-hidden="true">/</span>
            <span>Dashboard</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">Selamat datang, {ctx.user.fullName}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
            Semua aktivitas operasional {ctx.active.name} dalam satu tempat. Pilih modul di bawah untuk mulai bekerja.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5">
              <Building2 size={15} /> {ctx.active.name}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5">
              <Users size={15} /> Peran: {ctx.active.role === 'owner' ? 'Pemilik' : ctx.active.role === 'admin' ? 'Admin' : 'Anggota'}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><Boxes size={21} /></span>
          <div><p className="text-sm text-ink/60">Modul yang tersedia</p><p className="text-xl font-semibold tabular-nums">{mods.length}</p></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><Building2 size={21} /></span>
          <div><p className="text-sm text-ink/60">Data usaha dalam akun</p><p className="text-xl font-semibold tabular-nums">{ctx.companies.length}</p></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><ShieldIcon /></span>
          <div><p className="text-sm text-ink/60">Status akses</p><p className="text-base font-semibold">Aktif</p></div>
        </div>
      </section>

      {shortcuts.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Akses cepat</h2>
            <p className="mt-1 text-sm text-ink/60">Langsung buka pekerjaan yang sering digunakan.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {shortcuts.map((s) => {
              const Icon = s.icon
              return (
                <Link key={s.key} href={s.href} className="card group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-brand"><Icon size={20} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs text-ink/50">{s.moduleLabel}</span><span className="mt-0.5 block font-medium">{s.label}</span></span>
                  <ArrowUpRight size={17} className="shrink-0 text-ink/40 group-hover:text-brand" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Modul operasional</h2>
          <p className="mt-1 text-sm text-ink/60">Setiap modul memiliki menu dan data sesuai akses akunmu.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mods.map((m) => {
            const Icon = ICONS[m.icon] ?? LayoutDashboard
            return (
              <article key={m.key} className="card overflow-hidden transition hover:border-brand">
                <div className="flex items-start gap-3 border-b border-line p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon size={21} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{m.label}</h3>
                    <p className="mt-1 text-sm leading-5 text-ink/60">{DESCRIPTIONS[m.key] ?? 'Akses menu untuk mengelola aktivitas usaha.'}</p>
                  </div>
                </div>
                <div className="space-y-1 p-3">
                  {m.children!.map((child) => (
                    <Link key={child.href} href={child.href} className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-canvas">
                      <span>{child.label}</span>
                      <ArrowRight size={15} className="shrink-0 text-ink/35 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                    </Link>
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <span className="text-xs text-ink/50">{m.children!.length} menu tersedia</span>
                </div>
              </article>
            )
          })}
          {!mods.length && <p className="text-sm text-ink/60">Anda belum punya akses ke modul apa pun. Hubungi admin perusahaan.</p>}
        </div>
      </section>
    </div>
  )
}

function ShieldIcon() {
  return <Banknote size={21} />
}
