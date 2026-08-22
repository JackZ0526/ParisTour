import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedTripShares,
  invalidateCachedTripShares,
  setCachedTripShares,
  sharesAreEqual,
  type TripShareRow,
} from '../features/cloud-sync/services/tripCloud'

describe('trip shares local cache & diffing', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    const storageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    }
    vi.stubGlobal('localStorage', storageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null on empty cache and sets/gets correctly', () => {
    expect(getCachedTripShares('trip-123')).toBeNull()

    const mockShares: TripShareRow[] = [
      {
        id: 'share-1',
        trip_id: 'trip-123',
        invitee_email: 'alice@paris.fr',
        role: 'editor',
        created_at: '2026-08-22T00:00:00Z',
      },
    ]

    setCachedTripShares('trip-123', mockShares)
    expect(getCachedTripShares('trip-123')).toEqual(mockShares)

    invalidateCachedTripShares('trip-123')
    expect(getCachedTripShares('trip-123')).toBeNull()
  })

  it('diffs shares correctly with sharesAreEqual', () => {
    const listA: TripShareRow[] = [
      {
        id: 's-1',
        trip_id: 't-1',
        invitee_email: 'a@paris.fr',
        role: 'viewer',
        created_at: '2026-08-22T00:00:00Z',
      },
      {
        id: 's-2',
        trip_id: 't-1',
        invitee_email: 'b@paris.fr',
        role: 'editor',
        created_at: '2026-08-22T00:00:00Z',
      },
    ]

    const listB: TripShareRow[] = [
      {
        id: 's-2',
        trip_id: 't-1',
        invitee_email: 'b@paris.fr',
        role: 'editor',
        created_at: '2026-08-22T00:00:00Z',
      },
      {
        id: 's-1',
        trip_id: 't-1',
        invitee_email: 'a@paris.fr',
        role: 'viewer',
        created_at: '2026-08-22T00:00:00Z',
      },
    ]

    expect(sharesAreEqual(listA, listB)).toBe(true)

    const modifiedRole: TripShareRow[] = [
      {
        id: 's-1',
        trip_id: 't-1',
        invitee_email: 'a@paris.fr',
        role: 'editor',
        created_at: '2026-08-22T00:00:00Z',
      },
      {
        id: 's-2',
        trip_id: 't-1',
        invitee_email: 'b@paris.fr',
        role: 'editor',
        created_at: '2026-08-22T00:00:00Z',
      },
    ]

    expect(sharesAreEqual(listA, modifiedRole)).toBe(false)
  })
})
