/**
 * Client-side guardrail for paid Google Maps/Places requests.
 *
 * The project intentionally stops controlled API work at 90 requests per
 * local calendar day. The remaining ten requests are a safety margin for the
 * Maps JavaScript bootstrap and page reloads, which do not pass through these
 * service functions.
 */

export const GOOGLE_CONTROLLED_DAILY_LIMIT = 90

export type GoogleRequestKind =
  | 'place-search'
  | 'place-details'
  | 'place-photo'

export interface GoogleRequestBudgetSnapshot {
  date: string
  used: number
  remaining: number
  limit: number
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
    /* the in-memory guard still protects this tab */
  }
}

export function getGoogleRequestBudgetSnapshot(
  now = new Date(),
): GoogleRequestBudgetSnapshot {
  const budget = readBudget(now)
  return {
    ...budget,
    limit: GOOGLE_CONTROLLED_DAILY_LIMIT,
    remaining: Math.max(0, GOOGLE_CONTROLLED_DAILY_LIMIT - budget.used),
  }
}

/** Reserve one request immediately before starting a real network call. */
export function tryConsumeGoogleRequest(
  kind: GoogleRequestKind,
  amount = 1,
  now = new Date(),
): boolean {
  const cost = Math.max(1, Math.floor(amount))
  const current = readBudget(now)
  if (current.used + cost > GOOGLE_CONTROLLED_DAILY_LIMIT) return false

  const next: StoredBudget = {
    date: current.date,
    used: current.used + cost,
    byKind: {
      ...current.byKind,
      [kind]: (current.byKind[kind] || 0) + cost,
    },
  }
  writeBudget(next)
  return true
}

/** Test helper; production UI never resets the daily guardrail. */
export function resetGoogleRequestBudgetForTests() {
  memoryBudget = null
}
