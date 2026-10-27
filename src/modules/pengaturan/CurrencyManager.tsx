'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { getAllCurrencyOptions, type CompanyCurrency, type CurrencyOption } from './currencies'

export default function CurrencyManager({ companyId, initial, initialError }: {
  companyId: string
  initial: CompanyCurrency[]
  initialError: string | null
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const options = useMemo(() => getAllCurrencyOptions(), [])
  const [savedRows, setSavedRows] = useState(initial)
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() => [...new Set(['IDR', ...initial.filter((c) => c.is_active).map((c) => c.code)])])
  const [selectedToAdd, setSelectedToAdd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [info, setInfo] = useState<string | null>(null)

  const optionMap = useMemo(() => new Map(options.map((x) => [x.code, x])), [options])
  const visibleCurrencies = selectedCodes.map((code) => optionMap.get(code) ?? savedRows.find((row) => row.code === code) ?? { code, name: code, symbol: code })
    .sort((a, b) => a.code.localeCompare(b.code))
  const hasChanges = selectedCodes.length !== savedRows.filter((row) => row.is_active).length
    || selectedCodes.some((code) => !savedRows.some((row) => row.code === code && row.is_active))

  function addCurrency() {
    if (!selectedToAdd || selectedCodes.includes(selectedToAdd)) return
    setSelectedCodes((current) => [...current, selectedToAdd])
    setSelectedToAdd('')
    setInfo(null)
    setError(null)
  }

  function removeCurrency(code: string) {
    if (code === 'IDR') return
    setSelectedCodes((current) => current.filter((item) => item !== code))
    setInfo(null)
    setError(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    const rows = selectedCodes.map((code) => {
      const option: CurrencyOption | undefined = optionMap.get(code)
      const previous = savedRows.find((row) => row.code === code)
      return {
        company_id: companyId,
        code,
        name: option?.name ?? previous?.name ?? code,
        symbol: option?.symbol ?? previous?.symbol ?? code,
        is_default: code === 'IDR',
        is_active: true,
      }
    })

    const { error: upsertError } = await sb.from('company_currencies').upsert(rows, { onConflict: 'company_id,code' })
    if (upsertError) {
      setBusy(false)
      setError(upsertError.message.includes('company_currencies')
        ? 'Tabel mata uang belum tersedia. Jalankan migrasi 012_mata_uang.sql di Supabase SQL Editor terlebih dahulu.'
        : upsertError.message)
      return
    }

    const toDeactivate = savedRows.filter((row) => row.is_active && !selectedCodes.includes(row.code) && !row.is_default)
    for (const row of toDeactivate) {
      const { error: updateError } = await sb.from('company_currencies').update({ is_active: false }).eq('company_id', companyId).eq('code', row.code)
      if (updateError) {
        setBusy(false)
        setError(updateError.message)
        return
      }
    }

    const { data, error: loadError } = await sb.from('company_currencies')
      .select('id, company_id, code, name, symbol, is_default, is_active')
      .eq('company_id', companyId)
      .order('code')
    setBusy(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setSavedRows((data ?? []) as CompanyCurrency[])
    setSelectedCodes([...new Set(['IDR', ...(data ?? []).filter((row: any) => row.is_active).map((row: any) => row.code)])])
    setInfo('Mata uang berhasil disimpan. Mata uang aktif sekarang tersedia untuk dipilih pada transaksi yang mendukung mata uang.')
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Mata Uang</h1>
        <p className="mt-1 text-sm text-ink/60">Pilih mata uang yang digunakan perusahaan. Hanya mata uang yang disimpan dan aktif yang ditampilkan pada formulir transaksi.</p>
      </div>

      {initialError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Tidak dapat membaca daftar mata uang. Pastikan migrasi <code>012_mata_uang.sql</code> sudah dijalankan di Supabase. Detail: {initialError}
        </div>
      )}
      {error && !initialError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{info}</p>}

      <form onSubmit={save} className="card space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium">Pilih mata uang
            <select className="input mt-1" value={selectedToAdd} onChange={(e) => setSelectedToAdd(e.target.value)}>
              <option value="">Pilih dari daftar seluruh mata uang…</option>
              {options.map((currency) => (
                <option key={currency.code} value={currency.code} disabled={selectedCodes.includes(currency.code)}>
                  {currency.code} — {currency.name} ({currency.symbol})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" disabled={!selectedToAdd || selectedCodes.includes(selectedToAdd) || !!initialError} onClick={addCurrency}>
            <Plus size={16} /> Tambah
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-line bg-canvas text-ink/60">
              <th className="p-3 font-medium">Kode</th>
              <th className="p-3 font-medium">Mata uang</th>
              <th className="p-3 font-medium">Simbol</th>
              <th className="p-3 font-medium">Penggunaan</th>
              <th className="p-3" />
            </tr></thead>
            <tbody>
              {visibleCurrencies.map((currency) => {
                const saved = savedRows.some((row) => row.code === currency.code && row.is_active)
                const isDefault = currency.code === 'IDR'
                return (
                  <tr key={currency.code} className="border-b border-line last:border-0">
                    <td className="p-3 font-semibold tabular-nums">{currency.code}</td>
                    <td className="p-3">{currency.name}</td>
                    <td className="p-3">{currency.symbol}</td>
                    <td className="p-3">
                      {isDefault
                        ? <span className="rounded bg-brand-soft px-2 py-1 text-xs font-medium text-brand-dark">Default perusahaan</span>
                        : saved
                          ? <span className="text-xs text-green-700">Tersimpan</span>
                          : <span className="text-xs text-amber-700">Belum disimpan</span>}
                    </td>
                    <td className="p-3 text-right">
                      {!isDefault && <button type="button" className="btn px-2" onClick={() => removeCurrency(currency.code)} aria-label={'Hapus ' + currency.code} title="Hapus dari pilihan aktif"><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                )
              })}
              {!visibleCurrencies.length && <tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada mata uang dipilih.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink/60">IDR (Rupiah Indonesia) menjadi mata uang default dan tidak bisa dihapus. Menonaktifkan mata uang tidak menghapus riwayat transaksi lama.</p>
          <button className="btn btn-primary" disabled={busy || !!initialError || !hasChanges}>
            <Save size={16} /> {busy ? 'Menyimpan…' : 'Simpan mata uang'}
          </button>
        </div>
      </form>
    </div>
  )
}
