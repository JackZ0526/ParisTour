import { describe, expect, it } from 'vitest'
import {
  applyItineraryMutation,
  applyItineraryMutations,
  type ItineraryMutationDocument,
} from '../features/cloud-sync/v2/itineraryMutationReducer'
import {
  planBroadcastCatchUp,
  planCommitCatchUp,
} from '../features/cloud-sync/v2/revisionCatchUp'
import type {
  CommittedTripMutation,
  TripMutation,
  TripMutationBatchResult,
} from '../features/cloud-sync/v2/mutationTypes'
import type { DayPlan, ItineraryStop, Place } from '../types'
import { getSyncV2Egress, recordSyncV2Egress, resetSyncV2Egress } from '../features/cloud-sync/v2/syncEgress'

const makeStop = (id: string, placeId = id): ItineraryStop & { id: string } => ({
  id,
  placeId,
  time: '10:00',
  note: '',
})

const makePlace = (id: string): Place => ({
  id,
  name: id,
  type: 'attraction',
  description: id,
  ratingHint: '',
  image: '',
  location: { lat: 48.8, lng: 2.3 },
  googleMapsUrl: '',
})

const makeDay = (day: number, stops: ItineraryStop[]): DayPlan => ({
  day,
  title: `D${day}`,
  theme: '',
  pace: 'moderate',
  summary: '',
  metroHintFromArea: {},
  stops,
})

function draft(
  type: TripMutation['type'],
  payload: Extract<TripMutation, { type: typeof type }>['payload'],
  mutationId: string,
): TripMutation {
  return {
    protocol: 2,
    mutationId,
    tripId: 'trip-1',
    deviceId: 'device-1',
    baseRevision: 0,
    createdAt: '2026-08-26T00:00:00.000Z',
    type,
    payload,
  } as TripMutation
}

class MemoryTripServer {
  revision = 0
  log: CommittedTripMutation[] = []
  seen = new Set<string>()
  document: ItineraryMutationDocument = {
    days: [makeDay(1, [makeStop('a'), makeStop('b'), makeStop('c')])],
    customPlaces: { a: makePlace('a'), b: makePlace('b'), c: makePlace('c') },
  }

  apply(mutations: TripMutation[]): TripMutationBatchResult {
    const acknowledged: string[] = []
    const committed: CommittedTripMutation[] = []
    const conflicts: TripMutationBatchResult['conflicts'] = []
    for (const mutation of mutations) {
      if (this.seen.has(mutation.mutationId)) {
        acknowledged.push(mutation.mutationId)
        continue
      }
      const result = applyItineraryMutation(this.document, mutation)
      if (result.ignoredReason === 'invalid_anchor') {
        conflicts.push({ mutationId: mutation.mutationId, code: 'invalid_anchor' })
        continue
      }
      if (mutation.type === 'stop.move' && result.ignoredReason === 'entity_missing') {
        conflicts.push({
          mutationId: mutation.mutationId,
          code: 'entity_deleted',
          entityId: mutation.payload.stopId,
        })
        continue
      }
      this.document = result.document
      this.revision += 1
      this.seen.add(mutation.mutationId)
      const row: CommittedTripMutation = {
        ...mutation,
        revision: this.revision,
        committedAt: `2026-08-26T00:00:0${this.revision}.000Z`,
      }
      this.log.push(row)
      committed.push(row)
      acknowledged.push(mutation.mutationId)
    }
    return { revision: this.revision, acknowledged, committed, conflicts }
  }

  pull(afterRevision: number, dropIds: string[] = []) {
    return this.log.filter(
      (row) => row.revision > afterRevision && !dropIds.includes(row.mutationId),
    )
  }
}

describe('sync V2 protocol matrix', () => {
  it('keeps rapid add/add/move/delete without dropping operations', () => {
    const server = new MemoryTripServer()
    const ops = [
      draft('stop.add', {
        dayNumber: 1,
        stop: makeStop('d'),
        place: makePlace('d'),
        afterStopId: 'c',
      }, 'add-d'),
      draft('stop.add', {
        dayNumber: 1,
        stop: makeStop('e'),
        place: makePlace('e'),
        afterStopId: 'd',
      }, 'add-e'),
      draft('stop.move', {
        stopId: 'e',
        targetDayNumber: 1,
        beforeStopId: 'a',
      }, 'move-e'),
      draft('stop.delete', { stopId: 'b' }, 'del-b'),
    ]
    const result = server.apply(ops)
    expect(result.committed).toHaveLength(4)
    expect(server.document.days[0].stops.map((stop) => stop.id)).toEqual(['e', 'a', 'c', 'd'])
  })

  it('retries the same mutationId only once on the server', () => {
    const server = new MemoryTripServer()
    const add = draft('stop.add', {
      dayNumber: 1,
      stop: makeStop('d'),
      afterStopId: 'c',
    }, 'add-d')
    const first = server.apply([add])
    const retry = server.apply([add])
    expect(first.committed).toHaveLength(1)
    expect(retry.committed).toHaveLength(0)
    expect(retry.acknowledged).toEqual(['add-d'])
    expect(server.revision).toBe(1)
  })

  it('replays a dropped broadcast through a revision gap pull', () => {
    const server = new MemoryTripServer()
    server.apply([
      draft('stop.delete', { stopId: 'a' }, 'del-a'),
      draft('stop.delete', { stopId: 'b' }, 'del-b'),
      draft('stop.delete', { stopId: 'c' }, 'del-c'),
    ])
    let localRevision = 0
    const received = [server.log[0], server.log[2]]
    const applied: CommittedTripMutation[] = []
    for (const incoming of received) {
      const plan = planBroadcastCatchUp(localRevision, incoming)
      if (plan.action === 'apply') {
        applied.push(...plan.mutations)
        localRevision = incoming.revision
      } else if (plan.action === 'pull') {
        const missing = server.pull(localRevision)
        applied.push(...missing)
        localRevision = missing[missing.length - 1]?.revision ?? localRevision
      }
    }
    expect(applied.map((row) => row.mutationId)).toEqual(['del-a', 'del-b', 'del-c'])
  })

  it('ignores duplicate and out-of-order broadcasts', () => {
    const server = new MemoryTripServer()
    server.apply([
      draft('stop.delete', { stopId: 'a' }, 'del-a'),
      draft('stop.delete', { stopId: 'b' }, 'del-b'),
    ])
    let localRevision = 0
    const inbox = [server.log[1], server.log[0], server.log[1]]
    for (const incoming of inbox) {
      const plan = planBroadcastCatchUp(localRevision, incoming)
      if (plan.action === 'apply') localRevision = incoming.revision
      if (plan.action === 'pull') {
        const missing = server.pull(localRevision).filter((row) => row.revision <= incoming.revision)
        localRevision = missing[missing.length - 1]?.revision ?? localRevision
      }
    }
    expect(localRevision).toBe(2)
  })

  it('restores pending outbox mutations after a refresh overlay', () => {
    const snapshot = {
      days: [makeDay(1, [makeStop('a'), makeStop('b')])],
      customPlaces: {},
    }
    const pending = [
      draft('stop.add', { dayNumber: 1, stop: makeStop('c'), afterStopId: 'b' }, 'add-c'),
    ]
    const overlaid = applyItineraryMutations(snapshot, pending, 'replay')
    expect(overlaid.document.days[0].stops.map((stop) => stop.id)).toEqual(['a', 'b', 'c'])
  })

  it('batches offline edits into one apply after reconnect', () => {
    const server = new MemoryTripServer()
    const queued = [
      draft('stop.delete', { stopId: 'a' }, 'del-a'),
      draft('stop.delete', { stopId: 'b' }, 'del-b'),
    ]
    const result = server.apply(queued)
    expect(planCommitCatchUp(0, result)).toEqual({ action: 'ack-local', toRevision: 2 })
    expect(server.document.days[0].stops.map((stop) => stop.id)).toEqual(['c'])
  })

  it('lets concurrent moves of the same stop serialize by revision', () => {
    const server = new MemoryTripServer()
    const first = server.apply([
      draft('stop.move', { stopId: 'c', targetDayNumber: 1, beforeStopId: 'a' }, 'move-1'),
    ])
    const second = server.apply([
      draft('stop.move', { stopId: 'c', targetDayNumber: 1, afterStopId: 'b' }, 'move-2'),
    ])
    expect(first.committed).toHaveLength(1)
    expect(second.committed).toHaveLength(1)
    expect(server.document.days[0].stops.map((stop) => stop.id)).toEqual(['a', 'b', 'c'])
  })

  it('conflicts a move after the other device deleted the stop', () => {
    const server = new MemoryTripServer()
    server.apply([draft('stop.delete', { stopId: 'c' }, 'del-c')])
    const move = server.apply([
      draft('stop.move', { stopId: 'c', targetDayNumber: 1, beforeStopId: 'a' }, 'move-c'),
    ])
    expect(move.conflicts[0]?.code).toBe('entity_deleted')
    expect(move.committed).toHaveLength(0)
  })

  it('does not enqueue a remote apply back onto the local outbox', () => {
    const server = new MemoryTripServer()
    const result = server.apply([
      draft('stop.delete', { stopId: 'a' }, 'del-a'),
    ])
    const remote = applyItineraryMutations(
      {
        days: [makeDay(1, [makeStop('a'), makeStop('b'), makeStop('c')])],
        customPlaces: {},
      },
      result.committed,
      'remote',
    )
    expect(remote.changed).toBe(true)
    expect(remote.animation?.type).toBe('delete')
  })

  it('reloads snapshot then overlays remaining pending mutations after snapshotRequired', () => {
    const snapshot = {
      days: [makeDay(1, [makeStop('a')])],
      customPlaces: {},
    }
    const pending = [
      draft('stop.add', { dayNumber: 1, stop: makeStop('z'), afterStopId: 'a' }, 'add-z'),
    ]
    const overlaid = applyItineraryMutations(snapshot, pending, 'replay')
    expect(overlaid.document.days[0].stops.map((stop) => stop.id)).toEqual(['a', 'z'])
  })

  it('keeps FLIP identity across a remote adjacent swap A→B then B→C', () => {
    let document = {
      days: [makeDay(1, [makeStop('a'), makeStop('b'), makeStop('c')])],
      customPlaces: {},
    }
    const first = applyItineraryMutation(
      document,
      draft('stop.move', { stopId: 'a', targetDayNumber: 1, afterStopId: 'b' }, 'swap-1'),
      'remote',
    )
    document = first.document
    const second = applyItineraryMutation(
      document,
      draft('stop.move', { stopId: 'b', targetDayNumber: 1, afterStopId: 'c' }, 'swap-2'),
      'remote',
    )
    expect(first.animation).toMatchObject({ type: 'move', stopId: 'a' })
    expect(second.animation).toMatchObject({ type: 'move', stopId: 'b' })
    expect(second.document.days[0].stops.map((stop) => stop.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not count a snapshot or pull for consecutive broadcasts', () => {
    resetSyncV2Egress()
    const server = new MemoryTripServer()
    server.apply([
      draft('stop.delete', { stopId: 'a' }, 'del-a'),
      draft('stop.delete', { stopId: 'b' }, 'del-b'),
    ])
    let localRevision = 0
    for (const incoming of server.log) {
      recordSyncV2Egress('broadcast', incoming)
      const plan = planBroadcastCatchUp(localRevision, incoming)
      expect(plan.action).toBe('apply')
      if (plan.action === 'apply') localRevision = incoming.revision
    }
    const egress = getSyncV2Egress()
    expect(egress.broadcastMessages).toBe(2)
    expect(egress.snapshotLoads).toBe(0)
    expect(egress.pullCalls).toBe(0)
  })
})
