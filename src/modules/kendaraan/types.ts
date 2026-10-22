export type Kendaraan = {
  id: string; nama: string; plat: string; jenis: string; merek: string | null; tahun: number | null
  odometer: number; aktif: boolean; catatan: string | null; track_token: string
}
export type Lokasi = { id: string; nama: string; jenis: 'pool' | 'bengkel' | 'spbu' | 'lainnya'; lat: number; lng: number; alamat: string | null; catatan: string | null }
export type Posisi = { kendaraan_id: string; lat: number; lng: number; kecepatan: number | null; waktu: string; sumber: string }
export type Pajak = { id: string; kendaraan_id: string; jenis: string; berlaku_sampai: string; biaya: number | null; catatan: string | null }
export type ServisRow = { kendaraan_id: string; tanggal: string; berikutnya_tanggal: string | null; berikutnya_km: number | null }
export type RekeningPilihan = { id: string; nama: string; aktif: boolean }
export type KdPerm = { create: boolean; edit: boolean; delete: boolean }
