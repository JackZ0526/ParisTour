/**
 * Client-side counter for paid Google Maps/Places requests.
 *
 * The meter is observational only: every controlled call increments the daily
 * count and the per-kind breakdown so we can see API spend in the dashboard.
 * It never blocks the actual request — RapidAPI's own quota handles that.
 */

export type GoogleRequestKind =
  | 'place-search'
  | 'place-details'
  | 'place-photo'

export interface GoogleRequestBudgetSnapshot {
  date: string
  used: number
  byKind: Partial<Record<GoogleRequestKind, number>>
}

interface StoredBudget {
  date: string
  used: number
  byKind: Partial<Record<GoogleRequestKind, number>>
}

const STORAGE_PREFIX = 'paris-tour-google-request-budget-v1:'
let memoryBudget: StoredBudget | null = null

function localDate(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function storageFor(date: string): string {
  return `${STORAGE_PREFIX}${date}`
}

function emptyBudget(date: string): StoredBudget {
  return { date, used: 0, byKind: {} }
}

function validStoredBudget(value: unknown, date: string): StoredBudget | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredBudget>
  if (candidate.date !== date || !Number.isFinite(candidate.used)) return null
  const used = Math.max(0, Math.floor(Number(candidate.used)))
  const byKind =
    candidate.byKind && typeof candidate.byKind === 'object'
      ? candidate.byKind
      : {}
  return { date, used, byKind }
}

function readBudget(now = new Date()): StoredBudget {
  const date = localDate(now)
  try {
    const raw = localStorage.getItem(storageFor(date))
    const stored = raw ? validStoredBudget(JSON.parse(raw), date) : null
    if (stored) {
      memoryBudget = stored
      return stored
    }
  } catch {
    /* localStorage can be unavailable in private/server environments */
  }
  if (memoryBudget?.date === date) return memoryBudget
  memoryBudget = emptyBudget(date)
  return memoryBudget
}

function writeBudget(budget: StoredBudget) {
  memoryBudget = budget
  try {
    localStorage.setItem(storageFor(budget.date), JSON.stringify(budget))
  } catch {
    /* the in-memory counter still protects this tab */
  }
}

export function getGoogleRequestBudgetSnapshot(
  now = new Date(),
): GoogleRequestBudgetSnapshot {
  return readBudget(now)
}

/** Increment the daily counter for a controlled request and return the new count. */
export function recordGoogleRequest(
  kind: GoogleRequestKind,
  amount = 1,
  now = new Date(),
): number {
  const cost = Math.max(1, Math.floor(amount))
  const current = readBudget(now)
  const next: StoredBudget = {
    date: current.date,
    used: current.used + cost,
    byKind: {
      ...current.byKind,
      [kind]: (current.byKind[kind] || 0) + cost,
    },
  }
  writeBudget(next)
  return next.used
}

/**
 * @deprecated Retained for call-site compatibility. Always returns `true` —
 * the meter is observational only and never blocks real network calls.
 */
export function tryConsumeGoogleRequest(
  kind: GoogleRequestKind,
  amount = 1,
  now = new Date(),
): boolean {
  recordGoogleRequest(kind, amount, now)
  return true
}

/** Test helper; production UI never resets the daily counter. */
export function resetGoogleRequestBudgetForTests() {
  memoryBudget = null
}
