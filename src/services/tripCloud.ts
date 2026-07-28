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
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('trips')
    .update({ snapshot })
    .eq('id', tripId)
  if (error) throw error
}

/** Debounced cloud writer — only persists when the snapshot actually changed. */
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTripId: string | null = null
let saveInFlight = false
let pendingAfterFlight = false
/** Ignore mirrored realtime events right after our own save. */
let suppressRemoteUntil = 0
/** Last successfully uploaded / applied snapshot JSON, keyed by trip id. */
const lastSavedJsonByTrip = new Map<string, string>()
/** Snapshots already reconciled locally (handles jsonb / round-trip shape drift). */
const knownSnapshotJsonByTrip = new Map<string, Set<string>>()

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

function markSnapshotKnown(tripId: string, json: string) {
  let set = knownSnapshotJsonByTrip.get(tripId)
  if (!set) {
    set = new Set()
    knownSnapshotJsonByTrip.set(tripId, set)
  }
  set.add(json)
  lastSavedJsonByTrip.set(tripId, json)
}

function isSnapshotKnown(tripId: string, json: string): boolean {
  if (lastSavedJsonByTrip.get(tripId) === json) return true
  return knownSnapshotJsonByTrip.get(tripId)?.has(json) ?? false
}

export function rememberSavedSnapshot(tripId: string, snapshot: TripSnapshot): void {
  if (!tripId) return
  markSnapshotKnown(tripId, snapshotJson(snapshot))
}

function isLocalSaveBusy(): boolean {
  return (
    saveInFlight ||
    cloudSaveStatus === 'pending' ||
    cloudSaveStatus === 'saving'
  )
}

/**
 * Apply a remote trip snapshot if it differs from local.
 * Returns true when applied (caller should remount UI).
 */
export function applyRemoteTripSnapshot(
  tripId: string,
  snapshot: TripSnapshot,
): boolean {
  if (!tripId) return false
  if (Date.now() < suppressRemoteUntil) return false

  const json = snapshotJson(snapshot)
  if (isSnapshotKnown(tripId, json)) return false
  // Don't clobber in-progress local edits; the next remote event after save will catch up.
  if (isLocalSaveBusy()) return false

  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (cloudSaveStatus === 'pending') setCloudSaveStatus('idle')

  setCloudSyncStatus('syncing')
  applyTripSnapshot(snapshot)
  markSnapshotKnown(tripId, json)
  // Round-trip through localStorage may change shape — mark that too so we don't re-apply.
  try {
    markSnapshotKnown(tripId, snapshotJson(collectTripSnapshot()))
  } catch {
    /* ignore */
  }
  saveTripId = tripId
  // Block echo / hydration autosave from bouncing back into realtime.
  suppressRemoteUntil = Date.now() + 2000
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
        } | null
        if (!row?.id || row.id !== tripId) return
        const snap = asSnapshot(row.snapshot)
        const applied = applyRemoteTripSnapshot(tripId, snap)
        if (applied) onRemoteApply()
      },
    )
    .subscribe()

  realtimeChannel = channel

  return () => {
    if (realtimeChannel === channel) {
      void sb.removeChannel(channel)
      realtimeChannel = null
    }
  }
}

export function scheduleTripCloudSave(tripId: string, canEdit: boolean) {
  if (!canEdit || !tripId) return
  saveTripId = tripId
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
  if (isSnapshotKnown(tripId, json)) {
    if (cloudSaveStatus === 'pending' || cloudSaveStatus === 'saving') {
      setCloudSaveStatus('idle')
    }
    return
  }

  saveInFlight = true
  setCloudSaveStatus('saving')
  try {
    await saveTripSnapshot(tripId, snapshot)
    markSnapshotKnown(tripId, json)
    // Swallow our own realtime echo.
    suppressRemoteUntil = Date.now() + 3000
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
    }
  }
}

export function applyAccessibleTripLocally(trip: AccessibleTrip) {
  applyTripSnapshot(trip.snapshot)
  rememberSavedSnapshot(trip.id, trip.snapshot)
  try {
    markSnapshotKnown(trip.id, snapshotJson(collectTripSnapshot()))
  } catch {
    /* ignore */
  }
  saveTripId = trip.id
  suppressRemoteUntil = Date.now() + 1500
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
