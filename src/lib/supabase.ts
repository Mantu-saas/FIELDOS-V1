import { createClient } from '@supabase/supabase-js'

// Only the public "anon" key is ever used here. Never put the service_role key in this app.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key')
