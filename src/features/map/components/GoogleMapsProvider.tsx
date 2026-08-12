import { createContext, useContext, type ReactNode } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { getGoogleMapsApiKey } from '../services/googleMapsKey'

const libraries: ('places' | 'routes' | 'geometry')[] = []

interface GoogleMapsContextValue {
  isLoaded: boolean
  loadError: Error | undefined
  apiKey: string
}

const GoogleMapsContext = createContext<GoogleMapsContextValue | null>(null)

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const apiKey = getGoogleMapsApiKey()
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'paris-tour-google-maps',
    googleMapsApiKey: apiKey,
    language: 'zh-CN',
    region: 'FR',
    libraries,
  })

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError, apiKey }}>
      {children}
    </GoogleMapsContext.Provider>
  )
}

export function useGoogleMapsReady() {
  const ctx = useContext(GoogleMapsContext)
  if (!ctx) {
    throw new Error('useGoogleMapsReady must be used within GoogleMapsProvider')
  }
  return ctx
}
