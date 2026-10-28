export const SALARY_ITEM_TYPES = [
  'Gaji/Pensiun atau THT/JHT',
  'Tunjangan PPh',
  'Subsidi PPh',
  'Tunjangan Lainnya, Uang lembur dan sebagainya',
  'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
  'Honorarium dan Imbalan lain sejenisnya',
  'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
  'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
  'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
  'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja',
  'Potongan Gaji (Tidak Mengurangi PPh)',
  'Pengurangan Gaji (Mengurangi PPh)',
  'Premi asuransi kesehatan dibayarkan pekerja',
] as const

export type SalaryItemType = typeof SALARY_ITEM_TYPES[number]
export type SalaryPayType = 'Bulanan' | 'Tidak Tetap' | 'Potong'

export function getSalaryPayType(type: SalaryItemType): SalaryPayType {
  if ([
    'Potongan Gaji (Tidak Mengurangi PPh)',
    'Pengurangan Gaji (Mengurangi PPh)',
    'Premi asuransi kesehatan dibayarkan pekerja',
  ].includes(type)) return 'Potong'
  if ([
    'Tunjangan Lainnya, Uang lembur dan sebagainya',
    'Honorarium dan Imbalan lain sejenisnya',
    'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
    'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
  ].includes(type)) return 'Tidak Tetap'
  return 'Bulanan'
}

export type SalaryItem = {
  id: string
  company_id: string
  name: string
  item_type: SalaryItemType
  pay_type: SalaryPayType
  account_id: string
  active: boolean
  created_at?: string
  account?: { id: string; kode: string; nama: string } | null
}

export type ExpenseAccountOption = {
  id: string
  company_id?: string
  kode: string
  nama: string
  tipe?: string
  aktif?: boolean
}
