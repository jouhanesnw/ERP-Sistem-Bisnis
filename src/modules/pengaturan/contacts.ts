export type ContactKind = 'Pelanggan' | 'Pemasok' | 'Karyawan'

export type ContactRecord = {
  id: string
  kind: ContactKind
  name: string
  code: string | null
  phone: string | null
  email: string | null
  address: string | null
  detail: string | null
  active: boolean
  href: string
}
