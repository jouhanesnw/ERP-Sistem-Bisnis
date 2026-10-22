export type NavChild = { label: string; href: string }
export type ModuleDef = {
  key: string            // dipakai di database (module_access.module) dan URL
  label: string
  icon: string           // nama ikon lucide, dipetakan di Sidebar
  href?: string          // untuk menu tanpa submenu
  children?: NavChild[]
  alwaysVisible?: boolean // tidak perlu izin (dashboard)
  adminOnly?: boolean     // hanya owner/admin
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', href: '/dashboard', alwaysVisible: true },
  {
    key: 'kas', label: 'Kas', icon: 'Wallet',
    children: [
      { label: 'Rekening Kas', href: '/kas/rekening' },
      { label: 'Kas Masuk', href: '/kas/masuk' },
      { label: 'Kas Keluar', href: '/kas/keluar' },
      { label: 'Transfer', href: '/kas/transfer' },
      { label: 'Kategori', href: '/kas/kategori' },
      { label: 'Laporan Kas', href: '/kas/laporan' },
    ],
  },
  {
    key: 'penjualan', label: 'Penjualan', icon: 'ShoppingCart',
    children: [
      { label: 'Pelanggan', href: '/penjualan/pelanggan' },
      { label: 'Penawaran', href: '/penjualan/penawaran' },
      { label: 'Faktur Penjualan', href: '/penjualan/faktur' },
      { label: 'Pembayaran Masuk', href: '/penjualan/pembayaran' },
    ],
  },
  {
    key: 'pembelian', label: 'Pembelian', icon: 'Package',
    children: [
      { label: 'Pemasok', href: '/pembelian/pemasok' },
      { label: 'Pesanan Pembelian', href: '/pembelian/pesanan' },
      { label: 'Faktur Pembelian', href: '/pembelian/faktur' },
      { label: 'Pembayaran Keluar', href: '/pembelian/pembayaran' },
    ],
  },
  {
    key: 'produk', label: 'Produk & Stok', icon: 'Boxes',
    children: [
      { label: 'Daftar Produk', href: '/produk/daftar' },
      { label: 'Daftar Gudang', href: '/produk/gudang' },
      { label: 'Transfer Gudang', href: '/produk/transfer' },
      { label: 'Stok & Riwayat', href: '/produk/stok' },
      { label: 'Penyesuaian Stok', href: '/produk/penyesuaian' },
    ],
  },
  {
    key: 'akuntansi', label: 'Akuntansi', icon: 'BookOpen',
    children: [
      { label: 'Daftar Akun', href: '/akuntansi/akun' },
      { label: 'Jurnal Umum', href: '/akuntansi/jurnal' },
      { label: 'Buku Besar', href: '/akuntansi/buku-besar' },
      { label: 'Laporan Keuangan', href: '/akuntansi/laporan' },
    ],
  },
  {
    key: 'reminder', label: 'Reminder', icon: 'BellRing',
    children: [
      { label: 'Semua Pengingat', href: '/reminder/semua' },
      { label: 'Jatuh Tempo', href: '/reminder/jatuh-tempo' },
      { label: 'Pengaturan Notifikasi', href: '/reminder/notifikasi' },
    ],
  },
  {
    key: 'kendaraan', label: 'Kendaraan', icon: 'Car',
    children: [
      { label: 'Daftar Kendaraan', href: '/kendaraan/daftar' },
      { label: 'Servis', href: '/kendaraan/servis' },
      { label: 'Bahan Bakar', href: '/kendaraan/bbm' },
      { label: 'Pajak & STNK', href: '/kendaraan/pajak' },
      { label: 'Peta Armada', href: '/kendaraan/peta' },
    ],
  },
  {
    key: 'pengaturan', label: 'Pengaturan', icon: 'Settings', adminOnly: true,
    children: [
      { label: 'Anggota & Akses', href: '/pengaturan/anggota' },
      { label: 'Profil Perusahaan', href: '/pengaturan/perusahaan' },
    ],
  },
]

// Modul yang hak aksesnya bisa diatur per anggota
export const ASSIGNABLE = MODULES.filter((m) => !m.alwaysVisible && !m.adminOnly).map((m) => ({ key: m.key, label: m.label }))
