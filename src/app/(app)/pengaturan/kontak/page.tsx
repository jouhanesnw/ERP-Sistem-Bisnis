import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import ContactManager from '@/modules/pengaturan/ContactManager'
import type { ContactKind, ContactRecord } from '@/modules/pengaturan/contacts'

export default async function KontakPage() {
  const ctx = await getAppContext()
  const isAdmin = ctx.active.role !== 'member'
  const canViewCustomers = isAdmin || can(ctx.perms, 'penjualan')
  const canViewSuppliers = isAdmin || can(ctx.perms, 'pembelian')
  const canViewEmployees = isAdmin
  const sb = supabaseServer()

  const [customerResult, supplierResult, employeeResult] = await Promise.all([
    canViewCustomers
      ? sb.from('pj_pelanggan').select('id, nama, telepon, email, alamat, aktif').eq('company_id', ctx.active.companyId).order('nama')
      : Promise.resolve(null),
    canViewSuppliers
      ? sb.from('pb_pemasok').select('id, nama, telepon, email, alamat, aktif').eq('company_id', ctx.active.companyId).order('nama')
      : Promise.resolve(null),
    canViewEmployees
      ? sb.from('company_employees').select('id, employee_code, name_prefix, full_name, position_title, mobile_phone, business_phone, email, whatsapp, website, active').eq('company_id', ctx.active.companyId).order('full_name')
      : Promise.resolve(null),
  ])

  type Party = { id: string; nama: string; telepon: string | null; email: string | null; alamat: string | null; aktif: boolean }
  type EmployeeContact = { id: string; employee_code: string; name_prefix: string | null; full_name: string; position_title: string | null; mobile_phone: string | null; business_phone: string | null; email: string | null; whatsapp: string | null; website: string | null; active: boolean }

  const contacts: ContactRecord[] = []
  for (const party of (customerResult?.data ?? []) as Party[]) {
    contacts.push({
      id: party.id, kind: 'Pelanggan', name: party.nama, code: null,
      phone: party.telepon, email: party.email, address: party.alamat,
      detail: null, active: party.aktif, href: '/penjualan/pelanggan',
    })
  }
  for (const party of (supplierResult?.data ?? []) as Party[]) {
    contacts.push({
      id: party.id, kind: 'Pemasok', name: party.nama, code: null,
      phone: party.telepon, email: party.email, address: party.alamat,
      detail: null, active: party.aktif, href: '/pembelian/pemasok',
    })
  }
  for (const employee of (employeeResult?.data ?? []) as EmployeeContact[]) {
    contacts.push({
      id: employee.id, kind: 'Karyawan',
      name: [employee.name_prefix, employee.full_name].filter(Boolean).join(' '),
      code: employee.employee_code,
      phone: employee.mobile_phone || employee.business_phone || employee.whatsapp,
      email: employee.email,
      address: null,
      detail: employee.position_title,
      active: employee.active,
      href: '/pengaturan/karyawan',
    })
  }

  const initialError = customerResult?.error?.message ?? supplierResult?.error?.message ?? employeeResult?.error?.message ?? null
  const availableKinds: ContactKind[] = [
    ...(canViewCustomers ? ['Pelanggan' as const] : []),
    ...(canViewSuppliers ? ['Pemasok' as const] : []),
    ...(canViewEmployees ? ['Karyawan' as const] : []),
  ]

  return <ContactManager initial={contacts} initialError={initialError} availableKinds={availableKinds} />
}
