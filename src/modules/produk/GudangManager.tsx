'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { PdPerm } from './types'

export type Gudang = { id:string; company_id:string; kode:string; nama:string; alamat:string|null; aktif:boolean; is_default:boolean }
export default function GudangManager({companyId,gudang,perm}:{companyId:string;gudang:Gudang[];perm:PdPerm}){
 const sb=useMemo(()=>supabaseBrowser(),[]),router=useRouter()
 const [form,setForm]=useState<Gudang|'baru'|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const [stok,setStok]=useState<Record<string,number>>({})
 useEffect(()=>{let active=true;sb.from('pd_gudang_stok_v').select('gudang_id,produk_id,stok').eq('company_id',companyId).then(({data,error})=>{if(active&&!error){const m:Record<string,number>={};(data??[]).forEach((r:any)=>{if(Number(r.stok)>0)m[r.gudang_id]=(m[r.gudang_id]??0)+1});setStok(m)}});return()=>{active=false}},[sb,companyId])
 async function toggle(g:Gudang){if(g.is_default&&!g.aktif)return;const {error}=await sb.from('pd_gudang').update({aktif:!g.aktif}).eq('id',g.id);if(error)return setError(error.message);router.refresh()}
 async function remove(g:Gudang){if(g.is_default)return setError('Gudang utama tidak dapat dihapus.');if(!confirm('Hapus gudang '+g.nama+'? Gudang hanya bisa dihapus jika belum dipakai transaksi.'))return;const {error}=await sb.from('pd_gudang').delete().eq('id',g.id);if(error)return setError(error.code==='23503'?'Gudang memiliki riwayat stok atau transaksi. Nonaktifkan saja.':error.message);router.refresh()}
 return <div className="space-y-4">
  <div className="flex items-center gap-3"><div><h1 className="text-2xl font-semibold">Daftar Gudang</h1><p className="text-sm text-ink/60">Stok dicatat terpisah untuk setiap lokasi.</p></div>{perm.create&&<button className="btn btn-primary ml-auto" onClick={()=>setForm('baru')}>Tambah gudang</button>}</div>
  {error&&<p className="text-sm text-red-600">{error}</p>}
  {form&&<GudangForm key={form==='baru'?'baru':form.id} sb={sb} companyId={companyId} initial={form==='baru'?null:form} onDone={()=>{setForm(null);router.refresh()}} onCancel={()=>setForm(null)}/>}
  <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="p-3">Gudang</th><th className="p-3">Alamat</th><th className="p-3 text-right">SKU bersaldo</th><th className="p-3">Status</th><th className="p-3"/></tr></thead><tbody>
  {gudang.map(g=><tr key={g.id} className="border-b border-line last:border-0"><td className="p-3 font-medium">{g.nama}{g.is_default&&<span className="ml-2 rounded bg-canvas px-2 py-0.5 text-xs">Utama</span>}<span className="block text-xs text-ink/50">{g.kode}</span></td><td className="p-3">{g.alamat||'—'}</td><td className="p-3 text-right">{stok[g.id]??0}</td><td className="p-3">{g.aktif?'Aktif':'Nonaktif'}</td><td className="p-3"><div className="flex justify-end gap-1">{perm.edit&&<button className="btn" onClick={()=>setForm(g)}>Ubah</button>}{perm.edit&&!g.is_default&&<button className="btn" onClick={()=>toggle(g)}>{g.aktif?'Nonaktifkan':'Aktifkan'}</button>}{perm.delete&&!g.is_default&&<button className="btn" onClick={()=>remove(g)}>Hapus</button>}</div></td></tr>)}
  {!gudang.length&&<tr><td colSpan={5} className="p-6 text-center text-ink/60">Belum ada gudang.</td></tr>}</tbody></table></div>
  <p className="text-xs text-ink/50">Produk yang sudah memiliki riwayat stok tetap berada di gudang utama sampai ditransfer melalui menu Transfer Gudang.</p>
 </div>
}
function GudangForm({sb,companyId,initial,onDone,onCancel}:{sb:ReturnType<typeof supabaseBrowser>;companyId:string;initial:Gudang|null;onDone:()=>void;onCancel:()=>void}){
 const [f,setF]=useState({kode:initial?.kode??'',nama:initial?.nama??'',alamat:initial?.alamat??''}),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const set=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement>)=>setF({...f,[k]:e.target.value})
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);const payload={company_id:companyId,kode:f.kode.trim().toUpperCase(),nama:f.nama.trim(),alamat:f.alamat.trim()||null}
 const {error}=initial?await sb.from('pd_gudang').update(payload).eq('id',initial.id):await sb.from('pd_gudang').insert({...payload,is_default:false})
 setBusy(false);if(error)return setError(error.code==='23505'?'Kode gudang sudah dipakai.':error.message);onDone()}
 return <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-3"><label className="text-sm">Kode gudang<input className="input mt-1" value={f.kode} onChange={set('kode')} required placeholder="CABANG-01"/></label><label className="text-sm">Nama gudang<input className="input mt-1" value={f.nama} onChange={set('nama')} required placeholder="Gudang Cabang"/></label><label className="text-sm">Alamat<input className="input mt-1" value={f.alamat} onChange={set('alamat')}/></label>{error&&<p className="text-sm text-red-600 sm:col-span-3">{error}</p>}<div className="flex gap-2 sm:col-span-3"><button className="btn btn-primary" disabled={busy}>{busy?'Menyimpan…':'Simpan'}</button><button type="button" className="btn" onClick={onCancel}>Batal</button></div></form>
}
