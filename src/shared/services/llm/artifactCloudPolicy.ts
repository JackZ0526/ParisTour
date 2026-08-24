/**
 * Which durable artifact keys belong on the trip cloud row.
 *
 * Google / Tripadvisor / Booking / photo payloads stay in localStorage so
 * cloud sync does not re-download megabytes of API cache. LLM copy that
 * should appear on another device is allowlisted here.
 *
 * Keep in sync with `public.artifact_key_is_cloud` in supabase/schema.sql.
 */
const CLOUD_KEY_PREFIXES = [
  'place-detail:',
  'hotel-detail:',
  'recommend:',
  'translations:',
  'place-names:',
  'itinerary:locale-copy:',
] as const

export function isCloudSyncedArtifactKey(key: string): boolean {
  if (!key) return false
  return CLOUD_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function filterCloudArtifactMap<T>(
  map: Record<string, T> | null | undefined,
): Record<string, T> {
  const out: Record<string, T> = {}
  if (!map || typeof map !== 'object') return out
  for (const [key, value] of Object.entries(map)) {
    if (isCloudSyncedArtifactKey(key)) out[key] = value
  }
  return out
}
