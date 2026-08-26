import type { DayPlan, ItineraryStop, Place } from '../../../types'

export const TRIP_SYNC_PROTOCOL_V2 = 2 as const

export type TripMutationSource = 'local' | 'remote' | 'replay'

export type StopPatch = Partial<
  Pick<
    ItineraryStop,
    'time' | 'note' | 'transport' | 'walkLevel' | 'duration'
  >
>

export type DayPatch = Partial<
  Pick<DayPlan, 'title' | 'theme' | 'pace' | 'summary' | 'metroHintFromArea'>
>

type MutationBase<TType extends string, TPayload> = {
  protocol: typeof TRIP_SYNC_PROTOCOL_V2
  mutationId: string
  tripId: string
  deviceId: string
  baseRevision: number
  createdAt: string
  type: TType
  payload: TPayload
}

export type AddStopMutation = MutationBase<
  'stop.add',
  {
    dayNumber: number
    stop: ItineraryStop & { id: string }
    place?: Place
    afterStopId?: string | null
    beforeStopId?: string | null
  }
>

export type DeleteStopMutation = MutationBase<
  'stop.delete',
  {
    stopId: string
    /** Helps peers/servers resolve when index-suffixed ids drifted. */
    dayNumber?: number
    placeId?: string
  }
>

export type MoveStopMutation = MutationBase<
  'stop.move',
  {
    stopId: string
    targetDayNumber: number
    afterStopId?: string | null
    beforeStopId?: string | null
  }
>

export type ReplaceStopMutation = MutationBase<
  'stop.replace',
  {
    stopId: string
    place: Place
    patch?: StopPatch
  }
>

export type PatchStopMutation = MutationBase<
  'stop.patch',
  {
    stopId: string
    expectedVersion?: number
    fields: StopPatch
  }
>

export type PatchDayMutation = MutationBase<
  'day.patch',
  {
    dayNumber: number
    expectedVersion?: number
    fields: DayPatch
  }
>

export type UpsertCustomPlaceMutation = MutationBase<
  'custom_place.upsert',
  { place: Place }
>

export type DeleteCustomPlaceMutation = MutationBase<
  'custom_place.delete',
  { placeId: string }
>

export type ReplaceDayMutation = MutationBase<
  'day.replace',
  {
    dayNumber: number
    day: DayPlan
    places?: Record<string, Place>
  }
>

export type ReplaceItineraryMutation = MutationBase<
  'itinerary.replace',
  {
    days: DayPlan[]
    customPlaces: Record<string, Place>
  }
>

export type TripMutation =
  | AddStopMutation
  | DeleteStopMutation
  | MoveStopMutation
  | ReplaceStopMutation
  | PatchStopMutation
  | PatchDayMutation
  | UpsertCustomPlaceMutation
  | DeleteCustomPlaceMutation
  | ReplaceDayMutation
  | ReplaceItineraryMutation

type WithoutMutationMetadata<T extends TripMutation> = T extends TripMutation
  ? Omit<
      T,
      'protocol' | 'mutationId' | 'tripId' | 'deviceId' | 'baseRevision' | 'createdAt'
    >
  : never

export type TripMutationDraft = WithoutMutationMetadata<TripMutation>

export type CommittedTripMutation = TripMutation & {
  revision: number
  committedAt: string
  actorId?: string
}

export type TripMutationBatchRequest = {
  protocol: typeof TRIP_SYNC_PROTOCOL_V2
  tripId: string
  deviceId: string
  baseRevision: number
  mutations: TripMutation[]
}

export type TripMutationConflict = {
  mutationId: string
  code:
    | 'entity_deleted'
    | 'entity_missing'
    | 'version_conflict'
    | 'invalid_anchor'
    | 'invalid_payload'
  entityId?: string
  serverVersion?: number
}

export type TripMutationBatchResult = {
  revision: number
  acknowledged: string[]
  committed: CommittedTripMutation[]
  conflicts: TripMutationConflict[]
}

export type PullTripChangesResult = {
  fromRevision: number
  toRevision: number
  mutations: CommittedTripMutation[]
  hasMore: boolean
  snapshotRequired: boolean
}

export type TripSnapshotV2 = {
  revision: number
  days: DayPlan[]
  customPlaces: Record<string, Place>
  initialized: boolean
}

export type RemoteItineraryAnimation = {
  mutationId: string
  revision?: number
  type: 'add' | 'delete' | 'move' | 'replace' | 'patch'
  stopId?: string
  fromDayNumber?: number
  toDayNumber?: number
}

export function makeMutationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
