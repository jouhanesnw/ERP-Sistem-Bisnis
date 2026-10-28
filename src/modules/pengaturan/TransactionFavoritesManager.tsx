'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, Package, Receipt, ShoppingCart, Trash2, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { favoriteTypeLabel, type TransactionFavorite } from './TransactionFavoriteControls'

const FORM_HREF: Record<string, string> = {
  sales_quote: '/penjualan/penawaran',
  sales_invoice: '/penjualan/faktur',
  purchase_order: '/pembelian/pesanan',
  purchase_invoice: '/pembelian/faktur',
  kas_in: '/kas/masuk',
  kas_out: '/kas/keluar',
  kas_transfer: '/kas/transfer',
  journal_manual: '/akuntansi/jurnal',
}
const FORM_ICON: Record<string, typeof ShoppingCart> = {
  sales_quote: ShoppingCart,
  sales_invoice: Receipt,
  purchase_order: Package,
  purchase_invoice: Receipt,
  kas_in: Wallet,
  kas_out: Wallet,
  kas_transfer: Wallet,
  journal_manual: Receipt,
}
const FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'sales_quote', label: 'Penawaran Penjualan' },
  { value: 'sales_invoice', label: 'Faktur Penjualan' },
  { value: 'purchase_order', label: 'Pesanan Pembelian' },
  { value: 'purchase_invoice', label: 'Faktur Pembelian' },
  { value: 'kas_in', label: 'Kas Masuk' },
  { value: 'kas_out', label: 'Kas Keluar' },
  { value: 'kas_transfer', label: 'Transfer Antar Rekening' },
  { value: 'journal_manual', label: 'Jurnal Umum' },
]

export default function TransactionFavoritesManager({ companyId, initial, initialError }: {
  companyId: string
  initial: TransactionFavorite[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [deleting, setDeleting] = useState<string | null>(null)

  const visible = rows.filter((row) => {
    if (filter !== 'all' && row.favorite_type !== filter) return false
    return row.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))
  }).sort((a, b) => a.name.localeCompare(b.name, 'id'))

  async function remove(row: TransactionFavorite) {
    if (!confirm(`Hapus transaksi favorit "${row.name}"? Transaksi aslinya tidak akan terhapus.`)) return
    setDeleting(row.id); setError(null)
    const { error: deleteError } = await sb.from('company_transaction_favorites').delete()
      .eq('id', row.id).eq('company_id', companyId)
    setDeleting(null)
    if (deleteError) { setError(deleteError.message); return }
    setRows((current) => current.filter((item) => item.id !== row.id))
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Transaksi Favorit</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink/60">Kelola templat formulir penjualan, pembelian, Kas &amp; Bank, dan jurnal manual. Favorit menyimpan rincian formulir, bukan transaksi yang sudah dibukukan.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {initialError && <p className="text-sm text-red-600">Favorit belum dapat dimuat: {initialError}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="text-sm text-ink/60">Jumlah favorit</p><p className="mt-1 text-2xl font-semibold tabular-nums">{rows.length}</p></div>
        <div className="card p-4"><p className="text-sm text-ink/60">Dapat digunakan bersama</p><p className="mt-1 text-2xl font-semibold tabular-nums">{rows.filter((row) => row.visibility === 'all_members').length}</p></div>
        <div className="card p-4"><p className="text-sm text-ink/60">Favorit pribadi</p><p className="mt-1 text-2xl font-semibold tabular-nums">{rows.filter((row) => row.visibility === 'private').length}</p></div>
        <div className="card flex items-center gap-3 p-4"><Wallet size={23} className="text-ink/50" /><p className="text-sm text-ink/60">Pakai tombol Ambil Favorit di formulir transaksi baru.</p></div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input className="input w-full lg:max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama favorit..." />
        <select className="input w-full lg:w-auto lg:min-w-[230px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <p className="text-sm text-ink/60 lg:ml-auto">{visible.length} favorit</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead><tr className="border-b border-line bg-canvas text-ink/60">
            <th className="p-3 font-medium">Nama Favorit</th>
            <th className="p-3 font-medium">Jenis Formulir</th>
            <th className="p-3 font-medium">Detail</th>
            <th className="p-3 font-medium">Akses</th>
            <th className="p-3 font-medium">Dibuat</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {visible.map((row) => {
              const Icon = FORM_ICON[row.favorite_type] ?? Package
              const itemCount = Array.isArray(row.payload?.items) ? row.payload.items.length : Array.isArray(row.payload?.journal_lines) ? row.payload.journal_lines.length : 0
              const detailSummary = row.payload?.jumlah !== undefined
                ? `Nominal ${new Intl.NumberFormat('id-ID').format(Number(row.payload.jumlah) || 0)}`
                : `${itemCount} baris detail`
              return <tr key={row.id} className="border-b border-line last:border-0 align-top">
                <td className="p-3"><div className="font-medium">{row.name}</div></td>
                <td className="p-3"><span className="inline-flex items-center gap-2"><Icon size={15} className="text-ink/45" />{favoriteTypeLabel(row.favorite_type)}</span></td>
                <td className="p-3">{detailSummary}{row.payload?.currency_code ? ` · ${row.payload.currency_code}` : ''}</td>
                <td className="p-3">{row.visibility === 'all_members' ? 'Semua pengguna' : 'Pribadi'}</td>
                <td className="whitespace-nowrap p-3">{row.created_at ? new Date(row.created_at).toLocaleDateString('id-ID') : '—'}</td>
                <td className="whitespace-nowrap p-3 text-right"><div className="flex justify-end gap-2">
                  <Link className="btn" href={FORM_HREF[row.favorite_type] ?? '/dashboard'}>Buka formulir <ArrowUpRight size={14} /></Link>
                  <button type="button" className="btn px-2" title="Hapus favorit" aria-label={`Hapus ${row.name}`} disabled={deleting === row.id} onClick={() => remove(row)}><Trash2 size={15} /></button>
                </div></td>
              </tr>
            })}
            {!visible.length && <tr><td colSpan={6} className="p-10 text-center">
              <p className="font-medium">{rows.length ? 'Favorit tidak ditemukan' : 'Belum ada transaksi favorit'}</p>
              <p className="mt-1 text-sm text-ink/55">{rows.length ? 'Coba kata pencarian atau filter lain.' : 'Buka formulir penjualan atau pembelian, isi detail yang sering digunakan, lalu pilih Simpan sebagai Favorit.'}</p>
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
