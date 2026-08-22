import { getSupabase, isCloudSyncEnabled } from '../../../shared/lib/supabase'
import {
  getUserAvatar,
  setUserAvatar,
  type UserAvatar,
} from './avatarStore'

/**
 * Loads the user's avatar from Supabase profiles.
 */
export async function loadProfileAvatar(
  userId: string,
): Promise<UserAvatar | null> {
  if (!userId || !isCloudSyncEnabled()) return null

  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data?.avatar_url && typeof data.avatar_url === 'string') {
      return { type: 'image', value: data.avatar_url }
    }
  } catch {
    /* ignore and try metadata */
  }

  return null
}

/**
 * Persists the user's avatar to Supabase profiles table.
 * NOTE: Never write base64 dataUrls to auth.users.user_metadata,
 * as Supabase embeds user_metadata into the JWT header on every request,
 * which will cause HTTP 431 (Request Header Fields Too Large) errors!
 */
export async function saveProfileAvatar(
  userId: string,
  avatar: UserAvatar,
): Promise<void> {
  if (!userId || !isCloudSyncEnabled()) return

  const avatarUrl = avatar.type === 'image' && avatar.value ? avatar.value : null

  // 1. Update profiles table
  try {
    const sb = getSupabase()
    const { data: userData } = await sb.auth.getUser()
    const email = userData?.user?.email || ''

    if (email) {
      const { error } = await sb
        .from('profiles')
        .upsert(
          { id: userId, email: email.toLowerCase(), avatar_url: avatarUrl },
          { onConflict: 'id' },
        )
      if (error) {
        await sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId)
      }
    } else {
      await sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId)
    }
  } catch (err) {
    console.warn('[avatarCloud] profile table update ignored:', err)
  }

  // 2. Clear any accidental base64 strings from auth metadata to prevent JWT bloat
  try {
    const sb = getSupabase()
    const { data: userData } = await sb.auth.getUser()
    const metaAvatar = userData?.user?.user_metadata?.avatar_url
    if (typeof metaAvatar === 'string' && metaAvatar.startsWith('data:')) {
      await sb.auth.updateUser({
        data: { avatar_url: null },
      })
    }
  } catch {
    /* ignore */
  }
}

/**
 * Hydrates the user's avatar on startup / login.
 * - If cloud has avatar, updates local cache.
 * - If cloud is empty and local has custom image, syncs local image to cloud.
 */
export async function hydrateAccountAvatar(
  userId: string,
  email: string,
): Promise<void> {
  if (!userId || !isCloudSyncEnabled()) return

  try {
    // Purge any existing base64 metadata to recover clean JWT header
    const sb = getSupabase()
    const { data: userData } = await sb.auth.getUser()
    const metaAvatar = userData?.user?.user_metadata?.avatar_url
    if (typeof metaAvatar === 'string' && metaAvatar.startsWith('data:')) {
      await sb.auth.updateUser({
        data: { avatar_url: null },
      })
    }

    const cloudAvatar = await loadProfileAvatar(userId)
    const localAvatar = getUserAvatar(email)

    if (cloudAvatar && cloudAvatar.type === 'image') {
      if (localAvatar.type !== 'image' || localAvatar.value !== cloudAvatar.value) {
        setUserAvatar(cloudAvatar, email)
      }
      return
    }

    // Cloud is empty; if local has custom avatar, backfill profiles table once
    if (localAvatar.type === 'image' && localAvatar.value) {
      await saveProfileAvatar(userId, localAvatar)
    }
  } catch (err) {
    console.warn('[avatarCloud] unable to hydrate avatar', err)
  }
}

/**
 * Loads avatars for multiple users by their emails from Supabase profiles.
 * Used in collaboration panels to display companions' personalized avatars.
 */
export async function batchLoadProfileAvatars(
  emails: string[],
): Promise<Record<string, UserAvatar>> {
  const result: Record<string, UserAvatar> = {}
  if (!emails.length) return result

  const cleanEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  )
  if (!cleanEmails.length) return result

  // 1. Preload from local cache
  for (const email of cleanEmails) {
    const local = getUserAvatar(email)
    if (local.type === 'image' && local.value) {
      result[email] = local
    }
  }

  if (!isCloudSyncEnabled()) {
    return result
  }

  // 2. Fetch fresh avatars from profiles table
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('profiles')
      .select('email, avatar_url')
      .in('email', cleanEmails)

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row?.email && typeof row.avatar_url === 'string' && row.avatar_url) {
          const avatar: UserAvatar = { type: 'image', value: row.avatar_url }
          const normEmail = row.email.trim().toLowerCase()
          result[normEmail] = avatar
          setUserAvatar(avatar, normEmail)
        }
      }
    }
  } catch (err) {
    console.warn('[avatarCloud] batchLoadProfileAvatars failed:', err)
  }

  return result
}
