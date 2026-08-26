export type TripSyncV2UiStatus =
  | 'idle'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'conflict'
  | 'error'

export type TripSyncV2UiState = {
  enabled: boolean
  status: TripSyncV2UiStatus
  pending: number
  conflicts: number
}

type Listener = () => void

const listeners = new Set<Listener>()

let state: TripSyncV2UiState = {
  enabled: false,
  status: 'idle',
  pending: 0,
  conflicts: 0,
}

export function getTripSyncV2UiState(): TripSyncV2UiState {
  return state
}

export function setTripSyncV2UiState(next: Partial<TripSyncV2UiState>): void {
  const merged: TripSyncV2UiState = { ...state, ...next }
  if (
    merged.enabled === state.enabled &&
    merged.status === state.status &&
    merged.pending === state.pending &&
    merged.conflicts === state.conflicts
  ) {
    return
  }
  state = merged
  for (const listener of listeners) listener()
}

export function subscribeTripSyncV2UiState(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetTripSyncV2UiState(): void {
  state = {
    enabled: false,
    status: 'idle',
    pending: 0,
    conflicts: 0,
  }
  for (const listener of listeners) listener()
}
