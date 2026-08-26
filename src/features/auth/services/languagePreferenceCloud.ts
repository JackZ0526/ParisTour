import { getSupabase, isCloudSyncEnabled } from '../../../shared/lib/supabase'
import {
  getSystemPreferredLocale,
  isLocale,
  setLocale,
  type Locale,
} from '../../../shared/i18n'

let isHydratingLanguage = false

export function isHydratingLanguagePreference(): boolean {
  return isHydratingLanguage
}

/** Test-only helper to reset hydration state */
export function _resetLanguageHydrationStateForTests(): void {
  isHydratingLanguage = false
}

/**
 * Loads the user's language preference from Supabase profiles / auth metadata.
 */
export async function loadProfileLanguagePreference(
  userId: string,
): Promise<Locale | null> {
  if (!userId || !isCloudSyncEnabled()) return null

  // 1. Try reading from profiles table
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('profiles')
      .select('language_preference')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data?.language_preference && isLocale(data.language_preference)) {
      return data.language_preference
    }
  } catch {
    /* ignore and try metadata */
  }

  // 2. Try reading from auth user metadata
  try {
    const sb = getSupabase()
    const { data: userData } = await sb.auth.getUser()
    const meta = userData?.user?.user_metadata
    const metaLang = meta?.language_preference || meta?.locale
    if (metaLang && isLocale(metaLang)) {
      return metaLang
    }
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Persists the user's language preference to Supabase profiles and auth metadata.
 */
export async function saveProfileLanguagePreference(
  userId: string,
  preference: Locale,
): Promise<void> {
  if (!userId || !isCloudSyncEnabled() || !isLocale(preference)) return

  // 1. Update profiles table
  try {
    const sb = getSupabase()
    const { data: userData } = await sb.auth.getUser()
    const email = userData?.user?.email || ''

    if (email) {
      const { error } = await sb
        .from('profiles')
        .upsert(
          { id: userId, email: email.toLowerCase(), language_preference: preference },
          { onConflict: 'id' },
        )
      if (error) {
        await sb.from('profiles').update({ language_preference: preference }).eq('id', userId)
      }
    } else {
      await sb.from('profiles').update({ language_preference: preference }).eq('id', userId)
    }
  } catch (err) {
    console.warn('[profile-language] profiles table update ignored:', err)
  }

  // 2. Also update auth user metadata so it travels seamlessly with the session
  try {
    const sb = getSupabase()
    await sb.auth.updateUser({
      data: { language_preference: preference, locale: preference },
    })
  } catch (err) {
    console.warn('[profile-language] auth metadata update ignored:', err)
  }
}

/**
 * Hydrates the user's language preference on login / startup:
 * - If account has a language preference saved in cloud, prioritize and apply it.
 * - If account has never set a language preference, determine by system language:
 *   Chinese -> 'zh-CN', non-Chinese -> 'en'.
 */
export async function hydrateAccountLanguagePreference(
  userId: string,
): Promise<void> {
  if (!userId || !isCloudSyncEnabled()) return

  try {
    isHydratingLanguage = true
    const cloudPreference = await loadProfileLanguagePreference(userId)

    if (cloudPreference) {
      setLocale(cloudPreference)
      return
    }

    // Account has never set a language: follow system language (non-Chinese defaults to English)
    const sysLocale = getSystemPreferredLocale()
    setLocale(sysLocale)
  } catch (err) {
    console.warn('[profile-language] unable to hydrate language preference', err)
  } finally {
    isHydratingLanguage = false
  }
}
