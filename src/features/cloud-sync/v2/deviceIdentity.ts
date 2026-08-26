import { makeMutationId } from './mutationTypes'

const DEVICE_ID_KEY = 'paris-tour-sync-device-id-v2'
let memoryDeviceId: string | null = null

export function getSyncDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(DEVICE_ID_KEY)
      if (stored) {
        memoryDeviceId = stored
        return stored
      }
    } catch {
      // Fall back to a stable id for the lifetime of this page.
    }
  }

  const created = makeMutationId()
  memoryDeviceId = created
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DEVICE_ID_KEY, created)
    } catch {
      // Private browsing can reject storage writes; the in-memory id still works.
    }
  }
  return created
}
