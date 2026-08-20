import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  )
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

/**
 * Checks if cloud sync (Supabase Auth, DB Cloud Save, Realtime Sync) should run.
 * On localhost, cloud sync is disabled by default to save Supabase bandwidth and quota,
 * unless explicitly enabled via VITE_ENABLE_CLOUD_SYNC_ON_LOCAL=true in .env.
 */
export function isCloudSyncEnabled(): boolean {
  if (!isSupabaseConfigured()) return false
  if (isLocalhost() && import.meta.env.VITE_ENABLE_CLOUD_SYNC_ON_LOCAL !== 'true') {
    return false
  }
  return true
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
