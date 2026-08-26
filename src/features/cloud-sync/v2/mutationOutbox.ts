import type { TripMutation, TripMutationConflict } from './mutationTypes'
import { notifyOutboxChanged } from './uploaderLease'
import {
  recoverUploadingMutations,
  selectFlushableMutations,
} from './outboxPolicy'

const DB_NAME = 'paris-tour-sync-v2'
const DB_VERSION = 2
const OUTBOX_STORE_NAME = 'mutation_outbox'
const META_STORE_NAME = 'sync_meta'

type SyncMeta = {
  key: string
  value: number
}

export type OutboxMutationStatus =
  | 'pending'
  | 'uploading'
  | 'retry_wait'
  | 'conflict'

export type OutboxMutation = {
  mutationId: string
  tripId: string
  deviceId: string
  sequence: number
  mutation: TripMutation
  status: OutboxMutationStatus
  attemptCount: number
  nextRetryAt: number
  createdAt: number
  updatedAt: number
  conflict?: TripMutationConflict
}

type OutboxListener = (tripId: string) => void
const listeners = new Set<OutboxListener>()

function notify(tripId: string) {
  for (const listener of listeners) listener(tripId)
  notifyOutboxChanged(tripId)
}

export function subscribeMutationOutbox(listener: OutboxListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'))
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(OUTBOX_STORE_NAME)
        ? request.transaction!.objectStore(OUTBOX_STORE_NAME)
        : database.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'mutationId' })
      if (!store.indexNames.contains('trip_sequence')) {
        store.createIndex('trip_sequence', ['tripId', 'sequence'], { unique: true })
      }
      if (!store.indexNames.contains('trip_status')) {
        store.createIndex('trip_status', ['tripId', 'status'], { unique: false })
      }
      if (!database.objectStoreNames.contains(META_STORE_NAME)) {
        database.createObjectStore(META_STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error || new Error('Unable to open sync outbox'))
    }
  })
  return databasePromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | T,
): Promise<T> {
  const database = await openDatabase()
  const transaction = database.transaction(OUTBOX_STORE_NAME, mode)
  const store = transaction.objectStore(OUTBOX_STORE_NAME)
  const result = run(store)
  const value = result && typeof result === 'object' && 'onsuccess' in result
    ? await requestResult(result as IDBRequest<T>)
    : result as T
  await transactionDone(transaction)
  return value
}

async function allForTrip(tripId: string): Promise<OutboxMutation[]> {
  const all = await withStore('readonly', (store) => store.getAll()) as OutboxMutation[]
  return all
    .filter((entry) => entry.tripId === tripId)
    .sort((a, b) => a.sequence - b.sequence)
}

export async function nextMutationSequence(tripId: string): Promise<number> {
  const entries = await allForTrip(tripId)
  return (entries[entries.length - 1]?.sequence ?? 0) + 1
}

async function getNumericMeta(key: string): Promise<number> {
  const database = await openDatabase()
  const transaction = database.transaction(META_STORE_NAME, 'readonly')
  const value = await requestResult(
    transaction.objectStore(META_STORE_NAME).get(key),
  ) as SyncMeta | undefined
  await transactionDone(transaction)
  return value?.value ?? 0
}

async function setNumericMeta(key: string, value: number): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(META_STORE_NAME, 'readwrite')
  transaction.objectStore(META_STORE_NAME).put({ key, value })
  await transactionDone(transaction)
}

export function getAppliedTripRevision(tripId: string): Promise<number> {
  return getNumericMeta(`revision:${tripId}`)
}

export function setAppliedTripRevision(tripId: string, revision: number): Promise<void> {
  return setNumericMeta(`revision:${tripId}`, Math.max(0, Math.floor(revision)))
}

export async function enqueueMutation(
  mutation: TripMutation,
  sequence?: number,
): Promise<OutboxMutation> {
  const database = await openDatabase()
  const transaction = database.transaction(
    [OUTBOX_STORE_NAME, META_STORE_NAME],
    'readwrite',
  )
  const outbox = transaction.objectStore(OUTBOX_STORE_NAME)
  const meta = transaction.objectStore(META_STORE_NAME)
  const sequenceKey = `sequence:${mutation.tripId}`
  let result: OutboxMutation | null = null

  await new Promise<void>((resolve, reject) => {
    const existingRequest = outbox.get(mutation.mutationId)
    existingRequest.onerror = () => reject(existingRequest.error)
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as OutboxMutation | undefined
      if (existing) {
        result = existing
        resolve()
        return
      }

      const metaRequest = meta.get(sequenceKey)
      metaRequest.onerror = () => reject(metaRequest.error)
      metaRequest.onsuccess = () => {
        const storedSequence = (metaRequest.result as SyncMeta | undefined)?.value ?? 0
        const nextSequence = sequence ?? storedSequence + 1
        const now = Date.now()
        result = {
          mutationId: mutation.mutationId,
          tripId: mutation.tripId,
          deviceId: mutation.deviceId,
          sequence: nextSequence,
          mutation,
          status: 'pending',
          attemptCount: 0,
          nextRetryAt: 0,
          createdAt: now,
          updatedAt: now,
        }
        meta.put({ key: sequenceKey, value: Math.max(storedSequence, nextSequence) })
        outbox.add(result)
        resolve()
      }
    }
  })
  await transactionDone(transaction)
  if (!result) throw new Error('Unable to enqueue sync mutation')
  notify(mutation.tripId)
  return result
}

export async function getOutboxMutation(
  mutationId: string,
): Promise<OutboxMutation | null> {
  const value = await withStore('readonly', (store) => store.get(mutationId)) as
    | OutboxMutation
    | undefined
  return value || null
}

export async function listPendingMutations(
  tripId: string,
  options?: { limit?: number; now?: number },
): Promise<OutboxMutation[]> {
  const now = options?.now ?? Date.now()
  const limit = Math.max(1, options?.limit ?? 50)
  return selectFlushableMutations(await allForTrip(tripId), now, limit)
}

export async function listOptimisticMutations(tripId: string): Promise<OutboxMutation[]> {
  const entries = await allForTrip(tripId)
  return entries.filter((entry) => entry.status !== 'conflict')
}

export async function markMutationsUploading(mutationIds: string[]): Promise<void> {
  await mutateOutboxEntries(mutationIds, (current) => ({
    ...current,
    status: 'uploading',
    attemptCount: current.attemptCount + 1,
    updatedAt: Date.now(),
  }))
}

export async function scheduleMutationRetry(
  mutationIds: string[],
  delayMs: number,
): Promise<void> {
  const nextRetryAt = Date.now() + Math.max(0, delayMs)
  await mutateOutboxEntries(mutationIds, (current) => ({
    ...current,
    status: 'retry_wait',
    nextRetryAt,
    updatedAt: Date.now(),
  }))
}

export async function markMutationConflict(
  conflict: TripMutationConflict,
): Promise<void> {
  await mutateOutboxEntries([conflict.mutationId], (current) => ({
    ...current,
    status: 'conflict',
    conflict,
    updatedAt: Date.now(),
  }))
}

export async function acknowledgeMutations(mutationIds: string[]): Promise<void> {
  await mutateOutboxEntries(mutationIds, () => null)
}

async function mutateOutboxEntries(
  mutationIds: string[],
  update: (entry: OutboxMutation) => OutboxMutation | null,
): Promise<void> {
  if (!mutationIds.length) return
  const database = await openDatabase()
  const transaction = database.transaction(OUTBOX_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(OUTBOX_STORE_NAME)
  const touchedTrips = new Set<string>()
  await new Promise<void>((resolve, reject) => {
    let remaining = mutationIds.length
    const finishOne = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
    }
    for (const mutationId of mutationIds) {
      const request = store.get(mutationId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const current = request.result as OutboxMutation | undefined
        if (current) {
          const next = update(current)
          if (next) store.put(next)
          else store.delete(mutationId)
          touchedTrips.add(current.tripId)
        }
        finishOne()
      }
    }
  })
  await transactionDone(transaction)
  touchedTrips.forEach(notify)
}

export async function resetUploadingMutations(tripId: string): Promise<void> {
  const uploading = (await allForTrip(tripId)).filter((entry) => entry.status === 'uploading')
  if (!uploading.length) return
  const database = await openDatabase()
  const transaction = database.transaction(OUTBOX_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(OUTBOX_STORE_NAME)
  for (const entry of recoverUploadingMutations(uploading, Date.now())) {
    store.put(entry)
  }
  await transactionDone(transaction)
  notify(tripId)
}

export async function mutationOutboxSummary(tripId: string): Promise<{
  pending: number
  conflicts: number
  oldestPendingAt: number | null
}> {
  const entries = await allForTrip(tripId)
  const pending = entries.filter((entry) => entry.status !== 'conflict')
  return {
    pending: pending.length,
    conflicts: entries.length - pending.length,
    oldestPendingAt: pending[0]?.createdAt ?? null,
  }
}
