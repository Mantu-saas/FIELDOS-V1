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
