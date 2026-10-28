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
  'Iuran pensiunan THT/JHT dibayarkan pekerja',
] as const

export type SalaryItemType = typeof SALARY_ITEM_TYPES[number]
export type SalaryPayType = 'Bulanan' | 'Non bulanan/setahun sekali'

const MONTHLY_AND_YEARLY_TYPES: readonly SalaryItemType[] = [
  'Honorarium dan Imbalan lain sejenisnya',
  'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
]
const YEARLY_ONLY_TYPES: readonly SalaryItemType[] = [
  'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
]
export const PERCENTAGE_SALARY_TYPES: readonly SalaryItemType[] = [
  'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
  'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
  'Tunjangan Iuran Pensiun/THT/JHT dibayarkan Pemberi Kerja',
  'Premi asuransi kesehatan dibayarkan pekerja',
  'Iuran pensiunan THT/JHT dibayarkan pekerja',
]
export const EXPENSE_ACCOUNT_TYPES: readonly SalaryItemType[] = [
  'Tunjangan Jaminan Kecelakaan Kerja, Jaminan Kematian',
  'Premi asuransi kesehatan yang dibayarkan pemberi kerja',
  'Penerimaan dalam bentuk natura dan kenikmatan lainnya',
  'Tantiem, Bonus, Rapel, Gratifikasi, Jasa Produksi dan THR',
  'Potongan Gaji (Tidak Mengurangi PPh)',
  'Pengurangan Gaji (Mengurangi PPh)',
]
export const MAXIMUM_SALARY_TYPES: readonly SalaryItemType[] = [
  'Iuran pensiunan THT/JHT dibayarkan pekerja',
]

export function getSalaryPayOptions(type: SalaryItemType): SalaryPayType[] {
  if (YEARLY_ONLY_TYPES.includes(type)) return ['Non bulanan/setahun sekali']
  if (MONTHLY_AND_YEARLY_TYPES.includes(type)) return ['Bulanan', 'Non bulanan/setahun sekali']
  return ['Bulanan']
}
export function needsPercentage(type: SalaryItemType): boolean {
  return PERCENTAGE_SALARY_TYPES.includes(type)
}
export function needsExpenseAccount(type: SalaryItemType): boolean {
  return EXPENSE_ACCOUNT_TYPES.includes(type)
}
export function supportsMaximumSalary(type: SalaryItemType): boolean {
  return MAXIMUM_SALARY_TYPES.includes(type)
}

export type SalaryItem = {
  id: string
  company_id: string
  name: string
  item_type: SalaryItemType
  pay_type: SalaryPayType
  percentage_of_salary: number | string | null
  maximum_salary_enabled: boolean
  account_id: string | null
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
