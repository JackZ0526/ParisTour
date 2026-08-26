const STORAGE_FLAG = 'paris-tour-sync-protocol-v2'

export function isTripSyncV2Enabled(): boolean {
  const envEnabled = import.meta.env.VITE_TRIP_SYNC_V2 === 'true'
  if (typeof window === 'undefined') return envEnabled
  try {
    const override = window.localStorage.getItem(STORAGE_FLAG)
    if (override === 'true') return true
    if (override === 'false') return false
  } catch {
    /* use build-time flag */
  }
  return envEnabled
}

export function setTripSyncV2Override(enabled: boolean | null): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled == null) window.localStorage.removeItem(STORAGE_FLAG)
    else window.localStorage.setItem(STORAGE_FLAG, String(enabled))
  } catch {
    /* storage may be unavailable */
  }
}

