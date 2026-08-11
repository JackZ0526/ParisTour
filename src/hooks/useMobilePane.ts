import { useState } from 'react'

export type MobileItineraryPane = 'timeline' | 'map'

/**
 * useMobilePane — small UI state extracted from App.tsx.
 * Below `lg`, itinerary shows one pane at a time.
 */
export function useMobilePane(initial: MobileItineraryPane = 'timeline') {
  const [mobileItineraryPane, setMobileItineraryPane] = useState<MobileItineraryPane>(initial)
  return { mobileItineraryPane, setMobileItineraryPane }
}

