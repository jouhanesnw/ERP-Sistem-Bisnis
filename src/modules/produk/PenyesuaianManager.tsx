'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate,tglID } from '@/lib/format'
import { fmt,JENIS_MUTASI } from './util'
import type { Mutasi,PdPerm,Produk } from './types'
import type { Gudang } from './GudangManager'
type Stok={gudang_id:string;gudang_nama:string;produk_id:string;produk_nama:string;kode:string|null;satuan:string;stok:number;lacak_stok:boolean;aktif:boolean}
export default function PenyesuaianManager({companyId,produk,perm}:{companyId:string;produk:Produk[];perm:PdPerm}){
 const sb=useMemo(()=>supabaseBrowser(),[]),router=useRouter()
 const [gudang,setGudang]=useState<Gudang[]>([]),[stok,setStok]=useState<Stok[]>([]),[rows,setRows]=useState<Mutasi[]>([])
 const [pid,setPid]=useState(''),[gid,setGid]=useState(''),[fisik,setFisik]=useState(''),[tanggal,setTanggal]=useState(isoDate(new Date())),[ket,setKet]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const pilihan=stok.filter(x=>x.aktif&&x.lacak_stok&&x.gudang_id===gid),p=pilihan.find(x=>x.produk_id===pid),selisih=p&&fisik!==''?Number(fisik)-Number(p.stok):null
 const nama=useMemo(()=>Object.fromEntries(produk.map(x=>[x.id,x.nama])),[produk])
 const load=useCallback(async()=>{const [g,s,m]=await Promise.all([
  sb.from('pd_gudang').select('*').eq('company_id',companyId).eq('aktif',true).order('is_default',{ascending:false}).order('nama'),
  sb.from('pd_gudang_stok_v').select('*').eq('company_id',companyId),
  sb.from('pd_stok_mutasi').select('*').eq('company_id',companyId).in('jenis',['penyesuaian','awal']).order('created_at',{ascending:false}).limit(100)
 ]);if(g.error)return setError(g.error.message);if(s.error)return setError(s.error.message);if(m.error)return setError(m.error.message)
 const gs=(g.data??[]) as Gudang[];setGudang(gs);setStok((s.data??[]) as Stok[]);setRows((m.data??[]) as Mutasi[]);setGid(x=>x||gs[0]?.id||'');setPid(x=>x||((s.data??[]) as Stok[]).find((v:any)=>v.gudang_id===gs[0]?.id&&v.lacak_stok&&v.aktif)?.produk_id||'')
 },[sb,companyId])
 useEffect(()=>{load()},[load])
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);const {data,error}=await sb.rpc('pd_sesuaikan_gudang',{p_produk:pid,p_gudang:gid,p_tanggal:tanggal,p_fisik:Number(fisik),p_ket:ket||'Penyesuaian stok'});setBusy(false);if(error)return setError(error.message);setFisik('');setKet('');await load();router.refresh();if(Number(data)===0)setError('Stok sudah sesuai; tidak ada mutasi baru.')}
 return <div className="space-y-4"><h1 className="text-2xl font-semibold">Penyesuaian Stok</h1><p className="text-sm text-ink/60">Masukkan hasil hitung fisik untuk gudang tertentu. Sistem mencatat selisih stok.</p>
 {perm.create?<form onSubmit={submit} className="card grid max-w-3xl gap-3 p-4 sm:grid-cols-2">
 <label className="text-sm sm:col-span-2">Gudang<select className="input mt-1" value={gid} onChange={e=>{setGid(e.target.value);setPid('');setFisik('')}} required>{gudang.map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}</select></label>
 <label className="text-sm sm:col-span-2">Produk<select className="input mt-1" value={pid} onChange={e=>{setPid(e.target.value);setFisik('')}} required>{pilihan.map(x=><option key={x.produk_id} value={x.produk_id}>{x.produk_nama}{x.kode?' ('+x.kode+')':''}</option>)}</select></label>
 <div className="text-sm"><p className="text-ink/60">Stok sistem</p><p className="mt-1 text-lg font-semibold">{p?fmt(Number(p.stok))+' '+p.satuan:'—'}</p></div>
 <label className="text-sm">Stok fisik<input type="number" min="0" step="any" className="input mt-1" value={fisik} onChange={e=>setFisik(e.target.value)} required/></label>
 <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={e=>setTanggal(e.target.value)} required/></label>
 <label className="text-sm">Alasan<input className="input mt-1" value={ket} onChange={e=>setKet(e.target.value)} placeholder="Stok opname, barang rusak, dll."/></label>
 {selisih!==null&&<p className="text-sm sm:col-span-2">Selisih: {selisih>0?'+':''}{fmt(selisih)} {p?.satuan}</p>}{error&&<p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
 <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy||!pid||!gid}>{busy?'Menyimpan…':'Simpan penyesuaian'}</button></div>
 </form>:<p className="card p-4 text-sm text-ink/60">Tidak punya izin.</p>}
 <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="p-3">Tanggal</th><th className="p-3">Produk</th><th className="p-3">Jenis</th><th className="p-3 text-right">Selisih</th><th className="p-3">Alasan</th></tr></thead><tbody>{rows.filter(r=>r.gudang_id===gid).map(r=><tr key={r.id} className="border-b border-line"><td className="p-3">{tglID(r.tanggal)}</td><td className="p-3">{nama[r.produk_id]??'—'}</td><td className="p-3">{JENIS_MUTASI[r.jenis]??r.jenis}</td><td className={'p-3 text-right '+(r.jumlah<0?'text-red-700':'text-green-700')}>{r.jumlah>0?'+':''}{fmt(Number(r.jumlah))}</td><td className="p-3">{r.keterangan??'—'}</td></tr>)}{!rows.length&&<tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada penyesuaian.</td></tr>}</tbody></table></div>
 </div>
}
