import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

/** Browser Supabase client (anon key). Missing env → throws on use. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export function getSupabaseConfig() {
  return { url, anonKey }
}
