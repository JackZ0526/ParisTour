const STORAGE_KEY = 'paris-tour-destination-v1'

export function loadDestination(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { destination?: string } | string
    if (typeof parsed === 'string') return parsed.trim()
    if (parsed && typeof parsed.destination === 'string') return parsed.destination.trim()
    return ''
  } catch {
    return ''
  }
}

export function saveDestination(destination: string) {
  try {
    const trimmed = destination.trim()
    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ destination: trimmed }))
  } catch {
    /* ignore */
  }
}
