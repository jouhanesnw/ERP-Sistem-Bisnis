export type Pelanggan = { id: string; nama: string; telepon: string | null; email: string | null; alamat: string | null; aktif: boolean }
export type Jenis = 'penawaran' | 'faktur'
export type Dokumen = {
  id: string; company_id: string; jenis: Jenis; nomor: string; gudang_id: string; tanggal: string; batas_tanggal: string | null
  pelanggan_id: string; pelanggan_nama: string; status: string; ppn_persen: number; catatan: string | null; currency_code: string; payment_terms_id: string
  sumber_id: string | null; subtotal: number; total: number; terbayar: number; sisa: number
}
export type Item = { deskripsi: string; qty: number | string; harga: number | string; produk_id?: string | null }
export type Pembayaran = {
  id: string; tanggal: string; jumlah: number; rekening_id: string; catatan: string | null; dokumen_id: string; currency_code: string
  pj_dokumen: { nomor: string; pelanggan_id: string } | null
}
export type RekeningPilihan = { id: string; nama: string; aktif: boolean; currency_code: string }
export type PjPerm = { create: boolean; edit: boolean; delete: boolean }
