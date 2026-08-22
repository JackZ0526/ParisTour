import { getSupabase, isCloudSyncEnabled } from '../../../shared/lib/supabase'
import {
  getUserNickname,
  setUserNickname,
} from './nicknameStore'

/**
 * Loads the user's nickname from Supabase profiles / auth metadata.
 */
export async function loadProfileNickname(
  userId: string,
): Promise<string | null> {
  if (!userId || !isCloudSyncEnabled()) return null

  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data?.display_name && typeof data.display_name === 'string') {
      const clean = data.display_name.trim()
      if (clean) return clean
    }
  } catch {
    /* ignore and try metadata */
  }

  try {
    const sb = getSupabase()
    const { data: userData } = await sb.auth.getUser()
    const meta = userData?.user?.user_metadata
    const metaName =
      (typeof meta?.display_name === 'string' && meta.display_name) ||
      (typeof meta?.name === 'string' && meta.name) ||
      (typeof meta?.nickname === 'string' && meta.nickname)
    if (metaName && typeof metaName === 'string') {
      const clean = metaName.trim()
      if (clean) return clean
    }
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Persists the user's nickname to Supabase profiles and auth metadata.
 */
export async function saveProfileNickname(
  userId: string,
  nickname: string,
): Promise<void> {
  if (!userId || !isCloudSyncEnabled()) return

  const clean = nickname.trim() || null

  // 1. Update profiles table if available
  try {
    const sb = getSupabase()
    await sb
      .from('profiles')
      .update({ display_name: clean })
      .eq('id', userId)
  } catch (err) {
    console.warn('[nicknameCloud] profile table update ignored:', err)
  }

  // 2. Also update auth user metadata so it travels seamlessly with the session
  try {
    const sb = getSupabase()
    await sb.auth.updateUser({
      data: { display_name: clean, name: clean },
    })
  } catch (err) {
    console.warn('[nicknameCloud] auth metadata update ignored:', err)
  }
}

/**
 * Hydrates the user's nickname on startup / login.
 * - If cloud has nickname, updates local cache.
 * - If cloud is empty and local has nickname, syncs local nickname to cloud.
 */
export async function hydrateAccountNickname(
  userId: string,
  email: string,
): Promise<void> {
  if (!userId || !isCloudSyncEnabled()) return

  try {
    const cloudNickname = await loadProfileNickname(userId)
    const localNickname = getUserNickname(email)

    if (cloudNickname) {
      if (localNickname !== cloudNickname) {
        setUserNickname(cloudNickname, email)
      }
      return
    }

    // Cloud is empty; if local has custom nickname, backfill cloud once
    if (localNickname) {
      await saveProfileNickname(userId, localNickname)
    }
  } catch (err) {
    console.warn('[nicknameCloud] unable to hydrate nickname', err)
  }
}

/**
 * Loads nicknames for multiple users by their emails from Supabase profiles.
 * Used in collaboration panels to display companions' personalized nicknames.
 */
export async function batchLoadProfileNicknames(
  emails: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (!emails.length) return result

  const cleanEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  )
  if (!cleanEmails.length) return result

  // 1. Preload from local cache
  for (const email of cleanEmails) {
    const local = getUserNickname(email)
    if (local) {
      result[email] = local
    }
  }

  if (!isCloudSyncEnabled()) {
    return result
  }

  // 2. Fetch fresh nicknames from profiles table
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('profiles')
      .select('email, display_name')
      .in('email', cleanEmails)

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row?.email && typeof row.display_name === 'string' && row.display_name.trim()) {
          const clean = row.display_name.trim()
          const normEmail = row.email.trim().toLowerCase()
          result[normEmail] = clean
          setUserNickname(clean, normEmail)
        }
      }
    }
  } catch (err) {
    console.warn('[nicknameCloud] batchLoadProfileNicknames failed:', err)
  }

  return result
}
