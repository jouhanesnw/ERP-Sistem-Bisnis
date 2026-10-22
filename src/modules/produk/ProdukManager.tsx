'use client'
import { useMemo,useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate,rupiah } from '@/lib/format'
import { fmt,statusStok } from './util'
import type { PdPerm,Produk } from './types'
const SATUAN=['lembar','meter','pcs','roll','set','paket','kg','liter']
export default function ProdukManager({companyId,produk,perm}:{companyId:string;produk:Produk[];perm:PdPerm}){
 const sb=supabaseBrowser(),router=useRouter()
 const [q,setQ]=useState(''),[filter,setFilter]=useState('aktif'),[form,setForm]=useState<Produk|'baru'|null>(null),[error,setError]=useState<string|null>(null)
 const rows=useMemo(()=>produk.filter(p=>{
  const t=q.trim().toLowerCase()
  if(filter==='aktif'&&!p.aktif)return false
  if(filter==='menipis'&&!(p.aktif&&p.lacak_stok&&p.stok<=p.stok_minimum))return false
  return !t||p.nama.toLowerCase().includes(t)||(p.kode??'').toLowerCase().includes(t)
 }),[produk,q,filter])
 async function toggle(p:Produk){const {error}=await sb.from('pd_produk').update({aktif:!p.aktif}).eq('id',p.id);if(error)return setError(error.message);router.refresh()}
 async function remove(p:Produk){if(!confirm('Hapus produk '+p.nama+'?'))return;const {error}=await sb.from('pd_produk').delete().eq('id',p.id);if(error)return setError(error.code==='23503'?'Produk sudah dipakai pada stok atau faktur. Nonaktifkan saja.':error.message);router.refresh()}
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">Daftar Produk</h1>{perm.create&&<button className="btn btn-primary ml-auto" onClick={()=>setForm('baru')}>Tambah produk</button>}</div>
  <div className="card flex flex-wrap items-end gap-3 p-4"><label className="min-w-[12rem] flex-1 text-sm">Cari produk<input className="input mt-1" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nama atau SKU"/></label>
  <label className="text-sm">Tampilkan<select className="input mt-1" value={filter} onChange={e=>setFilter(e.target.value)}><option value="aktif">Aktif</option><option value="menipis">Stok menipis/habis</option><option value="semua">Semua</option></select></label></div>
  {error&&<p className="text-sm text-red-600">{error}</p>}
  {form&&<ProdukForm key={form==='baru'?'baru':form.id} sb={sb} companyId={companyId} initial={form==='baru'?null:form} onDone={()=>{setForm(null);router.refresh()}} onCancel={()=>setForm(null)}/>}
  <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="p-3">Produk / SKU</th><th className="p-3 text-right">Harga beli</th><th className="p-3 text-right">Harga jual</th><th className="p-3 text-right">Stok</th><th className="p-3"/></tr></thead>
  <tbody>{rows.map(p=>{const s=statusStok(p);return <tr key={p.id} className="border-b border-line last:border-0"><td className="p-3">{p.nama}{!p.aktif&&' (nonaktif)'}<span className="block text-xs text-ink/50">{[p.kode,p.satuan,!p.lacak_stok?'Tanpa pelacakan stok':null].filter(Boolean).join(' · ')}</span></td>
  <td className="p-3 text-right">{rupiah(Number(p.harga_beli))}</td><td className="p-3 text-right">{rupiah(Number(p.harga_jual))}</td><td className="p-3 text-right">{p.lacak_stok?<>{fmt(Number(p.stok))} {p.satuan} {s&&<span className={'rounded px-1.5 py-0.5 text-xs '+s.c}>{s.t}</span>}</>:'—'}</td>
  <td className="p-3"><div className="flex flex-wrap justify-end gap-1.5">{perm.edit&&<button className="btn" onClick={()=>setForm(p)}>Ubah</button>}{perm.edit&&<button className="btn" onClick={()=>toggle(p)}>{p.aktif?'Nonaktifkan':'Aktifkan'}</button>}{perm.delete&&<button className="btn" onClick={()=>remove(p)}>Hapus</button>}</div></td></tr>})}
  {!rows.length&&<tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada produk.</td></tr>}</tbody></table></div>
 </div>
}
function ProdukForm({sb,companyId,initial,onDone,onCancel}:{sb:ReturnType<typeof supabaseBrowser>;companyId:string;initial:Produk|null;onDone:()=>void;onCancel:()=>void}){
 const [f,setF]=useState({kode:initial?.kode??'',nama:initial?.nama??'',satuan:initial?.satuan??'pcs',harga_beli:String(initial?.harga_beli??0),harga_jual:String(initial?.harga_jual??0),stok_minimum:String(initial?.stok_minimum??0),stok_awal:'',catatan:initial?.catatan??''})
 const [lacak,setLacak]=useState(initial?.lacak_stok??true),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const set=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement>)=>setF({...f,[k]:e.target.value})
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null)
  const payload={company_id:companyId,kode:f.kode.trim()||null,nama:f.nama.trim(),satuan:f.satuan.trim()||'pcs',harga_beli:Number(f.harga_beli||0),harga_jual:Number(f.harga_jual||0),lacak_stok:lacak,stok_minimum:Number(f.stok_minimum||0),catatan:f.catatan.trim()||null}
  let err:{message:string;code?:string}|null=null
  if(initial)err=(await sb.from('pd_produk').update(payload).eq('id',initial.id)).error
  else {const r=await sb.from('pd_produk').insert(payload).select('id').single();err=r.error;if(!err&&lacak&&Number(f.stok_awal)>0)err=(await sb.rpc('pd_sesuaikan',{p_produk:r.data!.id,p_tanggal:isoDate(new Date()),p_fisik:Number(f.stok_awal),p_ket:'Stok awal',p_jenis:'awal'})).error}
  setBusy(false);if(err)return setError(err.code==='23505'?'Kode/SKU sudah dipakai.':err.message);onDone()
 }
 return <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-3">
  <label className="text-sm">Kode / SKU<input className="input mt-1" value={f.kode} onChange={set('kode')}/></label><label className="text-sm sm:col-span-2">Nama produk<input className="input mt-1" value={f.nama} onChange={set('nama')} required/></label>
  <label className="text-sm">Satuan dasar<input list="produk-satuan" className="input mt-1" value={f.satuan} onChange={set('satuan')} required/><datalist id="produk-satuan">{SATUAN.map(s=><option key={s} value={s}/>)}</datalist></label>
  <label className="text-sm">Harga beli (Rp)<input type="number" min="0" className="input mt-1" value={f.harga_beli} onChange={set('harga_beli')}/></label><label className="text-sm">Harga jual retail (Rp)<input type="number" min="0" className="input mt-1" value={f.harga_jual} onChange={set('harga_jual')}/></label>
  <label className="flex items-start gap-2 text-sm sm:col-span-3"><input type="checkbox" className="mt-1" checked={lacak} onChange={e=>setLacak(e.target.checked)}/><span>Lacak stok<span className="block text-ink/60">Matikan untuk jasa atau barang tanpa stok.</span></span></label>
  {lacak&&<><label className="text-sm">Stok minimum<input type="number" min="0" step="any" className="input mt-1" value={f.stok_minimum} onChange={set('stok_minimum')}/></label>{!initial&&<label className="text-sm">Stok awal<input type="number" min="0" step="any" className="input mt-1" value={f.stok_awal} onChange={set('stok_awal')}/></label>}</>}
  <label className="text-sm sm:col-span-3">Catatan<input className="input mt-1" value={f.catatan} onChange={set('catatan')}/></label>{error&&<p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
  <div className="flex gap-2 sm:col-span-3"><button className="btn btn-primary" disabled={busy}>{busy?'Menyimpan…':'Simpan'}</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div>
 </form>
}
