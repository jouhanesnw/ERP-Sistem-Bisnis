'use client'
import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate, monthStart, rupiah } from './format'
import type { Kategori, Rekening, Transaksi } from './types'

export default function LaporanKas({ companyId, rekening, kategori }: { companyId: string; rekening: Rekening[]; kategori: Kategori[] }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(isoDate(new Date()))
  const [rows, setRows] = useState<Transaksi[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sb.from('kas_transaksi').select('*').eq('company_id', companyId).gte('tanggal', from).lte('tanggal', to).order('tanggal')
      .then(({ data, error }) => { if (error) setError(error.message); else { setError(null); setRows((data ?? []) as Transaksi[]) } })
  }, [sb, companyId, from, to])

  const sum = (l: Transaksi[]) => l.reduce((s, r) => s + Number(r.jumlah), 0)
  const masuk = rows.filter((r) => r.jenis === 'masuk')
  const keluar = rows.filter((r) => r.jenis === 'keluar')
  const namaKat = Object.fromEntries(kategori.map((k) => [k.id, k.nama]))
  const namaRek = Object.fromEntries(rekening.map((r) => [r.id, r.nama]))

  const perKategori = (l: Transaksi[]) => {
    const m = new Map<string, number>()
    l.forEach((r) => { const n = r.kategori_id ? namaKat[r.kategori_id] ?? '—' : 'Tanpa kategori'; m.set(n, (m.get(n) ?? 0) + Number(r.jumlah)) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [['Tanggal', 'Jenis', 'Rekening', 'Rekening tujuan', 'Kategori', 'Jumlah', 'Keterangan'].map(esc).join(',')]
    rows.forEach((r) => lines.push([r.tanggal, r.jenis, namaRek[r.rekening_id] ?? '', r.rekening_tujuan_id ? namaRek[r.rekening_tujuan_id] : '', r.kategori_id ? namaKat[r.kategori_id] : '', r.jumlah, r.keterangan ?? ''].map(esc).join(',')))
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `laporan-kas_${from}_${to}.csv`; a.click()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Laporan Kas</h1>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn ml-auto" onClick={exportCsv} disabled={!rows.length}><Download size={16} />Unduh CSV</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Kas masuk" value={sum(masuk)} />
        <Stat label="Kas keluar" value={sum(keluar)} />
        <Stat label="Selisih" value={sum(masuk) - sum(keluar)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KatTable title="Kas masuk per kategori" data={perKategori(masuk)} />
        <KatTable title="Kas keluar per kategori" data={perKategori(keluar)} />
      </div>

      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-2 font-medium">Mutasi per rekening</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Rekening</th><th className="p-3 text-right font-medium">Masuk</th><th className="p-3 text-right font-medium">Keluar</th>
            <th className="p-3 text-right font-medium">Transfer masuk</th><th className="p-3 text-right font-medium">Transfer keluar</th><th className="p-3 text-right font-medium">Saldo saat ini</th>
          </tr></thead>
          <tbody>
            {rekening.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="p-3">{r.nama}</td>
                <td className="p-3 text-right tabular-nums">{rupiah(sum(masuk.filter((t) => t.rekening_id === r.id)))}</td>
                <td className="p-3 text-right tabular-nums">{rupiah(sum(keluar.filter((t) => t.rekening_id === r.id)))}</td>
                <td className="p-3 text-right tabular-nums">{rupiah(sum(rows.filter((t) => t.jenis === 'transfer' && t.rekening_tujuan_id === r.id)))}</td>
                <td className="p-3 text-right tabular-nums">{rupiah(sum(rows.filter((t) => t.jenis === 'transfer' && t.rekening_id === r.id)))}</td>
                <td className="p-3 text-right font-medium tabular-nums">{rupiah(Number(r.saldo))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="card p-4"><p className="text-sm text-ink/60">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{rupiah(value)}</p></div>
)

const KatTable = ({ title, data }: { title: string; data: [string, number][] }) => (
  <section className="card p-4">
    <h2 className="mb-2 font-medium">{title}</h2>
    <ul className="divide-y divide-line text-sm">
      {data.map(([n, v]) => <li key={n} className="flex justify-between py-2"><span>{n}</span><span className="tabular-nums">{rupiah(v)}</span></li>)}
      {!data.length && <li className="py-3 text-ink/60">Tidak ada data pada periode ini.</li>}
    </ul>
  </section>
)
