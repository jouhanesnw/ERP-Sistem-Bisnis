export type Akun = {
 id:string; company_id:string; kode:string; nama:string; tipe:'aset'|'kewajiban'|'modal'|'pendapatan'|'beban'
 normal:'debit'|'kredit'; induk_id:string|null; sistem:boolean; aktif:boolean; kode_tipe:string; currency_code:string; catatan:string|null
}
export type Jurnal = {id:string;company_id:string;nomor:string;tanggal:string;keterangan:string;sumber_tipe:string;total_debit:number|string;total_kredit:number|string}
export type BarisJurnal = {akun_id:string;debit:string;kredit:string;keterangan:string}
export type AkPerm = {create:boolean;edit:boolean;delete:boolean}
export type RingkasanAkun = {akun_id:string;kode:string;nama:string;tipe:Akun['tipe'];normal:Akun['normal'];aktif:boolean;periode_debit:number|string;periode_kredit:number|string;semua_debit:number|string;semua_kredit:number|string}
export type KategoriKas = {id:string;nama:string;jenis:'masuk'|'keluar';ak_akun_id:string|null}
