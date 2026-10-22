'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { monthStart,rupiah,isoDate } from '@/lib/format'
import type { RingkasanAkun } from './types'
type KasFlow={jenis:string;total:number|string;jumlah_transaksi:number}
const n=(v:number|string)=>Number(v)||0
export default function LaporanManager({companyId}:{companyId:string}){
 const sb=useMemo(()=>supabaseBrowser(),[]),[from,setFrom]=useState(monthStart()),[to,setTo]=useState(isoDate(new Date())),[data,setData]=useState<RingkasanAkun[]>([]),[kas,setKas]=useState<KasFlow[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null)
 const load=useCallback(async()=>{setLoading(true);setError(null);const [a,k]=await Promise.all([
  sb.rpc('ak_ringkasan_akun',{cid:companyId,p_mulai:from,p_sampai:to}),
  sb.rpc('ak_pergerakan_kas',{cid:companyId,p_mulai:from,p_sampai:to})
 ]);setLoading(false);if(a.error)return setError(a.error.message);if(k.error)return setError(k.error.message);setData((a.data??[]) as RingkasanAkun[]);setKas((k.data??[]) as KasFlow[])},[sb,companyId,from,to])
 useEffect(()=>{load()},[load])
 const profit=useMemo(()=>{
  const rev=data.filter(x=>x.tipe==='pendapatan').reduce((s,x)=>s+n(x.periode_kredit)-n(x.periode_debit),0)
  const exp=data.filter(x=>x.tipe==='beban').reduce((s,x)=>s+n(x.periode_debit)-n(x.periode_kredit),0)
  return {rev,exp,net:rev-exp}
 },[data])
 const balance=useMemo(()=>{
  const assets=data.filter(x=>x.tipe==='aset').reduce((s,x)=>s+n(x.semua_debit)-n(x.semua_kredit),0)
  const liab=data.filter(x=>x.tipe==='kewajiban').reduce((s,x)=>s+n(x.semua_kredit)-n(x.semua_debit),0)
  const equity=data.filter(x=>x.tipe==='modal').reduce((s,x)=>s+n(x.semua_kredit)-n(x.semua_debit),0)
  const earned = data.filter(x=>x.tipe==='pendapatan').reduce((s,x)=>s+n(x.semua_kredit)-n(x.semua_debit),0) - data.filter(x=>x.tipe==='beban').reduce((s,x)=>s+n(x.semua_debit)-n(x.semua_kredit),0)
  return {assets,liab,equity:equity+earned,diff:assets-liab-equity-earned}
 },[data])
 const masuk=n(kas.find(x=>x.jenis==='masuk')?.total??0),keluar=n(kas.find(x=>x.jenis==='keluar')?.total??0),transfer=n(kas.find(x=>x.jenis==='transfer')?.total??0)
 function bal(x:RingkasanAkun){const debit=n(x.semua_debit),credit=n(x.semua_kredit);return ['aset','beban'].includes(x.tipe)?debit-credit:credit-debit}
 return <div className="space-y-5"><div><h1 className="text-2xl font-semibold">Laporan Keuangan</h1><p className="text-sm text-ink/60">Laba rugi berdasarkan periode; neraca menggunakan saldo sampai tanggal akhir.</p></div>
 <div className="card flex flex-wrap items-end gap-3 p-4"><label className="text-sm">Dari<input type="date" className="input mt-1" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Sampai<input type="date" className="input mt-1" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="btn" onClick={load} disabled={loading}>{loading?'Memuat…':'Perbarui laporan'}</button></div>
 {error&&<p className="text-sm text-red-600">{error}</p>}
 <div className="grid gap-3 sm:grid-cols-3"><div className="card p-4"><p className="text-sm text-ink/60">Pendapatan periode</p><p className="mt-1 text-xl font-semibold">{rupiah(profit.rev)}</p></div><div className="card p-4"><p className="text-sm text-ink/60">Beban periode</p><p className="mt-1 text-xl font-semibold">{rupiah(profit.exp)}</p></div><div className="card p-4"><p className="text-sm text-ink/60">Laba / (rugi) periode</p><p className={'mt-1 text-xl font-semibold '+(profit.net<0?'text-red-700':'')}>{rupiah(profit.net)}</p></div></div>
 <section className="card overflow-x-auto"><div className="border-b border-line p-4"><h2 className="font-semibold">Laporan Laba Rugi</h2><p className="text-xs text-ink/60">Periode {from} s.d. {to}</p></div><table className="w-full text-left text-sm"><thead><tr className="text-ink/60"><th className="p-3">Akun</th><th className="p-3 text-right">Jumlah (Rp)</th></tr></thead><tbody>
 {data.filter(x=>x.tipe==='pendapatan').map(x=><tr key={x.akun_id} className="border-t border-line"><td className="p-3">{x.kode} · {x.nama}</td><td className="p-3 text-right">{rupiah(n(x.periode_kredit)-n(x.periode_debit))}</td></tr>)}
 <tr className="border-t border-line font-semibold"><td className="p-3">Total pendapatan</td><td className="p-3 text-right">{rupiah(profit.rev)}</td></tr>
 {data.filter(x=>x.tipe==='beban').map(x=><tr key={x.akun_id} className="border-t border-line"><td className="p-3">{x.kode} · {x.nama}</td><td className="p-3 text-right">{rupiah(n(x.periode_debit)-n(x.periode_kredit))}</td></tr>)}
 <tr className="border-t border-line font-semibold"><td className="p-3">Total beban</td><td className="p-3 text-right">{rupiah(profit.exp)}</td></tr><tr className="border-t border-line font-semibold"><td className="p-3">Laba / (rugi) bersih</td><td className="p-3 text-right">{rupiah(profit.net)}</td></tr>
 </tbody></table></section>
 <section className="card overflow-x-auto"><div className="border-b border-line p-4"><h2 className="font-semibold">Neraca</h2><p className="text-xs text-ink/60">Saldo sampai dengan {to}</p></div><table className="w-full text-left text-sm"><thead><tr className="text-ink/60"><th className="p-3">Akun</th><th className="p-3">Kelompok</th><th className="p-3 text-right">Saldo (Rp)</th></tr></thead><tbody>
 {data.filter(x=>['aset','kewajiban','modal'].includes(x.tipe)).map(x=><tr key={x.akun_id} className="border-t border-line"><td className="p-3">{x.kode} · {x.nama}</td><td className="p-3">{x.tipe}</td><td className="p-3 text-right">{rupiah(bal(x))}</td></tr>)}
 <tr className="border-t border-line font-semibold"><td className="p-3">Laba terakumulasi</td><td className="p-3">Hasil pendapatan dikurangi beban sejak saldo awal</td><td className="p-3 text-right">{rupiah(data.filter(x=>x.tipe==='pendapatan').reduce((s,x)=>s+n(x.semua_kredit)-n(x.semua_debit),0)-data.filter(x=>x.tipe==='beban').reduce((s,x)=>s+n(x.semua_debit)-n(x.semua_kredit),0))}</td></tr>
 <tr className="border-t border-line font-semibold"><td className="p-3" colSpan={2}>Total aset</td><td className="p-3 text-right">{rupiah(balance.assets)}</td></tr><tr className="border-t border-line font-semibold"><td className="p-3" colSpan={2}>Total kewajiban dan ekuitas termasuk laba terakumulasi</td><td className="p-3 text-right">{rupiah(balance.liab+balance.equity)}</td></tr>
 </tbody></table>
 {Math.abs(balance.diff)>1&&<p className="border-t border-line p-3 text-sm text-amber-700">Perhatian: neraca berbeda {rupiah(balance.diff)}. Periksa jurnal manual, saldo awal, dan pemetaan akun.</p>}
 </section>
 <section className="card overflow-x-auto"><div className="border-b border-line p-4"><h2 className="font-semibold">Ringkasan Pergerakan Kas</h2><p className="text-xs text-ink/60">Ini ringkasan transaksi kas, bukan laporan arus kas metode langsung lengkap.</p></div><div className="grid gap-3 p-4 sm:grid-cols-4"><div><p className="text-sm text-ink/60">Kas masuk</p><p className="font-semibold">{rupiah(masuk)}</p></div><div><p className="text-sm text-ink/60">Kas keluar</p><p className="font-semibold">{rupiah(keluar)}</p></div><div><p className="text-sm text-ink/60">Transfer antar rekening</p><p className="font-semibold">{rupiah(transfer)}</p></div><div><p className="text-sm text-ink/60">Arus bersih sebelum transfer</p><p className="font-semibold">{rupiah(masuk-keluar)}</p></div></div></section>
 </div>
}
