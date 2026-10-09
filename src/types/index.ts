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

  // My Life, My Why — personalisation
  life_priorities: string[]
  life_challenge: string | null
  proud_in_90_days: string | null
  personal_why: string | null
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

export type VisitRow = {
  id: string
  customer_id: string
  planned_start: string | null
  status: string
  sale_amount: number
  lead_amount: number
  collection_amount: number
  notes: string | null
  next_action: string | null
  follow_up_date: string | null
  customers: { name: string; address: string | null; phone: string | null } | null
}

export type FollowUpRow = {
  id: string
  customer_id: string
  due_date: string
  action: string
  expected_value: number
  status: string
  customers: { name: string } | null
}