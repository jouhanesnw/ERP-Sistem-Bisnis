'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { addDays, isoDate, tglID } from '@/lib/format'
import { formatCurrency, type ActiveCurrency } from '@/modules/pengaturan/currencies'
import type { PaymentTerm } from '@/modules/pengaturan/paymentTerms'
import type { Dokumen, Item, Jenis, Pemasok, PbPerm, RekeningPilihan } from './types'

const LABEL: Record<string, string> = { draft: 'Draft', dipesan: 'Dipesan', diterima: 'Diterima', terbit: 'Terbit', batal: 'Batal' }
function statusLabel(d: Dokumen) {
  if (d.jenis === 'faktur' && d.status === 'terbit') {
    if (d.sisa <= 0) return 'Lunas'
    if (d.terbayar > 0) return 'Dibayar sebagian'
    if (d.batas_tanggal && d.batas_tanggal < isoDate(new Date())) return 'Lewat jatuh tempo'
    return 'Belum dibayar'
  }
  return LABEL[d.status] ?? d.status
}


const MODUL = 'pembelian'
type ProdukPilihan = { id: string; kode: string | null; nama: string; satuan: string; harga_jual: number; harga_beli: number; stok: number; lacak_stok: boolean; aktif: boolean }
type GudangPilihan = { id: string; kode: string; nama: string; is_default: boolean }
const fmtN = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)

export default function DokumenManager({ companyId, jenis, pemasok, rekening, perm, currencies }: {
  companyId: string; jenis: Jenis; pemasok: Pemasok[]; rekening: RekeningPilihan[]; perm: PbPerm; currencies: ActiveCurrency[]
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const isFaktur = jenis === 'faktur'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filter, setFilter] = useState('semua')
  const [rows, setRows] = useState<Dokumen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ doc: Dokumen | null; items: Item[] } | null>(null)
  const [bayar, setBayar] = useState<Dokumen | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('pb_dokumen_v').select('*').eq('company_id', companyId).eq('jenis', jenis)
      .order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(500)
    if (from) q = q.gte('tanggal', from)
    if (to) q = q.lte('tanggal', to)
    const { data, error } = await q
    setLoading(false)
    if (error) return setError(error.message)
    setError(null); setRows((data ?? []) as Dokumen[])
  }, [sb, companyId, jenis, from, to])
  useEffect(() => { load() }, [load])

  const filters: [string, string][] = isFaktur
    ? [['semua', 'Semua'], ['draft', 'Draft'], ['belum', 'Belum lunas'], ['lunas', 'Lunas'], ['batal', 'Batal']]
    : [['semua', 'Semua'], ['draft', 'Draft'], ['dipesan', 'Dipesan'], ['diterima', 'Diterima'], ['batal', 'Batal']]
  const visible = rows.filter((d) => {
    if (filter === 'semua') return true
    if (filter === 'belum') return d.status === 'terbit' && d.sisa > 0
    if (filter === 'lunas') return d.status === 'terbit' && d.sisa <= 0
    return d.status === filter
  })
  const utangByCurrency = rows.filter((d) => d.jenis === 'faktur' && d.status === 'terbit').reduce<Record<string, number>>((acc, d) => { const code = d.currency_code || 'IDR'; acc[code] = (acc[code] ?? 0) + Number(d.sisa); return acc }, {})
  const utang = Object.entries(utangByCurrency).map(([code, amount]) => formatCurrency(amount, code)).join(' · ') || formatCurrency(0, 'IDR')
  const pemasokAktif = pemasok.filter((p) => p.aktif)

  async function openForm(d: Dokumen | null) {
    if (!d) return setForm({ doc: null, items: [{ deskripsi: '', qty: 1, harga: '' }] })
    const { data, error } = await sb.from('pb_dokumen_item').select('deskripsi, qty, harga, produk_id').eq('dokumen_id', d.id).order('urutan')
    if (error) return setError(error.message)
    setForm({ doc: d, items: (data ?? []) as Item[] })
  }
  async function setStatus(d: Dokumen, status: string, ask?: string) {
    if (ask && !confirm(ask)) return
    const { error } = await sb.from('pb_dokumen').update({ status }).eq('id', d.id)
    if (error) return setError(error.message)
    load()
  }
  async function remove(d: Dokumen) {
    if (!confirm('Hapus ' + d.nomor + '?')) return
    const { error } = await sb.from('pb_dokumen').delete().eq('id', d.id)
    if (error) return setError(error.message)
    load()
  }
  async function keFaktur(d: Dokumen) {
    if (!confirm('Buat faktur dari ' + d.nomor + '?')) return
    const { error } = await sb.rpc('pb_pesanan_ke_faktur', { p_id: d.id })
    if (error) return setError(error.message)
    router.push('/pembelian/faktur')
    load()
  }
  const canEdit = (d: Dokumen) => perm.edit && (!isFaktur || d.status === 'draft')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isFaktur ? 'Faktur Pembelian' : 'Pesanan Pembelian'}</h1>
          {isFaktur && <p className="text-sm text-ink/60">Utang belum dibayar: <b className="text-ink">{utang}</b></p>}
        </div>
        {perm.create && (pemasokAktif.length
          ? <button className="btn btn-primary ml-auto" onClick={() => openForm(null)}><Plus size={16} />Buat {isFaktur ? 'faktur' : 'pesanan'}</button>
          : <Link href="/pembelian/pemasok" className="btn ml-auto">Tambah pemasok dulu</Link>)}
      </div>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Status<select className="input mt-1" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {filters.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        <p className="ml-auto text-sm text-ink/60">{visible.length} dokumen</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form && <DokumenForm key={form.doc?.id ?? 'new'} sb={sb} companyId={companyId} jenis={jenis} currencies={currencies}
        pemasok={pemasokAktif.concat(pemasok.filter((p) => !p.aktif && p.id === form.doc?.pemasok_id))}
        doc={form.doc} items={form.items} onDone={() => { setForm(null); load() }} onCancel={() => setForm(null)} />}
      {bayar && <BayarForm key={bayar.id} sb={sb} dokumen={bayar} rekening={rekening.filter((r) => r.aktif && r.currency_code === (bayar.currency_code || 'IDR'))}
        onDone={() => { setBayar(null); load() }} onCancel={() => setBayar(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="p-3 font-medium">Nomor</th><th className="p-3 font-medium">Pemasok</th>
            <th className="p-3 font-medium">{isFaktur ? 'Jatuh tempo' : 'Estimasi tiba'}</th>
            <th className="p-3 text-right font-medium">Total</th>{isFaktur && <th className="p-3 text-right font-medium">Sisa</th>}
            <th className="p-3 font-medium">Status</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap p-3">{d.nomor}<span className="block text-xs text-ink/50">{tglID(d.tanggal)}{d.no_referensi ? ' · ' + d.no_referensi : ''}</span></td>
                <td className="p-3">{d.pemasok_nama}</td><td className="whitespace-nowrap p-3">{d.batas_tanggal ? tglID(d.batas_tanggal) : '—'}</td>
                <td className="p-3 text-right tabular-nums">{formatCurrency(Number(d.total), d.currency_code || 'IDR')}</td>
                {isFaktur && <td className="p-3 text-right tabular-nums">{d.status === 'terbit' ? formatCurrency(Number(d.sisa), d.currency_code || 'IDR') : '—'}</td>}
                <td className="p-3"><span className="whitespace-nowrap rounded bg-canvas px-2 py-0.5 text-xs font-medium">{statusLabel(d)}</span></td>
                <td className="p-3"><div className="flex flex-wrap justify-end gap-1.5">
                  <button className="btn" onClick={() => window.open('/cetak/pembelian/' + d.id, '_blank')}>Cetak</button>
                  {canEdit(d) && <button className="btn" onClick={() => openForm(d)}>Ubah</button>}
                  {perm.edit && isFaktur && d.status === 'draft' && <button className="btn" onClick={() => setStatus(d, 'terbit', 'Terbitkan ' + d.nomor + '? Setelah terbit, faktur siap dibayar.')}>Terbitkan</button>}
                  {perm.create && isFaktur && d.status === 'terbit' && d.sisa > 0 && <button className="btn btn-primary" onClick={() => setBayar(d)}>Bayar</button>}
                  {perm.edit && isFaktur && d.status === 'terbit' && d.terbayar === 0 && <button className="btn" onClick={() => setStatus(d, 'batal', 'Batalkan ' + d.nomor + '?')}>Batalkan</button>}
                  {perm.edit && !isFaktur && d.status === 'draft' && <button className="btn" onClick={() => setStatus(d, 'dipesan')}>Tandai dipesan</button>}
                  {perm.edit && !isFaktur && d.status === 'dipesan' && <>
                    <button className="btn" onClick={() => setStatus(d, 'diterima')}>Barang diterima</button>
                    <button className="btn" onClick={() => setStatus(d, 'batal', 'Batalkan pesanan ini?')}>Batalkan</button>
                  </>}
                  {perm.create && !isFaktur && d.status !== 'batal' && <button className="btn" onClick={() => keFaktur(d)}>Jadikan faktur</button>}
                  {perm.delete && (!isFaktur || d.status === 'draft' || d.status === 'batal') && <button className="btn px-2" onClick={() => remove(d)} aria-label="Hapus"><Trash2 size={15} /></button>}
                </div></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={isFaktur ? 7 : 6} className="p-6 text-center text-ink/60">{loading ? 'Memuat…' : 'Belum ada data.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DokumenForm({ sb, companyId, jenis, pemasok, currencies, doc, items: initialItems, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; companyId: string; jenis: Jenis; pemasok: Pemasok[]; currencies: ActiveCurrency[]
  doc: Dokumen | null; items: Item[]; onDone: () => void; onCancel: () => void
}) {
  const today = isoDate(new Date())
  const [pemasokId, setPemasokId] = useState(doc?.pemasok_id ?? pemasok[0]?.id ?? '')
  const [currencyCode, setCurrencyCode] = useState(doc?.currency_code ?? currencies.find((c) => c.is_default)?.code ?? currencies[0]?.code ?? 'IDR')
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([])
  const [paymentTermsId, setPaymentTermsId] = useState(doc?.payment_terms_id ?? '')
  const [tanggal, setTanggal] = useState(doc?.tanggal ?? today)
  const [ref, setRef] = useState(doc?.no_referensi ?? '')
  const [batas, setBatas] = useState(doc ? doc.batas_tanggal ?? '' : addDays(today, 14))
  const [ppn, setPpn] = useState(String(doc?.ppn_persen ?? 0))
  const [catatan, setCatatan] = useState(doc?.catatan ?? '')
  const [items, setItems] = useState<Item[]>(initialItems)
  const [produk, setProduk] = useState<ProdukPilihan[]>([])
  const [gudang, setGudang] = useState<GudangPilihan[]>([])
  const [gudangId, setGudangId] = useState(doc?.gudang_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { sb.rpc('gd_pilihan', { cid: companyId, modul: MODUL }).then(({ data, error }) => { if (error) return setError(error.message); const list = (data ?? []) as GudangPilihan[]; setGudang(list); setGudangId((old) => old || doc?.gudang_id || list.find((g) => g.is_default)?.id || list[0]?.id || '') }) }, [sb, companyId, doc?.gudang_id])
  useEffect(() => { if (!gudangId) { setProduk([]); return } sb.rpc('pd_pilihan_gudang', { cid: companyId, modul: MODUL, gid: gudangId }).then(({ data, error }) => { if (error) return setError(error.message); setProduk((data ?? []) as ProdukPilihan[]) }) }, [sb, companyId, gudangId])
  useEffect(() => {
    let current = true
    sb.from('company_payment_terms')
      .select('id, company_id, name, discount_days, discount_percent, due_days, description, is_default, active, created_at')
      .eq('company_id', companyId).eq('active', true)
      .order('is_default', { ascending: false }).order('name')
      .then(({ data, error }) => {
        if (!current) return
        if (error) { setError(error.message); return }
        const list = (data ?? []) as PaymentTerm[]
        setPaymentTerms(list)
        const preferredId = doc?.payment_terms_id ?? list.find((term) => term.is_default)?.id ?? list[0]?.id ?? ''
        setPaymentTermsId((old) => old || preferredId)
        const preferred = list.find((term) => term.id === preferredId)
        if (!doc && jenis === 'faktur' && preferred) setBatas(addDays(today, preferred.due_days))
      })
    return () => { current = false }
  }, [sb, companyId, doc?.payment_terms_id, jenis])
  const selectedPaymentTerm = paymentTerms.find((term) => term.id === paymentTermsId)\n  function changePaymentTerm(id: string) {\n    setPaymentTermsId(id)\n    const term = paymentTerms.find((item) => item.id === id)\n    if (jenis === 'faktur' && term) setBatas(addDays(tanggal, term.due_days))\n  }\n  const subtotal = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.harga || 0), 0)
  const ppnNilai = Math.round(subtotal * Number(ppn || 0) / 100)
  const setItem = (idx: number, patch: Partial<Item>) => setItems((list) => list.map((x, i) => i === idx ? { ...x, ...patch } : x))
  function pilihProduk(idx: number, id: string) {
    const p = produk.find((x) => x.id === id)
    if (!p) return setItem(idx, { produk_id: null })
    setItem(idx, { produk_id: p.id, deskripsi: p.nama, harga: p.harga_beli })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await sb.rpc('pb_simpan_dokumen', {
      p: { id: doc?.id ?? null, company_id: companyId, jenis, pemasok_id: pemasokId, gudang_id: gudangId, no_referensi: ref, currency_code: currencyCode, payment_terms_id: paymentTermsId || null,
        tanggal, batas_tanggal: batas || null, ppn_persen: Number(ppn || 0), catatan,
        items: items.map((i) => ({ deskripsi: i.deskripsi, qty: Number(i.qty), harga: Number(i.harga || 0), produk_id: i.produk_id ?? null })) },
    })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4">
      <h2 className="font-medium">{doc ? 'Ubah ' + doc.nomor : (jenis === 'faktur' ? 'Faktur baru' : 'Pesanan baru')}</h2>
    <label className="block text-sm">Gudang penerimaan barang
      <select className="input mt-1" value={gudangId} onChange={(e) => setGudangId(e.target.value)} required>
        {gudang.map((g) => <option key={g.id} value={g.id}>{g.nama}{g.is_default ? ' (utama)' : ''}</option>)}
      </select>
    </label>
      {jenis === 'faktur' && <label className="block text-sm">No. faktur dari pemasok (opsional)<input className="input mt-1" value={ref} onChange={(e) => setRef(e.target.value)} /></label>}
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">Pemasok<select className="input mt-1" value={pemasokId} onChange={(e) => setPemasokId(e.target.value)} required>
          {pemasok.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
        </select></label>
        <label className="text-sm">Mata uang<select className="input mt-1" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} required>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></label>\n        <label className="text-sm">Syarat Pembayaran<select className="input mt-1" value={paymentTermsId} onChange={(e) => changePaymentTerm(e.target.value)} required disabled={!paymentTerms.length}><option value="">{paymentTerms.length ? 'Pilih syarat pembayaran' : 'Memuat syarat pembayaran…'}</option>{paymentTerms.map((term) => <option key={term.id} value={term.id}>{term.name}{term.is_default ? ' (default)' : ''}</option>)}</select>{selectedPaymentTerm && <span className="mt-1 block text-xs text-ink/55">Jatuh tempo {selectedPaymentTerm.due_days} hari{Number(selectedPaymentTerm.discount_percent) > 0 ? `; diskon ${fmtN(Number(selectedPaymentTerm.discount_percent))}% jika dibayar dalam ${selectedPaymentTerm.discount_days} hari` : ''}</span>}</label>
        <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={(e) => { const value = e.target.value; setTanggal(value); if (jenis === 'faktur' && selectedPaymentTerm) setBatas(addDays(value, selectedPaymentTerm.due_days)) }} required /></label>
        <label className="text-sm">{jenis === 'faktur' ? 'Jatuh tempo' : 'Estimasi tiba'}<input type="date" className="input mt-1" value={batas} onChange={(e) => setBatas(e.target.value)} /></label>
      </div>
      <div className="space-y-2">
        <div className="hidden grid-cols-12 gap-2 text-xs text-ink/60 sm:grid"><span className="col-span-6">Deskripsi</span><span className="col-span-2">Jumlah</span><span className="col-span-3">Harga satuan ({currencyCode})</span></div>
        {items.map((it, idx) => <div key={idx} className="grid grid-cols-12 gap-2">
          <select className="input col-span-12 sm:col-span-3" value={it.produk_id ?? ''} onChange={(e) => pilihProduk(idx, e.target.value)} aria-label="Produk">
            <option value="">Teks bebas</option>
            {produk.filter((p) => p.aktif || p.id === it.produk_id).map((p) => <option key={p.id} value={p.id}>{p.kode ? p.kode + ' · ' : ''}{p.nama}</option>)}
          </select>
          <input className="input col-span-12 sm:col-span-4" placeholder="Barang atau jasa" value={it.deskripsi} onChange={(e) => setItem(idx, { deskripsi: e.target.value })} required aria-label="Deskripsi" />
          <input className="input col-span-4 sm:col-span-2" type="number" min="0.01" step="any" value={it.qty} onChange={(e) => setItem(idx, { qty: e.target.value })} required aria-label="Jumlah" />
          <input className="input col-span-6 sm:col-span-3" type="number" min="0" step="1" value={it.harga} onChange={(e) => setItem(idx, { harga: e.target.value })} required aria-label="Harga satuan" />
          {produk.find((p) => p.id === it.produk_id)?.lacak_stok && <p className="col-span-12 text-xs text-ink/50">Stok tercatat: {fmtN(Number(produk.find((p) => p.id === it.produk_id)?.stok ?? 0))} {produk.find((p) => p.id === it.produk_id)?.satuan}</p>}
      <button type="button" className="btn col-span-2 px-2 sm:col-span-1" disabled={items.length === 1} onClick={() => setItems((list) => list.filter((_, i) => i !== idx))} aria-label="Hapus baris"><Trash2 size={15} /></button>
        </div>)}
        <button type="button" className="btn" onClick={() => setItems((list) => [...list, { deskripsi: '', qty: 1, harga: '' }])}><Plus size={15} />Tambah baris</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Catatan<input className="input mt-1" value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
        <div className="space-y-1 text-sm sm:text-right">
          <label className="inline-flex items-center gap-2">PPN (%)<input type="number" min="0" max="100" step="any" className="input w-20" value={ppn} onChange={(e) => setPpn(e.target.value)} /></label>
          <p className="text-ink/60">Subtotal {formatCurrency(subtotal, currencyCode)} · PPN {formatCurrency(ppnNilai, currencyCode)}</p>
          <p className="text-base font-semibold">Total {formatCurrency(subtotal + ppnNilai, currencyCode)}</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy || !pemasokId || !gudangId || !paymentTermsId}>{busy ? 'Menyimpan…' : 'Simpan'}</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
    </form>
  )
}

function BayarForm({ sb, dokumen, rekening, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; dokumen: Dokumen; rekening: RekeningPilihan[]; onDone: () => void; onCancel: () => void
}) {
  const [tanggal, setTanggal] = useState(isoDate(new Date()))
  const [jumlah, setJumlah] = useState(String(dokumen.sisa))
  const [rek, setRek] = useState(rekening[0]?.id ?? '')
  const [catatan, setCatatan] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error } = await sb.rpc('pb_catat_pembayaran', { p_dokumen: dokumen.id, p_tanggal: tanggal, p_jumlah: Number(jumlah), p_rekening: rek, p_catatan: catatan || null })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }
  return <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
    <h2 className="font-medium sm:col-span-2">Pembayaran {dokumen.nomor} · sisa {formatCurrency(dokumen.sisa, dokumen.currency_code || 'IDR')}</h2>
    <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
    <label className="text-sm">Jumlah ({dokumen.currency_code || 'IDR'})<input type="number" min="1" max={dokumen.sisa} step="1" className="input mt-1" value={jumlah} onChange={(e) => setJumlah(e.target.value)} required /></label>
    <label className="text-sm">Bayar dari rekening<select className="input mt-1" value={rek} onChange={(e) => setRek(e.target.value)} required>{rekening.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</select></label>
    <label className="text-sm">Catatan<input className="input mt-1" value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
    {!rekening.length && <p className="text-sm text-red-600 sm:col-span-2">Belum ada rekening aktif dengan mata uang {dokumen.currency_code || 'IDR'}. Buat rekening dengan mata uang yang sama di Kas &gt; Rekening Kas.</p>}
    {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
    <div className="flex gap-2 sm:col-span-2"><button className="btn btn-primary" disabled={busy || !rek}>{busy ? 'Menyimpan…' : 'Catat pembayaran'}</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
  </form>
}
