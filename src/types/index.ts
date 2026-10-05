export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  city: string | null
  monthly_target: number
  preferred_home_time: string | null
  work_start_time: string | null
  work_end_time: string | null
  onboarding_complete: boolean
}

export type Customer = {
  id: string
  name: string
  customer_type: string | null
  phone: string | null
  address: string | null
  potential_amount: number
  priority: number
  usual_availability: string | null
  notes: string | null
  active: boolean
}

export type Sale = {
  id: string
  customer_id: string | null
  sale_date: string
  amount: number
  status: string
  product_category: string | null
}
