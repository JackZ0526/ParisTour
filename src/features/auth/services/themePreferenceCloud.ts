import { getSupabase } from '../../../shared/lib/supabase'
import {
  isThemePreference,
  type ThemePreference,
} from '../../../shared/services/themeStore'

/** Read the signed-in user's account-level theme preference. */
export async function loadProfileThemePreference(
  userId: string,
): Promise<ThemePreference | null> {
  if (!userId) return null

  const { data, error } = await getSupabase()
    .from('profiles')
    .select('theme_preference')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return isThemePreference(data?.theme_preference)
    ? data.theme_preference
    : null
}

/** Persist a theme choice to the signed-in user's profile. */
export async function saveProfileThemePreference(
  userId: string,
  preference: ThemePreference,
): Promise<void> {
  if (!userId) return

  const { error } = await getSupabase()
    .from('profiles')
    .update({ theme_preference: preference })
    .eq('id', userId)

  if (error) throw error
}
