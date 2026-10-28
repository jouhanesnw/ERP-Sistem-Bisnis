export type EmployeeTaxStatus = 'Pegawai Tetap' | 'Pegawai Tidak Tetap' | 'Bukan Pegawai' | 'Penerima Pensiun'
export type EmployeePTKPStatus = 'TK/0' | 'TK/1' | 'TK/2' | 'TK/3' | 'K/0' | 'K/1' | 'K/2' | 'K/3'

export type Employee = {
  id: string
  company_id: string
  employee_code: string
  employee_code_auto: boolean
  employee_code_series: string
  name_prefix: string | null
  full_name: string
  identity_number: string | null
  email: string | null
  mobile_phone: string | null
  business_phone: string | null
  home_phone: string | null
  whatsapp: string | null
  website: string | null
  position_title: string | null
  start_date: string
  branch_id: string | null
  department_id: string | null
  is_salesperson: boolean
  notes: string | null
  address_line: string | null
  city: string | null
  postal_code: string | null
  province: string | null
  country: string
  subject_to_pph21: boolean
  npwp: string | null
  employment_status: EmployeeTaxStatus
  ptkp_status: EmployeePTKPStatus
  tax_start_month: number
  tax_start_year: number
  previous_income: number | string
  previous_pph: number | string
  bank_name: string | null
  bank_account_number: string | null
  bank_account_name: string | null
  active: boolean
  created_at?: string
  branch?: { id: string; name: string } | null
  department?: { id: string; name: string } | null
}

export type EmployeeBranchOption = { id: string; name: string; active: boolean }
export type EmployeeDepartmentOption = { id: string; name: string; active: boolean }
