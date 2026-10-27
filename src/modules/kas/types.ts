export type Rekening = { id: string; nama: string; tipe: 'tunai' | 'bank' | 'ewallet'; nomor: string | null; saldo_awal: number; aktif: boolean; saldo: number }
export type Kategori = { id: string; nama: string; jenis: 'masuk' | 'keluar'; aktif: boolean }
export type Jenis = 'masuk' | 'keluar' | 'transfer'
export type Transaksi = {
  id: string; tanggal: string; jenis: Jenis; rekening_id: string; rekening_tujuan_id: string | null
  kategori_id: string | null; jumlah: number; keterangan: string | null; bukti_path: string | null; currency_code: string
}
export type KasPerm = { create: boolean; edit: boolean; delete: boolean }
