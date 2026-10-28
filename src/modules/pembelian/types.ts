export type Pemasok = { id: string; nama: string; telepon: string | null; email: string | null; alamat: string | null; aktif: boolean }
export type Jenis = 'pesanan' | 'faktur'
export type Dokumen = {
  id: string; company_id: string; jenis: Jenis; nomor: string; no_referensi: string | null; gudang_id: string; tanggal: string; batas_tanggal: string | null
  pemasok_id: string; pemasok_nama: string; status: string; ppn_persen: number; catatan: string | null; currency_code: string; payment_terms_id: string; shipping_method_id: string | null; shipping_name?: string | null
  sumber_id: string | null; subtotal: number; total: number; terbayar: number; sisa: number
}
export type Item = { deskripsi: string; qty: number | string; harga: number | string; produk_id?: string | null }
export type Pembayaran = {
  id: string; tanggal: string; jumlah: number; rekening_id: string; catatan: string | null; dokumen_id: string; currency_code: string
  pb_dokumen: { nomor: string; pemasok_id: string } | null
}
export type RekeningPilihan = { id: string; nama: string; aktif: boolean; currency_code: string }
export type PbPerm = { create: boolean; edit: boolean; delete: boolean }
