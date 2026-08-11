import { getSupabase } from '../../../lib/supabase'
import {
  applyTripSnapshot,
  collectTripSnapshot,
  emptyTripSnapshot,
  type TripSnapshot,
} from './tripSnapshot'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type TripRole = 'owner' | 'viewer' | 'editor'

export type TripShareRole = 'viewer' | 'editor'

export type TripRow = {
  id: string
  owner_id: string
  is_primary: boolean
  title: string
  snapshot: TripSnapshot
  updated_at: string
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
  isPrimary: boolean
  role: TripRole
  updatedAt: string
  snapshot: TripSnapshot
  /** Label for switcher */
  label: string
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
    destination: typeof s.destination === 'string' ? s.destination : '巴黎',
    flights: s.flights ?? null,
    hotel: s.hotel ?? null,
    itinerary: s.itinerary ?? null,
    baseline: s.baseline ?? null,
    recommendationPreferences: s.recommendationPreferences ?? null,
    llmArtifacts,
  }
}

const MAX_TRIP_BACKUPS = 5

/** Archive copy without bulky LLM caches / nested history. */
function snapshotForBackup(snapshot: TripSnapshot): TripSnapshot {
  const clean = asSnapshot(snapshot)
  return {
    ...clean,
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
    hotel: clean.hotel,
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
    .select('id, owner_id, is_primary, title, snapshot, updated_at')
    .eq('owner_id', userId)
    .eq('is_primary', true)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing) {
    return {
      ...existing,
      snapshot: asSnapshot(existing.snapshot),
    }
  }

  const { data: created, error: insertError } = await sb
    .from('trips')
    .insert({
      owner_id: userId,
      is_primary: true,
      title: '我的巴黎行程',
      snapshot: emptyTripSnapshot(),
    })
    .select('id, owner_id, is_primary, title, snapshot, updated_at')
    .single()

  if (insertError) {
    // Race: another tab created primary; re-read.
    const { data: raced, error: raceError } = await sb
      .from('trips')
      .select('id, owner_id, is_primary, title, snapshot, updated_at')
      .eq('owner_id', userId)
      .eq('is_primary', true)
      .maybeSingle()
    if (raced) {
      return { ...raced, snapshot: asSnapshot(raced.snapshot) }
    }
    throw insertError || raceError
  }
  return {
    ...created,
    snapshot: asSnapshot(created.snapshot),
  }
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
    title: primary.title,
    ownerId: primary.owner_id,
    isPrimary: true,
    role: 'owner',
    updatedAt: primary.updated_at,
    snapshot: primary.snapshot,
    label: '我的行程',
  })

  const { data: shares, error: shareError } = await sb
    .from('trip_shares')
    .select('trip_id, role, trips(id, owner_id, is_primary, title, snapshot, updated_at)')
    .eq('invitee_email', email)

  if (shareError) throw shareError

  for (const row of shares || []) {
    const trip = row.trips as unknown as TripRow | TripRow[] | null
    const t = Array.isArray(trip) ? trip[0] : trip
    if (!t?.id) continue
    if (out.some((x) => x.id === t.id)) continue
    const role: TripRole = row.role === 'editor' ? 'editor' : 'viewer'
    const perm = role === 'editor' ? '可编辑' : '只读'

    let ownerLabel = '他人'
    const { data: ownerEmail } = await sb.rpc('trip_owner_email', {
      p_trip_id: t.id,
    })
    if (typeof ownerEmail === 'string' && ownerEmail.trim()) {
      ownerLabel = ownerEmail.trim().toLowerCase()
    }

    out.push({
      id: t.id,
      title: t.title,
      ownerId: t.owner_id,
      isPrimary: Boolean(t.is_primary),
      role,
      updatedAt: t.updated_at,
      snapshot: asSnapshot(t.snapshot),
      label: `来自 ${ownerLabel} · ${perm}`,
    })
  }

  return out
}

export async function loadTripById(tripId: string): Promise<TripRow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('trips')
    .select('id, owner_id, is_primary, title, snapshot, updated_at')
    .eq('id', tripId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...data, snapshot: asSnapshot(data.snapshot) }
}

export async function saveTripSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
  options?: { archivePrevious?: boolean },
): Promise<string | null> {
  const sb = getSupabase()
  const { data: current, error: currentError } = await sb
    .from('trips')
    .select('snapshot, updated_at')
    .eq('id', tripId)
    .maybeSingle()
  if (currentError) throw currentError

  const previous = asSnapshot(current?.snapshot)
  // Never persist the old embedded backupHistory key on the live row.
  const nextSnapshot = asSnapshot(snapshot)

  if (
    options?.archivePrevious !== false &&
    substantiveSnapshotJson(previous) !== substantiveSnapshotJson(nextSnapshot)
  ) {
    await archiveTripSnapshot(
      tripId,
      previous,
      typeof current?.updated_at === 'string' ? current.updated_at : null,
    )
  }

  const { data, error } = await sb
    .from('trips')
    .update({ snapshot: nextSnapshot })
    .eq('id', tripId)
    .select('updated_at')
    .maybeSingle()
  if (error) throw error
  return typeof data?.updated_at === 'string' ? data.updated_at : null
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
  if (!backupRow) throw new Error('找不到该存档备份，可能已超出最近 5 次范围。')

  const restored = asSnapshot(backupRow.snapshot)
  // Keep restored artifacts empty if backup was stripped; do not invent old caches.
  if (!restored.llmArtifacts) restored.llmArtifacts = {}

  return saveTripSnapshot(tripId, restored, { archivePrevious: true })
}

/** Debounced cloud writer — only persists when the snapshot actually changed. */
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTripId: string | null = null
let saveInFlight = false
let queuedSnapshot: TripSnapshot | null = null
let queuedSaveMode: 'none' | 'artifacts' | 'full' = 'none'
let queuedAllowEmptyTrip = false
/** Exact snapshot currently being uploaded, for no-op checks during a save. */
let inFlightJson: string | null = null
let pendingAfterFlight = false
/** Ignore mirrored realtime events right after our own save. */
let suppressRemoteUntil = 0
let suppressFlushTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Snapshot JSON currently reconciled on this client (last save or last applied remote).
 * Used to skip no-op local uploads — not to reject re-applying historical remote states.
 */
const lastSavedJsonByTrip = new Map<string, string>()
/** Last known generated itinerary, retained as a safety baseline across an empty regression. */
const lastGeneratedJsonByTrip = new Map<string, string>()
/** Last trip.updated_at we reconciled (save or remote apply). */
const lastAppliedUpdatedAtByTrip = new Map<string, string>()

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
  return JSON.stringify(snapshot)
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
      lastSavedJsonByTrip.set(tripId, snapshotJson(collectTripSnapshot()))
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
  lastSavedJsonByTrip.set(tripId, snapshotJson(snapshot))
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
  opts?: { trustSnapshot?: boolean },
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
      lastSavedJsonByTrip.set(tripId, json)
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
  queuedSnapshot = null
  queuedSaveMode = 'none'
  queuedAllowEmptyTrip = false
  pendingAfterFlight = false
  if (cloudSaveStatus === 'pending') setCloudSaveStatus('idle')

  setCloudSyncStatus('syncing')
  applyTripSnapshot(snapshot)
  // Reconcile against *local* round-trip form so remount autosave does not re-upload.
  try {
    const reconciled = collectTripSnapshot()
    lastSavedJsonByTrip.set(tripId, snapshotJson(reconciled))
    rememberGeneratedSnapshot(tripId, reconciled)
  } catch {
    lastSavedJsonByTrip.set(tripId, json)
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
  return applyRemoteTripSnapshot(tripId, full.snapshot, stamp, {
    trustSnapshot: true,
  })
}

/** Subscribe to live updates for one trip. Returns unsubscribe. */
export function subscribeTripRealtime(
  tripId: string,
  onRemoteApply: () => void,
): () => void {
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

  if (saveTimer) clearTimeout(saveTimer)
  // React's persistence effects run after the change-notification effect. Wait
  // one task so localStorage reflects this render before deciding it is dirty.
  saveTimer = setTimeout(() => {
    saveTimer = null
    const mode = queuedSaveMode === 'artifacts' ? 'artifacts' : 'full'
    let snapshot: TripSnapshot | null
    let json: string
    try {
      snapshot = collectSnapshotForMode(tripId, mode)
      if (!snapshot) return
      json = snapshotJson(snapshot)
    } catch {
      return
    }

    queuedSnapshot = snapshot

    // During an upload compare with that upload, not the older saved baseline:
    // reverting while A is uploading must still queue B to restore the cloud.
    const unchanged = saveInFlight
      ? json === inFlightJson
      : json === lastSavedJsonByTrip.get(tripId)
    if (unchanged) {
      queuedSnapshot = null
      queuedSaveMode = 'none'
      queuedAllowEmptyTrip = false
      if (cloudSaveStatus === 'pending') setCloudSaveStatus('idle')
      return
    }

    setCloudSaveStatus('pending')
    // Coalesce substantive edits into one write ~1.5s after the last change.
    saveTimer = setTimeout(() => {
      void flushTripCloudSave()
    }, 1500)
  }, 0)
}

export async function flushTripCloudSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const tripId = saveTripId
  if (!tripId) return
  if (saveInFlight) {
    pendingAfterFlight = true
    return
  }

  const saveMode = queuedSaveMode === 'artifacts' ? 'artifacts' : 'full'
  const snapshot = queuedSnapshot || collectTripSnapshot()
  const allowEmptyTrip = queuedAllowEmptyTrip
  queuedSnapshot = null
  queuedSaveMode = 'none'
  queuedAllowEmptyTrip = false
  const json = snapshotJson(snapshot)
  if (lastSavedJsonByTrip.get(tripId) === json) {
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

  saveInFlight = true
  inFlightJson = json
  setCloudSaveStatus('saving')
  try {
    const updatedAt = await saveTripSnapshot(tripId, snapshot, {
      archivePrevious: saveMode === 'full',
    })
    lastSavedJsonByTrip.set(tripId, json)
    rememberGeneratedSnapshot(tripId, snapshot)
    if (updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updatedAt)
    // Swallow our own realtime echo.
    armSuppressRemote(3000)
    setCloudSaveStatus('saved')
  } catch (err) {
    console.warn('[tripCloud] save failed', err)
    setCloudSaveStatus(
      'error',
      err instanceof Error ? err.message : '保存失败',
    )
  } finally {
    saveInFlight = false
    inFlightJson = null
    if (pendingAfterFlight) {
      pendingAfterFlight = false
      void flushTripCloudSave()
    } else {
      flushQueuedRemote()
    }
  }
}

export function applyAccessibleTripLocally(trip: AccessibleTrip) {
  applyTripSnapshot(trip.snapshot)
  rememberSavedSnapshot(trip.id, trip.snapshot, trip.updatedAt)
  try {
    rememberSavedSnapshot(trip.id, collectTripSnapshot(), trip.updatedAt)
  } catch {
    /* ignore */
  }
  saveTripId = trip.id
  beginRemoteQuietPeriod(2500)
  armSuppressRemote(1500)
  setCloudSaveStatus('idle')
  setCloudSyncStatus('idle')
}


export async function listTripShares(tripId: string): Promise<TripShareRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('trip_shares')
    .select('id, trip_id, invitee_email, role, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as TripShareRow[]
}

export async function upsertTripShare(
  tripId: string,
  inviteeEmail: string,
  role: TripShareRole,
): Promise<void> {
  const email = inviteeEmail.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('请输入有效邮箱')
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
    throw new Error(data.error || `发送邀请邮件失败（${res.status}）`)
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
