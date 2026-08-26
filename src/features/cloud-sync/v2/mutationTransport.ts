import { getSupabase } from '../../../shared/lib/supabase'
import type {
  PullTripChangesResult,
  TripMutation,
  TripMutationBatchResult,
  TripSnapshotV2,
} from './mutationTypes'
import { recordSyncV2Egress } from './syncEgress'

function requireObject<T>(value: unknown, operation: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${operation} returned an invalid response`)
  }
  return value as T
}

export async function applyTripMutationsV2(input: {
  tripId: string
  deviceId: string
  baseRevision: number
  mutations: TripMutation[]
}): Promise<TripMutationBatchResult> {
  const payload = {
    p_trip_id: input.tripId,
    p_device_id: input.deviceId,
    p_base_revision: input.baseRevision,
    p_mutations: input.mutations,
  }
  recordSyncV2Egress('apply', payload)
  const { data, error } = await getSupabase().rpc('apply_trip_mutations_v2', payload)
  if (error) throw error
  const result = requireObject<TripMutationBatchResult>(data, 'apply_trip_mutations_v2')
  recordSyncV2Egress('apply', result)
  return result
}

export async function pullTripChangesV2(
  tripId: string,
  afterRevision: number,
  limit = 100,
): Promise<PullTripChangesResult> {
  const payload = {
    p_trip_id: tripId,
    p_after_revision: afterRevision,
    p_limit: limit,
  }
  recordSyncV2Egress('pull', payload)
  const { data, error } = await getSupabase().rpc('pull_trip_changes_v2', payload)
  if (error) throw error
  const result = requireObject<PullTripChangesResult>(data, 'pull_trip_changes_v2')
  recordSyncV2Egress('pull', result)
  return result
}

export async function loadTripSnapshotV2(tripId: string): Promise<TripSnapshotV2> {
  recordSyncV2Egress('snapshot', { p_trip_id: tripId })
  const { data, error } = await getSupabase().rpc('load_trip_snapshot_v2', {
    p_trip_id: tripId,
  })
  if (error) throw error
  const result = requireObject<TripSnapshotV2>(data, 'load_trip_snapshot_v2')
  recordSyncV2Egress('snapshot', result)
  return result
}
