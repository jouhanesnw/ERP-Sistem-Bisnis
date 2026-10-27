'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { formatCurrency } from '@/modules/pengaturan/currencies'
import type { ActiveCurrency } from '@/modules/pengaturan/currencies'
import type { KasPerm, Rekening } from './types'

const TIPE = { tunai: 'Tunai', bank: 'Bank', ewallet: 'E-wallet' }

export default function RekeningManager({ companyId, rekening, perm, currencies }: {
  companyId: string; rekening: Rekening[]; perm: KasPerm; currencies: ActiveCurrency[]
}) {
  const sb = supabaseBrowser()
  const router = useRouter()
  const [form, setForm] = useState<Rekening | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saldoPerMataUang = rekening.filter((r) => r.aktif).reduce<Record<string, number>>((acc, r) => {
    const code = r.currency_code || 'IDR'
    acc[code] = (acc[code] ?? 0) + Number(r.saldo)
    return acc
  }, {})
  const total = Object.entries(saldoPerMataUang).map(([code, amount]) => formatCurrency(amount, code)).join(' · ') || formatCurrency(0, 'IDR')

  async function toggle(r: Rekening) {
    const { error } = await sb.from('kas_rekening').update({ aktif: !r.aktif }).eq('id', r.id)
    if (error) return setError(error.message)
    router.refresh()
  }
  async function remove(r: Rekening) {
    if (!confirm(`Hapus rekening ${r.nama}?`)) return
    const { error } = await sb.from('kas_rekening').delete().eq('id', r.id)
    if (error) return setError(error.code === '23503' ? 'Rekening sudah dipakai transaksi. Nonaktifkan saja.' : error.message)
    setError(null); router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rekening Kas</h1>
          <p className="text-sm text-ink/60">Total saldo rekening aktif: <b className="text-ink">{total}</b></p>
        </div>
        {perm.create && <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}>Tambah rekening</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && <RekeningForm key={form === 'new' ? 'new' : form.id} companyId={companyId} initial={form === 'new' ? null : form}
        currencies={currencies} onDone={() => { setForm(null); router.refresh() }} onCancel={() => setForm(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Nama</th><th className="p-3 font-medium">Jenis</th><th className="p-3 font-medium">Mata uang</th>
            <th className="p-3 text-right font-medium">Saldo</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rekening.map((r) => (
              <tr key={r.id} className={`border-b border-line last:border-0 ${r.aktif ? '' : 'text-ink/40'}`}>
                <td className="p-3">{r.nama}{r.nomor && <span className="block text-xs text-ink/50">{r.nomor}</span>}</td>
                <td className="p-3">{TIPE[r.tipe]}{!r.aktif && ' (nonaktif)'}</td>
                <td className="p-3">{r.currency_code || 'IDR'}</td>
                <td className="p-3 text-right tabular-nums">{formatCurrency(Number(r.saldo), r.currency_code || 'IDR')}</td>
                <td className="space-x-2 p-3 text-right">
                  {perm.edit && <button className="btn" onClick={() => setForm(r)}>Ubah</button>}
                  {perm.edit && <button className="btn" onClick={() => toggle(r)}>{r.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                  {perm.delete && <button className="btn" onClick={() => remove(r)}>Hapus</button>}
                </td>
              </tr>
            ))}
            {!rekening.length && <tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada rekening. Tambahkan rekening kas, bank, atau e-wallet pertama.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RekeningForm({ companyId, initial, currencies, onDone, onCancel }: {
  companyId: string; initial: Rekening | null; currencies: ActiveCurrency[]; onDone: () => void; onCancel: () => void
}) {
  const sb = supabaseBrowser()
  const [nama, setNama] = useState(initial?.nama ?? '')
  const [tipe, setTipe] = useState<string>(initial?.tipe ?? 'bank')
  const [nomor, setNomor] = useState(initial?.nomor ?? '')
  const [saldoAwal, setSaldoAwal] = useState(String(initial?.saldo_awal ?? 0))
  const [currencyCode, setCurrencyCode] = useState(initial?.currency_code ?? currencies.find((c) => c.is_default)?.code ?? currencies[0]?.code ?? 'IDR')
  const [error, setError] = useState<string | null>(null)
  const currencyOptions = initial && !currencies.some((c) => c.code === initial.currency_code)
    ? [...currencies, { code: initial.currency_code, name: initial.currency_code, symbol: initial.currency_code, is_default: false }]
    : currencies

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { company_id: companyId, nama, tipe, nomor: nomor || null, saldo_awal: Number(saldoAwal), currency_code: currencyCode }
    const { error } = initial ? await sb.from('kas_rekening').update(payload).eq('id', initial.id) : await sb.from('kas_rekening').insert(payload)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-sm">Nama rekening<input className="input mt-1" value={nama} onChange={(e) => setNama(e.target.value)} required /></label>
      <label className="text-sm">Jenis
        <select className="input mt-1" value={tipe} onChange={(e) => setTipe(e.target.value)}>
          <option value="tunai">Tunai</option><option value="bank">Bank</option><option value="ewallet">E-wallet</option>
        </select>
      </label>
      <label className="text-sm">Mata uang rekening
        <select className="input mt-1" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} disabled={!!initial} required>
          {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
        {initial && <span className="mt-1 block text-xs text-ink/60">Mata uang rekening tidak dapat diubah setelah rekening dibuat. Buat rekening terpisah untuk mata uang lain.</span>}
      </label>
      <label className="text-sm">Nomor rekening (opsional)<input className="input mt-1" value={nomor} onChange={(e) => setNomor(e.target.value)} /></label>
      <label className="text-sm">Saldo awal ({currencyCode})<input className="input mt-1" type="number" step="any" value={saldoAwal} onChange={(e) => setSaldoAwal(e.target.value)} required /></label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary">Simpan</button>
        <button type="button" className="btn" onClick={onCancel}>Batal</button>
      </div>
    </form>
  )
}
