export type ShippingMethod = {
  id: string
  company_id: string
  name: string
  pic: string | null
  phone: string | null
  address: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string
  active: boolean
  created_at?: string
}
