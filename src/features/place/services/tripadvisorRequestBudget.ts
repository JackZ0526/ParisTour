/**
 * Client-side guardrail for Tripadvisor RapidAPI.
 *
 * Free tier is 150 requests / month. Controlled app calls stop at 80 so the
 * remaining quota covers dashboard probes, retries, and accidental extras.
 */

export const TRIPADVISOR_MONTHLY_LIMIT = 80
export const TRIPADVISOR_PROVIDER_MONTHLY_CAP = 150

export type TripadvisorRequestKind =
  | 'catalog-search'
  | 'media-gallery'
  | 'details'
  | 'auto-complete'

export interface TripadvisorRequestBudgetSnapshot {
  month: string
  used: number
  remaining: number
  limit: number
  byKind: Partial<Record<TripadvisorRequestKind, number>>
}

interface StoredBudget {
  month: string
  used: number
  byKind: Partial<Record<TripadvisorRequestKind, number>>
}

const STORAGE_PREFIX = 'paris-tour-tripadvisor-request-budget-v1:'
let memoryBudget: StoredBudget | null = null

function localMonth(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function storageFor(month: string): string {
  return `${STORAGE_PREFIX}${month}`
}

function emptyBudget(month: string): StoredBudget {
  return { month, used: 0, byKind: {} }
}

function validStoredBudget(value: unknown, month: string): StoredBudget | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredBudget>
  if (candidate.month !== month || !Number.isFinite(candidate.used)) return null
  const used = Math.max(0, Math.floor(Number(candidate.used)))
  const byKind =
    candidate.byKind && typeof candidate.byKind === 'object'
      ? candidate.byKind
      : {}
  return { month, used, byKind }
}

function readBudget(now = new Date()): StoredBudget {
  const month = localMonth(now)
  try {
    const raw = localStorage.getItem(storageFor(month))
    const stored = raw ? validStoredBudget(JSON.parse(raw), month) : null
    if (stored) {
      memoryBudget = stored
      return stored
    }
  } catch {
    /* localStorage can be unavailable in private/server environments */
  }
  if (memoryBudget?.month === month) return memoryBudget
  memoryBudget = emptyBudget(month)
  return memoryBudget
}

function writeBudget(budget: StoredBudget) {
  memoryBudget = budget
  try {
    localStorage.setItem(storageFor(budget.month), JSON.stringify(budget))
  } catch {
    /* the in-memory guard still protects this tab */
  }
}

export function getTripadvisorRequestBudgetSnapshot(
  now = new Date(),
): TripadvisorRequestBudgetSnapshot {
  const budget = readBudget(now)
  return {
    ...budget,
    limit: TRIPADVISOR_MONTHLY_LIMIT,
    remaining: Math.max(0, TRIPADVISOR_MONTHLY_LIMIT - budget.used),
  }
}

/** Reserve one request immediately before starting a real network call. */
export function tryConsumeTripadvisorRequest(
  kind: TripadvisorRequestKind,
  amount = 1,
  now = new Date(),
): boolean {
  const cost = Math.max(1, Math.floor(amount))
  const current = readBudget(now)
  if (current.used + cost > TRIPADVISOR_MONTHLY_LIMIT) return false

  const next: StoredBudget = {
    month: current.month,
    used: current.used + cost,
    byKind: {
      ...current.byKind,
      [kind]: (current.byKind[kind] || 0) + cost,
    },
  }
  writeBudget(next)
  return true
}

/** Test helper; production UI never resets the monthly guardrail. */
export function resetTripadvisorRequestBudgetForTests() {
  memoryBudget = null
}
