import type { HotelCacheState } from '../../hotel/services/hotelCache'
import type { TripSnapshot } from './tripSnapshot'

/** UI-only hotel fields that must not trigger cloud writes or dirty checks. */
export function hotelForCloud(
  hotel: HotelCacheState | null | undefined,
): Omit<HotelCacheState, 'fetchedAt' | 'othersCollapsed'> | null {
  if (!hotel) return null
  const { fetchedAt: _fetchedAt, othersCollapsed: _collapsed, ...rest } = hotel
  return rest
}

/** JSON used to decide whether the trip core actually changed. */
export function snapshotCompareJson(snapshot: TripSnapshot): string {
  const { llmArtifacts: _artifacts, mapRoutes: _routes, hotel, itinerary, ...rest } = snapshot
  return JSON.stringify({
    ...rest,
    hotel: hotelForCloud(hotel),
    itinerary: itinerary
      ? { ...itinerary, days: [] }
      : null,
  })
}

export function hotelCompareJson(hotel: HotelCacheState | null | undefined): string {
  return JSON.stringify(hotelForCloud(hotel))
}

export type RemoteApplyDecision = 'ignore' | 'artifacts-only' | 'days-only' | 'apply-core' | 'keep-local'

/** Minimum gap between automatic `trip_backups` rows for the same trip. */
export const MIN_TRIP_BACKUP_INTERVAL_MS = 15 * 60 * 1000

/** Skip the artifact pull RPC when the client already has this revision. */
export function shouldPullTripArtifacts(
  hintRev: number | undefined,
  knownRev: number | undefined,
): boolean {
  return !(hintRev != null && knownRev != null && hintRev === knownRev)
}

/** Restore always archives; autosave keeps at most one backup per interval. */
export function shouldArchiveTripBackup(input: {
  force?: boolean
  lastArchiveAtMs: number | null
  nowMs: number
}): boolean {
  if (input.force) return true
  if (input.lastArchiveAtMs == null) return true
  return input.nowMs - input.lastArchiveAtMs >= MIN_TRIP_BACKUP_INTERVAL_MS
}

/**
 * Two-editor policy:
 * - Viewers / clean editors take the newer remote core.
 * - An editor with unsaved core changes keeps local work (last active writer wins on save).
 * - Artifact-only remote updates never remount the itinerary.
 */
export function planRemoteApply(input: {
  remoteNewer: boolean
  artifactsRevChanged: boolean
  daysRevChanged: boolean
  coreSame: boolean
  localCoreDirty: boolean
}): RemoteApplyDecision {
  if (!input.remoteNewer && !input.artifactsRevChanged && !input.daysRevChanged) {
    return 'ignore'
  }
  if (input.localCoreDirty) return 'keep-local'
  if (input.coreSame) {
    if (input.daysRevChanged) return 'days-only'
    return input.artifactsRevChanged ? 'artifacts-only' : 'ignore'
  }
  if (input.remoteNewer) return 'apply-core'
  if (input.daysRevChanged) return 'days-only'
  return input.artifactsRevChanged ? 'artifacts-only' : 'ignore'
}
