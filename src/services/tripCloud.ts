import { getSupabase } from '../lib/supabase'
import {
  applyTripSnapshot,
  collectTripSnapshot,
  emptyTripSnapshot,
  type TripSnapshot,
} from './tripSnapshot'

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

/** Debounced cloud writer — call after local mutations. */
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTripId: string | null = null
let saveInFlight = false

export function scheduleTripCloudSave(tripId: string, canEdit: boolean) {
  if (!canEdit || !tripId) return
  saveTripId = tripId
  if (saveTimer) clearTimeout(saveTimer)
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
  if (!tripId || saveInFlight) return
  saveInFlight = true
  try {
    const snapshot = collectTripSnapshot()
    await saveTripSnapshot(tripId, snapshot)
  } catch (err) {
    console.warn('[tripCloud] save failed', err)
  } finally {
    saveInFlight = false
  }
}

export function applyAccessibleTripLocally(trip: AccessibleTrip) {
  applyTripSnapshot(trip.snapshot)
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
