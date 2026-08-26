import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DayPlan, Place } from '../../../types'
import { getSupabase, isCloudSyncEnabled } from '../../../shared/lib/supabase'
import { applyItineraryMutations } from './itineraryMutationReducer'
import { getSyncDeviceId } from './deviceIdentity'
import {
  enqueueMutation,
  getAppliedTripRevision,
  listOptimisticMutations,
  mutationOutboxSummary,
  setAppliedTripRevision,
} from './mutationOutbox'
import { applyTripMutationsV2, loadTripSnapshotV2, pullTripChangesV2 } from './mutationTransport'
import { startMutationUploader, type MutationUploader } from './mutationUploader'
import {
  TRIP_SYNC_PROTOCOL_V2,
  makeMutationId,
  type CommittedTripMutation,
  type TripMutation,
  type TripMutationDraft,
} from './mutationTypes'
import {
  planBroadcastCatchUp,
  planCommitCatchUp,
  planPullCatchUp,
} from './revisionCatchUp'
import { recordSyncV2Egress } from './syncEgress'
import { setTripSyncV2UiState, type TripSyncV2UiStatus } from './syncV2Status'
import {
  loadItineraryState,
  saveItineraryState,
} from '../../itinerary/utils/itineraryState'

export type TripSyncV2Status = 'disabled' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'

type Document = { days: DayPlan[]; customPlaces: Record<string, Place> }

const RECENT_ACK_LIMIT = 200
const GAP_PULL_DEBOUNCE_MS = 40

function missingCustomPlaceIds(document: Document): string[] {
  const missing = new Set<string>()
  for (const day of document.days) {
    for (const stop of day.stops) {
      if (stop.placeId.startsWith('custom-') && !document.customPlaces[stop.placeId]) {
        missing.add(stop.placeId)
      }
    }
  }
  return [...missing]
}

async function hydrateMissingCustomPlaces(
  activeTripId: string,
  document: Document,
): Promise<Document> {
  const missing = missingCustomPlaceIds(document)
  if (!missing.length) return document
  try {
    const snapshot = await loadTripSnapshotV2(activeTripId)
    let customPlaces = document.customPlaces
    let changed = false
    for (const id of missing) {
      const place = snapshot.customPlaces[id]
      if (place) {
        customPlaces = { ...customPlaces, [id]: place }
        changed = true
      }
    }
    return changed ? { ...document, customPlaces } : document
  } catch (err) {
    console.warn('[trip-sync-v2] unable to hydrate missing custom places', err)
    return document
  }
}

function normalizeCommittedMutation(value: unknown): CommittedTripMutation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const nested =
    candidate.payload &&
    typeof candidate.payload === 'object' &&
    !Array.isArray(candidate.payload) &&
    'mutationId' in (candidate.payload as object) &&
    'type' in (candidate.payload as object)
      ? (candidate.payload as Record<string, unknown>)
      : candidate

  const protocol = Number(nested.protocol)
  const revision = Number(nested.revision)
  const baseRevision = Number(nested.baseRevision)
  const tripId = nested.tripId == null ? '' : String(nested.tripId)
  const mutationId = nested.mutationId == null ? '' : String(nested.mutationId)
  const deviceId = nested.deviceId == null ? '' : String(nested.deviceId)
  const type = nested.type == null ? '' : String(nested.type)
  const payload = nested.payload
  if (
    protocol !== TRIP_SYNC_PROTOCOL_V2 ||
    !tripId ||
    !mutationId ||
    !deviceId ||
    !type ||
    !Number.isFinite(revision) ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return null
  }

  return {
    protocol: TRIP_SYNC_PROTOCOL_V2,
    tripId,
    mutationId,
    deviceId,
    type,
    revision,
    baseRevision: Number.isFinite(baseRevision) ? baseRevision : 0,
    payload,
    createdAt:
      nested.createdAt == null ? new Date().toISOString() : String(nested.createdAt),
    committedAt:
      nested.committedAt == null ? new Date().toISOString() : String(nested.committedAt),
  } as CommittedTripMutation
}

function toUiStatus(status: TripSyncV2Status): TripSyncV2UiStatus {
  if (status === 'disabled') return 'idle'
  return status
}

export function useTripSyncV2(options: {
  enabled: boolean
  tripId: string | null
  canEdit: boolean
  days: DayPlan[]
  customPlaces: Record<string, Place>
  setDays: Dispatch<SetStateAction<DayPlan[]>>
  setCustomPlaces: Dispatch<SetStateAction<Record<string, Place>>>
  setSyncRenderKey: Dispatch<SetStateAction<number>>
  remoteHydrationRenderKeyRef: MutableRefObject<number | null>
  suppressCopyRef: MutableRefObject<boolean>
}): {
  recordMutation: (draft: TripMutationDraft) => void
  status: TripSyncV2Status
} {
  const {
    enabled,
    tripId,
    canEdit,
    days,
    customPlaces,
    setDays,
    setCustomPlaces,
    setSyncRenderKey,
    remoteHydrationRenderKeyRef,
    suppressCopyRef,
  } = options
  const active = enabled && isCloudSyncEnabled() && Boolean(tripId)
  const [status, setStatus] = useState<TripSyncV2Status>(active ? 'connecting' : 'disabled')
  const documentRef = useRef<Document>({ days, customPlaces })
  const revisionRef = useRef(0)
  const localMutationIdsRef = useRef(new Set<string>())
  const recentAckIdsRef = useRef<string[]>([])
  const uploaderRef = useRef<MutationUploader | null>(null)
  const tripIdRef = useRef(tripId)

  tripIdRef.current = tripId

  // Keep documentRef aligned with React state after paint. Avoid assigning during
  // render — that can clobber a remote apply that already wrote a newer document.
  useEffect(() => {
    documentRef.current = { days, customPlaces }
  }, [customPlaces, days])

  const rememberAck = useCallback((mutationId: string) => {
    localMutationIdsRef.current.delete(mutationId)
    const recent = recentAckIdsRef.current
    if (recent.includes(mutationId)) return
    recent.push(mutationId)
    if (recent.length > RECENT_ACK_LIMIT) recent.splice(0, recent.length - RECENT_ACK_LIMIT)
  }, [])

  const shouldSkipReplay = useCallback((mutationId: string) => {
    return (
      localMutationIdsRef.current.has(mutationId) ||
      recentAckIdsRef.current.includes(mutationId)
    )
  }, [])

  const publishUiState = useCallback(async (
    nextStatus: TripSyncV2Status,
    activeTripId: string | null = tripId,
  ) => {
    setStatus(nextStatus)
    if (!activeTripId || nextStatus === 'disabled') {
      setTripSyncV2UiState({ enabled: false, status: 'idle', pending: 0, conflicts: 0 })
      return
    }
    const summary = await mutationOutboxSummary(activeTripId)
    setTripSyncV2UiState({
      enabled: true,
      status: toUiStatus(nextStatus),
      pending: summary.pending,
      conflicts: summary.conflicts,
    })
  }, [tripId])

  const markRemoteRender = useCallback(() => {
    suppressCopyRef.current = true
    setSyncRenderKey((current) => {
      const next = current + 1
      remoteHydrationRenderKeyRef.current = next
      return next
    })
  }, [
    remoteHydrationRenderKeyRef,
    setSyncRenderKey,
    suppressCopyRef,
  ])

  const applyCommitted = useCallback(async (
    mutations: CommittedTripMutation[],
    mode: 'remote' | 'local-ack' = 'remote',
  ): Promise<boolean> => {
    if (!tripId || !mutations.length) return false
    const ordered = [...mutations].sort((a, b) => a.revision - b.revision)
    let document = documentRef.current
    let changed = false
    let nextRevision = revisionRef.current

    for (const mutation of ordered) {
      if (mutation.tripId !== tripId || mutation.revision <= nextRevision) continue
      if (mutation.revision !== nextRevision + 1) return false
      if (mode === 'local-ack' || shouldSkipReplay(mutation.mutationId)) {
        rememberAck(mutation.mutationId)
      } else {
        const result = applyItineraryMutations(document, [mutation], 'remote')
        document = result.document
        changed ||= result.changed
        // Identity drift (explicit id vs ensureStopId / stale local copy):
        // fall back to durable snapshot instead of advancing past a no-op.
        if (
          result.ignoredReason === 'entity_missing' ||
          result.ignoredReason === 'invalid_anchor'
        ) {
          return false
        }
      }
      nextRevision = mutation.revision
    }

    if (nextRevision === revisionRef.current) return true
    revisionRef.current = nextRevision
    await setAppliedTripRevision(tripId, nextRevision)
    // Always push remote documents into React. A false `changed` with an
    // advanced revision leaves the other browser showing "synced" on stale UI.
    if (changed || mode === 'remote') {
      if (mode === 'remote') {
        document = await hydrateMissingCustomPlaces(tripId, document)
      }
      documentRef.current = document
      markRemoteRender()
      setDays(document.days)
      setCustomPlaces(document.customPlaces)
      try {
        const previous = loadItineraryState()
        saveItineraryState(document.days, document.customPlaces, {
          generated: previous.generated || document.days.length > 0,
          fingerprint: previous.fingerprint ?? null,
        })
      } catch (err) {
        console.warn('[trip-sync-v2] unable to persist applied itinerary', err)
      }
    }
    void publishUiState('synced', tripId)
    return true
  }, [
    markRemoteRender,
    publishUiState,
    rememberAck,
    setCustomPlaces,
    setDays,
    shouldSkipReplay,
    tripId,
  ])

  useEffect(() => {
    if (!active || !tripId) {
      void publishUiState('disabled')
      return
    }

    const deviceId = getSyncDeviceId()
    let disposed = false
    let channel: RealtimeChannel | null = null
    let catchingUp = false
    let catchUpRequested = false
    let gapTimer: ReturnType<typeof setTimeout> | null = null
    const supabase = getSupabase()

    const applySnapshot = async () => {
      let snapshot = await loadTripSnapshotV2(tripId)
      if (disposed) return
      if (!snapshot.initialized && canEdit) {
        await applyTripMutationsV2({
          tripId,
          deviceId,
          baseRevision: 0,
          mutations: [],
        })
        if (disposed) return
        snapshot = await loadTripSnapshotV2(tripId)
      }
      if (disposed) return
      if (!snapshot.initialized) {
        revisionRef.current = 0
        await setAppliedTripRevision(tripId, 0)
        return
      }
      const optimisticEntries = await listOptimisticMutations(tripId)
      localMutationIdsRef.current = new Set(
        optimisticEntries.map((entry) => entry.mutationId),
      )
      const overlaid = applyItineraryMutations(
        { days: snapshot.days, customPlaces: snapshot.customPlaces },
        optimisticEntries.map((entry) => entry.mutation),
        'replay',
      ).document
      revisionRef.current = snapshot.revision
      await setAppliedTripRevision(tripId, snapshot.revision)
      documentRef.current = overlaid
      markRemoteRender()
      setDays(overlaid.days)
      setCustomPlaces(overlaid.customPlaces)
      try {
        const previous = loadItineraryState()
        saveItineraryState(overlaid.days, overlaid.customPlaces, {
          generated: previous.generated || overlaid.days.length > 0,
          fingerprint: previous.fingerprint ?? null,
        })
      } catch (err) {
        console.warn('[trip-sync-v2] unable to persist snapshot itinerary', err)
      }
    }

    const catchUp = async () => {
      catchUpRequested = true
      if (catchingUp || disposed) return
      catchingUp = true
      try {
        while (catchUpRequested && !disposed) {
          catchUpRequested = false
          let hasMore = true
          while (hasMore && !disposed) {
            const page = await pullTripChangesV2(tripId, revisionRef.current)
            const plan = planPullCatchUp(revisionRef.current, page)
            if (plan.action === 'snapshot') {
              await applySnapshot()
              hasMore = false
              continue
            }
            if (plan.action === 'apply') {
              const applied = await applyCommitted(plan.mutations)
              if (!applied) {
                await applySnapshot()
                hasMore = false
                continue
              }
              hasMore = page.hasMore
              continue
            }
            hasMore = false
          }
        }
        if (!disposed) void publishUiState('synced', tripId)
      } catch (error) {
        if (!disposed) {
          const next = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'
          void publishUiState(next, tripId)
          console.warn('[trip-sync-v2] catch-up failed:', error)
        }
      } finally {
        catchingUp = false
      }
    }

    const requestGapCatchUp = () => {
      if (gapTimer) return
      gapTimer = setTimeout(() => {
        gapTimer = null
        void catchUp()
      }, GAP_PULL_DEBOUNCE_MS)
    }

    const start = async () => {
      void publishUiState('connecting', tripId)
      localMutationIdsRef.current = new Set()
      recentAckIdsRef.current = []
      revisionRef.current = await getAppliedTripRevision(tripId)
      await applySnapshot()
      if (disposed) return

      const syncRealtimeAuth = async () => {
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) {
          supabase.realtime.setAuth(data.session.access_token)
        }
      }
      await syncRealtimeAuth()
      if (disposed) return
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          session?.access_token &&
          (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED')
        ) {
          supabase.realtime.setAuth(session.access_token)
        }
      })

      const handleIncomingMutation = (raw: unknown) => {
        const payload = normalizeCommittedMutation(raw)
        if (!payload || payload.tripId !== tripId) return
        if (disposed || tripIdRef.current !== tripId) return
        recordSyncV2Egress('broadcast', payload)
        const plan = planBroadcastCatchUp(revisionRef.current, payload)
        if (plan.action === 'apply') {
          void applyCommitted(plan.mutations).then((applied) => {
            if (!applied) requestGapCatchUp()
          })
        } else if (plan.action === 'pull') {
          requestGapCatchUp()
        }
      }

      channel = supabase
        .channel(`trip:${tripId}:mutations`, {
          config: { private: true, broadcast: { self: false } },
        })
        .on('broadcast', { event: 'mutation' }, (message) => {
          handleIncomingMutation(message?.payload ?? message)
        })
        .subscribe((subscriptionStatus) => {
          if (subscriptionStatus === 'SUBSCRIBED') {
            void publishUiState('syncing', tripId)
            void catchUp()
          }
          if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
            void publishUiState('error', tripId)
          }
        })

      // Separate channel: private broadcast + postgres_changes on one channel
      // is unreliable. Revision bumps pull the durable log when broadcast drops.
      const revisionChannel = supabase
        .channel(`trip:${tripId}:sync-state`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'trip_sync_state_v2',
            filter: `trip_id=eq.${tripId}`,
          },
          () => {
            if (disposed || tripIdRef.current !== tripId) return
            requestGapCatchUp()
          },
        )
        .subscribe()

      const fanOutCommitted = (committed: CommittedTripMutation[]) => {
        if (!channel || !committed.length) return
        for (const mutation of committed) {
          void channel.send({
            type: 'broadcast',
            event: 'mutation',
            payload: mutation,
          })
        }
      }

      uploaderRef.current = startMutationUploader({
        tripId,
        deviceId,
        getRevision: () => revisionRef.current,
        onCommitted: async (result) => {
          if (disposed || tripIdRef.current !== tripId) return
          const plan = planCommitCatchUp(revisionRef.current, result)
          if (plan.action === 'snapshot' || result.conflicts.length) {
            await applySnapshot()
            void publishUiState(result.conflicts.length ? 'conflict' : 'synced', tripId)
            fanOutCommitted(result.committed)
            return
          }
          if (plan.action === 'ack-local') {
            await applyCommitted(result.committed, 'local-ack')
            fanOutCommitted(result.committed)
            return
          }
          if (plan.action === 'pull') {
            requestGapCatchUp()
            fanOutCommitted(result.committed)
            return
          }
          fanOutCommitted(result.committed)
          void publishUiState('synced', tripId)
        },
        onError: (error) => {
          if (disposed) return
          const next = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'
          void publishUiState(next, tripId)
          console.warn('[trip-sync-v2] upload failed:', error)
        },
      })

      const onVisible = () => {
        if (document.visibilityState === 'visible') requestGapCatchUp()
      }
      document.addEventListener('visibilitychange', onVisible)

      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        authListener.subscription.unsubscribe()
        void supabase.removeChannel(revisionChannel)
      }
    }

    let unsubscribeAuth: (() => void) | undefined
    void start()
      .then((cleanupAuth) => {
        unsubscribeAuth = cleanupAuth
      })
      .catch((error) => {
        if (!disposed) {
          void publishUiState('error', tripId)
          console.warn('[trip-sync-v2] startup failed:', error)
        }
      })

    return () => {
      disposed = true
      if (gapTimer) clearTimeout(gapTimer)
      uploaderRef.current?.stop()
      uploaderRef.current = null
      unsubscribeAuth?.()
      if (channel) void supabase.removeChannel(channel)
      localMutationIdsRef.current = new Set()
      recentAckIdsRef.current = []
    }
  }, [
    active,
    applyCommitted,
    canEdit,
    markRemoteRender,
    publishUiState,
    setCustomPlaces,
    setDays,
    tripId,
  ])

  const recordMutation = useCallback((draft: TripMutationDraft) => {
    if (!active || !canEdit || !tripId) return
    const mutation: TripMutation = {
      ...draft,
      protocol: TRIP_SYNC_PROTOCOL_V2,
      mutationId: makeMutationId(),
      tripId,
      deviceId: getSyncDeviceId(),
      baseRevision: revisionRef.current,
      createdAt: new Date().toISOString(),
    } as TripMutation

    const optimistic = applyItineraryMutations(documentRef.current, [mutation], 'local')
    documentRef.current = optimistic.document
    localMutationIdsRef.current.add(mutation.mutationId)
    void publishUiState('syncing', tripId)
    void enqueueMutation(mutation)
      .then(() => uploaderRef.current?.requestFlush())
      .catch((error) => {
        void publishUiState('error', tripId)
        console.error('[trip-sync-v2] unable to persist mutation:', error)
      })
  }, [active, canEdit, publishUiState, tripId])

  return { recordMutation, status }
}
