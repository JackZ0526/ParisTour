import { getSupabase, isCloudSyncEnabled } from '../../../shared/lib/supabase'
import { yieldToMain } from '../../../shared/lib/yieldToMain'
import {
  flushHotelCacheToStorage,
  type HotelCacheState,
} from '../../hotel/services/hotelCache'
import {
  ackArtifactCloudDiff,
  artifactCloudDiffIsEmpty,
  cloudArtifactKnownMap,
  flushLlmArtifactsToStorage,
  hasArtifactCloudDiff,
  markArtifactsCloudSynced,
  mergeCloudArtifacts,
  peekArtifactCloudDiff,
  type LlmArtifactMap,
} from '../../../shared/services/llm/llmArtifactStore'
import { filterCloudArtifactMap } from '../../../shared/services/llm/artifactCloudPolicy'
import {
  applyTripSnapshot,
  collectTripSnapshot,
  emptyTripSnapshot,
  type TripSnapshot,
} from './tripSnapshot'
import {
  hotelCompareJson,
  hotelForCloud,
  planRemoteApply,
  realtimeRowOmitsCore,
  snapshotCompareJson,
} from './tripCloudPolicy'
import {
  asDayPlanMap,
  dayCloudDiffIsEmpty,
  daysToMap,
  hashDayPlan,
  hashesForDays,
  knownHashesForPresentDays,
  mergeCloudDays,
  peekDayCloudDiff,
} from './itineraryDayCloud'
import { itineraryDayCount } from '../../itinerary/services/tripDates'
import {
  loadItineraryState,
  restoreFullFromBaseline,
  saveItineraryState,
} from '../../itinerary/utils/itineraryState'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { sanitizeMapRouteCache } from '../../map/services/mapRouteCache'
import { getUserNickname } from '../../auth/services/nicknameStore'
import { getLocale, translate, type Locale } from '../../../shared/i18n'

export type TripRole = 'owner' | 'viewer' | 'editor'

export type TripShareRole = 'viewer' | 'editor'

export type TripRow = {
  id: string
  owner_id: string
  is_primary: boolean
  title: string
  snapshot: TripSnapshot
  updated_at: string
  artifactsRev: number
  daysRev: number
}

/** One server-side archive row in `public.trip_backups` (not localStorage). */
export type TripSnapshotBackup = {
  id: string
  tripId: string
  createdAt: string
  snapshot: TripSnapshot
}

export type AccessibleTrip = {
  id: string
  title: string
  ownerId: string
  ownerEmail?: string
  ownerName?: string
  isPrimary: boolean
  role: TripRole
  updatedAt: string
  artifactsRev: number
  daysRev: number
  snapshot: TripSnapshot
  /** Label for switcher */
  label: string
}

export function formatOwnerHandle(email?: string | null, locale?: Locale): string {
  const others = translate('cloud.ownerOthers', undefined, locale) || 'Others'
  if (!email) return others
  try {
    const nick = getUserNickname(email)
    if (nick && nick.trim()) return nick.trim()
  } catch {
    /* ignore */
  }
  const prefix = email.split('@')[0]?.trim() || ''
  return prefix ? `@${prefix}` : others
}

const LAST_TRIP_KEY_PREFIX = 'paris-tour-last-trip-v1:'

function lastTripStorageKey(userId: string): string {
  return `${LAST_TRIP_KEY_PREFIX}${userId}`
}

/** Remember which trip this user last had open (own or shared). */
export function rememberLastTripId(userId: string, tripId: string): void {
  if (!userId || !tripId) return
  try {
    localStorage.setItem(lastTripStorageKey(userId), tripId)
  } catch {
    /* ignore quota / private mode */
  }
}

export function readLastTripId(userId: string): string | null {
  if (!userId) return null
  try {
    return localStorage.getItem(lastTripStorageKey(userId))
  } catch {
    return null
  }
}

/** Prefer last-opened trip if still accessible; otherwise own primary / first. */
export function pickPreferredTrip(
  accessible: AccessibleTrip[],
  userId: string,
): AccessibleTrip | null {
  if (!accessible.length) return null
  const remembered = readLastTripId(userId)
  if (remembered) {
    const match = accessible.find((t) => t.id === remembered)
    if (match) return match
  }
  return accessible.find((t) => t.role === 'owner' && t.isPrimary) || accessible[0] || null
}


export type TripShareRow = {
  id: string
  trip_id: string
  invitee_email: string
  role: TripShareRole
  created_at: string
}

function asSnapshot(raw: unknown): TripSnapshot {
  if (!raw || typeof raw !== 'object') return emptyTripSnapshot()
  const s = raw as Partial<TripSnapshot>
  const hasArtifacts = 'llmArtifacts' in s
  const llmArtifacts = hasArtifacts
    ? s.llmArtifacts && typeof s.llmArtifacts === 'object'
      ? s.llmArtifacts
      : {}
    : null
  return {
    version: 1,
    dates: s.dates ?? null,
    destination: typeof s.destination === 'string' ? s.destination : '',
    flights: s.flights ?? null,
    hotel: s.hotel ?? null,
    itinerary: s.itinerary ?? null,
    baseline: s.baseline ?? null,
    recommendationPreferences: s.recommendationPreferences ?? null,
    mapRoutes: sanitizeMapRouteCache(s.mapRoutes),
    llmArtifacts,
  }
}

function asArtifactMap(raw: unknown): LlmArtifactMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as LlmArtifactMap
}

function asHotelState(raw: unknown): HotelCacheState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as HotelCacheState
}

function asArtifactsRev(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const TRIP_CORE_COLUMNS =
  'id, owner_id, is_primary, title, snapshot, hotel, updated_at, artifacts_rev, days_rev'

/** Join split cloud columns (and legacy embedded snapshot fields) into one trip snapshot. */
function snapshotFromCloudRow(row: {
  snapshot?: unknown
  hotel?: unknown
  artifacts?: unknown
}): TripSnapshot {
  const base = asSnapshot(row.snapshot)
  const hotel = row.hotel === undefined ? base.hotel : asHotelState(row.hotel)
  const artifacts =
    row.artifacts === undefined
      ? base.llmArtifacts && typeof base.llmArtifacts === 'object'
        ? base.llmArtifacts
        : {}
      : asArtifactMap(row.artifacts)
  return {
    ...base,
    hotel: hotel ?? null,
    llmArtifacts: artifacts,
  }
}

function tripRowFromCloud(row: {
  id: string
  owner_id: string
  is_primary?: boolean
  title?: string
  updated_at: string
  artifacts_rev?: unknown
  days_rev?: unknown
  snapshot?: unknown
  hotel?: unknown
  artifacts?: unknown
}): TripRow {
  return {
    id: row.id,
    owner_id: row.owner_id,
    is_primary: Boolean(row.is_primary),
    title: row.title || '',
    snapshot: snapshotFromCloudRow(row),
    updated_at: row.updated_at,
    artifactsRev: asArtifactsRev(row.artifacts_rev),
    daysRev: asArtifactsRev(row.days_rev),
  }
}

function logTripCloudRead(label: string, payload: unknown) {
  try {
    const bytes = JSON.stringify(payload ?? null).length
    console.debug(`[tripCloud] ${label} ~${Math.max(1, Math.round(bytes / 1024))}KB`)
  } catch {
    /* ignore */
  }
}

function coreSnapshotForCloud(snapshot: TripSnapshot): TripSnapshot {
  const clean = asSnapshot(snapshot)
  const itinerary = clean.itinerary
    ? { ...clean.itinerary, days: [] }
    : null
  return {
    ...clean,
    itinerary,
    hotel: null,
    mapRoutes: {},
    llmArtifacts: {},
  }
}

type CloudPartsJson = {
  core: string
  hotel: string
}

function cloudPartsJson(snapshot: TripSnapshot): CloudPartsJson {
  const clean = asSnapshot(snapshot)
  return {
    core: JSON.stringify(coreSnapshotForCloud(clean)),
    hotel: hotelCompareJson(clean.hotel),
  }
}

type CloudSavePart = 'core' | 'hotel' | 'artifacts' | 'days'

class StaleCloudSaveError extends Error {
  constructor() {
    super('stale-cloud-save')
    this.name = 'StaleCloudSaveError'
  }
}

const MAX_TRIP_BACKUPS = 5

/** Archive copy without bulky LLM caches / nested history. */
function snapshotForBackup(snapshot: TripSnapshot): TripSnapshot {
  const clean = asSnapshot(snapshot)
  return {
    ...clean,
    mapRoutes: {},
    llmArtifacts: {},
  }
}

function substantiveSnapshotJson(snapshot: TripSnapshot): string {
  const clean = asSnapshot(snapshot)
  return JSON.stringify({
    version: clean.version,
    dates: clean.dates,
    destination: clean.destination,
    flights: clean.flights,
    hotel: clean.hotel
      ? {
          selectedId: clean.hotel.selected?.id ?? null,
          candidateIds: (clean.hotel.candidates || []).map(
            (card) => card.bookingHotelId || card.id,
          ),
        }
      : null,
    itinerary: clean.itinerary,
    baseline: clean.baseline,
    recommendationPreferences: clean.recommendationPreferences,
  })
}

async function archiveTripSnapshot(
  tripId: string,
  previous: TripSnapshot,
  createdAt?: string | null,
): Promise<void> {
  const sb = getSupabase()
  const row: { trip_id: string; snapshot: TripSnapshot; created_at?: string } = {
    trip_id: tripId,
    snapshot: snapshotForBackup(previous),
  }
  if (typeof createdAt === 'string' && createdAt.trim()) {
    row.created_at = createdAt.trim()
  }
  const { error: insertError } = await sb.from('trip_backups').insert(row)
  if (insertError) throw insertError

  const { data: ids, error: listError } = await sb
    .from('trip_backups')
    .select('id')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  if (listError) throw listError

  const overflow = (ids || []).slice(MAX_TRIP_BACKUPS)
  if (!overflow.length) return
  const { error: deleteError } = await sb
    .from('trip_backups')
    .delete()
    .in(
      'id',
      overflow.map((r) => r.id),
    )
  if (deleteError) throw deleteError
}

export async function isEmailAllowlisted(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const sb = getSupabase()
  // security definer RPC — works for anon (pre-login invite check)
  const { data, error } = await sb.rpc('is_allowlisted_email', {
    check_email: normalized,
  })
  if (error) {
    console.warn('[allowlist]', error.message)
    return false
  }
  return data === true
}

export async function getProfileAllowlisted(userId: string): Promise<boolean> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('profiles')
    .select('allowlisted')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[profile]', error.message)
    return false
  }
  return data?.allowlisted === true
}

/** Ensure the signed-in user has a primary trip row; create empty if missing. */
export async function ensurePrimaryTrip(userId: string): Promise<TripRow> {
  const sb = getSupabase()
  const { data: existing, error: selectError } = await sb
    .from('trips')
    .select(TRIP_CORE_COLUMNS)
    .eq('owner_id', userId)
    .eq('is_primary', true)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing) {
    return tripRowFromCloud(existing)
  }

  // A temporarily missing/rotating auth token makes RLS hide existing trips.
  // Verify the token with Auth before attempting a primary-trip insert, so a
  // session race can never be mistaken for a brand-new account.
  const { data: authData, error: authError } = await sb.auth.getUser()
  if (authError || authData.user?.id !== userId) {
    throw new Error(translate('errors.cloudSessionUnverified'))
  }

  const empty = emptyTripSnapshot()
  const { data: created, error: insertError } = await sb
    .from('trips')
    .insert({
      owner_id: userId,
      is_primary: true,
      title: translate('cloud.defaultPrimaryTripTitle'),
      snapshot: coreSnapshotForCloud(empty),
      hotel: null,
      artifacts: {},
      itinerary_days: {},
      itinerary_day_hashes: {},
    })
    .select(TRIP_CORE_COLUMNS)
    .single()

  if (insertError) {
    // Race: another tab created primary; re-read.
    const { data: raced, error: raceError } = await sb
      .from('trips')
      .select(TRIP_CORE_COLUMNS)
      .eq('owner_id', userId)
      .eq('is_primary', true)
      .maybeSingle()
    if (raced) {
      return tripRowFromCloud(raced)
    }
    throw insertError || raceError
  }
  return tripRowFromCloud(created)
}

export async function listAccessibleTrips(
  userId: string,
  userEmail: string,
): Promise<AccessibleTrip[]> {
  const sb = getSupabase()
  const email = userEmail.trim().toLowerCase()
  const out: AccessibleTrip[] = []

  const primary = await ensurePrimaryTrip(userId)
  out.push({
    id: primary.id,
    title: primary.title || translate('cloud.defaultPrimaryTripTitle'),
    ownerId: primary.owner_id,
    ownerEmail: email,
    ownerName: formatOwnerHandle(email, getLocale()),
    isPrimary: true,
    role: 'owner',
    updatedAt: primary.updated_at,
    artifactsRev: primary.artifactsRev,
    daysRev: primary.daysRev,
    snapshot: primary.snapshot,
    label: primary.title || translate('cloud.tripPrimary'),
  })

  const { data: shares, error: shareError } = await sb
    .from('trip_shares')
    .select('trip_id, role, trips(id, owner_id, is_primary, title, snapshot, hotel, updated_at, artifacts_rev, days_rev)')
    .eq('invitee_email', email)

  if (shareError) throw shareError

  for (const row of shares || []) {
    const trip = row.trips as unknown as
      | {
          id: string
          owner_id: string
          is_primary?: boolean
          title?: string
          updated_at: string
          artifacts_rev?: unknown
          days_rev?: unknown
          snapshot?: unknown
          hotel?: unknown
        }
      | Array<{
          id: string
          owner_id: string
          is_primary?: boolean
          title?: string
          updated_at: string
          artifacts_rev?: unknown
          days_rev?: unknown
          snapshot?: unknown
          hotel?: unknown
        }>
      | null
    const rawTrip = Array.isArray(trip) ? trip[0] : trip
    if (!rawTrip?.id) continue
    if (out.some((x) => x.id === rawTrip.id)) continue
    const role: TripRole = row.role === 'editor' ? 'editor' : 'viewer'
    const perm = role === 'editor' ? translate('cloud.permEditor') : translate('cloud.permViewer')

    let rawOwnerEmail: string | undefined
    const { data: ownerEmailRes } = await sb.rpc('trip_owner_email', {
      p_trip_id: rawTrip.id,
    })
    if (typeof ownerEmailRes === 'string' && ownerEmailRes.trim()) {
      rawOwnerEmail = ownerEmailRes.trim().toLowerCase()
    }
    const ownerName = formatOwnerHandle(rawOwnerEmail, getLocale())

    const shared = tripRowFromCloud(rawTrip)
    out.push({
      id: shared.id,
      title: shared.title || translate('cloud.defaultSharedTripTitle'),
      ownerId: shared.owner_id,
      ownerEmail: rawOwnerEmail,
      ownerName,
      isPrimary: shared.is_primary,
      role,
      updatedAt: shared.updated_at,
      artifactsRev: shared.artifactsRev,
      daysRev: shared.daysRev,
      snapshot: shared.snapshot,
      label: translate('cloud.sharedTripLabel', { owner: ownerName, perm }),
    })
  }

  // Batch resolve owner nicknames for shared trips from cloud profiles
  const ownerEmails = Array.from(
    new Set(out.map((t) => t.ownerEmail).filter(Boolean) as string[]),
  )
  if (ownerEmails.length) {
    try {
      const { batchLoadProfileNicknames } = await import(
        '../../auth/services/nicknamePreferenceCloud'
      )
      const nickMap = await batchLoadProfileNicknames(ownerEmails)
      for (const trip of out) {
        if (trip.ownerEmail) {
          const nick =
            nickMap[trip.ownerEmail.toLowerCase()] ||
            getUserNickname(trip.ownerEmail)
          if (nick) {
            trip.ownerName = nick
            if (trip.role !== 'owner') {
              const perm = trip.role === 'editor' ? '可编辑' : '只读'
              trip.label = `来自 ${nick} · ${perm}`
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out
}

export async function loadTripById(tripId: string): Promise<TripRow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('trips')
    .select(TRIP_CORE_COLUMNS)
    .eq('id', tripId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  logTripCloudRead('loadTripById', data)
  return tripRowFromCloud(data)
}

function parsePatchResult(data: unknown): { updatedAt: string | null; rev: number | null } {
  if (typeof data === 'string' && data.trim()) {
    return { updatedAt: data.trim(), rev: null }
  }
  if (data && typeof data === 'object') {
    const rec = data as { updated_at?: unknown; rev?: unknown }
    const updatedAt =
      typeof rec.updated_at === 'string' && rec.updated_at.trim()
        ? rec.updated_at.trim()
        : null
    return { updatedAt, rev: rec.rev == null ? null : asArtifactsRev(rec.rev) }
  }
  return { updatedAt: null, rev: null }
}

function isMissingRpc(err: unknown, fn: string): boolean {
  const rec = asRecord(err)
  const code = rec && typeof rec.code === 'string' ? rec.code : ''
  const raw = extractErrorText(err).toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (raw.includes(fn) && /does not exist|could not find|schema cache/.test(raw))
  )
}

type PulledArtifacts = {
  rev: number
  upserts: LlmArtifactMap
  deletes: string[]
}

function parsePullResult(data: unknown): PulledArtifacts {
  const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const upserts = asArtifactMap(rec.upserts)
  const deletes = Array.isArray(rec.deletes)
    ? rec.deletes.filter((key): key is string => typeof key === 'string')
    : []
  return {
    rev: asArtifactsRev(rec.rev),
    upserts,
    deletes,
  }
}

/** Incremental artifact hydrate: only keys the client does not already have. */
export async function syncTripArtifactsFromCloud(
  tripId: string,
  hintRev?: number,
): Promise<void> {
  if (!tripId || !isCloudSyncEnabled()) return
  const knownRev = lastAppliedArtifactsRevByTrip.get(tripId)
  if (hintRev != null && knownRev != null && hintRev === knownRev) return

  const sb = getSupabase()
  let pulled: PulledArtifacts
  try {
    const { data, error } = await sb.rpc('pull_trip_artifacts', {
      p_trip_id: tripId,
      p_known: cloudArtifactKnownMap(),
    })
    if (error) throw error
    pulled = parsePullResult(data)
    logTripCloudRead('pull_trip_artifacts', {
      rev: pulled.rev,
      upsertKeys: Object.keys(pulled.upserts).length,
      deletes: pulled.deletes.length,
      upserts: pulled.upserts,
    })
  } catch (err) {
    if (!isMissingRpc(err, 'pull_trip_artifacts')) throw err
    const { data, error } = await sb
      .from('trips')
      .select('artifacts, artifacts_rev')
      .eq('id', tripId)
      .maybeSingle()
    if (error) throw error
    logTripCloudRead('artifacts fallback select', data)
    pulled = {
      rev: asArtifactsRev(data?.artifacts_rev),
      upserts: filterCloudArtifactMap(asArtifactMap(data?.artifacts)),
      deletes: [],
    }
  }

  mergeCloudArtifacts({
    upserts: pulled.upserts,
    deletes: pulled.deletes,
    silent: true,
  })
  lastAppliedArtifactsRevByTrip.set(tripId, pulled.rev)
}

/** Incremental day hydrate: only days whose hash the client does not already have. */
export async function syncTripDaysFromCloud(
  tripId: string,
  hintRev?: number,
): Promise<boolean> {
  if (!tripId || !isCloudSyncEnabled()) return false
  const localDays = loadItineraryState().days
  const localEmpty = !localDays.length
  const knownRev = lastAppliedDaysRevByTrip.get(tripId)
  if (
    !localEmpty &&
    hintRev != null &&
    knownRev != null &&
    hintRev === knownRev
  ) {
    return false
  }

  const sb = getSupabase()
  const skip = dirtyDayKeys(tripId)
  const known = knownHashesForPresentDays(
    localDays,
    lastAppliedDayHashesByTrip.get(tripId),
  )
  let pulled: { rev: number; upserts: ReturnType<typeof asDayPlanMap>; deletes: string[] }
  try {
    const { data, error } = await sb.rpc('pull_trip_days', {
      p_trip_id: tripId,
      p_known: known,
    })
    if (error) throw error
    const parsed = parsePullResult(data)
    pulled = {
      rev: parsed.rev,
      upserts: asDayPlanMap(parsed.upserts),
      deletes: localEmpty ? [] : parsed.deletes,
    }
    logTripCloudRead('pull_trip_days', {
      rev: pulled.rev,
      upsertKeys: Object.keys(pulled.upserts).length,
      deletes: pulled.deletes.length,
    })
  } catch (err) {
    if (!isMissingRpc(err, 'pull_trip_days')) throw err
    const { data, error } = await sb
      .from('trips')
      .select('itinerary_days, days_rev')
      .eq('id', tripId)
      .maybeSingle()
    if (error) throw error
    logTripCloudRead('itinerary_days fallback select', data)
    pulled = {
      rev: asArtifactsRev(data?.days_rev),
      upserts: asDayPlanMap(data?.itinerary_days),
      deletes: [],
    }
  }

  const applied = mergeCloudDays({
    upserts: pulled.upserts,
    deletes: pulled.deletes,
    skipKeys: skip,
  })
  const acked: Record<string, string> = {}
  for (const [key, plan] of Object.entries(pulled.upserts)) {
    if (skip.has(key)) continue
    acked[key] = hashDayPlan(plan)
  }
  ackDayHashes(
    tripId,
    acked,
    pulled.deletes.filter((key) => !skip.has(key)),
  )
  lastAppliedDaysRevByTrip.set(tripId, pulled.rev)
  return applied
}

type TripUpdateResult = {
  updatedAt: string | null
  rev: number
  daysRev: number
}

async function updateTripRow(
  tripId: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt: string | null,
): Promise<TripUpdateResult | 'stale'> {
  const sb = getSupabase()
  const query = expectedUpdatedAt
    ? sb.from('trips').update(patch).eq('id', tripId).eq('updated_at', expectedUpdatedAt)
    : sb.from('trips').update(patch).eq('id', tripId)
  const { data, error } = await query.select('updated_at, artifacts_rev, days_rev').maybeSingle()
  if (error) throw error
  if (!data) return 'stale'
  return {
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
    rev: asArtifactsRev(data.artifacts_rev),
    daysRev: asArtifactsRev(data.days_rev),
  }
}

async function applyLockedTripUpdate(
  tripId: string,
  patch: Record<string, unknown>,
  opts?: { overwriteOnConflict?: boolean },
): Promise<TripUpdateResult> {
  const expected = lastAppliedUpdatedAtByTrip.get(tripId) ?? null
  const first = await updateTripRow(tripId, patch, expected)
  if (first !== 'stale') return first

  const full = await loadTripById(tripId)
  if (!full) throw new Error(translate('cloud.errorUnknown'))

  if (opts?.overwriteOnConflict || isLocalCoreDirty(tripId)) {
    const retry = await updateTripRow(tripId, patch, null)
    if (retry === 'stale') throw new Error(translate('cloud.errorConflict'))
    return retry
  }

  applyRemoteTripSnapshot(tripId, full.snapshot, full.updated_at, {
    trustSnapshot: true,
    hydrateArtifacts: false,
    hydrateDays: false,
  })
  try {
    await syncTripArtifactsFromCloud(tripId, full.artifactsRev)
  } catch (err) {
    console.warn('[tripCloud] artifact pull after stale save failed', err)
  }
  try {
    await syncTripDaysFromCloud(tripId, full.daysRev)
  } catch (err) {
    console.warn('[tripCloud] day pull after stale save failed', err)
  }
  realtimeApplyHandler?.(tripId)
  throw new StaleCloudSaveError()
}

export async function saveTripSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
  options?: {
    archivePrevious?: boolean
    parts?: CloudSavePart[]
    /** Write the snapshot's artifacts blob as-is (restore / RPC fallback). */
    replaceArtifacts?: boolean
  },
): Promise<string | null> {
  const sb = getSupabase()
  const parts = options?.parts?.length
    ? options.parts
    : (['core', 'hotel', 'artifacts', 'days'] as CloudSavePart[])
  const nextSnapshot = asSnapshot(snapshot)
  const nextParts = cloudPartsJson(nextSnapshot)
  const prevParts = lastSavedPartsByTrip.get(tripId)

  const patch: Record<string, unknown> = {}
  if (parts.includes('core') && nextParts.core !== prevParts?.core) {
    patch.snapshot = coreSnapshotForCloud(nextSnapshot)
  }
  if (parts.includes('hotel') && nextParts.hotel !== prevParts?.hotel) {
    patch.hotel = hotelForCloud(nextSnapshot.hotel)
  }

  let latestUpdatedAt: string | null = lastAppliedUpdatedAtByTrip.get(tripId) ?? null

  if (parts.includes('artifacts') && options?.replaceArtifacts) {
    patch.artifacts = filterCloudArtifactMap(
      nextSnapshot.llmArtifacts && typeof nextSnapshot.llmArtifacts === 'object'
        ? nextSnapshot.llmArtifacts
        : {},
    )
    patch.artifacts_rev = (lastAppliedArtifactsRevByTrip.get(tripId) ?? 0) + 1
    patch.itinerary_days = daysToMap(nextSnapshot.itinerary?.days)
    patch.itinerary_day_hashes = hashesForDays(nextSnapshot.itinerary?.days)
    patch.days_rev = (lastAppliedDaysRevByTrip.get(tripId) ?? 0) + 1
  }

  if (Object.keys(patch).length) {
    if (options?.archivePrevious !== false && (patch.snapshot || patch.hotel)) {
      const { data: current, error: currentError } = await sb
        .from('trips')
        .select('snapshot, hotel, updated_at')
        .eq('id', tripId)
        .maybeSingle()
      if (currentError) throw currentError
      const previous = snapshotFromCloudRow(current || {})
      if (substantiveSnapshotJson(previous) !== substantiveSnapshotJson(nextSnapshot)) {
        await archiveTripSnapshot(
          tripId,
          previous,
          typeof current?.updated_at === 'string' ? current.updated_at : null,
        )
      }
    }

    const updated = await applyLockedTripUpdate(tripId, patch, {
      overwriteOnConflict: options?.replaceArtifacts === true,
    })
    latestUpdatedAt = updated.updatedAt ?? latestUpdatedAt
    if (updated.updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updated.updatedAt)
    if (patch.artifacts !== undefined) {
      markArtifactsCloudSynced()
      lastAppliedArtifactsRevByTrip.set(tripId, updated.rev)
    }
    if (patch.itinerary_days !== undefined) {
      ackDayHashes(tripId, hashesForDays(nextSnapshot.itinerary?.days), [])
      lastAppliedDaysRevByTrip.set(tripId, updated.daysRev)
    }
  }

  if (parts.includes('artifacts') && !options?.replaceArtifacts) {
    const patched = await patchTripArtifactsOrFallback(tripId, nextSnapshot)
    if ('updatedAt' in patched) {
      if (patched.updatedAt) latestUpdatedAt = patched.updatedAt
    } else {
      const updated = await applyLockedTripUpdate(tripId, patched.fallbackPatch, {
        overwriteOnConflict: true,
      })
      latestUpdatedAt = updated.updatedAt ?? latestUpdatedAt
      if (updated.updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updated.updatedAt)
      markArtifactsCloudSynced()
      lastAppliedArtifactsRevByTrip.set(tripId, updated.rev)
    }
  }

  if (parts.includes('days') && !options?.replaceArtifacts) {
    const patched = await patchTripDaysOrFallback(tripId, nextSnapshot)
    if ('updatedAt' in patched) {
      if (patched.updatedAt) latestUpdatedAt = patched.updatedAt
    } else {
      const updated = await applyLockedTripUpdate(tripId, patched.fallbackPatch, {
        overwriteOnConflict: true,
      })
      latestUpdatedAt = updated.updatedAt ?? latestUpdatedAt
      if (updated.updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updated.updatedAt)
      if (patched.fallbackPatch.itinerary_day_hashes) {
        ackDayHashes(
          tripId,
          patched.fallbackPatch.itinerary_day_hashes as Record<string, string>,
          [],
        )
      }
      lastAppliedDaysRevByTrip.set(tripId, updated.daysRev)
    }
  }

  return latestUpdatedAt
}

function isMissingPatchRpc(err: unknown): boolean {
  return isMissingRpc(err, 'patch_trip_artifacts')
}

async function patchTripArtifactsOrFallback(
  tripId: string,
  snapshot: TripSnapshot,
): Promise<{ updatedAt: string | null } | { fallbackPatch: Record<string, unknown> }> {
  const diff = peekArtifactCloudDiff()
  if (artifactCloudDiffIsEmpty(diff)) return { updatedAt: null }

  const sb = getSupabase()
  try {
    const { data, error } = await sb.rpc('patch_trip_artifacts', {
      p_trip_id: tripId,
      p_upserts: filterCloudArtifactMap(diff.upserts),
      p_deletes: diff.deletes,
    })
    if (error) throw error
    ackArtifactCloudDiff(diff)
    const parsed = parsePatchResult(data)
    if (parsed.rev != null) lastAppliedArtifactsRevByTrip.set(tripId, parsed.rev)
    logTripCloudRead('patch_trip_artifacts', {
      upsertKeys: Object.keys(diff.upserts).length,
      deletes: diff.deletes.length,
    })
    return { updatedAt: parsed.updatedAt }
  } catch (err) {
    if (!isMissingPatchRpc(err)) throw err
    return {
      fallbackPatch: {
        artifacts: filterCloudArtifactMap(
          snapshot.llmArtifacts && typeof snapshot.llmArtifacts === 'object'
            ? snapshot.llmArtifacts
            : {},
        ),
        artifacts_rev: (lastAppliedArtifactsRevByTrip.get(tripId) ?? 0) + 1,
      },
    }
  }
}

async function patchTripDaysOrFallback(
  tripId: string,
  snapshot: TripSnapshot,
): Promise<{ updatedAt: string | null } | { fallbackPatch: Record<string, unknown> }> {
  const diff = peekDaysForTrip(tripId, snapshot)
  if (dayCloudDiffIsEmpty(diff)) return { updatedAt: null }

  const sb = getSupabase()
  try {
    const { data, error } = await sb.rpc('patch_trip_days', {
      p_trip_id: tripId,
      p_upserts: diff.upserts,
      p_hashes: diff.hashes,
      p_deletes: diff.deletes,
    })
    if (error) throw error
    ackDayHashes(tripId, diff.hashes, diff.deletes)
    const parsed = parsePatchResult(data)
    if (parsed.rev != null) lastAppliedDaysRevByTrip.set(tripId, parsed.rev)
    logTripCloudRead('patch_trip_days', {
      upsertKeys: Object.keys(diff.upserts).length,
      deletes: diff.deletes.length,
    })
    return { updatedAt: parsed.updatedAt }
  } catch (err) {
    if (!isMissingRpc(err, 'patch_trip_days')) throw err
    return {
      fallbackPatch: {
        itinerary_days: daysToMap(snapshot.itinerary?.days),
        itinerary_day_hashes: hashesForDays(snapshot.itinerary?.days),
        days_rev: (lastAppliedDaysRevByTrip.get(tripId) ?? 0) + 1,
      },
    }
  }
}

/** List server-side backups for a trip (newest first, max 5). */
export async function listTripSnapshotBackups(
  tripId: string,
): Promise<TripSnapshotBackup[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('trip_backups')
    .select('id, trip_id, snapshot, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .limit(MAX_TRIP_BACKUPS)
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id as string,
    tripId: row.trip_id as string,
    createdAt: row.created_at as string,
    snapshot: asSnapshot(row.snapshot),
  }))
}

/** Restore a server backup into trips.snapshot (archives current first). */
export async function restoreTripSnapshotBackup(
  tripId: string,
  backupIdToRestore: string,
): Promise<string | null> {
  const sb = getSupabase()
  const { data: backupRow, error: backupError } = await sb
    .from('trip_backups')
    .select('id, trip_id, snapshot, created_at')
    .eq('id', backupIdToRestore)
    .eq('trip_id', tripId)
    .maybeSingle()
  if (backupError) throw backupError
  if (!backupRow) throw new Error(translate('errors.cloudBackupNotFound'))

  const restored = asSnapshot(backupRow.snapshot)
  // Keep restored artifacts empty if backup was stripped; do not invent old caches.
  if (!restored.llmArtifacts) restored.llmArtifacts = {}

  return saveTripSnapshot(tripId, restored, {
    archivePrevious: true,
    replaceArtifacts: true,
  })
}

/** Debounced cloud writer — only persists when the snapshot actually changed. */
const SAVE_DEBOUNCE_MS = 2000
const SAVE_ARTIFACTS_DEBOUNCE_MS = 3500
const MAX_TRANSIENT_SAVE_RETRIES = 1
const TRANSIENT_SAVE_RETRY_MS = 2000

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTripId: string | null = null
let saveInFlight = false
let queuedSaveMode: 'none' | 'artifacts' | 'full' = 'none'
let queuedAllowEmptyTrip = false
let pendingAfterFlight = false
let transientSaveRetryCount = 0
/** Pause uploads during bursty work (itinerary generation); flush once on release. */
let saveHoldCount = 0
/** Ignore mirrored realtime events right after our own save. */
let suppressRemoteUntil = 0
let suppressFlushTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Snapshot JSON currently reconciled on this client (last save or last applied remote).
 * Used to skip no-op local uploads — not to reject re-applying historical remote states.
 */
const lastSavedJsonByTrip = new Map<string, string>()
/** Per-blob fingerprints so we can PATCH only the columns that changed. */
const lastSavedPartsByTrip = new Map<string, CloudPartsJson>()
/** Last known generated itinerary, retained as a safety baseline across an empty regression. */
const lastGeneratedJsonByTrip = new Map<string, string>()
/** Last trip.updated_at we reconciled (save or remote apply). */
const lastAppliedUpdatedAtByTrip = new Map<string, string>()
/** Last artifacts_rev we pulled/patched for a trip. */
const lastAppliedArtifactsRevByTrip = new Map<string, number>()
/** Last days_rev we pulled/patched for a trip. */
const lastAppliedDaysRevByTrip = new Map<string, number>()
/** Per-day hashes last acked with the server. */
const lastAppliedDayHashesByTrip = new Map<string, Record<string, string>>()

type QueuedRemote = {
  tripId: string
  snapshot: TripSnapshot
  updatedAt: string
  trustSnapshot: boolean
  onApply: () => void
}
/** Latest remote update deferred while saving / swallowing our own echo. */
let queuedRemote: QueuedRemote | null = null
let realtimeApplyHandler: ((tripId: string) => void) | null = null

export type CloudSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
export type CloudSyncStatus = 'idle' | 'syncing' | 'synced'

export type CloudSaveTarget =
  | 'itinerary_days'
  | 'place_details'
  | 'translations'
  | 'hotel'
  | 'flights_dates'
  | 'preferences'
  | 'custom_places'
  | 'composite'
  | 'general'

let cloudSaveStatus: CloudSaveStatus = 'idle'
let cloudSaveError: string | null = null
let cloudSaveTarget: CloudSaveTarget = 'general'
let cloudSaveDayNumbers: number[] | undefined = undefined
let savedHideTimer: ReturnType<typeof setTimeout> | null = null
const cloudSaveListeners = new Set<() => void>()

let cloudSyncStatus: CloudSyncStatus = 'idle'
let cloudSyncTarget: CloudSaveTarget = 'general'
let cloudSyncDayNumbers: number[] | undefined = undefined
let syncedHideTimer: ReturnType<typeof setTimeout> | null = null
const cloudSyncListeners = new Set<() => void>()

export function getCloudSaveStatus(): CloudSaveStatus {
  return cloudSaveStatus
}

export function getCloudSaveError(): string | null {
  return cloudSaveError
}

export function getCloudSaveTarget(): CloudSaveTarget {
  return cloudSaveTarget
}

export function getCloudSaveDayNumbers(): number[] | undefined {
  return cloudSaveDayNumbers
}

export function subscribeCloudSaveStatus(listener: () => void): () => void {
  cloudSaveListeners.add(listener)
  return () => {
    cloudSaveListeners.delete(listener)
  }
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return cloudSyncStatus
}

export function getCloudSyncTarget(): CloudSaveTarget {
  return cloudSyncTarget
}

export function getCloudSyncDayNumbers(): number[] | undefined {
  return cloudSyncDayNumbers
}

export function subscribeCloudSyncStatus(listener: () => void): () => void {
  cloudSyncListeners.add(listener)
  return () => {
    cloudSyncListeners.delete(listener)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function extractErrorText(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  const rec = asRecord(err)
  if (!rec) return ''
  const parts = [rec.message, rec.details, rec.hint]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
  if (parts.length) return parts.join(' · ')
  if (rec.cause) return extractErrorText(rec.cause)
  return ''
}

function describeCloudSaveError(err: unknown): string {
  const rec = asRecord(err)
  const code = rec && typeof rec.code === 'string' ? rec.code : ''
  const raw = extractErrorText(err)
  const haystack = `${code} ${raw}`.toLowerCase()
  const locale = getLocale()

  if (/row-level security|rls|42501|permission denied|not authorized/.test(haystack)) {
    return translate('cloud.errorNoWritePermission', undefined, locale)
  }
  if (/jwt|not authenticated|invalid claim|401/.test(haystack)) {
    return translate('cloud.errorSessionExpired', undefined, locale)
  }
  if (/payload too large|too large|413|54000|value too long/.test(haystack)) {
    return translate('cloud.errorPayloadTooLarge', undefined, locale)
  }
  if (/failed to fetch|networkerror|network request|load failed/.test(haystack)) {
    return translate('cloud.errorNetworkDown', undefined, locale)
  }
  if (/timeout|timed out|57014/.test(haystack)) {
    return translate('cloud.errorTimeout', undefined, locale)
  }
  if (/duplicate|23505|conflict|409/.test(haystack)) {
    return translate('cloud.errorConflict', undefined, locale)
  }
  const failGeneric = translate('cloud.saveLabelError', undefined, locale)
  if (code && raw && raw !== failGeneric) {
    return `${raw}（${code}）`
  }
  if (raw && raw !== failGeneric) return raw
  return code
    ? translate('cloud.errorCodeOnly', { code }, locale)
    : translate('cloud.errorUnknown', undefined, locale)
}

function isTransientCloudSaveError(err: unknown): boolean {
  const rec = asRecord(err)
  const code = rec && typeof rec.code === 'string' ? rec.code : ''
  const raw = extractErrorText(err)
  return /timeout|timed out|57014|failed to fetch|networkerror|network request|load failed|\b50[234]\b/i.test(
    `${code} ${raw}`,
  )
}

function setCloudSaveStatus(
  next: CloudSaveStatus,
  error: string | null = null,
  opts?: { target?: CloudSaveTarget; dayNumbers?: number[] },
) {
  cloudSaveStatus = next
  cloudSaveError = error
  if (opts?.target) cloudSaveTarget = opts.target
  if (opts?.dayNumbers) cloudSaveDayNumbers = opts.dayNumbers
  else if (next === 'idle') {
    cloudSaveTarget = 'general'
    cloudSaveDayNumbers = undefined
  }
  if (savedHideTimer) {
    clearTimeout(savedHideTimer)
    savedHideTimer = null
  }
  if (next === 'saved') {
    savedHideTimer = setTimeout(() => {
      if (cloudSaveStatus === 'saved') {
        cloudSaveStatus = 'idle'
        cloudSaveError = null
        cloudSaveTarget = 'general'
        cloudSaveDayNumbers = undefined
        cloudSaveListeners.forEach((l) => l())
      }
    }, 2400)
  }
  cloudSaveListeners.forEach((l) => l())
}

function setCloudSyncStatus(
  next: CloudSyncStatus,
  opts?: { target?: CloudSaveTarget; dayNumbers?: number[] },
) {
  cloudSyncStatus = next
  if (opts?.target) cloudSyncTarget = opts.target
  if (opts?.dayNumbers) cloudSyncDayNumbers = opts.dayNumbers
  else if (next === 'idle') {
    cloudSyncTarget = 'general'
    cloudSyncDayNumbers = undefined
  }
  if (syncedHideTimer) {
    clearTimeout(syncedHideTimer)
    syncedHideTimer = null
  }
  if (next === 'synced') {
    syncedHideTimer = setTimeout(() => {
      if (cloudSyncStatus === 'synced') {
        cloudSyncStatus = 'idle'
        cloudSyncTarget = 'general'
        cloudSyncDayNumbers = undefined
        cloudSyncListeners.forEach((l) => l())
      }
    }, 2400)
  }
  cloudSyncListeners.forEach((l) => l())
}

function snapshotJson(snapshot: TripSnapshot): string {
  return snapshotCompareJson(asSnapshot(snapshot))
}

function isLocalCoreDirty(tripId: string): boolean {
  const last = lastSavedJsonByTrip.get(tripId)
  if (!last) return false
  try {
    return snapshotJson(collectTripSnapshot()) !== last
  } catch {
    return false
  }
}

function trackSavedSnapshot(tripId: string, snapshot: TripSnapshot, json?: string) {
  lastSavedJsonByTrip.set(tripId, json ?? snapshotJson(snapshot))
  lastSavedPartsByTrip.set(tripId, cloudPartsJson(snapshot))
}

function hasGeneratedTrip(snapshot: TripSnapshot): boolean {
  return Boolean(snapshot.itinerary?.generated || snapshot.itinerary?.days?.length)
}

function expectedDayCountFor(snapshot: TripSnapshot): number {
  const start =
    snapshot.itinerary?.fingerprint?.itineraryStartDate || snapshot.dates?.startDate
  return itineraryDayCount(start, snapshot.dates?.endDate) || snapshot.itinerary?.days?.length || 0
}

function peekDaysForTrip(tripId: string, snapshot?: TripSnapshot | null) {
  const current = snapshot ?? collectTripSnapshot()
  return peekDayCloudDiff(
    current.itinerary?.days,
    lastAppliedDayHashesByTrip.get(tripId),
    { expectedDayCount: expectedDayCountFor(current) },
  )
}

function dirtyDayKeys(tripId: string): Set<string> {
  // If we have no queued or in-flight save and saves are not held, local state has no uncommitted user edits.
  if (queuedSaveMode === 'none' && !saveInFlight && saveHoldCount === 0) {
    return new Set()
  }
  const last = lastAppliedDayHashesByTrip.get(tripId)
  if (!last || !Object.keys(last).length) return new Set()
  try {
    const diff = peekDaysForTrip(tripId)
    return new Set([...Object.keys(diff.upserts), ...diff.deletes])
  } catch {
    return new Set()
  }
}

function ackDayHashes(
  tripId: string,
  next: Record<string, string>,
  deletes: string[] = [],
) {
  const last = { ...(lastAppliedDayHashesByTrip.get(tripId) || {}) }
  for (const key of deletes) delete last[key]
  Object.assign(last, next)
  lastAppliedDayHashesByTrip.set(tripId, last)
}

function isUnexpectedEmptyRegression(
  previous: TripSnapshot | null,
  next: TripSnapshot,
): boolean {
  if (!previous || !hasGeneratedTrip(previous)) return false
  return (
    !next.dates &&
    !next.flights &&
    !next.hotel?.selected &&
    !hasGeneratedTrip(next)
  )
}

function baselineSnapshot(tripId: string): TripSnapshot | null {
  const raw = lastSavedJsonByTrip.get(tripId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as TripSnapshot
  } catch {
    return null
  }
}

function generatedBaselineSnapshot(tripId: string): TripSnapshot | null {
  const raw = lastGeneratedJsonByTrip.get(tripId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as TripSnapshot
  } catch {
    return null
  }
}

function rememberGeneratedSnapshot(tripId: string, snapshot: TripSnapshot): void {
  if (hasGeneratedTrip(snapshot)) {
    lastGeneratedJsonByTrip.set(tripId, snapshotJson(snapshot))
  }
}

export function detectSaveTarget(
  parts: CloudSavePart[],
  snapshot: TripSnapshot,
  tripId: string,
): { target: CloudSaveTarget; dayNumbers?: number[] } {
  const onlyArtifacts = parts.length === 1 && parts[0] === 'artifacts'
  const onlyDays = parts.length === 1 && parts[0] === 'days'
  const onlyHotel = parts.length === 1 && parts[0] === 'hotel'

  if (onlyArtifacts) {
    const diff = peekArtifactCloudDiff()
    const keys = Object.keys(diff.upserts)
    const isTranslations =
      keys.length > 0 &&
      keys.every((k) => k.startsWith('translations:') || k.startsWith('place-names:'))
    return { target: isTranslations ? 'translations' : 'place_details' }
  }

  if (onlyDays) {
    const dayDiff = peekDaysForTrip(tripId, snapshot)
    const dayNums = Object.keys(dayDiff.upserts)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b)
    return { target: 'itinerary_days', dayNumbers: dayNums.length ? dayNums : undefined }
  }

  if (onlyHotel) {
    return { target: 'hotel' }
  }

  if (parts.includes('days') && parts.includes('artifacts') && !parts.includes('core')) {
    return { target: 'composite' }
  }

  if (parts.includes('core')) {
    const prev = baselineSnapshot(tripId)
    if (prev) {
      const datesChanged = JSON.stringify(prev.dates) !== JSON.stringify(snapshot.dates)
      const flightsChanged = JSON.stringify(prev.flights) !== JSON.stringify(snapshot.flights)
      const hotelChanged = JSON.stringify(prev.hotel) !== JSON.stringify(snapshot.hotel)
      const customPlacesChanged =
        JSON.stringify(prev.itinerary?.customPlaces) !==
        JSON.stringify(snapshot.itinerary?.customPlaces)
      const prefsChanged =
        JSON.stringify(prev.recommendationPreferences) !==
        JSON.stringify(snapshot.recommendationPreferences)

      const changedCount = [
        datesChanged || flightsChanged,
        hotelChanged,
        customPlacesChanged,
        prefsChanged,
      ].filter(Boolean).length

      if (changedCount === 1 && !parts.includes('days') && !parts.includes('artifacts')) {
        if (datesChanged || flightsChanged) return { target: 'flights_dates' }
        if (hotelChanged) return { target: 'hotel' }
        if (customPlacesChanged) return { target: 'custom_places' }
        if (prefsChanged) return { target: 'preferences' }
      }
    }
  }

  if (parts.length > 1) {
    return { target: 'composite' }
  }

  return { target: 'general' }
}

function collectSnapshotForMode(
  tripId: string,
  mode: 'artifacts' | 'full',
): TripSnapshot | null {
  const current = collectTripSnapshot()
  if (mode === 'full') return current
  const baseline = baselineSnapshot(tripId)
  if (!baseline) return null
  return {
    ...baseline,
    llmArtifacts: current.llmArtifacts,
  }
}

function isNewerUpdatedAt(candidate: string, current: string | undefined): boolean {
  if (!current) return true
  const a = Date.parse(candidate)
  const b = Date.parse(current)
  if (Number.isFinite(a) && Number.isFinite(b)) return a > b
  return candidate > current
}

function armSuppressRemote(ms: number) {
  suppressRemoteUntil = Date.now() + ms
  if (suppressFlushTimer) clearTimeout(suppressFlushTimer)
  suppressFlushTimer = setTimeout(() => {
    suppressFlushTimer = null
    flushQueuedRemote()
  }, ms + 20)
}

/** After applying a remote snapshot, ignore remount/effect autosave noise. */
let quietAutosaveUntil = 0
let quietSettleTimer: ReturnType<typeof setTimeout> | null = null

function beginRemoteQuietPeriod(ms: number) {
  quietAutosaveUntil = Date.now() + ms
  if (quietSettleTimer) clearTimeout(quietSettleTimer)
  // When quiet ends, adopt whatever localStorage settled to (nav/fingerprint
  // tweaks) as the reconciled baseline — do not upload that drift.
  quietSettleTimer = setTimeout(() => {
    quietSettleTimer = null
    const tripId = saveTripId
    if (!tripId) return
    try {
      const settled = collectTripSnapshot()
      trackSavedSnapshot(tripId, settled)
    } catch {
      /* ignore */
    }
    if (queuedSaveMode !== 'none' && saveHoldCount === 0) {
      armSaveTimer(SAVE_DEBOUNCE_MS)
    }
  }, ms + 30)
}

/** True while App should not wipe a just-applied remote itinerary. */
export function isRemoteQuietPeriodActive(): boolean {
  return Date.now() < quietAutosaveUntil
}

/** Milliseconds until the remote quiet window ends (0 if already idle). */
export function remainingRemoteQuietMs(): number {
  return Math.max(0, quietAutosaveUntil - Date.now())
}

function queueRemoteUpdate(next: QueuedRemote) {
  if (
    queuedRemote &&
    queuedRemote.tripId === next.tripId &&
    !isNewerUpdatedAt(next.updatedAt, queuedRemote.updatedAt)
  ) {
    return
  }
  queuedRemote = next
}

function flushQueuedRemote() {
  if (!queuedRemote) return
  if (saveInFlight || cloudSaveStatus === 'saving') return
  if (Date.now() < suppressRemoteUntil) {
    armSuppressRemote(Math.max(50, suppressRemoteUntil - Date.now()))
    return
  }
  const q = queuedRemote
  queuedRemote = null
  const applied = applyRemoteTripSnapshot(q.tripId, q.snapshot, q.updatedAt, {
    trustSnapshot: q.trustSnapshot,
  })
  if (applied) q.onApply()
}

export function rememberSavedSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
  updatedAt?: string | null,
): void {
  if (!tripId) return
  trackSavedSnapshot(tripId, snapshot)
  rememberGeneratedSnapshot(tripId, snapshot)
  if (updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updatedAt)
}

/**
 * Apply a remote trip snapshot when cloud updated_at is newer than what we last reconciled.
 * Returns true when applied (caller should rehydrate its React state).
 *
 * Pass `trustSnapshot: true` for REST-fetched rows. Untrusted realtime payloads that look
 * like an empty trip are refused so TOAST-omitted jsonb cannot blank the UI.
 */
export function applyRemoteTripSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
  updatedAt?: string | null,
  opts?: { trustSnapshot?: boolean; hydrateArtifacts?: boolean; hydrateDays?: boolean },
): boolean {
  if (!tripId) return false

  const stamp =
    typeof updatedAt === 'string' && updatedAt.trim() ? updatedAt.trim() : ''
  const trustSnapshot = Boolean(opts?.trustSnapshot)

  // Defer while we write or swallow our own echo — never drop the event.
  if (saveInFlight || cloudSaveStatus === 'saving' || Date.now() < suppressRemoteUntil) {
    if (stamp) {
      queueRemoteUpdate({
        tripId,
        snapshot,
        updatedAt: stamp,
        trustSnapshot,
        onApply: () => realtimeApplyHandler?.(tripId),
      })
    }
    return false
  }

  if (stamp) {
    const prev = lastAppliedUpdatedAtByTrip.get(tripId)
    if (prev && !isNewerUpdatedAt(stamp, prev)) return false
  }

  // Incomplete realtime payloads (TOAST / missing jsonb) often look like an empty
  // trip. Never wipe a known generated itinerary with that — refetch via REST instead.
  if (!trustSnapshot) {
    const safetyBaseline =
      generatedBaselineSnapshot(tripId) || baselineSnapshot(tripId)
    if (isUnexpectedEmptyRegression(safetyBaseline, snapshot)) {
      console.warn(
        '[tripCloud] refused empty remote snapshot (likely incomplete realtime payload)',
      )
      return false
    }
  }

  const json = snapshotJson(snapshot)
  // Already matches what's on disk — advance cursor, no remount needed.
  // Do NOT compare against lastSavedJson alone: restoring a previously-seen
  // snapshot must still remount when updated_at is newer.
  try {
    if (snapshotJson(collectTripSnapshot()) === json) {
      trackSavedSnapshot(tripId, snapshot, json)
      rememberGeneratedSnapshot(tripId, snapshot)
      if (stamp) lastAppliedUpdatedAtByTrip.set(tripId, stamp)
      return false
    }
  } catch {
    /* ignore */
  }

  // Remote snapshot is being applied: clear any pending local timer and reset queued save mode.
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  queuedSaveMode = 'none'
  queuedAllowEmptyTrip = false
  pendingAfterFlight = false
  if (cloudSaveStatus === 'pending') setCloudSaveStatus('idle')

  setCloudSyncStatus('syncing')
  applyTripSnapshot(snapshot, {
    hydrateArtifacts: opts?.hydrateArtifacts === true,
    hydrateDays: opts?.hydrateDays === true,
  })
  // Reconcile against *local* round-trip form so remount autosave does not re-upload.
  try {
    const reconciled = collectTripSnapshot()
    trackSavedSnapshot(tripId, reconciled)
    rememberGeneratedSnapshot(tripId, reconciled)
  } catch {
    trackSavedSnapshot(tripId, snapshot, json)
    rememberGeneratedSnapshot(tripId, snapshot)
  }
  if (stamp) lastAppliedUpdatedAtByTrip.set(tripId, stamp)
  saveTripId = tripId
  // Block echo / hydration autosave from bouncing back into realtime.
  beginRemoteQuietPeriod(3500)
  armSuppressRemote(2000)
  window.setTimeout(() => {
    setCloudSyncStatus('synced')
  }, 450)
  return true
}

let realtimeChannel: RealtimeChannel | null = null

/**
 * Apply a remote row after fetching the authoritative snapshot from REST.
 * Realtime UPDATE payloads often omit large jsonb (TOAST) or arrive partial —
 * treating that as emptyTripSnapshot blanks collaborator UIs until refresh.
 */
async function applyRemoteTripFromServer(
  tripId: string,
  hintUpdatedAt?: string | null,
  payloadRow?: Record<string, unknown> | null,
): Promise<boolean> {
  const knownRev = lastAppliedArtifactsRevByTrip.get(tripId) ?? 0
  const knownDaysRev = lastAppliedDaysRevByTrip.get(tripId) ?? 0
  const currentStamp = lastAppliedUpdatedAtByTrip.get(tripId)
  const payloadRev =
    payloadRow && 'artifacts_rev' in payloadRow
      ? asArtifactsRev(payloadRow.artifacts_rev)
      : null
  const payloadDaysRev =
    payloadRow && 'days_rev' in payloadRow
      ? asArtifactsRev(payloadRow.days_rev)
      : null
  const payloadStamp =
    (typeof hintUpdatedAt === 'string' && hintUpdatedAt.trim()) ||
    (typeof payloadRow?.updated_at === 'string' ? payloadRow.updated_at : '') ||
    ''
  const remoteNewer = payloadStamp ? isNewerUpdatedAt(payloadStamp, currentStamp) : true
  const payloadRevChanged = payloadRev != null && payloadRev !== knownRev
  const payloadDaysRevChanged =
    payloadDaysRev != null ? payloadDaysRev !== knownDaysRev : remoteNewer
  const omitsCore = realtimeRowOmitsCore(payloadRow)

  const pullSidecars = async (
    artifactRev?: number,
    daysRev?: number,
  ): Promise<boolean> => {
    try {
      await syncTripArtifactsFromCloud(tripId, artifactRev)
    } catch (err) {
      console.warn('[tripCloud] artifact pull failed', err)
    }
    try {
      return await syncTripDaysFromCloud(tripId, daysRev)
    } catch (err) {
      console.warn('[tripCloud] day pull failed', err)
      return false
    }
  }

  if (omitsCore) {
    const decision = planRemoteApply({
      remoteNewer,
      artifactsRevChanged: payloadRevChanged,
      daysRevChanged: payloadDaysRevChanged,
      coreSame: true,
      localCoreDirty: isLocalCoreDirty(tripId),
    })
    if (decision === 'ignore') return false
    if (
      decision === 'artifacts-only' ||
      decision === 'days-only' ||
      decision === 'keep-local'
    ) {
      const daysApplied = await pullSidecars(
        payloadRev ?? undefined,
        payloadDaysRev ?? undefined,
      )
      if (decision !== 'keep-local' && payloadStamp) {
        lastAppliedUpdatedAtByTrip.set(tripId, payloadStamp)
      }
      if (decision === 'days-only' || (decision === 'keep-local' && daysApplied)) {
        if (daysApplied) {
          setCloudSyncStatus('syncing')
          window.setTimeout(() => setCloudSyncStatus('synced'), 450)
        }
        return daysApplied
      }
      if (decision === 'artifacts-only') {
        setCloudSyncStatus('syncing')
        window.setTimeout(() => setCloudSyncStatus('synced'), 450)
      }
      return false
    }
  }

  if (payloadRow && ('snapshot' in payloadRow || 'hotel' in payloadRow)) {
    const remote = snapshotFromCloudRow(payloadRow)
    const remoteParts = cloudPartsJson(remote)
    const localParts = lastSavedPartsByTrip.get(tripId)
    const payloadCoreSame = Boolean(
      localParts &&
        remoteParts.core === localParts.core &&
        remoteParts.hotel === localParts.hotel,
    )
    const payloadDecision = planRemoteApply({
      remoteNewer,
      artifactsRevChanged: payloadRevChanged,
      daysRevChanged: payloadDaysRevChanged,
      coreSame: payloadCoreSame,
      localCoreDirty: isLocalCoreDirty(tripId),
    })
    if (payloadDecision === 'ignore') return false
    if (
      payloadDecision === 'artifacts-only' ||
      payloadDecision === 'days-only' ||
      payloadDecision === 'keep-local'
    ) {
      const daysApplied = await pullSidecars(
        payloadRev ?? undefined,
        payloadDaysRev ?? undefined,
      )
      if (payloadDecision !== 'keep-local' && payloadStamp) {
        lastAppliedUpdatedAtByTrip.set(tripId, payloadStamp)
      }
      if (payloadDecision === 'days-only' || (payloadDecision === 'keep-local' && daysApplied)) {
        if (daysApplied) {
          setCloudSyncStatus('syncing')
          window.setTimeout(() => setCloudSyncStatus('synced'), 450)
        }
        return daysApplied
      }
      if (payloadDecision === 'artifacts-only') {
        setCloudSyncStatus('syncing')
        window.setTimeout(() => setCloudSyncStatus('synced'), 450)
      }
      return false
    }
  }

  const full = await loadTripById(tripId)
  if (!full) return false
  const stamp =
    (typeof full.updated_at === 'string' && full.updated_at.trim()) ||
    payloadStamp ||
    null
  const remoteParts = cloudPartsJson(full.snapshot)
  const localParts = lastSavedPartsByTrip.get(tripId)
  const coreSame = Boolean(
    localParts &&
      remoteParts.core === localParts.core &&
      remoteParts.hotel === localParts.hotel,
  )
  const decision = planRemoteApply({
    remoteNewer: stamp ? isNewerUpdatedAt(stamp, currentStamp) : true,
    artifactsRevChanged: full.artifactsRev !== knownRev,
    daysRevChanged: full.daysRev !== knownDaysRev,
    coreSame,
    localCoreDirty: isLocalCoreDirty(tripId),
  })

  if (decision === 'ignore') {
    if (stamp) lastAppliedUpdatedAtByTrip.set(tripId, stamp)
    lastAppliedArtifactsRevByTrip.set(tripId, full.artifactsRev)
    lastAppliedDaysRevByTrip.set(tripId, full.daysRev)
    return false
  }

  if (decision === 'keep-local') {
    const daysApplied = await pullSidecars(full.artifactsRev, full.daysRev)
    return daysApplied
  }

  if (decision === 'artifacts-only' || decision === 'days-only') {
    if (stamp) lastAppliedUpdatedAtByTrip.set(tripId, stamp)
    const daysApplied = await pullSidecars(full.artifactsRev, full.daysRev)
    if (daysApplied || decision === 'artifacts-only') {
      setCloudSyncStatus('syncing')
      window.setTimeout(() => setCloudSyncStatus('synced'), 450)
    }
    return daysApplied
  }

  const applied = applyRemoteTripSnapshot(tripId, full.snapshot, stamp, {
    trustSnapshot: true,
    hydrateArtifacts: false,
    hydrateDays: false,
  })
  try {
    await syncTripArtifactsFromCloud(tripId, full.artifactsRev)
  } catch (err) {
    console.warn('[tripCloud] artifact pull failed', err)
  }
  let daysApplied = false
  try {
    daysApplied = await syncTripDaysFromCloud(tripId, full.daysRev)
  } catch (err) {
    console.warn('[tripCloud] day pull failed', err)
  }
  if (applied || daysApplied) {
    setCloudSyncStatus('syncing')
    window.setTimeout(() => setCloudSyncStatus('synced'), 450)
  }
  return applied || daysApplied
}

/** Subscribe to live updates for one trip. Returns unsubscribe. */
export function subscribeTripRealtime(
  tripId: string,
  onRemoteApply: () => void,
): () => void {
  // localhost dev: skip realtime channel to save Supabase bandwidth
  if (!isCloudSyncEnabled()) return () => {}
  const sb = getSupabase()
  if (realtimeChannel) {
    void sb.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  realtimeApplyHandler = (id) => {
    if (id === tripId) onRemoteApply()
  }

  let applySeq = 0

  const channel = sb
    .channel(`trip-sync:${tripId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'trips',
        filter: `id=eq.${tripId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown> | null
        const rowId = typeof row?.id === 'string' ? row.id : ''
        if (!row || !rowId || rowId !== tripId) return

        const rowUpdatedAt =
          typeof row.updated_at === 'string' ? row.updated_at : undefined
        const currentStamp = lastAppliedUpdatedAtByTrip.get(tripId)
        const rowRev = asArtifactsRev(row.artifacts_rev)
        const knownRev = lastAppliedArtifactsRevByTrip.get(tripId) ?? 0
        const rowDaysRev = asArtifactsRev(row.days_rev)
        const knownDaysRev = lastAppliedDaysRevByTrip.get(tripId) ?? 0
        if (
          rowUpdatedAt &&
          currentStamp &&
          !isNewerUpdatedAt(rowUpdatedAt, currentStamp) &&
          rowRev === knownRev &&
          rowDaysRev === knownDaysRev
        ) {
          return
        }

        const seq = ++applySeq
        void (async () => {
          try {
            const applied = await applyRemoteTripFromServer(
              tripId,
              rowUpdatedAt,
              row,
            )
            if (seq !== applySeq) return
            if (applied) onRemoteApply()
          } catch (err) {
            console.warn('[tripCloud] realtime sync fetch failed', err)
          }
        })()
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const seq = ++applySeq
        void (async () => {
          try {
            const applied = await applyRemoteTripFromServer(tripId)
            if (seq !== applySeq) return
            if (applied) onRemoteApply()
          } catch (err) {
            console.warn('[tripCloud] realtime subscribe catch-up failed', err)
          }
        })()
      }
    })

  realtimeChannel = channel

  return () => {
    applySeq += 1
    if (realtimeApplyHandler) realtimeApplyHandler = null
    if (queuedRemote?.tripId === tripId) queuedRemote = null
    if (realtimeChannel === channel) {
      void sb.removeChannel(channel)
      realtimeChannel = null
    }
  }
}

export function scheduleTripCloudSave(
  tripId: string,
  canEdit: boolean,
  opts?: {
    force?: boolean
    artifactsOnly?: boolean
    allowEmptyTrip?: boolean
  },
) {
  if (!canEdit || !tripId) return
  if (!isCloudSyncEnabled()) return // localhost dev: local-only saves
  saveTripId = tripId
  bindCloudFlushListeners()

  // After live sync, remount effects often look like "changes". Swallow those
  // unless the caller forces (e.g. restore default).
  if (!opts?.force && Date.now() < quietAutosaveUntil) {
    return
  }

  if (opts?.artifactsOnly) {
    if (!hasArtifactCloudDiff()) return
    if (queuedSaveMode === 'none') queuedSaveMode = 'artifacts'
  } else {
    queuedSaveMode = 'full'
  }
  if (opts?.allowEmptyTrip) queuedAllowEmptyTrip = true

  if (saveHoldCount > 0) return

  const delayMs = opts?.artifactsOnly ? SAVE_ARTIFACTS_DEBOUNCE_MS : SAVE_DEBOUNCE_MS
  armSaveTimer(delayMs)
}

function armSaveTimer(delayMs: number) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushTripCloudSave()
  }, delayMs)
}

let cloudFlushBound = false
function bindCloudFlushListeners() {
  if (cloudFlushBound || typeof window === 'undefined') return
  cloudFlushBound = true
  const flush = () => {
    void flushTripCloudSave({ urgent: true })
  }
  const checkCatchUp = () => {
    const tripId = saveTripId
    if (!tripId || !isCloudSyncEnabled()) return
    if (saveInFlight || cloudSaveStatus === 'saving') return
    void (async () => {
      try {
        const applied = await applyRemoteTripFromServer(tripId)
        if (applied) realtimeApplyHandler?.(tripId)
      } catch (err) {
        console.warn('[tripCloud] catch-up on visibility/focus failed', err)
      }
    })()
  }

  window.addEventListener('pagehide', flush)
  window.addEventListener('focus', checkCatchUp)
  window.addEventListener('online', checkCatchUp)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush()
    } else if (document.visibilityState === 'visible') {
      checkCatchUp()
    }
  })
}

/** Defer cloud uploads during a burst (first itinerary gen, day regen). */
export function holdTripCloudSaves() {
  saveHoldCount += 1
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

export function releaseTripCloudSaves() {
  saveHoldCount = Math.max(0, saveHoldCount - 1)
  if (saveHoldCount > 0 || !saveTripId) return
  if (queuedSaveMode === 'none') return
  armSaveTimer(SAVE_DEBOUNCE_MS)
}

export async function flushTripCloudSave(options?: { urgent?: boolean }): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!isCloudSyncEnabled()) return // localhost dev: skip cloud writes
  const tripId = saveTripId
  if (!tripId) return
  if (saveInFlight) {
    pendingAfterFlight = true
    return
  }

  const hasQueued = queuedSaveMode !== 'none'
  const artifactsChangedEarly = hasArtifactCloudDiff()
  if (!hasQueued && !artifactsChangedEarly) return

  if (!options?.urgent) {
    if (saveHoldCount > 0) return
    await yieldToMain()
    if (saveInFlight) {
      pendingAfterFlight = true
      return
    }
    if (saveTimer) return
    if (saveHoldCount > 0) return
  }

  flushLlmArtifactsToStorage()
  flushHotelCacheToStorage()

  if (queuedSaveMode === 'none' && hasArtifactCloudDiff()) {
    queuedSaveMode = 'artifacts'
  }

  const saveMode = queuedSaveMode === 'artifacts' ? 'artifacts' : 'full'
  const allowEmptyTrip = queuedAllowEmptyTrip
  queuedSaveMode = 'none'
  queuedAllowEmptyTrip = false

  let snapshot: TripSnapshot | null
  let json: string
  try {
    snapshot = collectSnapshotForMode(tripId, saveMode)
    if (!snapshot) {
      if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
        setCloudSaveStatus('idle')
      }
      flushQueuedRemote()
      return
    }
    json = snapshotJson(snapshot)
  } catch (err) {
    console.warn('[tripCloud] snapshot serialize failed', err)
    setCloudSaveStatus('error', '行程数据过大，无法写入云端')
    flushQueuedRemote()
    return
  }
  const coreUnchanged = lastSavedJsonByTrip.get(tripId) === json
  const artifactsChanged = hasArtifactCloudDiff()
  const daysChanged = !dayCloudDiffIsEmpty(peekDaysForTrip(tripId, snapshot))
  if (saveMode === 'artifacts') {
    if (!artifactsChanged && !daysChanged) {
      if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
        setCloudSaveStatus('idle')
      }
      flushQueuedRemote()
      return
    }
  } else if (coreUnchanged && !artifactsChanged && !daysChanged) {
    if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
      setCloudSaveStatus('idle')
    }
    flushQueuedRemote()
    return
  }

  const previous = baselineSnapshot(tripId)
  const safetyBaseline =
    previous && hasGeneratedTrip(previous)
      ? previous
      : generatedBaselineSnapshot(tripId) || previous
  if (!allowEmptyTrip && isUnexpectedEmptyRegression(safetyBaseline, snapshot)) {
    console.error('[tripCloud] blocked an unexpected empty-trip autosave')
    setCloudSaveStatus('error', '已阻止异常空行程覆盖云端存档')
    flushQueuedRemote()
    return
  }

  const parts: CloudSavePart[] = []
  if (saveMode === 'full' && !coreUnchanged) {
    parts.push('core', 'hotel')
  }
  if (artifactsChanged) parts.push('artifacts')
  if (daysChanged) parts.push('days')
  if (!parts.length) {
    if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
      setCloudSaveStatus('idle')
    }
    flushQueuedRemote()
    return
  }

  const detected = detectSaveTarget(parts, snapshot, tripId)

  saveInFlight = true
  setCloudSaveStatus('saving', null, detected)
  try {
    const updatedAt = await saveTripSnapshot(tripId, snapshot, {
      archivePrevious: saveMode === 'full' && !coreUnchanged,
      parts,
    })
    trackSavedSnapshot(tripId, snapshot, json)
    rememberGeneratedSnapshot(tripId, snapshot)
    if (updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updatedAt)
    // Swallow our own realtime echo.
    armSuppressRemote(3000)
    transientSaveRetryCount = 0
    setCloudSaveStatus('saved', null, detected)
  } catch (err) {
    if (err instanceof StaleCloudSaveError) {
      setCloudSaveStatus('idle')
    } else {
      console.warn('[tripCloud] save failed', err)
      if (
        isTransientCloudSaveError(err) &&
        transientSaveRetryCount < MAX_TRANSIENT_SAVE_RETRIES
      ) {
        transientSaveRetryCount += 1
        if (saveMode === 'full' || queuedSaveMode === 'none') queuedSaveMode = saveMode
        if (allowEmptyTrip) queuedAllowEmptyTrip = true
        setCloudSaveStatus('pending', null, detected)
        armSaveTimer(TRANSIENT_SAVE_RETRY_MS)
      } else {
        transientSaveRetryCount = 0
        setCloudSaveStatus('error', describeCloudSaveError(err), detected)
      }
    }
  } finally {
    saveInFlight = false
    if (pendingAfterFlight) {
      pendingAfterFlight = false
      if (saveHoldCount > 0) {
        if (queuedSaveMode === 'none') queuedSaveMode = 'full'
      } else {
        setCloudSaveStatus('pending')
        armSaveTimer(SAVE_DEBOUNCE_MS)
      }
    } else {
      flushQueuedRemote()
    }
  }
}

export async function applyAccessibleTripLocally(trip: AccessibleTrip) {
  const embeddedDays = Boolean(trip.snapshot.itinerary?.days?.length)
  applyTripSnapshot(trip.snapshot, {
    hydrateArtifacts: false,
    hydrateDays: embeddedDays,
  })
  rememberSavedSnapshot(trip.id, trip.snapshot, trip.updatedAt)
  try {
    rememberSavedSnapshot(trip.id, collectTripSnapshot(), trip.updatedAt)
  } catch {
    /* ignore */
  }
  saveTripId = trip.id
  bindCloudFlushListeners()
  lastAppliedArtifactsRevByTrip.delete(trip.id)
  lastAppliedDaysRevByTrip.delete(trip.id)
  lastAppliedDayHashesByTrip.delete(trip.id)
  beginRemoteQuietPeriod(2500)
  armSuppressRemote(1500)
  setCloudSaveStatus('idle')
  setCloudSyncStatus('idle')
  try {
    await syncTripArtifactsFromCloud(trip.id, trip.artifactsRev)
  } catch (err) {
    console.warn('[tripCloud] artifact pull failed', err)
  }
  try {
    await syncTripDaysFromCloud(trip.id, trip.daysRev)
  } catch (err) {
    console.warn('[tripCloud] day pull failed', err)
  }
  const itinerary = loadItineraryState()
  if (!itinerary.days.length) {
    const restored = restoreFullFromBaseline()
    if (restored) {
      saveItineraryState(restored.days, restored.customPlaces, {
        generated: true,
        fingerprint: restored.fingerprint,
      })
    }
  } else if (!itinerary.generated && itinerary.days.length) {
    saveItineraryState(itinerary.days, itinerary.customPlaces, {
      generated: true,
      fingerprint: itinerary.fingerprint,
    })
  }
}


const SHARES_STORAGE_PREFIX = 'paris-tour-shares-cache-v1:'

export function getCachedTripShares(tripId: string): TripShareRow[] | null {
  if (!tripId) return null
  try {
    const raw = localStorage.getItem(`${SHARES_STORAGE_PREFIX}${tripId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TripShareRow[]) : null
  } catch {
    return null
  }
}

export function setCachedTripShares(tripId: string, shares: TripShareRow[]): void {
  if (!tripId) return
  try {
    localStorage.setItem(`${SHARES_STORAGE_PREFIX}${tripId}`, JSON.stringify(shares))
  } catch (err) {
    console.warn('[tripCloud] failed to cache trip shares:', err)
  }
}

export function invalidateCachedTripShares(tripId: string): void {
  if (!tripId) return
  try {
    localStorage.removeItem(`${SHARES_STORAGE_PREFIX}${tripId}`)
  } catch {
    /* ignore */
  }
}

export function sharesAreEqual(a: TripShareRow[], b: TripShareRow[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id))
  const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id))
  for (let i = 0; i < sortedA.length; i++) {
    if (
      sortedA[i].id !== sortedB[i].id ||
      sortedA[i].invitee_email !== sortedB[i].invitee_email ||
      sortedA[i].role !== sortedB[i].role
    ) {
      return false
    }
  }
  return true
}

export async function listTripShares(tripId: string): Promise<TripShareRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('trip_shares')
    .select('id, trip_id, invitee_email, role, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const res = (data || []) as TripShareRow[]
  setCachedTripShares(tripId, res)
  return res
}

export async function upsertTripShare(
  tripId: string,
  inviteeEmail: string,
  role: TripShareRole,
): Promise<void> {
  const email = inviteeEmail.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error(translate('errors.cloudEmailInvalid'))
  const sb = getSupabase()

  const { error } = await sb.from('trip_shares').upsert(
    {
      trip_id: tripId,
      invitee_email: email,
      role,
    },
    { onConflict: 'trip_id,invitee_email' },
  )
  if (error) throw error
}

export type ShareInviteMailResult = {
  sent: boolean
  registered: boolean
  inviteUrl: string
  warning?: string
  error?: string
}

/** After upsertTripShare: email invitee with login/signup deep link. */
export async function sendShareInviteEmail(
  tripId: string,
  inviteeEmail: string,
  role: TripShareRole,
): Promise<ShareInviteMailResult> {
  const { authFetch } = await import('../../auth/services/authFetch')
  const res = await authFetch('/api/share-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId,
      inviteeEmail: inviteeEmail.trim().toLowerCase(),
      role,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as ShareInviteMailResult & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || translate('errors.cloudInviteFailed', { status: res.status }))
  }
  return {
    sent: Boolean(data.sent),
    registered: Boolean(data.registered),
    inviteUrl: data.inviteUrl || '',
    warning: data.warning,
    error: data.error,
  }
}

export async function updateTripShareRole(
  shareId: string,
  role: TripShareRole,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('trip_shares').update({ role }).eq('id', shareId)
  if (error) throw error
}

export async function removeTripShare(shareId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('trip_shares').delete().eq('id', shareId)
  if (error) throw error
}
