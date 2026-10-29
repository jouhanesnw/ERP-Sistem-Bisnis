'use client'

import { useMemo, useState } from 'react'
import { Check, Download, Save, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

export type FavoritePayload = {
  counterparty_id?: string
  currency_code?: string
  shipping_method_id?: string | null
  shipping_term_id?: string | null
  payment_terms_id?: string
  gudang_id?: string
  ppn_persen?: number | string
  catatan?: string
  no_referensi?: string
  items?: { deskripsi: string; qty: number | string; harga: number | string; produk_id?: string | null }[]
  rekening_id?: string
  rekening_tujuan_id?: string | null
  kategori_id?: string | null
  jumlah?: number | string
  keterangan?: string
  journal_lines?: { akun_id: string; debit: number | string; kredit: number | string; keterangan: string }[]
  hutang_akun_id?: string
  branch_id?: string | null
  jatuh_tempo?: string
  beban_items?: { akun_beban_id: string; deskripsi: string; jumlah: number | string }[]
}

export type TransactionFavorite = {
  id: string
  company_id: string
  favorite_type: string
  name: string
  visibility: 'all_members' | 'private'
  payload: FavoritePayload
  created_by?: string
  created_at?: string
}

const FAVORITE_LABELS: Record<string, string> = {
  sales_quote: 'Penawaran Penjualan',
  sales_invoice: 'Faktur Penjualan',
  purchase_order: 'Pesanan Pembelian',
  purchase_invoice: 'Faktur Pembelian',
  kas_in: 'Kas Masuk',
  kas_out: 'Kas Keluar',
  kas_transfer: 'Transfer Antar Rekening',
  journal_manual: 'Jurnal Umum',
  expense_recording: 'Pencatatan Beban',
}

export function favoriteTypeLabel(type: string) {
  return FAVORITE_LABELS[type] ?? type
}

export default function TransactionFavoriteControls({ companyId, favoriteType, payload, onApply }: {
  companyId: string
  favoriteType: string
  payload: FavoritePayload
  onApply: (payload: FavoritePayload) => void
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [mode, setMode] = useState<'save' | 'load' | null>(null)
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'all_members' | 'private'>('all_members')
  const [rows, setRows] = useState<TransactionFavorite[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function openLoad() {
    setMode('load'); setBusy(true); setError(null); setNotice(null); setSelected('')
    const { data, error } = await sb.from('company_transaction_favorites')
      .select('id, company_id, favorite_type, name, visibility, payload, created_by, created_at')
      .eq('company_id', companyId).eq('favorite_type', favoriteType).order('name')
    setBusy(false)
    if (error) { setError(error.message); setRows([]); return }
    setRows((data ?? []) as TransactionFavorite[])
  }

  async function save() {
    if (!name.trim()) { setError('Nama favorit wajib diisi.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { data: { user }, error: userError } = await sb.auth.getUser()
    if (userError || !user) { setBusy(false); setError('Sesi login tidak ditemukan. Silakan login ulang.'); return }
    const { error: saveError } = await sb.rpc('company_transaction_favorite_save', {
      p: {
        company_id: companyId,
        favorite_type: favoriteType,
        name: name.trim(),
        visibility,
        payload,
      },
    })
    setBusy(false)
    if (saveError) { setError(saveError.code === '23505' ? 'Nama favorit sudah digunakan.' : saveError.message); return }
    setMode(null)
    setName('')
    setNotice('Transaksi favorit berhasil disimpan.')
  }

  function apply() {
    const chosen = rows.find((row) => row.id === selected)
    if (!chosen) { setError('Pilih transaksi favorit terlebih dahulu.'); return }
    onApply(chosen.payload)
    setMode(null); setError(null)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={openLoad}><Download size={15} /> Ambil Favorit</button>
        <button type="button" className="btn" onClick={() => { setName(''); setVisibility('all_members'); setError(null); setNotice(null); setMode('save') }}><Save size={15} /> Simpan sebagai Favorit</button>
        {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      </div>
      {mode && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3 sm:p-5" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setMode(null) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="favorite-dialog-title" style={{ width: 'min(560px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: '88vh', backgroundColor: '#ffffff' }} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id="favorite-dialog-title" className="text-lg font-semibold">{mode === 'save' ? 'Simpan Transaksi Favorit' : 'Ambil Transaksi Favorit'}</h2>
              <p className="mt-1 text-sm text-ink/60">{favoriteTypeLabel(favoriteType)}. Favorit hanya menyimpan templat; tidak membuat transaksi atau mengubah stok.</p>
            </div>
            <button type="button" className="btn px-2" aria-label="Tutup" disabled={busy} onClick={() => setMode(null)}><X size={18} /></button>
          </div>
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {mode === 'save' ? <>
              <label className="block text-sm font-medium">Nama Favorit <span className="text-red-600">*</span>
                <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="Contoh: Pembelian bahan baku rutin" />
              </label>
              <label className="block text-sm font-medium">Akses Pengguna
                <select className="input mt-1 w-full" value={visibility} onChange={(e) => setVisibility(e.target.value as 'all_members' | 'private')}>
                  <option value="all_members">Semua pengguna perusahaan</option>
                  <option value="private">Pribadi (hanya saya dan admin)</option>
                </select>
              </label>
              <p className="text-xs text-ink/55">Tanggal transaksi tidak disimpan agar favorit bisa dipakai untuk transaksi baru. Kuantitas, harga, akun/item, dan detail lain yang ada di formulir akan tersimpan sebagai templat.</p>
            </> : <>
              {busy && <p className="text-sm text-ink/60">Memuat favorit…</p>}
              {!busy && !rows.length && <p className="rounded-lg bg-canvas p-4 text-sm text-ink/60">Belum ada favorit untuk jenis transaksi ini. Isi formulir, lalu pilih “Simpan sebagai Favorit”.</p>}
              {!!rows.length && <label className="block text-sm font-medium">Pilih Favorit
                <select className="input mt-1 w-full" value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Pilih transaksi favorit…</option>
                  {rows.map((row) => <option key={row.id} value={row.id}>{row.name}{row.visibility === 'private' ? ' (Pribadi)' : ''}</option>)}
                </select>
              </label>}
              {selected && (() => {
                const chosen = rows.find((row) => row.id === selected)
                const itemCount = chosen?.payload.items?.length ?? chosen?.payload.beban_items?.length ?? chosen?.payload.journal_lines?.length ?? 0
                return chosen ? <div className="rounded-lg border border-line p-3 text-sm"><p className="font-medium">{chosen.name}</p><p className="mt-1 text-ink/60">{itemCount} baris detail{chosen.payload.currency_code ? ` · ${chosen.payload.currency_code}` : ''}{chosen.payload.jumlah !== undefined ? ` · Nominal ${new Intl.NumberFormat('id-ID').format(Number(chosen.payload.jumlah))}` : ''}</p></div> : null
              })()}
            </>}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" className="btn" disabled={busy} onClick={() => setMode(null)}>Batal</button>
            {mode === 'save'
              ? <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}><Check size={15} /> {busy ? 'Menyimpan…' : 'Simpan Favorit'}</button>
              : <button type="button" className="btn btn-primary" disabled={busy || !selected} onClick={apply}><Download size={15} /> Ambil</button>}
          </div>
        </section>
      </div>}
    </>
  )
}
