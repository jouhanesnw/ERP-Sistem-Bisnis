'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { addDays, isoDate, tglID } from '@/lib/format'
import { formatCurrency, type ActiveCurrency } from '@/modules/pengaturan/currencies'
import type { PaymentTerm } from '@/modules/pengaturan/paymentTerms'
import type { ShippingMethod } from '@/modules/pengaturan/shipping'
import type { Dokumen, Item, Jenis, Pelanggan, PjPerm, RekeningPilihan } from './types'


const MODUL = 'penjualan'
type ProdukPilihan = { id: string; kode: string | null; nama: string; satuan: string; harga_jual: number; harga_beli: number; stok: number; lacak_stok: boolean; aktif: boolean }
type GudangPilihan = { id: string; kode: string; nama: string; is_default: boolean }
const fmtN = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)

export default function DokumenManager({ companyId, jenis, pelanggan, initialRows, initialError, perm, currencies, shippingMethods }: {
  companyId: string; jenis: Jenis; pelanggan: Pelanggan[]; initialRows: Dokumen[]; initialError: string | null; perm: PjPerm; currencies: ActiveCurrency[]; shippingMethods: ShippingMethod[]
}) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()
  const isFaktur = jenis === 'faktur'
  const [rows, setRows] = useState<Dokumen[]>(initialRows)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [filter, setFilter] = useState('semua')
  const [form, setForm] = useState<{ doc: Dokumen | null; items: Item[] } | null>(null)
  const [bayar, setBayar] = useState<Dokumen | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const previousRange = useRef({ from, to })

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('pj_dokumen_v').select('*').eq('company_id', companyId).eq('jenis', jenis)
      .order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(500)
    if (from) q = q.gte('tanggal', from)
    if (to) q = q.lte('tanggal', to)
    const { data, error } = await q
    setLoading(false)
    if (error) return setError(error.message)
    setError(null); setRows((data ?? []) as Dokumen[])
  }, [sb, companyId, jenis, from, to])
  useEffect(() => {
    // The initial document list is rendered by the server. Fetch again only when
    // the user changes the date range, or after an explicit mutation calls load().
    if (previousRange.current.from === from && previousRange.current.to === to) return
    previousRange.current = { from, to }
    load()
  }, [from, to, load])

  const visible = rows.filter((d) => filter === 'semua' || (filter === 'belum' ? d.status === 'terbit' && d.sisa > 0 : filter === 'lunas' ? d.status === 'terbit' && d.sisa <= 0 : d.status === filter))
  const piutangByCurrency = rows.filter((d) => d.status === 'terbit').reduce<Record<string, number>>((acc, d) => { const code = d.currency_code || 'IDR'; acc[code] = (acc[code] ?? 0) + Number(d.sisa); return acc }, {})
  const piutang = Object.entries(piutangByCurrency).map(([code, amount]) => formatCurrency(amount, code)).join(' · ') || formatCurrency(0, 'IDR')

  async function openForm(doc: Dokumen | null) {
    if (!doc) return setForm({ doc: null, items: [{ deskripsi: '', qty: 1, harga: 0 }] })
    const { data, error } = await sb.from('pj_dokumen_item').select('deskripsi, qty, harga, produk_id').eq('dokumen_id', doc.id).order('urutan')
    if (error) return setError(error.message)
    setForm({ doc, items: (data ?? []) as Item[] })
  }
  async function status(doc: Dokumen, next: string) {
    if (!confirm(`Ubah status ${doc.nomor} menjadi ${next}?`)) return
    const { error } = await sb.from('pj_dokumen').update({ status: next }).eq('id', doc.id)
    if (error) return setError(error.message)
    load()
  }
  async function remove(doc: Dokumen) {
    if (!confirm(`Hapus ${doc.nomor}?`)) return
    const { error } = await sb.from('pj_dokumen').delete().eq('id', doc.id)
    if (error) return setError(error.message)
    load()
  }
  async function keFaktur(doc: Dokumen) {
    if (!confirm(`Buat faktur dari ${doc.nomor}?`)) return
    const { error } = await sb.rpc('pj_penawaran_ke_faktur', { p_id: doc.id })
    if (error) return setError(error.message)
    router.push('/penjualan/faktur')
    load()
  }
  const canEdit = (d: Dokumen) => perm.edit && (!isFaktur || d.status === 'draft')
  const customerList = pelanggan.filter((p) => p.aktif)

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><div>
      <h1 className="text-2xl font-semibold">{isFaktur ? 'Faktur Penjualan' : 'Penawaran'}</h1>
      {isFaktur && <p className="text-sm text-ink/60">Piutang belum dibayar: <b className="text-ink">{piutang}</b></p>}
    </div>
    {perm.create && (customerList.length ? <button className="btn btn-primary ml-auto" onClick={() => openForm(null)}><Plus size={16} />Buat {isFaktur ? 'faktur' : 'penawaran'}</button> : <Link className="btn ml-auto" href="/penjualan/pelanggan">Tambah pelanggan dulu</Link>)}
    </div>
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="text-sm">Status<select className="input mt-1" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="semua">Semua</option><option value="draft">Draft</option>{isFaktur ? <><option value="belum">Belum lunas</option><option value="lunas">Lunas</option><option value="batal">Batal</option></> : <><option value="terkirim">Terkirim</option><option value="diterima">Diterima</option><option value="ditolak">Ditolak</option></>}
      </select></label>
      <p className="ml-auto text-sm text-ink/60">{visible.length} dokumen</p>
    </div>
    {error && <p className="text-sm text-red-600">{error}</p>}
    {form && <DokumenForm key={form.doc?.id ?? 'new'} sb={sb} companyId={companyId} jenis={jenis} currencies={currencies} shippingMethods={shippingMethods} pelanggan={customerList.concat(pelanggan.filter((p) => !p.aktif && p.id === form.doc?.pelanggan_id))} doc={form.doc} items={form.items} onDone={() => { setForm(null); load() }} onCancel={() => setForm(null)} />}
    {bayar && <BayarForm key={bayar.id} sb={sb} companyId={companyId} dokumen={bayar} onDone={() => { setBayar(null); load() }} onCancel={() => setBayar(null)} />}
    <div className="card overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b border-line text-ink/60"><th className="p-3">Nomor</th><th className="p-3">Pelanggan</th><th className="p-3">Ekspedisi</th><th className="p-3">{isFaktur ? 'Jatuh tempo' : 'Berlaku sampai'}</th><th className="p-3 text-right">Total</th>{isFaktur && <th className="p-3 text-right">Sisa</th>}<th className="p-3">Status</th><th className="p-3" /></tr></thead>
      <tbody>{visible.map((d) => <tr key={d.id} className="border-b border-line align-top last:border-0">
        <td className="whitespace-nowrap p-3">{d.nomor}<span className="block text-xs text-ink/50">{tglID(d.tanggal)}</span></td><td className="p-3">{d.pelanggan_nama}</td><td className="p-3">{d.shipping_name || '—'}</td><td className="whitespace-nowrap p-3">{d.batas_tanggal ? tglID(d.batas_tanggal) : '—'}</td>
        <td className="p-3 text-right tabular-nums">{formatCurrency(Number(d.total), d.currency_code || 'IDR')}</td>{isFaktur && <td className="p-3 text-right tabular-nums">{d.status === 'terbit' ? formatCurrency(Number(d.sisa), d.currency_code || 'IDR') : '—'}</td>}
        <td className="p-3"><span className="rounded bg-canvas px-2 py-1 text-xs">{d.status === 'terbit' && d.sisa <= 0 ? 'Lunas' : d.status}</span></td>
        <td className="p-3"><div className="flex flex-wrap justify-end gap-1.5">
          <button className="btn" onClick={() => window.open(`/cetak/penjualan/${d.id}`, '_blank')}>Cetak</button>
          {canEdit(d) && <button className="btn" onClick={() => openForm(d)}>Ubah</button>}
          {perm.edit && isFaktur && d.status === 'draft' && <button className="btn" onClick={() => status(d, 'terbit')}>Terbitkan</button>}
          {perm.create && isFaktur && d.status === 'terbit' && d.sisa > 0 && <button className="btn btn-primary" onClick={() => setBayar(d)}>Bayar</button>}
          {perm.edit && isFaktur && d.status === 'terbit' && d.terbayar === 0 && <button className="btn" onClick={() => status(d, 'batal')}>Batalkan</button>}
          {perm.edit && !isFaktur && d.status === 'draft' && <button className="btn" onClick={() => status(d, 'terkirim')}>Tandai terkirim</button>}
          {perm.edit && !isFaktur && d.status === 'terkirim' && <><button className="btn" onClick={() => status(d, 'diterima')}>Diterima</button><button className="btn" onClick={() => status(d, 'ditolak')}>Ditolak</button></>}
          {perm.create && !isFaktur && d.status !== 'ditolak' && <button className="btn" onClick={() => keFaktur(d)}>Jadikan faktur</button>}
          {perm.delete && (!isFaktur || d.status === 'draft' || d.status === 'batal') && <button className="btn px-2" onClick={() => remove(d)} aria-label="Hapus"><Trash2 size={15} /></button>}
        </div></td>
      </tr>)}
      {!visible.length && <tr><td colSpan={isFaktur ? 8 : 7} className="p-6 text-center text-ink/60">{loading ? 'Memuat…' : 'Belum ada data.'}</td></tr>}</tbody>
    </table></div>
  </div>
}

function DokumenForm({ sb, companyId, jenis, pelanggan, currencies, shippingMethods, doc, items: initialItems, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; companyId: string; jenis: Jenis; pelanggan: Pelanggan[]; currencies: ActiveCurrency[]; shippingMethods: ShippingMethod[]; doc: Dokumen | null; items: Item[]; onDone: () => void; onCancel: () => void
}) {
  const today = isoDate(new Date())
  const [pel, setPel] = useState(doc?.pelanggan_id ?? pelanggan[0]?.id ?? '')
  const [currencyCode, setCurrencyCode] = useState(doc?.currency_code ?? currencies.find((c) => c.is_default)?.code ?? currencies[0]?.code ?? 'IDR')
  const [shippingMethodId, setShippingMethodId] = useState(doc?.shipping_method_id ?? '')
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([])
  const [paymentTermsId, setPaymentTermsId] = useState(doc?.payment_terms_id ?? '')
  const [tanggal, setTanggal] = useState(doc?.tanggal ?? today)
  const [batas, setBatas] = useState(doc?.batas_tanggal ?? addDays(today, 14))
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
  const selectedPaymentTerm = paymentTerms.find((term) => term.id === paymentTermsId)
  function changePaymentTerm(id: string) {
    setPaymentTermsId(id)
    const term = paymentTerms.find((item) => item.id === id)
    if (jenis === 'faktur' && term) setBatas(addDays(tanggal, term.due_days))
  }
  const subtotal = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.harga || 0), 0)
  const setItem = (idx: number, patch: Partial<Item>) => setItems((old) => old.map((it, i) => i === idx ? { ...it, ...patch } : it))
  function pilihProduk(idx: number, id: string) {
    const p = produk.find((x) => x.id === id)
    if (!p) return setItem(idx, { produk_id: null })
    setItem(idx, { produk_id: p.id, deskripsi: p.nama, harga: p.harga_jual })
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error } = await sb.rpc('pj_simpan_dokumen', { p: { id: doc?.id ?? null, company_id: companyId, jenis, pelanggan_id: pel, gudang_id: gudangId, tanggal, batas_tanggal: batas || null, ppn_persen: Number(ppn), catatan, currency_code: currencyCode, payment_terms_id: paymentTermsId || null, shipping_method_id: shippingMethodId || null, items: items.map((i) => ({ deskripsi: i.deskripsi, qty: Number(i.qty), harga: Number(i.harga || 0), produk_id: i.produk_id ?? null })) } })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }
  return <form onSubmit={submit} className="card space-y-4 p-4">
    <h2 className="font-medium">{doc ? `Ubah ${doc.nomor}` : `Buat ${jenis === 'faktur' ? 'faktur' : 'penawaran'}`}</h2>
    <label className="block text-sm">Gudang pengeluaran barang
      <select className="input mt-1" value={gudangId} onChange={(e) => setGudangId(e.target.value)} required>
        {gudang.map((g) => <option key={g.id} value={g.id}>{g.nama}{g.is_default ? ' (utama)' : ''}</option>)}
      </select>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Pelanggan<select className="input mt-1" value={pel} onChange={(e) => setPel(e.target.value)} required>{pelanggan.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}</select></label>
      <label className="text-sm">Mata uang<select className="input mt-1" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} required>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></label>
      <label className="text-sm">Pengiriman / Ekspedisi<select className="input mt-1" value={shippingMethodId} onChange={(e) => setShippingMethodId(e.target.value)}><option value="">Tidak dipilih</option>{shippingMethods.filter((item) => item.active || item.id === shippingMethodId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (nonaktif)'}</option>)}</select></label>
      <label className="text-sm">Syarat Pembayaran<select className="input mt-1" value={paymentTermsId} onChange={(e) => changePaymentTerm(e.target.value)} required disabled={!paymentTerms.length}><option value="">{paymentTerms.length ? 'Pilih syarat pembayaran' : 'Memuat syarat pembayaran…'}</option>{paymentTerms.map((term) => <option key={term.id} value={term.id}>{term.name}{term.is_default ? ' (default)' : ''}</option>)}</select>{selectedPaymentTerm && <span className="mt-1 block text-xs text-ink/55">Jatuh tempo {selectedPaymentTerm.due_days} hari{Number(selectedPaymentTerm.discount_percent) > 0 ? `; diskon ${fmtN(Number(selectedPaymentTerm.discount_percent))}% jika dibayar dalam ${selectedPaymentTerm.discount_days} hari` : ''}</span>}</label>
      <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={(e) => { const value = e.target.value; setTanggal(value); if (jenis === 'faktur' && selectedPaymentTerm) setBatas(addDays(value, selectedPaymentTerm.due_days)) }} required /></label>
      <label className="text-sm">{jenis === 'faktur' ? 'Jatuh tempo' : 'Berlaku sampai'}<input type="date" className="input mt-1" value={batas} onChange={(e) => setBatas(e.target.value)} /></label>
    </div>
    <div className="space-y-2">{items.map((it, idx) => <div key={idx} className="grid grid-cols-12 gap-2">
      <select className="input col-span-12 sm:col-span-3" value={it.produk_id ?? ''} onChange={(e) => pilihProduk(idx, e.target.value)} aria-label="Produk">
            <option value="">Teks bebas</option>
            {produk.filter((p) => p.aktif || p.id === it.produk_id).map((p) => <option key={p.id} value={p.id}>{p.kode ? p.kode + ' · ' : ''}{p.nama}</option>)}
          </select>
          <input className="input col-span-12 sm:col-span-4" placeholder="Barang atau jasa" value={it.deskripsi} onChange={(e) => setItem(idx, { deskripsi: e.target.value })} required aria-label="Deskripsi" />
      <input className="input col-span-4 sm:col-span-2" type="number" min="0.01" step="any" value={it.qty} onChange={(e) => setItem(idx, { qty: e.target.value })} required aria-label="Jumlah" />
      <input className="input col-span-6 sm:col-span-3" type="number" min="0" step="1" value={it.harga} onChange={(e) => setItem(idx, { harga: e.target.value })} required aria-label="Harga satuan" />
      {produk.find((p) => p.id === it.produk_id)?.lacak_stok && <p className="col-span-12 text-xs text-ink/50">Stok tercatat: {fmtN(Number(produk.find((p) => p.id === it.produk_id)?.stok ?? 0))} {produk.find((p) => p.id === it.produk_id)?.satuan}</p>}
      <button type="button" className="btn col-span-2 px-2" disabled={items.length === 1} onClick={() => setItems((old) => old.filter((_, i) => i !== idx))} aria-label="Hapus baris"><Trash2 size={15} /></button>
    </div>)}
      <button type="button" className="btn" onClick={() => setItems((old) => [...old, { deskripsi: '', qty: 1, harga: 0 }])}><Plus size={15} />Tambah baris</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Catatan<input className="input mt-1" value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label><label className="text-sm">PPN (%)<input className="input mt-1" type="number" min="0" max="100" step="any" value={ppn} onChange={(e) => setPpn(e.target.value)} /></label></div>
    <p className="text-right text-sm text-ink/60">Subtotal {formatCurrency(subtotal, currencyCode)} · Total {formatCurrency(Math.round(subtotal * (1 + Number(ppn || 0) / 100)), currencyCode)}</p>
    {error && <p className="text-sm text-red-600">{error}</p>}
    <div className="flex gap-2"><button className="btn btn-primary" disabled={busy || !pel || !gudangId || !paymentTermsId}>{busy ? 'Menyimpan…' : 'Simpan'}</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
  </form>
}

function BayarForm({ sb, companyId, dokumen, onDone, onCancel }: {
  sb: ReturnType<typeof supabaseBrowser>; companyId: string; dokumen: Dokumen; onDone: () => void; onCancel: () => void
}) {
  const [tanggal, setTanggal] = useState(isoDate(new Date()))
  const [jumlah, setJumlah] = useState(String(dokumen.sisa))
  const [rekening, setRekening] = useState<RekeningPilihan[]>([])
  const [loadingRekening, setLoadingRekening] = useState(true)
  const [rek, setRek] = useState('')
  const [catatan, setCatatan] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let current = true
    sb.rpc('pj_rekening_pilihan', { cid: companyId }).then(({ data, error }) => {
      if (!current) return
      setLoadingRekening(false)
      if (error) return setError(error.message)
      const list = ((data ?? []) as RekeningPilihan[]).filter((item) => item.aktif && item.currency_code === (dokumen.currency_code || 'IDR'))
      setRekening(list)
      setRek((old) => old || list[0]?.id || '')
    })
    return () => { current = false }
  }, [sb, companyId])
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const { error } = await sb.rpc('pj_catat_pembayaran', { p_dokumen: dokumen.id, p_tanggal: tanggal, p_jumlah: Number(jumlah), p_rekening: rek, p_catatan: catatan || null })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }
  return <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
    <h2 className="font-medium sm:col-span-2">Pembayaran {dokumen.nomor} · sisa {formatCurrency(dokumen.sisa, dokumen.currency_code || 'IDR')}</h2>
    <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></label>
    <label className="text-sm">Jumlah ({dokumen.currency_code || 'IDR'})<input type="number" min="1" max={dokumen.sisa} step="1" className="input mt-1" value={jumlah} onChange={(e) => setJumlah(e.target.value)} required /></label>
    <label className="text-sm">Masuk ke rekening<select className="input mt-1" value={rek} onChange={(e) => setRek(e.target.value)} required disabled={loadingRekening || !rekening.length}><option value="">{loadingRekening ? 'Memuat rekening…' : 'Pilih rekening'}</option>{rekening.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</select></label>
    <label className="text-sm">Catatan<input className="input mt-1" value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
    {!loadingRekening && !rekening.length && !error && <p className="text-sm text-red-600 sm:col-span-2">Belum ada rekening aktif dengan mata uang {dokumen.currency_code || 'IDR'}. Buat rekening dengan mata uang yang sama di Kas &gt; Rekening Kas.</p>}
    {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
    <div className="flex gap-2 sm:col-span-2"><button className="btn btn-primary" disabled={busy || !rek}>{busy ? 'Menyimpan…' : 'Catat pembayaran'}</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
  </form>
}
