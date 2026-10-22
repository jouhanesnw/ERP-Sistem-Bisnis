import type { Produk } from './types'
export const fmt = (n:number) => new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(n)
export function statusStok(p:Produk) {
 if(!p.lacak_stok) return null
 if(p.stok<=0) return {t:'Habis',c:'bg-red-100 text-red-800'}
 if(p.stok<=p.stok_minimum) return {t:'Menipis',c:'bg-amber-100 text-amber-800'}
 return {t:'Aman',c:'bg-green-100 text-green-800'}
}
export const JENIS_MUTASI:Record<string,string>={awal:'Stok awal',pembelian:'Pembelian',penjualan:'Penjualan',penyesuaian:'Penyesuaian'}
