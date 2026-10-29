'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { AkPerm, Akun, KategoriKas } from './types'

const TIPE = [
  ['aset', 'Aset'],
  ['kewajiban', 'Kewajiban'],
  ['modal', 'Modal / Ekuitas'],
  ['pendapatan', 'Pendapatan'],
  ['beban', 'Beban'],
] as const
type MainType = Akun['tipe']
type CurrencyOption = { code: string; name: string; is_active: boolean }
const SUBTYPES: { code: string; label: string; main: MainType[] }[] = [
  { code: 'UMUM', label: 'Umum', main: ['aset', 'kewajiban', 'modal', 'pendapatan', 'beban'] },
  { code: 'BANK', label: 'Kas / Bank', main: ['aset'] },
  { code: 'AREC', label: 'Piutang Usaha', main: ['aset'] },
  { code: 'OCAS', label: 'Aset Lancar Lainnya', main: ['aset'] },
  { code: 'OASS', label: 'Aset Lainnya', main: ['aset'] },
  { code: 'FASS', label: 'Aset Tetap', main: ['aset'] },
  { code: 'DEPR', label: 'Akumulasi Penyusutan', main: ['aset'] },
  { code: 'INTR', label: 'Persediaan', main: ['aset'] },
  { code: 'APAY', label: 'Utang Usaha', main: ['kewajiban'] },
  { code: 'OCLY', label: 'Kewajiban Lancar Lainnya', main: ['kewajiban'] },
  { code: 'LTLY', label: 'Kewajiban Jangka Panjang', main: ['kewajiban'] },
  { code: 'EQTY', label: 'Ekuitas', main: ['modal'] },
  { code: 'REVE', label: 'Pendapatan', main: ['pendapatan'] },
  { code: 'OINC', label: 'Pendapatan Lainnya', main: ['pendapatan'] },
  { code: 'COGS', label: 'Harga Pokok Penjualan', main: ['beban'] },
  { code: 'EXPS', label: 'Beban Operasional', main: ['beban'] },
  { code: 'OEXP', label: 'Beban Lainnya', main: ['beban'] },
]

export default function AkunManager({ companyId, akun: initial, perm }: { companyId: string; akun: Akun[]; perm: AkPerm }) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const [akun, setAkun] = useState(initial)
  const [kategori, setKategori] = useState<KategoriKas[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([{ code: 'IDR', name: 'Rupiah Indonesia', is_active: true }])
  const [nama, setNama] = useState('')
  const [kode, setKode] = useState('')
  const [tipe, setTipe] = useState<MainType>('beban')
  const [kodeTipe, setKodeTipe] = useState('UMUM')
  const [indukId, setIndukId] = useState('')
  const [currencyCode, setCurrencyCode] = useState('IDR')
  const [catatan, setCatatan] = useState('')
  const [editing, setEditing] = useState<Akun | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadMap = useCallback(async () => {
    const [categoryResult, currencyResult] = await Promise.all([
      sb.rpc('ak_kategori_kas_pilihan', { cid: companyId }),
      sb.from('company_currencies').select('code, name, is_active').eq('company_id', companyId).eq('is_active', true).order('code'),
    ])
    if (categoryResult.error) setError(categoryResult.error.message)
    else setKategori((categoryResult.data ?? []) as KategoriKas[])
    if (currencyResult.error) setError(currencyResult.error.message)
    else {
      const available = (currencyResult.data ?? []) as CurrencyOption[]
      if (available.length) {
        setCurrencies(available)
        setCurrencyCode((current) => available.some((item) => item.code === current) ? current : (available.find((item) => item.code === 'IDR')?.code ?? available[0].code))
      }
    }
  }, [sb, companyId])
  useEffect(() => { void loadMap() }, [loadMap])

  const descendantsOfEditing = useMemo(() => {
    const excluded = new Set<string>()
    if (!editing) return excluded
    excluded.add(editing.id)
    let changed = true
    while (changed) {
      changed = false
      for (const item of akun) {
        if (item.induk_id && excluded.has(item.induk_id) && !excluded.has(item.id)) {
          excluded.add(item.id)
          changed = true
        }
      }
    }
    return excluded
  }, [editing, akun])
  const parentOptions = akun.filter((item) => item.aktif && !descendantsOfEditing.has(item.id))
  const subtypeOptions = SUBTYPES.filter((item) => item.main.includes(tipe))
  const accountNameById = useMemo(() => new Map(akun.map((item) => [item.id, item.nama])), [akun])

  function resetForm() {
    setNama(''); setKode(''); setTipe('beban'); setKodeTipe('UMUM')
    setIndukId(''); setCatatan(''); setEditing(null)
    setCurrencyCode(currencies.find((item) => item.code === 'IDR')?.code ?? currencies[0]?.code ?? 'IDR')
    setError(null)
  }
  function startCreate() {
    if (showForm && !editing) { setShowForm(false); resetForm(); return }
    resetForm(); setInfo(null); setShowForm(true)
  }
  function startEdit(account: Akun) {
    if (!perm.edit || account.sistem) return
    setEditing(account)
    setNama(account.nama)
    setKode(account.kode)
    setTipe(account.tipe)
    setKodeTipe(account.kode_tipe || 'UMUM')
    setIndukId(account.induk_id ?? '')
    setCurrencyCode(account.currency_code || 'IDR')
    setCatatan(account.catatan ?? '')
    setInfo(null); setError(null); setShowForm(true)
  }
  function handleTipeChange(value: MainType) {
    setTipe(value)
    const currentSubtype = SUBTYPES.find((item) => item.code === kodeTipe)
    if (!currentSubtype || !currentSubtype.main.includes(value)) setKodeTipe('UMUM')
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    const payload = {
      kode: kode.trim(),
      nama: nama.trim(),
      tipe,
      normal: (['aset', 'beban'].includes(tipe) ? 'debit' : 'kredit') as Akun['normal'],
      kode_tipe: kodeTipe,
      induk_id: indukId || null,
      currency_code: currencyCode,
      catatan: catatan.trim() || null,
    }
    const result = editing
      ? await sb.from('ak_akun').update(payload).eq('id', editing.id).eq('company_id', companyId).select('*').single()
      : await sb.from('ak_akun').insert({ company_id: companyId, ...payload, sistem: false, aktif: true }).select('*').single()
    setBusy(false)
    if (result.error) {
      setError(result.error.code === '23505'
        ? 'Kode akun sudah digunakan.'
        : result.error.code === '23503'
          ? 'Mata uang atau akun induk tidak valid untuk perusahaan ini.'
          : result.error.message)
      return
    }
    const saved = result.data as Akun
    setAkun((current) => {
      const next = editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]
      return next.sort((a, b) => a.kode.localeCompare(b.kode, 'id'))
    })
    setInfo(editing ? 'Perubahan akun berhasil disimpan.' : 'Akun berhasil ditambahkan.')
    setShowForm(false); resetForm(); router.refresh()
  }

  async function toggle(account: Akun) {
    const { error: updateError } = await sb.from('ak_akun').update({ aktif: !account.aktif }).eq('id', account.id).eq('company_id', companyId)
    if (updateError) { setError(updateError.message); return }
    setAkun((current) => current.map((item) => item.id === account.id ? { ...item, aktif: !account.aktif } : item))
    setInfo('Status akun diperbarui.')
  }

  async function mapCategory(id: string, accountId: string) {
    const { error: mapError } = await sb.rpc('ak_peta_kategori_kas', { p_kategori: id, p_akun: accountId || null })
    if (mapError) { setError(mapError.message); return }
    setKategori((current) => current.map((item) => item.id === id ? { ...item, ak_akun_id: accountId || null } : item))
    setInfo('Pemetaan kategori Kas disimpan. Jurnal transaksi terkait mengikuti pemetaan ini.')
  }

  const groups = useMemo(() => TIPE.map(([key, label]) => ({ key, label, items: akun.filter((account) => account.tipe === key) })), [akun])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Akun Perkiraan</h1>
          <p className="text-sm text-ink/60">Chart of Accounts dengan akun induk, tipe detail, mata uang, dan catatan.</p>
        </div>
        {perm.create && <button className="btn btn-primary ml-auto" type="button" onClick={startCreate}>{showForm ? 'Tutup Form' : 'Tambah Akun'}</button>}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        Struktur mengacu pada workbook contoh, tetapi tidak mengimpor data perusahaan tersebut. Akun Jakarta/Surabaya, piutang direksi, rekening bank, serta saldo awal tidak dibuat otomatis. Saldo awal harus dicatat melalui jurnal saldo awal yang seimbang.
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {info && <p role="status" className="text-sm text-green-700">{info}</p>}

      {showForm && (
        <form onSubmit={saveAccount} className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">Kode perkiraan
            <input className="input mt-1" value={kode} onChange={(event) => setKode(event.target.value)} required placeholder="Contoh: 6100-01" />
          </label>
          <label className="text-sm sm:col-span-2">Nama akun
            <input className="input mt-1" value={nama} onChange={(event) => setNama(event.target.value)} required placeholder="Contoh: Beban listrik" />
          </label>
          <label className="text-sm">Kelompok utama
            <select className="input mt-1" value={tipe} onChange={(event) => handleTipeChange(event.target.value as MainType)}>
              {TIPE.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">Tipe akun detail
            <select className="input mt-1" value={kodeTipe} onChange={(event) => setKodeTipe(event.target.value)}>
              {subtypeOptions.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.label}</option>)}
            </select>
          </label>
          <label className="text-sm">Akun induk (opsional)
            <select className="input mt-1" value={indukId} onChange={(event) => setIndukId(event.target.value)}>
              <option value="">Tanpa induk</option>
              {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.kode} — {item.nama}</option>)}
            </select>
          </label>
          <label className="text-sm">Mata uang akun
            <select className="input mt-1" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} required>
              {currencies.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2 xl:col-span-4">Catatan
            <textarea className="input min-h-16" value={catatan} onChange={(event) => setCatatan(event.target.value)} placeholder="Opsional: tujuan/penggunaan akun" />
          </label>
          <div className="flex items-center text-sm text-ink/60">Saldo normal otomatis: <b className="ml-1">{['aset', 'beban'].includes(tipe) ? 'debit' : 'kredit'}</b></div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 xl:col-span-4">
            <button type="button" className="btn" onClick={() => { setShowForm(false); resetForm() }}>Batal</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Akun'}</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {groups.map((group) => (
          <section key={group.key} className="card overflow-x-auto">
            <div className="border-b border-line p-3 font-semibold">{group.label} <span className="ml-1 text-sm font-normal text-ink/45">({group.items.length})</span></div>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-ink/60"><th className="p-3">Kode</th><th className="p-3">Nama akun</th><th className="p-3">Akun induk</th><th className="p-3">Tipe detail</th><th className="p-3">Mata uang</th><th className="p-3">Saldo normal</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
              <tbody>
                {group.items.map((account) => (
                  <tr key={account.id} className="border-t border-line align-top">
                    <td className="p-3 whitespace-nowrap tabular-nums">{account.kode}</td>
                    <td className="p-3 min-w-[13rem]">{account.nama}{account.sistem && <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs">Sistem</span>}{account.catatan && <p className="mt-1 max-w-xs text-xs text-ink/50">{account.catatan}</p>}</td>
                    <td className="p-3 min-w-[10rem] text-ink/65">{account.induk_id ? (accountNameById.get(account.induk_id) ?? 'Akun induk tidak ditemukan') : '—'}</td>
                    <td className="p-3 whitespace-nowrap">{account.kode_tipe || 'UMUM'}</td>
                    <td className="p-3">{account.currency_code || 'IDR'}</td>
                    <td className="p-3 capitalize">{account.normal}</td>
                    <td className="p-3">{account.aktif ? 'Aktif' : 'Nonaktif'}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {perm.edit && !account.sistem && <button className="btn" type="button" onClick={() => startEdit(account)}>Ubah</button>}
                      {perm.edit && !account.sistem && <button className="btn ml-1" type="button" onClick={() => void toggle(account)}>{account.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                    </td>
                  </tr>
                ))}
                {!group.items.length && <tr><td colSpan={8} className="p-4 text-center text-ink/50">Belum ada akun di kelompok ini.</td></tr>}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-line p-4"><h2 className="font-semibold">Pemetaan Kategori Kas</h2><p className="mt-1 text-sm text-ink/60">Pilih akun lawan untuk transaksi kas manual. Kategori yang belum dipetakan memakai akun default sistem.</p></div>
        <table className="w-full text-left text-sm">
          <thead><tr className="text-ink/60"><th className="p-3">Kategori</th><th className="p-3">Jenis</th><th className="p-3">Akun lawan</th></tr></thead>
          <tbody>
            {kategori.map((item) => (
              <tr key={item.id} className="border-t border-line"><td className="p-3">{item.nama}</td><td className="p-3 capitalize">{item.jenis}</td><td className="p-3">
                <select className="input min-w-[15rem]" value={item.ak_akun_id ?? ''} disabled={!perm.edit} onChange={(event) => void mapCategory(item.id, event.target.value)}>
                  <option value="">Akun default sistem</option>{akun.filter((account) => account.aktif).map((account) => <option key={account.id} value={account.id}>{account.kode} · {account.nama}</option>)}
                </select>
              </td></tr>
            ))}
            {!kategori.length && <tr><td colSpan={3} className="p-4 text-center text-ink/50">Belum ada kategori Kas. Buat kategori terlebih dahulu di menu Kas.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  )
}
