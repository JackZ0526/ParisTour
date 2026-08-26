import type { TripMutationBatchResult } from './mutationTypes'

const MAX_RETRY_DELAY_MS = 30_000

export type FlushableOutboxEntry = {
  status: 'pending' | 'uploading' | 'retry_wait' | 'conflict'
  nextRetryAt: number
  updatedAt: number
}

export function mutationRetryDelayMs(attempt: number, random = Math.random()): number {
  const exponent = Math.max(0, Math.min(8, attempt - 1))
  const base = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** exponent)
  return Math.round(base * (0.8 + random * 0.4))
}

export function selectFlushableMutations<T extends FlushableOutboxEntry>(
  entries: T[],
  now: number,
  limit = 50,
): T[] {
  return entries
    .filter(
      (entry) =>
        entry.status !== 'conflict' &&
        (entry.status !== 'retry_wait' || entry.nextRetryAt <= now),
    )
    .slice(0, Math.max(1, limit))
}

export function recoverUploadingMutations<T extends FlushableOutboxEntry>(
  entries: T[],
  now: number,
): T[] {
  return entries.map((entry) =>
    entry.status === 'uploading'
      ? { ...entry, status: 'pending', updatedAt: now }
      : entry,
  )
}

export function duplicateAckIds(result: TripMutationBatchResult): string[] {
  const committed = new Set(result.committed.map((mutation) => mutation.mutationId))
  return result.acknowledged.filter((id) => !committed.has(id))
}

export function unresolvedMutationIds(
  attemptedIds: string[],
  result: TripMutationBatchResult,
): string[] {
  const resolved = new Set([
    ...result.acknowledged,
    ...result.conflicts.map((conflict) => conflict.mutationId),
  ])
  return attemptedIds.filter((id) => !resolved.has(id))
}
