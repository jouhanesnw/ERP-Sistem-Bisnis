'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import {
  Activity,
  ArrowLeftRight,
  BadgeDollarSign,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileSearch,
  History,
  Home,
  Monitor,
  Table,
  TrendingUp,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  Landmark,
  Loader2,
  MapPin,
  Package,
  Power,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  UserRound,
  Users,
  Wallet,
  Boxes,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import type { ModuleDef } from '@/config/modules'

type TileTone = 'blue' | 'green' | 'purple' | 'orange'
type MenuTile = { label: string; href?: string; icon?: LucideIcon; tone?: TileTone; disabled?: boolean }
type SidebarItem = {
  key: string
  label: string
  icon: LucideIcon
  children?: MenuTile[]
  disabled?: boolean
  separatorBefore?: boolean
}

const TILE_ICONS: LucideIcon[] = [
  CreditCard,
  Building2,
  Users,
  Receipt,
  BadgeDollarSign,
  Truck,
  FileText,
  ArrowLeftRight,
  Wallet,
  Package,
  ClipboardCheck,
  Tags,
  UserRound,
  CalendarDays,
  Activity,
]

function getTileIcon(label: string, index: number, customIcon?: LucideIcon): LucideIcon {
  if (customIcon) return customIcon;
  const text = label.toLowerCase()
  if (text.includes('pelanggan') || text.includes('kontak')) return UserRound
  if (text.includes('pemasok') || text.includes('perusahaan') || text.includes('cabang')) return Building2
  if (text.includes('faktur') || text.includes('jurnal')) return Receipt
  if (text.includes('pembayaran') || text.includes('kas') || text.includes('rekening')) return Wallet
  if (text.includes('transfer')) return ArrowLeftRight
  if (text.includes('gudang') || text.includes('stok') || text.includes('persediaan')) return Boxes
  if (text.includes('produk') || text.includes('pesanan')) return Package
  if (text.includes('laporan') || text.includes('aktivitas')) return ClipboardList
  if (text.includes('akun') || text.includes('buku besar')) return BookOpen
  if (text.includes('pengaturan') || text.includes('anggota') || text.includes('akses')) return Users
  if (text.includes('kategori')) return Tags
  if (text.includes('kalender') || text.includes('tanggal')) return CalendarDays
  return TILE_ICONS[index % TILE_ICONS.length]
}

function getTileTone(label: string, customTone?: TileTone) {
  if (customTone === 'green') return 'border-[#78c94f] bg-[#dcfbd1] text-[#4d7c0f]'
  if (customTone === 'purple') return 'border-[#bd75ee] bg-[#f3e2ff] text-[#6b21a8]'
  if (customTone === 'orange') return 'border-[#ff8a36] bg-[#ffead7] text-[#c45100]'
  if (customTone === 'blue') return 'border-[#46a9fb] bg-[#d7eaff] text-[#075985]'
  const text = label.toLowerCase()
  if (text.includes('berulang') || text.includes('akhir bulan') || text.includes('jatuh tempo')) {
    return 'border-[#78c94f] bg-[#dcfbd1] text-[#4d7c0f]'
  }
  if (text.includes('favorit') || text.includes('kalender') || text.includes('aktivitas') || text.includes('notifikasi')) {
    return 'border-[#bd75ee] bg-[#f3e2ff] text-[#6b21a8]'
  }
  return 'border-[#46a9fb] bg-[#d7eaff] text-[#075985]'
}

function getTileClass(child: MenuTile, active: boolean) {
  return `group relative flex w-[164px] h-[92px] min-h-[92px] flex-col items-center justify-between gap-1.5 rounded-lg border p-[10px] text-center shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685d1] sm:h-[100px] sm:min-h-[100px] ${getTileTone(child.label, child.tone)} ${active ? 'ring-2 ring-inset ring-[#1685d1]' : ''}`
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
  const [panel, setPanel] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null)
  const byKey = useMemo(() => Object.fromEntries(modules.map((module) => [module.key, module])), [modules])

  const items = useMemo<SidebarItem[]>(() => {
    const result: SidebarItem[] = []
    if (byKey.pengaturan) {
      result.push({
        key: 'perusahaan',
        label: 'Perusahaan',
        icon: Building2,
        children: [
          { label: 'Mata Uang', href: '/pengaturan/mata-uang', icon: CreditCard, tone: 'blue' },
          { label: 'Cabang', href: '/pengaturan/cabang', icon: Building2, tone: 'blue' },
          { label: 'Departemen', href: '/pengaturan/departemen', icon: Landmark, tone: 'blue' },
          { label: 'Pajak', href: '/pengaturan/pajak', icon: Receipt, tone: 'blue' },
          { label: 'Syarat Pembayaran', icon: BadgeDollarSign, tone: 'blue', disabled: true },
          { label: 'Pengiriman', icon: Truck, tone: 'blue', disabled: true },
          { label: 'FOB', icon: FileText, tone: 'blue', disabled: true },
          { label: 'Gaji/Tunjangan', icon: Wallet, tone: 'blue', disabled: true },
          { label: 'Karyawan', icon: Users, tone: 'blue', disabled: true },
          { label: 'Transaksi Berulang', icon: ClipboardCheck, tone: 'green', disabled: true },
          { label: 'Proses Akhir Bulan', icon: CalendarDays, tone: 'green', disabled: true },
          { label: 'Kontak', icon: UserRound, tone: 'purple', disabled: true },
          { label: 'Transaksi Favorit', icon: ClipboardCheck, tone: 'purple', disabled: true },
          { label: 'Kalender', icon: CalendarDays, tone: 'purple', disabled: true },
          { label: 'Log Aktivitas', icon: Activity, tone: 'purple', disabled: true },
        ],
      })
    }
    if (byKey.akuntansi) {
      result.push({
        key: 'buku-besar',
        label: 'Buku Besar',
        icon: BookOpen,
        children: [
          { label: 'Akun Perkiraan', href: '/akuntansi/akun', icon: Wallet, tone: 'blue' },
          { label: 'Pencatatan Beban', icon: ClipboardList, tone: 'green', disabled: true },
          { label: 'Pencatatan Gaji', icon: Receipt, tone: 'green', disabled: true },
          { label: 'Jurnal Umum', href: '/akuntansi/jurnal', icon: Table, tone: 'green' },
          { label: 'Monitor Anggaran', icon: Monitor, tone: 'purple', disabled: true },
          { label: 'Transfer Anggaran', icon: ArrowLeftRight, tone: 'green', disabled: true },
          { label: 'Anggaran', icon: TrendingUp, tone: 'orange', disabled: true },
          { label: 'Histori Akun', href: '/akuntansi/buku-besar', icon: History, tone: 'purple' },
          { label: 'Log Aktivitas Jurnal', icon: FileSearch, tone: 'purple', disabled: true },
        ],
      })
    }
    if (byKey.kas) {
      result.push({
        key: 'kas',
        label: 'Kas & Bank',
        icon: Wallet,
        children: [
          { label: 'Pembayaran', href: '/kas/keluar', icon: Wallet, tone: 'green' },
          { label: 'Penerimaan', href: '/kas/masuk', icon: BadgeDollarSign, tone: 'green' },
          { label: 'Transfer Bank', href: '/kas/transfer', icon: Landmark, tone: 'green' },
          { label: 'SmartLink e-Banking', icon: FileText, tone: 'blue', disabled: true },
          { label: 'Rekening Koran', icon: CreditCard, tone: 'purple', disabled: true },
          { label: 'Histori Bank', icon: Building2, tone: 'purple', disabled: true },
          { label: 'Rekonsiliasi Bank', icon: ClipboardCheck, tone: 'purple', disabled: true },
          { label: 'SmartLink Virtual Account', icon: FileText, tone: 'purple', disabled: true },
          { label: 'SmartLink e-Payment', icon: Receipt, tone: 'purple', disabled: true },
        ],
      })
    }
    if (byKey.penjualan) {
      result.push({
        key: 'penjualan',
        label: 'Penjualan',
        icon: ShoppingCart,
        children: [
          { label: 'Penawaran Penjualan', href: '/penjualan/penawaran', icon: BadgeDollarSign, tone: 'green' },
          { label: 'Pesanan Penjualan', icon: ClipboardList, tone: 'green', disabled: true },
          { label: 'Pengiriman Pesanan', icon: Truck, tone: 'green', disabled: true },
          { label: 'Uang Muka Penjualan', icon: Wallet, tone: 'green', disabled: true },
          { label: 'Faktur Penjualan', href: '/penjualan/faktur', icon: Receipt, tone: 'green' },
          { label: 'Penerimaan Penjualan', href: '/penjualan/pembayaran', icon: CreditCard, tone: 'green' },
          { label: 'Retur Penjualan', icon: ArrowLeftRight, tone: 'green', disabled: true },
          { label: 'Kategori Pelanggan', icon: Users, tone: 'blue', disabled: true },
          { label: 'Kategori Penjualan', icon: Tags, tone: 'blue', disabled: true },
          { label: 'Pelanggan', href: '/penjualan/pelanggan', icon: UserRound, tone: 'blue' },
          { label: 'Penyesuaian Harga/Diskon', icon: Tags, tone: 'orange', disabled: true },
          { label: 'Komisi Penjual', icon: BadgeDollarSign, tone: 'orange', disabled: true },
          { label: 'Target Penjualan', icon: TrendingUp, tone: 'orange', disabled: true },
          { label: 'SmartLink e-Commerce', icon: ShoppingCart, tone: 'orange', disabled: true },
          { label: 'Check In', icon: Activity, tone: 'purple', disabled: true },
        ],
      })
    }
    if (byKey.pembelian) {
      result.push({
        key: 'pembelian',
        label: 'Pembelian',
        icon: Package,
        children: [
          { label: 'Pesanan Pembelian', href: '/pembelian/pesanan', icon: ClipboardList, tone: 'green' },
          { label: 'Penerimaan Barang', icon: Package, tone: 'green', disabled: true },
          { label: 'Uang Muka Pembelian', icon: Wallet, tone: 'green', disabled: true },
          { label: 'Faktur Pembelian', href: '/pembelian/faktur', icon: Receipt, tone: 'green' },
          { label: 'Pembayaran Pembelian', href: '/pembelian/pembayaran', icon: CreditCard, tone: 'green' },
          { label: 'Retur Pembelian', icon: ArrowLeftRight, tone: 'green', disabled: true },
          { label: 'Harga Pemasok', icon: BadgeDollarSign, tone: 'orange', disabled: true },
          { label: 'Kategori Pemasok', icon: Users, tone: 'blue', disabled: true },
          { label: 'Pemasok', href: '/pembelian/pemasok', icon: UserRound, tone: 'blue' },
          { label: 'Perintah Pembayaran', icon: FileText, tone: 'green', disabled: true },
          { label: 'Transfer Pemasok', icon: ArrowLeftRight, tone: 'purple', disabled: true },
        ],
      })
    }
    if (byKey.produk) {
      result.push({
        key: 'persediaan',
        label: 'Persediaan',
        icon: Boxes,
        children: [
          { label: 'Permintaan Barang', icon: FileText, tone: 'green', disabled: true },
          { label: 'Pemindahan Barang', href: '/produk/transfer', icon: Truck, tone: 'green' },
          { label: 'Penyesuaian Persediaan', href: '/produk/penyesuaian', icon: Boxes, tone: 'green' },
          { label: 'Pekerjaan Pesanan', icon: ClipboardCheck, tone: 'green', disabled: true },
          { label: 'Penambahan Bahan Baku', icon: Package, tone: 'green', disabled: true },
          { label: 'Penyelesaian Pesanan', icon: ClipboardCheck, tone: 'green', disabled: true },
          { label: 'Perintah Stok Opname', icon: FileText, tone: 'green', disabled: true },
          { label: 'Hasil Stok Opname', href: '/produk/stok', icon: ClipboardCheck, tone: 'green' },
          { label: 'Barang & Jasa', href: '/produk/daftar', icon: Package, tone: 'blue' },
          { label: 'Gudang', href: '/produk/gudang', icon: Building2, tone: 'blue' },
          { label: 'Satuan Barang', icon: Boxes, tone: 'blue', disabled: true },
          { label: 'Kategori Barang', icon: Tags, tone: 'blue', disabled: true },
          { label: 'Merek Barang', icon: BadgeDollarSign, tone: 'blue', disabled: true },
          { label: 'Pemenuhan Pesanan', icon: ClipboardList, tone: 'purple', disabled: true },
          { label: 'Barang per Gudang', href: '/produk/stok', icon: Building2, tone: 'purple' },
          { label: 'Barang Stok Minimum', icon: Package, tone: 'purple', disabled: true },
        ],
      })
    }
    result.push({
      key: 'aset-tetap',
      label: 'Aset Tetap',
      icon: Landmark,
      children: [
        { label: 'Aset Tetap', icon: Landmark, tone: 'blue', disabled: true },
        { label: 'Kategori Aset', icon: Boxes, tone: 'blue', disabled: true },
        { label: 'Kategori Aset Tetap Pajak', icon: Receipt, tone: 'blue', disabled: true },
        { label: 'Perubahan Aset Tetap', icon: Activity, tone: 'green', disabled: true },
        { label: 'Disposisi Aset Tetap', icon: ClipboardCheck, tone: 'green', disabled: true },
        { label: 'Pindah Aset', icon: ArrowLeftRight, tone: 'green', disabled: true },
        { label: 'Aset per Lokasi', icon: MapPin, tone: 'purple', disabled: true },
      ],
    })

    if (byKey.kas || byKey.akuntansi) {
      result.push({
        key: 'laporan',
        label: 'Daftar Laporan',
        icon: ClipboardList,
        children: [
          { label: 'Daftar Laporan', href: byKey.akuntansi ? '/akuntansi/laporan' : '/kas/laporan', icon: FileSearch, tone: 'purple' },
          { label: 'SPT PPN / PPNBM', icon: FileText, tone: 'purple', disabled: true },
          { label: 'Analisa AI', icon: Activity, tone: 'purple', disabled: true },
          { label: 'SPT PPh Ps.21', icon: FileText, tone: 'purple', disabled: true },
          { label: 'Bukti Potong PPh Ps.21', icon: FileSearch, tone: 'purple', disabled: true },
        ],
      })
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

  const activePanel = panel ? items.find((item) => item.key === panel) : undefined

  useEffect(() => {
    setPanel(null)
    setTooltip(null)
  }, [path])

  useEffect(() => {
    if (!panel) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel])

  function showTooltip(event: SyntheticEvent<HTMLElement>, label: string) {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }

  function togglePanel(item: SidebarItem) {
    if (!item.children?.length) return
    setTooltip(null)
    setPanel((current) => current === item.key ? null : item.key)
  }

  function closeMenus() {
    setPanel(null)
    setTooltip(null)
    onClose()
  }

  function isItemActive(item: SidebarItem) {
    return item.children?.some((child) => path === child.href || path.startsWith(child.href + '/')) ?? false
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={closeMenus} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-20 flex-col border-r border-white/10 bg-gradient-to-b from-[#193f70] to-[#10294e] text-white shadow-lg transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label={`Navigasi ERP untuk ${companyName}`}
      >
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Menu utama">
          <Link
            href="/dashboard"
            prefetch
            onClick={closeMenus}
            aria-label="Dashboard"
            aria-current={path === '/dashboard' ? 'page' : undefined}
            onMouseEnter={(event) => showTooltip(event, 'Dashboard')}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event, 'Dashboard')}
            onBlur={() => setTooltip(null)}
            className={`group relative mb-1 flex h-12 items-center justify-center rounded-xl transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${path === '/dashboard' ? 'bg-white/15 text-white' : 'text-white/85'}`}
          >
            {path === '/dashboard' && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[#ef466b]" />}
            <Home size={23} strokeWidth={1.8} />
          </Link>
          {items.map((item) => {
            const Icon = item.icon
            const active = isItemActive(item)
            const selected = panel === item.key

            return (
              <div key={item.key}>
                {item.separatorBefore && <div className="mx-2 my-3 border-t border-white/20" aria-hidden="true" />}
                {item.disabled ? (
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
                  <button
                    type="button"
                    onClick={() => togglePanel(item)}
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
                    {selected && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#ef466b]" />}
                  </button>
                )}
              </div>
            )
          })}
          <div className="mx-2 my-3 border-t border-white/15" aria-hidden="true" />
          <Link
            href="/data-usaha"
            prefetch
            onClick={closeMenus}
            aria-label="Data Usaha"
            onMouseEnter={(event) => showTooltip(event, 'Data Usaha')}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event, 'Data Usaha')}
            onBlur={() => setTooltip(null)}
            className="group relative flex h-12 items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Database size={22} strokeWidth={1.8} />
          </Link>
          <button
            type="button"
            onClick={() => { setPanel(null); setTooltip(null); onLogout() }}
            aria-label="Keluar"
            onMouseEnter={(event) => showTooltip(event, 'Keluar')}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event, 'Keluar')}
            onBlur={() => setTooltip(null)}
            className="group relative flex h-12 w-full items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-red-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Power size={23} strokeWidth={1.8} />
          </button>
        </nav>
      </aside>

      {tooltip ? (
        <div
          className="pointer-events-none fixed left-[5.25rem] z-[70] -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ top: tooltip.top }}
        >
          {tooltip.label}
        </div>
      ) : null}

      {activePanel?.children?.length ? (
        <>
          <button
            type="button"
            aria-label="Tutup panel menu"
            className="fixed bottom-0 left-20 right-0 top-16 z-[45] cursor-default bg-black/[0.025]"
            onClick={() => setPanel(null)}
          />
          <section
            style={{
              width: ['buku-besar', 'kas', 'aset-tetap', 'laporan'].includes(activePanel.key) ? 860 : activePanel.key === 'persediaan' ? 1200 : 860,
              maxWidth: 'calc(100vw - 6rem)',
            }}
            className="fixed left-20 top-[5rem] z-50 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-[#fbfbfb] text-[#3d3d3d] shadow-[0_12px_35px_rgba(0,0,0,0.28)]"
            aria-label={activePanel.label}
            aria-modal="false"
            role="dialog"
          >
            <div className="shrink-0 px-4 pb-3 pt-3 sm:px-4 sm:pt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-normal text-[#555] sm:text-xl">{activePanel.label}</h2>
                <button
                  type="button"
                  onClick={() => setPanel(null)}
                  aria-label="Tutup panel menu"
                  className="rounded-md p-1.5 text-[#777] hover:bg-black/5 hover:text-[#333]"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
              </div>
              <div className="mt-3 h-[2px] w-full bg-[#ef466b]" />
            </div>

            <div className="overflow-y-auto px-4 pb-4">
              <div className="grid content-start gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, 164px)' }}>
                {activePanel.children.map((child, index) => {
                  const TileIcon = getTileIcon(child.label, index, child.icon)
                  const active = !!child.href && (path === child.href || path.startsWith(child.href + '/'))
                  const pending = !!child.href && pendingPath === child.href
const tileClass = getTileClass(child, active)
                  const icon = <span className="flex flex-1 items-center justify-center">
                    <TileIcon size={28} strokeWidth={1.8} className={`transition-transform ${child.disabled ? '' : 'group-hover:scale-105'}`} />
                  </span>
                  const label = <span className="text-[13px] font-medium leading-snug text-[#414b56]">{child.label}</span>
                  if (!child.href || child.disabled) {
                    return (
                      <button
                        key={child.href ?? child.label}
                        type="button"
                        disabled
                        aria-label={child.label + ' — belum tersedia'}
                        title="Fitur belum tersedia"
                        className={`${tileClass} cursor-not-allowed`}
                      >
                        {icon}
                        {label}
                      </button>
                    )
                  }
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      prefetch
                      onClick={closeMenus}
                      aria-current={active ? 'page' : undefined}
                      className={tileClass}
                    >
                      {icon}
                      {label}
                      {pending ? <Loader2 size={13} className="absolute right-1.5 top-1.5 animate-spin" /> : null}
                    </Link>
                  )
                })}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
