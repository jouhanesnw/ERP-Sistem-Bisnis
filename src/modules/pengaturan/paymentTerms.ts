export type PaymentTerm = {
  id: string
  company_id: string
  name: string
  discount_days: number
  discount_percent: number | string
  due_days: number
  description: string | null
  is_default: boolean
  active: boolean
  created_at?: string
}
