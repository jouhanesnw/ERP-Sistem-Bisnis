'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate, monthStart, rupiah, tglID } from '@/lib/format'
import type { Pelanggan, Pembayaran, PjPerm, RekeningPilihan } from './types'

export default function PembayaranManager({ companyId, pelanggan, rekening, perm }: {
  companyId: string; pelanggan: Pelanggan[]; rekening: RekeningPilihan[]; perm: PjPerm
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(isoDate(new Date()))
  const [rows, setRows] = useState<Pembayaran[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const namaPel = useMemo(() => Object.fromEntries(pelanggan.map((p) => [p.id, p.nama])), [pelanggan])
  const namaRek = useMemo(() => Object.fromEntries(rekening.map((r) => [r.id, r.nama])), [rekening])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb.from('pj_pembayaran').select('*, pj_dokumen(nomor, pelanggan_id)')
      .eq('company_id', companyId).gte('tanggal', from).lte('tanggal', to)
      .order('tanggal', { ascending: false }).order('created_at', { ascending: false })
    setLoading(false)
    if (error) return setError(error.message)
    setError(null); setRows((data ?? []) as unknown as Pembayaran[])
  }, [sb, companyId, from, to])
  useEffect(() => { load() }, [load])

  async function remove(r: Pembayaran) {
    if (!confirm('Hapus pembayaran ini? Kas masuk yang terkait di modul Kas juga ikut terhapus.')) return
    const { error } = await sb.rpc('pj_hapus_pembayaran', { p_id: r.id })
    if (error) return setError(error.message)
    load()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pembayaran Masuk</h1>
      <p className="text-sm text-ink/60">Pembayaran dicatat dari halaman Faktur Penjualan (tombol Bayar) dan otomatis masuk ke Kas.</p>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <p className="ml-auto text-sm text-ink/60">{rows.length} pembayaran · Total <b className="text-ink">{rupiah(rows.reduce((s, r) => s + Number(r.jumlah), 0))}</b></p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Tanggal</th><th className="p-3 font-medium">Faktur</th><th className="p-3 font-medium">Pelanggan</th>
            <th className="p-3 font-medium">Rekening</th><th className="p-3 text-right font-medium">Jumlah</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap p-3">{tglID(r.tanggal)}</td>
                <td className="p-3">{r.pj_dokumen?.nomor}{r.catatan && <span className="block text-xs text-ink/50">{r.catatan}</span>}</td>
                <td className="p-3">{r.pj_dokumen ? namaPel[r.pj_dokumen.pelanggan_id] : '—'}</td>
                <td className="p-3">{namaRek[r.rekening_id] ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{rupiah(Number(r.jumlah))}</td>
                <td className="p-3 text-right">{perm.delete && <button className="btn px-2" onClick={() => remove(r)} aria-label="Hapus"><Trash2 size={15} /></button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-ink/60">{loading ? 'Memuat…' : 'Belum ada pembayaran pada periode ini.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
