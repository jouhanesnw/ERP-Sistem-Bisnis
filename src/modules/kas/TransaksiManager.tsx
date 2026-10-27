'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate, monthStart, tglID } from './format'
import { formatCurrency } from '@/modules/pengaturan/currencies'
import type { Jenis, KasPerm, Kategori, Rekening, Transaksi } from './types'

const TITLE: Record<Jenis, string> = { masuk: 'Kas Masuk', keluar: 'Kas Keluar', transfer: 'Transfer Antar Rekening' }
const BUCKET = 'kas-bukti'

export default function TransaksiManager({ companyId, jenis, rekening, kategori, perm }: {
  companyId: string; jenis: Jenis; rekening: Rekening[]; kategori: Kategori[]; perm: KasPerm
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(isoDate(new Date()))
  const [rekFilter, setRekFilter] = useState('')
  const [rows, setRows] = useState<Transaksi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Transaksi | 'new' | null>(null)

  const namaRek = useMemo(() => Object.fromEntries(rekening.map((r) => [r.id, r.nama])), [rekening])
  const namaKat = useMemo(() => Object.fromEntries(kategori.map((k) => [k.id, k.nama])), [kategori])

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('kas_transaksi').select('*').eq('company_id', companyId).eq('jenis', jenis)
      .gte('tanggal', from).lte('tanggal', to)
      .order('tanggal', { ascending: false }).order('created_at', { ascending: false })
    if (rekFilter) q = q.or(`rekening_id.eq.${rekFilter},rekening_tujuan_id.eq.${rekFilter}`)
    const { data, error } = await q
    setLoading(false)
    if (error) return setError(error.message)
    setError(null); setRows((data ?? []) as Transaksi[])
  }, [sb, companyId, jenis, from, to, rekFilter])
  useEffect(() => { load() }, [load])

  async function openBukti(path: string) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60)
    if (error) return setError(error.message)
    window.open(data.signedUrl, '_blank')
  }
  async function remove(r: Transaksi) {
    if (!confirm('Hapus transaksi ini?')) return
    const { error } = await sb.from('kas_transaksi').delete().eq('id', r.id)
    if (error) return setError(error.message)
    if (r.bukti_path) await sb.storage.from(BUCKET).remove([r.bukti_path])
    load()
  }

  const total = Object.entries(rows.reduce<Record<string, number>>((acc, row) => { const code = row.currency_code || 'IDR'; acc[code] = (acc[code] ?? 0) + Number(row.jumlah); return acc }, {})).map(([code, amount]) => formatCurrency(amount, code)).join(' · ') || formatCurrency(0, 'IDR')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{TITLE[jenis]}</h1>
        {perm.create && (rekening.some((r) => r.aktif)
          ? <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}><Plus size={16} />Tambah</button>
          : <Link href="/kas/rekening" className="btn ml-auto">Buat rekening dulu</Link>)}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Rekening
          <select className="input mt-1" value={rekFilter} onChange={(e) => setRekFilter(e.target.value)}>
            <option value="">Semua</option>
            {rekening.map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.currency_code || 'IDR'})</option>)}
          </select>
        </label>
        <p className="ml-auto text-sm text-ink/60">{rows.length} transaksi · Total <b className="text-ink">{total}</b></p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && (
        <TransaksiForm key={form === 'new' ? 'new' : form.id} sb={sb} companyId={companyId} jenis={jenis}
          rekening={rekening.filter((r) => r.aktif || (form !== 'new' && (r.id === form.rekening_id || r.id === form.rekening_tujuan_id)))}
          kategori={kategori.filter((k) => k.jenis === jenis && (k.aktif || (form !== 'new' && k.id === form.kategori_id)))}
          initial={form === 'new' ? null : form}
          onDone={() => { setForm(null); load() }} onCancel={() => setForm(null)} />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Tanggal</th><th className="p-3 font-medium">Keterangan</th>
            <th className="p-3 font-medium">Rekening</th><th className="p-3 text-right font-medium">Jumlah</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap p-3">{tglID(r.tanggal)}</td>
                <td className="p-3">{r.keterangan || '—'}{r.kategori_id && <span className="block text-xs text-ink/50">{namaKat[r.kategori_id]}</span>}</td>
                <td className="p-3">{r.jenis === 'transfer' ? `${namaRek[r.rekening_id]} → ${namaRek[r.rekening_tujuan_id!]}` : namaRek[r.rekening_id]}</td>
                <td className="p-3 text-right tabular-nums">{formatCurrency(Number(r.jumlah), r.currency_code || 'IDR')}</td>
                <td className="space-x-1 whitespace-nowrap p-3 text-right">
                  {r.bukti_path && <button className="btn px-2" onClick={() => openBukti(r.bukti_path!)} aria-label="Lihat bukti"><Paperclip size={15} /></button>}
                  {perm.edit && <button className="btn px-2" onClick={() => setForm(r)} aria-label="Ubah"><Pencil size={15} /></button>}
                  {perm.delete && <button className="btn px-2" onClick={() => remove(r)} aria-label="Hapus"><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="p-6 text-center text-ink/60">{loading ? 'Memuat…' : 'Belum ada transaksi pada periode ini.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TransaksiForm({ sb, companyId, jenis, rekening, kategori, initial, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; companyId: string; jenis: Jenis; rekening: Rekening[]; kategori: Kategori[]
  initial: Transaksi | null; onDone: () => void; onCancel: () => void
}) {
  const [tanggal, setTanggal] = useState(initial?.tanggal ?? isoDate(new Date()))
  const [asal, setAsal] = useState(initial?.rekening_id ?? rekening[0]?.id ?? '')
  const [tujuan, setTujuan] = useState(initial?.rekening_tujuan_id ?? '')
  const currencyCode = rekening.find((r) => r.id === asal)?.currency_code ?? initial?.currency_code ?? 'IDR'
  const [kat, setKat] = useState(initial?.kategori_id ?? '')
  const [jumlah, setJumlah] = useState(initial ? String(initial.jumlah) : '')
  const [ket, setKet] = useState(initial?.keterangan ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (jenis === 'transfer' && (!tujuan || tujuan === asal)) return setError('Rekening tujuan harus dipilih dan berbeda dari rekening asal.')
    setBusy(true)
    let bukti = initial?.bukti_path ?? null
    if (file) {
      const path = `${companyId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await sb.storage.from(BUCKET).upload(path, file)
      if (up.error) { setBusy(false); return setError(up.error.message) }
      if (bukti) await sb.storage.from(BUCKET).remove([bukti])
      bukti = path
    }
    const payload = {
      company_id: companyId, jenis, tanggal, rekening_id: asal,
      rekening_tujuan_id: jenis === 'transfer' ? tujuan : null,
      kategori_id: jenis === 'transfer' ? null : kat || null,
      jumlah: Number(jumlah), keterangan: ket || null, bukti_path: bukti, currency_code: currencyCode,
    }
    const { error } = initial ? await sb.from('kas_transaksi').update(payload).eq('id', initial.id) : await sb.from('kas_transaksi').insert(payload)
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
      <label className="text-sm">Jumlah ({currencyCode})<input type="number" min="1" step="1" className="input mt-1" value={jumlah} onChange={(e) => setJumlah(e.target.value)} required /></label>
      <label className="text-sm">{jenis === 'transfer' ? 'Dari rekening' : 'Rekening'}
        <select className="input mt-1" value={asal} onChange={(e) => setAsal(e.target.value)} required>
          {rekening.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
      </label>
      {jenis === 'transfer' ? (
        <label className="text-sm">Ke rekening
          <select className="input mt-1" value={tujuan} onChange={(e) => setTujuan(e.target.value)} required>
            <option value="">Pilih rekening</option>
            {rekening.filter((r) => r.id !== asal && r.currency_code === currencyCode).map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.currency_code})</option>)}
          </select>
        </label>
      ) : (
        <label className="text-sm">Kategori
          <select className="input mt-1" value={kat} onChange={(e) => setKat(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {kategori.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </label>
      )}
      <label className="text-sm sm:col-span-2">Keterangan<input className="input mt-1" value={ket} onChange={(e) => setKet(e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Bukti (foto atau PDF){initial?.bukti_path && ' — sudah ada, pilih file baru untuk menggantinya'}
        <input type="file" accept="image/*,application/pdf" className="input mt-1" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="btn" onClick={onCancel}>Batal</button>
      </div>
    </form>
  )
}
