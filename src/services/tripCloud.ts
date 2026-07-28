import { getSupabase } from '../lib/supabase'
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
  return {
    version: 1,
    dates: s.dates ?? null,
    destination: typeof s.destination === 'string' ? s.destination : '巴黎',
    flights: s.flights ?? null,
    hotel: s.hotel ?? null,
    itinerary: s.itinerary ?? null,
    baseline: s.baseline ?? null,
  }
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
): Promise<string | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('trips')
    .update({ snapshot })
    .eq('id', tripId)
    .select('updated_at')
    .maybeSingle()
  if (error) throw error
  return typeof data?.updated_at === 'string' ? data.updated_at : null
}

/** Debounced cloud writer — only persists when the snapshot actually changed. */
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTripId: string | null = null
let saveInFlight = false
let pendingAfterFlight = false
/** Ignore mirrored realtime events right after our own save. */
let suppressRemoteUntil = 0
let suppressFlushTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Snapshot JSON currently reconciled on this client (last save or last applied remote).
 * Used to skip no-op local uploads — not to reject re-applying historical remote states.
 */
const lastSavedJsonByTrip = new Map<string, string>()
/** Last trip.updated_at we reconciled (save or remote apply). */
const lastAppliedUpdatedAtByTrip = new Map<string, string>()

type QueuedRemote = {
  tripId: string
  snapshot: TripSnapshot
  updatedAt: string
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
  const applied = applyRemoteTripSnapshot(q.tripId, q.snapshot, q.updatedAt)
  if (applied) q.onApply()
}

export function rememberSavedSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
  updatedAt?: string | null,
): void {
  if (!tripId) return
  lastSavedJsonByTrip.set(tripId, snapshotJson(snapshot))
  if (updatedAt) lastAppliedUpdatedAtByTrip.set(tripId, updatedAt)
}

/**
 * Apply a remote trip snapshot when cloud updated_at is newer than what we last reconciled.
 * Returns true when applied (caller should remount UI).
 */
export function applyRemoteTripSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
  updatedAt?: string | null,
): boolean {
  if (!tripId) return false

  const stamp =
    typeof updatedAt === 'string' && updatedAt.trim() ? updatedAt.trim() : ''

  // Defer while we write or swallow our own echo — never drop the event.
  if (saveInFlight || cloudSaveStatus === 'saving' || Date.now() < suppressRemoteUntil) {
    if (stamp) {
      queueRemoteUpdate({
        tripId,
        snapshot,
        updatedAt: stamp,
        onApply: () => realtimeApplyHandler?.(tripId),
      })
    }
    return false
  }

  if (stamp) {
    const prev = lastAppliedUpdatedAtByTrip.get(tripId)
    if (prev && !isNewerUpdatedAt(stamp, prev)) return false
  }

  const json = snapshotJson(snapshot)
  // Already matches what's on disk — advance cursor, no remount needed.
  // Do NOT compare against lastSavedJson alone: restoring a previously-seen
  // snapshot must still remount when updated_at is newer.
  try {
    if (snapshotJson(collectTripSnapshot()) === json) {
      lastSavedJsonByTrip.set(tripId, json)
      if (stamp) lastAppliedUpdatedAtByTrip.set(tripId, stamp)
      return false
    }
  } catch {
    /* ignore */
  }

  // Remote write wins over a debounced local save that hasn't uploaded yet.
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (cloudSaveStatus === 'pending') setCloudSaveStatus('idle')

  setCloudSyncStatus('syncing')
  applyTripSnapshot(snapshot)
  // Reconcile against *local* round-trip form so remount autosave does not re-upload.
  try {
    lastSavedJsonByTrip.set(tripId, snapshotJson(collectTripSnapshot()))
  } catch {
    lastSavedJsonByTrip.set(tripId, json)
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
        const snap = asSnapshot(row.snapshot)
        const applied = applyRemoteTripSnapshot(tripId, snap, row.updated_at)
        if (applied) onRemoteApply()
      },
    )
    .subscribe()

  realtimeChannel = channel

  return () => {
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
  opts?: { force?: boolean },
) {
  if (!canEdit || !tripId) return
  saveTripId = tripId

  // After live sync, remount effects often look like "changes". Swallow those
  // unless the caller forces (e.g. restore default).
  if (!opts?.force && Date.now() < quietAutosaveUntil) {
    return
  }

  if (saveTimer) clearTimeout(saveTimer)
  setCloudSaveStatus('pending')
  // Coalesce rapid edits into one write ~1.5s after the last change.
  saveTimer = setTimeout(() => {
    void flushTripCloudSave()
  }, 1500)
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

  const snapshot = collectTripSnapshot()
  const json = snapshotJson(snapshot)
  if (lastSavedJsonByTrip.get(tripId) === json) {
    if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
      setCloudSaveStatus('idle')
    }
    flushQueuedRemote()
    return
  }

  saveInFlight = true
  setCloudSaveStatus('saving')
  try {
    const updatedAt = await saveTripSnapshot(tripId, snapshot)
    lastSavedJsonByTrip.set(tripId, json)
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
  const { authFetch } = await import('./authFetch')
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
