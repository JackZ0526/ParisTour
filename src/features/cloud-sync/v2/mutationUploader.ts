import {
  acknowledgeMutations,
  listPendingMutations,
  markMutationConflict,
  markMutationsUploading,
  resetUploadingMutations,
  scheduleMutationRetry,
  subscribeMutationOutbox,
} from './mutationOutbox'
import { applyTripMutationsV2 } from './mutationTransport'
import { mutationRetryDelayMs, unresolvedMutationIds } from './outboxPolicy'
import { requestUploaderLease, subscribeOutboxBroadcast } from './uploaderLease'
import type { TripMutationBatchResult } from './mutationTypes'

export type MutationUploader = {
  requestFlush: () => void
  stop: () => void
}

export function startMutationUploader(options: {
  tripId: string
  deviceId: string
  getRevision: () => number
  onCommitted: (result: TripMutationBatchResult) => void | Promise<void>
  onError?: (error: unknown) => void
}): MutationUploader {
  let stopped = false
  let isLeader = false
  let flushing = false
  let flushAgain = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleFlush = (delay = 0) => {
    if (stopped || !isLeader) return
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      retryTimer = null
      void flush()
    }, delay)
  }

  const flush = async () => {
    if (stopped || !isLeader) return
    if (flushing) {
      flushAgain = true
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    flushing = true
    try {
      const entries = await listPendingMutations(options.tripId, { limit: 50 })
      if (!entries.length) return
      const mutationIds = entries.map((entry) => entry.mutationId)
      await markMutationsUploading(mutationIds)
      try {
        const result = await applyTripMutationsV2({
          tripId: options.tripId,
          deviceId: options.deviceId,
          baseRevision: options.getRevision(),
          mutations: entries.map((entry) => entry.mutation),
        })
        await acknowledgeMutations(result.acknowledged)
        for (const conflict of result.conflicts) {
          await markMutationConflict(conflict)
        }
        const unresolved = unresolvedMutationIds(mutationIds, result)
        if (unresolved.length) await scheduleMutationRetry(unresolved, 1_000)
        await options.onCommitted(result)
        flushAgain = true
      } catch (error) {
        const attempt = Math.max(...entries.map((entry) => entry.attemptCount + 1))
        const delay = mutationRetryDelayMs(attempt)
        await scheduleMutationRetry(mutationIds, delay)
        options.onError?.(error)
        scheduleFlush(delay)
      }
    } finally {
      flushing = false
      if (flushAgain && !stopped) {
        flushAgain = false
        scheduleFlush()
      }
    }
  }

  const becomeLeader = () => {
    if (stopped) return
    const alreadyLeader = isLeader
    isLeader = true
    if (!alreadyLeader) {
      void resetUploadingMutations(options.tripId).then(() => scheduleFlush())
    } else {
      scheduleFlush()
    }
  }

  const lease = requestUploaderLease(options.tripId, becomeLeader)
  const unsubscribe = subscribeMutationOutbox((changedTripId) => {
    if (changedTripId === options.tripId) scheduleFlush()
  })
  const unsubscribeBroadcast = subscribeOutboxBroadcast(options.tripId, () => {
    scheduleFlush()
  })
  const handleOnline = () => scheduleFlush()
  if (typeof window !== 'undefined') window.addEventListener('online', handleOnline)

  return {
    requestFlush: () => scheduleFlush(),
    stop: () => {
      stopped = true
      isLeader = false
      lease.release()
      unsubscribe()
      unsubscribeBroadcast()
      if (retryTimer) clearTimeout(retryTimer)
      if (typeof window !== 'undefined') window.removeEventListener('online', handleOnline)
    },
  }
}
