import { describe, expect, it } from 'vitest'
import {
  duplicateAckIds,
  mutationRetryDelayMs,
  recoverUploadingMutations,
  selectFlushableMutations,
  unresolvedMutationIds,
} from '../features/cloud-sync/v2/outboxPolicy'
import {
  planBroadcastCatchUp,
  planCommitCatchUp,
  planPullCatchUp,
  revisionsAreConsecutive,
} from '../features/cloud-sync/v2/revisionCatchUp'
import type { CommittedTripMutation, TripMutationBatchResult } from '../features/cloud-sync/v2/mutationTypes'

const committed = (revision: number, mutationId = `m${revision}`): CommittedTripMutation => ({
  protocol: 2,
  mutationId,
  tripId: 'trip-1',
  deviceId: 'device-1',
  baseRevision: revision - 1,
  createdAt: '2026-08-26T00:00:00.000Z',
  type: 'stop.delete',
  payload: { stopId: mutationId },
  revision,
  committedAt: '2026-08-26T00:00:00.000Z',
})

describe('outbox policy', () => {
  it('recovers uploading mutations after a refresh and retries with backoff', () => {
    const recovered = recoverUploadingMutations(
      [
        { status: 'uploading', nextRetryAt: 0, updatedAt: 1 },
        { status: 'retry_wait', nextRetryAt: 50, updatedAt: 1 },
        { status: 'conflict', nextRetryAt: 0, updatedAt: 1 },
      ],
      10,
    )
    expect(recovered[0].status).toBe('pending')
    expect(selectFlushableMutations(recovered, 10, 10).map((entry) => entry.status)).toEqual([
      'pending',
    ])
    expect(selectFlushableMutations(recovered, 50, 10).map((entry) => entry.status)).toEqual([
      'pending',
      'retry_wait',
    ])
    expect(mutationRetryDelayMs(1, 0)).toBe(400)
    expect(mutationRetryDelayMs(3, 0)).toBe(1600)
  })
})

describe('revision catch-up plans', () => {
  it('acks consecutive local commits without a pull', () => {
    const result: TripMutationBatchResult = {
      revision: 3,
      acknowledged: ['a', 'b'],
      committed: [committed(2, 'a'), committed(3, 'b')],
      conflicts: [],
    }
    expect(revisionsAreConsecutive(1, [2, 3])).toBe(true)
    expect(planCommitCatchUp(1, result)).toEqual({ action: 'ack-local', toRevision: 3 })
    expect(planCommitCatchUp(1, {
      revision: 4,
      acknowledged: ['gap'],
      committed: [committed(4, 'gap')],
      conflicts: [],
    })).toEqual({ action: 'pull' })
  })

  it('reloads a snapshot after conflicts or duplicate acks from a crash window', () => {
    expect(planCommitCatchUp(1, {
      revision: 1,
      acknowledged: ['a'],
      committed: [],
      conflicts: [{ mutationId: 'a', code: 'entity_deleted' }],
    })).toEqual({ action: 'snapshot' })
    expect(duplicateAckIds({
      revision: 2,
      acknowledged: ['a', 'b'],
      committed: [committed(2, 'b')],
      conflicts: [],
    })).toEqual(['a'])
    expect(planCommitCatchUp(1, {
      revision: 2,
      acknowledged: ['a', 'b'],
      committed: [committed(2, 'b')],
      conflicts: [],
    })).toEqual({ action: 'snapshot' })
  })

  it('applies consecutive broadcasts and coalesces gaps into a single pull plan', () => {
    expect(planBroadcastCatchUp(4, committed(5))).toEqual({
      action: 'apply',
      mutations: [committed(5)],
    })
    expect(planBroadcastCatchUp(4, committed(7))).toEqual({ action: 'pull' })
    expect(planBroadcastCatchUp(4, committed(4))).toEqual({ action: 'none' })
    expect(planPullCatchUp(4, {
      snapshotRequired: false,
      toRevision: 6,
      mutations: [committed(5), committed(6)],
    }).action).toBe('apply')
    expect(planPullCatchUp(2, {
      snapshotRequired: true,
      toRevision: 9,
      mutations: [],
    })).toEqual({ action: 'snapshot' })
  })

  it('does not re-upload mutations the server already acknowledged', () => {
    expect(unresolvedMutationIds(['a', 'b', 'c'], {
      revision: 2,
      acknowledged: ['a'],
      committed: [committed(2, 'a')],
      conflicts: [{ mutationId: 'b', code: 'invalid_anchor' }],
    })).toEqual(['c'])
  })
})
