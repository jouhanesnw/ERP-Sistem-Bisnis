'use client'
import { useMemo,useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { isoDate,rupiah,tglID } from '@/lib/format'
import type { AkPerm,Akun,Jurnal,BarisJurnal } from './types'
import TransactionFavoriteControls, { type FavoritePayload } from '@/modules/pengaturan/TransactionFavoriteControls'
const amount=(n:number|string)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n)||0)
export default function JurnalManager({companyId,akun,jurnal:initial,perm}:{companyId:string;akun:Akun[];jurnal:Jurnal[];perm:AkPerm}){
 const sb=useMemo(()=>supabaseBrowser(),[]),router=useRouter()
 const [open,setOpen]=useState(false),[tanggal,setTanggal]=useState(isoDate(new Date())),[ket,setKet]=useState(''),[lines,setLines]=useState<BarisJurnal[]>([{akun_id:akun[0]?.id??'',debit:'',kredit:'',keterangan:''},{akun_id:akun[1]?.id??akun[0]?.id??'',debit:'',kredit:'',keterangan:''}]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const totalD=lines.reduce((s,l)=>s+Number(l.debit||0),0),totalK=lines.reduce((s,l)=>s+Number(l.kredit||0),0)
 function applyFavorite(payload:FavoritePayload){
  if(payload.keterangan!==undefined)setKet(payload.keterangan??'')
  if(payload.journal_lines?.length){
   setLines(payload.journal_lines.map(l=>({akun_id:l.akun_id,debit:String(l.debit??''),kredit:String(l.kredit??''),keterangan:l.keterangan??''})))
  }
 }
 const setLine=(i:number,p:Partial<BarisJurnal>)=>setLines(old=>old.map((l,j)=>i===j?{...l,...p}:l))
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null)
  const items=lines.map(l=>({akun_id:l.akun_id,debit:Number(l.debit||0),kredit:Number(l.kredit||0),keterangan:l.keterangan||null}))
  const {error}=await sb.rpc('ak_simpan_jurnal',{p:{company_id:companyId,tanggal,keterangan:ket,items}})
  setBusy(false);if(error)return setError(error.message)
  setOpen(false);setKet('');setLines([{akun_id:akun[0]?.id??'',debit:'',kredit:'',keterangan:''},{akun_id:akun[1]?.id??akun[0]?.id??'',debit:'',kredit:'',keterangan:''}]);router.refresh()
 }
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center gap-3"><div><h1 className="text-2xl font-semibold">Jurnal Umum</h1><p className="text-sm text-ink/60">Jurnal otomatis berasal dari transaksi; jurnal manual harus seimbang.</p></div>{perm.create&&<button className="btn btn-primary ml-auto" onClick={()=>setOpen(x=>!x)}>{open?'Tutup':'Buat jurnal manual'}</button>}</div>
  {open&&<form onSubmit={submit} className="card space-y-4 p-4">
  <TransactionFavoriteControls companyId={companyId} favoriteType="journal_manual"
   payload={{keterangan:ket,journal_lines:lines.map(l=>({akun_id:l.akun_id,debit:l.debit,kredit:l.kredit,keterangan:l.keterangan}))}}
   onApply={applyFavorite}/>
  <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tanggal<input className="input mt-1" type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} required/></label><label className="text-sm">Keterangan<input className="input mt-1" value={ket} onChange={e=>setKet(e.target.value)} required placeholder="Contoh: Koreksi biaya operasional"/></label></div>
  <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-ink/60"><th className="p-2">Akun</th><th className="p-2">Keterangan baris</th><th className="p-2">Debit (Rp)</th><th className="p-2">Kredit (Rp)</th><th className="p-2"/></tr></thead><tbody>{lines.map((l,i)=><tr key={i} className="border-t border-line"><td className="p-2"><select className="input min-w-[14rem]" value={l.akun_id} onChange={e=>setLine(i,{akun_id:e.target.value})} required>{akun.filter(a=>a.aktif).map(a=><option key={a.id} value={a.id}>{a.kode} · {a.nama}</option>)}</select></td><td className="p-2"><input className="input min-w-[8rem]" value={l.keterangan} onChange={e=>setLine(i,{keterangan:e.target.value})}/></td><td className="p-2"><input type="number" min="0" step="0.01" className="input min-w-[7rem]" value={l.debit} onChange={e=>setLine(i,{debit:e.target.value,kredit:e.target.value?'0':l.kredit})}/></td><td className="p-2"><input type="number" min="0" step="0.01" className="input min-w-[7rem]" value={l.kredit} onChange={e=>setLine(i,{kredit:e.target.value,debit:e.target.value?'0':l.debit})}/></td><td className="p-2"><button type="button" className="btn" disabled={lines.length<=2} onClick={()=>setLines(x=>x.filter((_,j)=>j!==i))}>Hapus</button></td></tr>)}</tbody></table></div>
  <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn" onClick={()=>setLines(x=>[...x,{akun_id:akun[0]?.id??'',debit:'',kredit:'',keterangan:''}])}>Tambah baris</button><p className="ml-auto text-sm">Debit <b>{rupiah(totalD)}</b> · Kredit <b>{rupiah(totalK)}</b></p></div>
  {error&&<p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button className="btn btn-primary" disabled={busy||akun.length===0||totalD<=0||Math.round((totalD-totalK)*100)!==0}>{busy?'Menyimpan…':'Simpan jurnal'}</button><button type="button" className="btn" onClick={()=>setOpen(false)}>Batal</button></div></form>}
  <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="p-3">Nomor / Tanggal</th><th className="p-3">Keterangan</th><th className="p-3">Sumber</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Kredit</th></tr></thead><tbody>{initial.map(j=><tr key={j.id} className="border-b border-line last:border-0"><td className="p-3 whitespace-nowrap">{j.nomor}<span className="block text-xs text-ink/50">{tglID(j.tanggal)}</span></td><td className="p-3">{j.keterangan}</td><td className="p-3">{({pj_faktur:'Faktur penjualan',pb_faktur:'Faktur pembelian',kas_transaksi:'Transaksi Kas',opening:'Saldo awal',manual:'Manual'} as Record<string,string>)[j.sumber_tipe]??j.sumber_tipe}</td><td className="p-3 text-right tabular-nums">{amount(j.total_debit)}</td><td className="p-3 text-right tabular-nums">{amount(j.total_kredit)}</td></tr>)}{!initial.length&&<tr><td colSpan={5} className="p-6 text-center text-ink/50">Belum ada jurnal.</td></tr>}</tbody></table></div>
  <p className="text-xs text-ink/50">Jurnal otomatis tidak bisa diedit dari formulir manual. Perubahan transaksi sumber akan memperbarui jurnal terkait sesuai aturan modul.</p>
 </div>
}
