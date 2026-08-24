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
  'id, owner_id, is_primary, title, snapshot, hotel, updated_at, artifacts_rev'

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
  return {
    ...clean,
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
    hotel: JSON.stringify(clean.hotel ?? null),
  }
}

type CloudSavePart = 'core' | 'hotel' | 'artifacts'

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
    snapshot: primary.snapshot,
    label: primary.title || translate('cloud.tripPrimary'),
  })

  const { data: shares, error: shareError } = await sb
    .from('trip_shares')
    .select('trip_id, role, trips(id, owner_id, is_primary, title, snapshot, hotel, updated_at, artifacts_rev)')
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

function isMissingArtifactsRpc(err: unknown, fn: 'patch_trip_artifacts' | 'pull_trip_artifacts'): boolean {
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
    if (!isMissingArtifactsRpc(err, 'pull_trip_artifacts')) throw err
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
    : (['core', 'hotel', 'artifacts'] as CloudSavePart[])
  const nextSnapshot = asSnapshot(snapshot)
  const nextParts = cloudPartsJson(nextSnapshot)
  const prevParts = lastSavedPartsByTrip.get(tripId)

  const patch: Record<string, unknown> = {}
  if (parts.includes('core') && nextParts.core !== prevParts?.core) {
    patch.snapshot = coreSnapshotForCloud(nextSnapshot)
  }
  if (parts.includes('hotel') && nextParts.hotel !== prevParts?.hotel) {
    patch.hotel = nextSnapshot.hotel ?? null
  }

  let latestUpdatedAt: string | null = lastAppliedUpdatedAtByTrip.get(tripId) ?? null

  if (parts.includes('artifacts')) {
    if (options?.replaceArtifacts) {
      patch.artifacts = filterCloudArtifactMap(
        nextSnapshot.llmArtifacts && typeof nextSnapshot.llmArtifacts === 'object'
          ? nextSnapshot.llmArtifacts
          : {},
      )
      patch.artifacts_rev = (lastAppliedArtifactsRevByTrip.get(tripId) ?? 0) + 1
    } else {
      const patchedAt = await patchTripArtifactsOrFallback(tripId, nextSnapshot, patch)
      if (patchedAt) latestUpdatedAt = patchedAt
    }
  }

  if (!Object.keys(patch).length) {
    return latestUpdatedAt
  }

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

  const { data, error } = await sb
    .from('trips')
    .update(patch)
    .eq('id', tripId)
    .select('updated_at, artifacts_rev')
    .maybeSingle()
  if (error) throw error
  if (patch.artifacts !== undefined) {
    markArtifactsCloudSynced()
    lastAppliedArtifactsRevByTrip.set(tripId, asArtifactsRev(data?.artifacts_rev))
  }
  return typeof data?.updated_at === 'string' ? data.updated_at : latestUpdatedAt
}

function isMissingPatchRpc(err: unknown): boolean {
  return isMissingArtifactsRpc(err, 'patch_trip_artifacts')
}

async function patchTripArtifactsOrFallback(
  tripId: string,
  snapshot: TripSnapshot,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const diff = peekArtifactCloudDiff()
  if (artifactCloudDiffIsEmpty(diff)) return null

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
    return parsed.updatedAt
  } catch (err) {
    if (!isMissingPatchRpc(err)) throw err
    patch.artifacts = filterCloudArtifactMap(
      snapshot.llmArtifacts && typeof snapshot.llmArtifacts === 'object'
        ? snapshot.llmArtifacts
        : {},
    )
    patch.artifacts_rev = (lastAppliedArtifactsRevByTrip.get(tripId) ?? 0) + 1
    return null
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
const MIN_SAVE_INTERVAL_MS = 8000
const MAX_TRANSIENT_SAVE_RETRIES = 1

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTripId: string | null = null
let saveInFlight = false
let queuedSaveMode: 'none' | 'artifacts' | 'full' = 'none'
let queuedAllowEmptyTrip = false
let pendingAfterFlight = false
let transientSaveRetryCount = 0
/** Last time a cloud write actually started (network). */
let lastSaveStartedAt = 0
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

let cloudSaveStatus: CloudSaveStatus = 'idle'
let cloudSaveError: string | null = null
let savedHideTimer: ReturnType<typeof setTimeout> | null = null
const cloudSaveListeners = new Set<() => void>()

let cloudSyncStatus: CloudSyncStatus = 'idle'
let syncedHideTimer: ReturnType<typeof setTimeout> | null = null
const cloudSyncListeners = new Set<() => void>()

export function getCloudSaveStatus(): CloudSaveStatus {
  return cloudSaveStatus
}

export function getCloudSaveError(): string | null {
  return cloudSaveError
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

function setCloudSaveStatus(next: CloudSaveStatus, error: string | null = null) {
  cloudSaveStatus = next
  cloudSaveError = error
  if (savedHideTimer) {
    clearTimeout(savedHideTimer)
    savedHideTimer = null
  }
  if (next === 'saved') {
    savedHideTimer = setTimeout(() => {
      if (cloudSaveStatus === 'saved') {
        cloudSaveStatus = 'idle'
        cloudSaveError = null
        cloudSaveListeners.forEach((l) => l())
      }
    }, 2400)
  }
  cloudSaveListeners.forEach((l) => l())
}

function setCloudSyncStatus(next: CloudSyncStatus) {
  cloudSyncStatus = next
  if (syncedHideTimer) {
    clearTimeout(syncedHideTimer)
    syncedHideTimer = null
  }
  if (next === 'synced') {
    syncedHideTimer = setTimeout(() => {
      if (cloudSyncStatus === 'synced') {
        cloudSyncStatus = 'idle'
        cloudSyncListeners.forEach((l) => l())
      }
    }, 2400)
  }
  cloudSyncListeners.forEach((l) => l())
}

function snapshotJson(snapshot: TripSnapshot): string {
  const { llmArtifacts: _artifacts, mapRoutes: _routes, ...rest } = snapshot
  return JSON.stringify(rest)
}

function trackSavedSnapshot(tripId: string, snapshot: TripSnapshot, json?: string) {
  lastSavedJsonByTrip.set(tripId, json ?? snapshotJson(snapshot))
  lastSavedPartsByTrip.set(tripId, cloudPartsJson(snapshot))
}

function hasGeneratedTrip(snapshot: TripSnapshot): boolean {
  return Boolean(snapshot.itinerary?.days?.length)
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
  }, ms + 30)
}

/** True while App should not wipe a just-applied remote itinerary. */
export function isRemoteQuietPeriodActive(): boolean {
  return Date.now() < quietAutosaveUntil
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
  opts?: { trustSnapshot?: boolean; hydrateArtifacts?: boolean },
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

  // Remote write wins over a debounced local save that hasn't uploaded yet.
  // Discard the entire queued transaction, including an intentional-clear flag;
  // otherwise a stale empty snapshot can flush after the remote snapshot lands.
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
): Promise<boolean> {
  const full = await loadTripById(tripId)
  if (!full) return false
  const stamp =
    (typeof full.updated_at === 'string' && full.updated_at.trim()) ||
    (typeof hintUpdatedAt === 'string' && hintUpdatedAt.trim()) ||
    null
  const applied = applyRemoteTripSnapshot(tripId, full.snapshot, stamp, {
    trustSnapshot: true,
    hydrateArtifacts: false,
  })
  try {
    await syncTripArtifactsFromCloud(tripId, full.artifactsRev)
  } catch (err) {
    console.warn('[tripCloud] artifact pull failed', err)
  }
  return applied
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
        const row = payload.new as {
          id?: string
          snapshot?: unknown
          updated_at?: string
        } | null
        if (!row?.id || row.id !== tripId) return

        // Echo suppression: Ignore if updated_at is not newer than our local reconciled state.
        const currentStamp = lastAppliedUpdatedAtByTrip.get(tripId)
        if (row.updated_at && currentStamp && !isNewerUpdatedAt(row.updated_at, currentStamp)) {
          return
        }

        const seq = ++applySeq
        void (async () => {
          try {
            // Always refetch: payload.snapshot is not reliable for large jsonb.
            const applied = await applyRemoteTripFromServer(
              tripId,
              row.updated_at,
            )
            if (seq !== applySeq) return
            if (applied) onRemoteApply()
          } catch (err) {
            console.warn('[tripCloud] realtime sync fetch failed', err)
          }
        })()
      },
    )
    .subscribe()

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

  // After live sync, remount effects often look like "changes". Swallow those
  // unless the caller forces (e.g. restore default).
  if (!opts?.force && Date.now() < quietAutosaveUntil) {
    return
  }

  if (opts?.artifactsOnly) {
    if (queuedSaveMode === 'none') queuedSaveMode = 'artifacts'
  } else {
    queuedSaveMode = 'full'
  }
  if (opts?.allowEmptyTrip) queuedAllowEmptyTrip = true

  if (saveHoldCount > 0) return

  setCloudSaveStatus('pending')
  armSaveTimer(SAVE_DEBOUNCE_MS)
}

function msUntilNextSaveAllowed() {
  if (!lastSaveStartedAt) return 0
  return Math.max(0, MIN_SAVE_INTERVAL_MS - (Date.now() - lastSaveStartedAt))
}

function armSaveTimer(delayMs: number) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushTripCloudSave()
  }, delayMs)
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
  setCloudSaveStatus('pending')
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

  if (!options?.urgent) {
    if (saveHoldCount > 0) return
    const wait = msUntilNextSaveAllowed()
    if (wait > 0) {
      setCloudSaveStatus('pending')
      armSaveTimer(wait)
      return
    }
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
  if (saveMode === 'artifacts') {
    if (!artifactsChanged) {
      if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
        setCloudSaveStatus('idle')
      }
      flushQueuedRemote()
      return
    }
  } else if (coreUnchanged && !artifactsChanged) {
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
  if (!parts.length) {
    if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
      setCloudSaveStatus('idle')
    }
    flushQueuedRemote()
    return
  }

  saveInFlight = true
  lastSaveStartedAt = Date.now()
  setCloudSaveStatus('saving')
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
    setCloudSaveStatus('saved')
  } catch (err) {
    console.warn('[tripCloud] save failed', err)
    if (
      isTransientCloudSaveError(err) &&
      transientSaveRetryCount < MAX_TRANSIENT_SAVE_RETRIES
    ) {
      transientSaveRetryCount += 1
      if (saveMode === 'full' || queuedSaveMode === 'none') queuedSaveMode = saveMode
      if (allowEmptyTrip) queuedAllowEmptyTrip = true
      setCloudSaveStatus('pending')
      armSaveTimer(MIN_SAVE_INTERVAL_MS)
    } else {
      transientSaveRetryCount = 0
      setCloudSaveStatus('error', describeCloudSaveError(err))
    }
  } finally {
    saveInFlight = false
    if (pendingAfterFlight) {
      pendingAfterFlight = false
      if (saveHoldCount > 0) {
        if (queuedSaveMode === 'none') queuedSaveMode = 'full'
      } else {
        setCloudSaveStatus('pending')
        armSaveTimer(Math.max(SAVE_DEBOUNCE_MS, msUntilNextSaveAllowed()))
      }
    } else {
      flushQueuedRemote()
    }
  }
}

export async function applyAccessibleTripLocally(trip: AccessibleTrip) {
  applyTripSnapshot(trip.snapshot, { hydrateArtifacts: false })
  rememberSavedSnapshot(trip.id, trip.snapshot, trip.updatedAt)
  try {
    rememberSavedSnapshot(trip.id, collectTripSnapshot(), trip.updatedAt)
  } catch {
    /* ignore */
  }
  saveTripId = trip.id
  lastAppliedArtifactsRevByTrip.delete(trip.id)
  beginRemoteQuietPeriod(2500)
  armSuppressRemote(1500)
  setCloudSaveStatus('idle')
  setCloudSyncStatus('idle')
  try {
    await syncTripArtifactsFromCloud(trip.id, trip.artifactsRev)
  } catch (err) {
    console.warn('[tripCloud] artifact pull failed', err)
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
