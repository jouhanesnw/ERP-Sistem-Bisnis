'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate,tglID } from '@/lib/format'
import { fmt } from './util'
import type { PdPerm,Produk } from './types'
import type { Gudang } from './GudangManager'
type Transfer={id:string;nomor:string;tanggal:string;gudang_asal_id:string;gudang_tujuan_id:string;produk_id:string;jumlah:number;catatan:string|null}
type Stok={gudang_id:string;produk_id:string;stok:number}
export default function TransferManager({companyId,produk,perm}:{companyId:string;produk:Produk[];perm:PdPerm}){
 const sb=useMemo(()=>supabaseBrowser(),[]),router=useRouter()
 const [gudang,setGudang]=useState<Gudang[]>([]),[stok,setStok]=useState<Stok[]>([]),[rows,setRows]=useState<Transfer[]>([])
 const [tanggal,setTanggal]=useState(isoDate(new Date())),[asal,setAsal]=useState(''),[tujuan,setTujuan]=useState(''),[pid,setPid]=useState(''),[jumlah,setJumlah]=useState(''),[catatan,setCatatan]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const namaGudang=useMemo(()=>Object.fromEntries(gudang.map(g=>[g.id,g.nama])),[gudang]),namaProduk=useMemo(()=>Object.fromEntries(produk.map(p=>[p.id,p.nama])),[produk])
 const stokAsal=Number(stok.find(x=>x.gudang_id===asal&&x.produk_id===pid)?.stok??0),tersedia=produk.filter(p=>p.aktif&&p.lacak_stok)
 const load=useCallback(async()=>{const [g,s,t]=await Promise.all([
  sb.from('pd_gudang').select('*').eq('company_id',companyId).eq('aktif',true).order('is_default',{ascending:false}).order('nama'),
  sb.from('pd_gudang_stok_v').select('gudang_id,produk_id,stok').eq('company_id',companyId),
  sb.from('pd_transfer').select('*').eq('company_id',companyId).order('tanggal',{ascending:false}).order('created_at',{ascending:false}).limit(200)
 ]);if(g.error)return setError(g.error.message);if(s.error)return setError(s.error.message);if(t.error)return setError(t.error.message)
  const gs=(g.data??[]) as Gudang[];setGudang(gs);setStok((s.data??[]) as Stok[]);setRows((t.data??[]) as Transfer[])
  setAsal(x=>x||gs[0]?.id||'');setTujuan(x=>x||gs.find(a=>a.id!==gs[0]?.id)?.id||'');setPid(x=>x||tersedia[0]?.id||'')
 },[sb,companyId,produk])
 useEffect(()=>{load()},[load])
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null)
  const {error}=await sb.rpc('pd_transfer_stok',{p_tanggal:tanggal,p_asal:asal,p_tujuan:tujuan,p_produk:pid,p_jumlah:Number(jumlah),p_catatan:catatan||null})
  setBusy(false);if(error)return setError(error.message);setJumlah('');setCatatan('');await load();router.refresh()
 }
 return <div className="space-y-4"><div><h1 className="text-2xl font-semibold">Transfer Gudang</h1><p className="text-sm text-ink/60">Pemindahan langsung: stok berkurang dari gudang asal dan bertambah di tujuan dalam satu transaksi.</p></div>
 {perm.create&&<form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
  <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={e=>setTanggal(e.target.value)} required/></label>
  <label className="text-sm">Gudang asal<select className="input mt-1" value={asal} onChange={e=>setAsal(e.target.value)} required>{gudang.map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}</select><span className="text-xs text-ink/50">Stok produk: {fmt(stokAsal)}</span></label>
  <label className="text-sm">Gudang tujuan<select className="input mt-1" value={tujuan} onChange={e=>setTujuan(e.target.value)} required>{gudang.filter(g=>g.id!==asal).map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}</select></label>
  <label className="text-sm sm:col-span-2">Produk<select className="input mt-1" value={pid} onChange={e=>setPid(e.target.value)} required>{tersedia.map(p=><option key={p.id} value={p.id}>{p.kode?p.kode+' · ':''}{p.nama} ({p.satuan})</option>)}</select></label>
  <label className="text-sm">Jumlah ({produk.find(p=>p.id===pid)?.satuan??'unit'})<input type="number" min="0.01" step="any" max={stokAsal} className="input mt-1" value={jumlah} onChange={e=>setJumlah(e.target.value)} required/></label>
  <label className="text-sm sm:col-span-3">Catatan<input className="input mt-1" value={catatan} onChange={e=>setCatatan(e.target.value)} placeholder="Contoh: pindah stok ke gudang cabang"/></label>
  {error&&<p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
  <div className="sm:col-span-3"><button className="btn btn-primary" disabled={busy||!pid||!asal||!tujuan||asal===tujuan||Number(jumlah)<=0||Number(jumlah)>stokAsal}>{busy?'Memproses…':'Simpan transfer'}</button></div>
 </form>}
 <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="p-3">Tanggal / Nomor</th><th className="p-3">Produk</th><th className="p-3">Asal → Tujuan</th><th className="p-3 text-right">Jumlah</th><th className="p-3">Catatan</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b border-line last:border-0"><td className="p-3">{tglID(r.tanggal)}<span className="block text-xs text-ink/50">{r.nomor}</span></td><td className="p-3">{namaProduk[r.produk_id]??'—'}</td><td className="p-3">{namaGudang[r.gudang_asal_id]??'—'} → {namaGudang[r.gudang_tujuan_id]??'—'}</td><td className="p-3 text-right">{fmt(Number(r.jumlah))} {produk.find(p=>p.id===r.produk_id)?.satuan}</td><td className="p-3">{r.catatan??'—'}</td></tr>)}{!rows.length&&<tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada transfer.</td></tr>}</tbody></table></div>
 </div>
}
