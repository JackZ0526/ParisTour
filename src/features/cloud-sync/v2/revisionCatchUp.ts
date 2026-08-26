import type {
  CommittedTripMutation,
  TripMutationBatchResult,
} from './mutationTypes'
import { duplicateAckIds } from './outboxPolicy'

export type CatchUpPlan =
  | { action: 'none' }
  | { action: 'ack-local'; toRevision: number }
  | { action: 'apply'; mutations: CommittedTripMutation[] }
  | { action: 'pull' }
  | { action: 'snapshot' }

export function revisionsAreConsecutive(
  afterRevision: number,
  revisions: number[],
): boolean {
  return revisions.every((revision, index) => revision === afterRevision + index + 1)
}

export function planBroadcastCatchUp(
  localRevision: number,
  incoming: CommittedTripMutation,
): CatchUpPlan {
  if (incoming.revision <= localRevision) return { action: 'none' }
  if (incoming.revision === localRevision + 1) {
    return { action: 'apply', mutations: [incoming] }
  }
  return { action: 'pull' }
}

export function planCommitCatchUp(
  localRevision: number,
  result: TripMutationBatchResult,
): CatchUpPlan {
  if (result.conflicts.length) return { action: 'snapshot' }
  if (duplicateAckIds(result).length) return { action: 'snapshot' }

  const committed = [...result.committed].sort((a, b) => a.revision - b.revision)
  if (!committed.length) return { action: 'none' }

  const revisions = committed.map((mutation) => mutation.revision)
  if (revisionsAreConsecutive(localRevision, revisions)) {
    return { action: 'ack-local', toRevision: committed[committed.length - 1].revision }
  }
  if (committed[0].revision > localRevision + 1) return { action: 'pull' }
  if (committed[committed.length - 1].revision <= localRevision) return { action: 'none' }
  return { action: 'pull' }
}

export function planPullCatchUp(
  localRevision: number,
  page: {
    snapshotRequired: boolean
    toRevision: number
    mutations: CommittedTripMutation[]
  },
): CatchUpPlan {
  if (page.snapshotRequired || page.toRevision < localRevision) {
    return { action: 'snapshot' }
  }
  const revisions = [...page.mutations]
    .sort((a, b) => a.revision - b.revision)
    .map((mutation) => mutation.revision)
  if (!revisions.length) return { action: 'none' }
  if (revisionsAreConsecutive(localRevision, revisions)) {
    return { action: 'apply', mutations: page.mutations }
  }
  return { action: 'snapshot' }
}
