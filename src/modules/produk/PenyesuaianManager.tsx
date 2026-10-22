'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate,tglID } from '@/lib/format'
import { fmt,JENIS_MUTASI } from './util'
import type { Mutasi,PdPerm,Produk } from './types'
export default function PenyesuaianManager({companyId,produk,perm}:{companyId:string;produk:Produk[];perm:PdPerm}){
 const sb=useMemo(()=>supabaseBrowser(),[]),router=useRouter(),pilihan=produk.filter(p=>p.lacak_stok&&p.aktif)
 const [pid,setPid]=useState(pilihan[0]?.id??''),[fisik,setFisik]=useState(''),[tanggal,setTanggal]=useState(isoDate(new Date())),[ket,setKet]=useState(''),[rows,setRows]=useState<Mutasi[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const p=pilihan.find(x=>x.id===pid),selisih=p&&fisik!==''?Number(fisik)-Number(p.stok):null,nama=useMemo(()=>Object.fromEntries(produk.map(x=>[x.id,x.nama])),[produk])
 const load=useCallback(async()=>{const {data,error}=await sb.from('pd_stok_mutasi').select('*').eq('company_id',companyId).in('jenis',['penyesuaian','awal']).order('created_at',{ascending:false}).limit(100);if(error)return setError(error.message);setRows((data??[]) as Mutasi[])},[sb,companyId])
 useEffect(()=>{load()},[load])
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);const {data,error}=await sb.rpc('pd_sesuaikan',{p_produk:pid,p_tanggal:tanggal,p_fisik:Number(fisik),p_ket:ket||'Penyesuaian stok',p_jenis:'penyesuaian'});setBusy(false);if(error)return setError(error.message);setFisik('');setKet('');await load();router.refresh();setError(Number(data)===0?'Stok sudah sesuai; tidak ada mutasi baru.':null)}
 return <div className="space-y-4"><h1 className="text-2xl font-semibold">Penyesuaian Stok</h1><p className="text-sm text-ink/60">Masukkan hasil hitung fisik. Selisih tercatat di kartu stok.</p>
 {perm.create?<form onSubmit={submit} className="card grid max-w-3xl gap-3 p-4 sm:grid-cols-2"><label className="text-sm sm:col-span-2">Produk<select className="input mt-1" value={pid} onChange={e=>{setPid(e.target.value);setFisik('')}} required>{pilihan.map(x=><option key={x.id} value={x.id}>{x.nama}{x.kode?' ('+x.kode+')':''}</option>)}</select></label>
 <div className="text-sm"><p className="text-ink/60">Stok di sistem</p><p className="mt-1 text-lg font-semibold">{p?fmt(Number(p.stok))+' '+p.satuan:'—'}</p></div><label className="text-sm">Stok fisik<input type="number" min="0" step="any" className="input mt-1" value={fisik} onChange={e=>setFisik(e.target.value)} required/></label>
 <label className="text-sm">Tanggal<input type="date" className="input mt-1" value={tanggal} onChange={e=>setTanggal(e.target.value)} required/></label><label className="text-sm">Alasan<input className="input mt-1" value={ket} onChange={e=>setKet(e.target.value)} placeholder="Stok opname, barang rusak, dll."/></label>
 {selisih!==null&&<p className="text-sm sm:col-span-2">Selisih: {selisih>0?'+':''}{fmt(selisih)} {p?.satuan}</p>}{error&&<p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
 <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy||!pid}>{busy?'Menyimpan…':'Simpan penyesuaian'}</button></div></form>:<p className="card p-4 text-sm text-ink/60">Tidak punya izin untuk menambah penyesuaian.</p>}
 <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="p-3">Tanggal</th><th className="p-3">Produk</th><th className="p-3">Jenis</th><th className="p-3 text-right">Selisih</th><th className="p-3">Alasan</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b border-line"><td className="p-3">{tglID(r.tanggal)}</td><td className="p-3">{nama[r.produk_id]??'—'}</td><td className="p-3">{JENIS_MUTASI[r.jenis]??r.jenis}</td><td className={'p-3 text-right '+(r.jumlah<0?'text-red-700':'text-green-700')}>{r.jumlah>0?'+':''}{fmt(Number(r.jumlah))}</td><td className="p-3">{r.keterangan??'—'}</td></tr>)}{!rows.length&&<tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada penyesuaian.</td></tr>}</tbody></table></div></div>
}
