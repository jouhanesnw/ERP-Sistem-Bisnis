export type Produk = { id:string; company_id:string; kode:string|null; nama:string; satuan:string; harga_beli:number; harga_jual:number; lacak_stok:boolean; stok_minimum:number; aktif:boolean; catatan:string|null; stok:number }
export type Mutasi = { id:string; produk_id:string; gudang_id:string; tanggal:string; jumlah:number; jenis:string; keterangan:string|null }
export type PdPerm = { create:boolean; edit:boolean; delete:boolean }
