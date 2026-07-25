import { useCallback, useEffect, useMemo, useState } from 'react'
import { DirectionsRenderer, GoogleMap, Marker } from '@react-google-maps/api'
import { getPlace } from '../data/places'
import type { DayNavPlan, ResolvedDayLeg } from '../services/googleNav'
import type { DayPlan, Place, SelectedHotel } from '../types'
import { getDayOrigin } from '../utils/dayOrigin'
import { useGoogleMapsReady } from './GoogleMapsProvider'

const mapContainerStyle = { width: '100%', height: '100%' }

/** Google Maps blue — native look, not black */
const GOOGLE_ROUTE_BLUE = '#1a73e8'

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  clickableIcons: true,
  gestureHandling: 'cooperative',
}

function homeIconUrl() {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="#b56a3c" stroke="#fff" stroke-width="3"/>
      <path fill="#fff" d="M20 10.5 29.5 19h-2.2v8.8h-4.6v-5H17.3v5h-4.6V19H10.5L20 10.5z"/>
    </svg>`,
  )
  return `data:image/svg+xml;charset=UTF-8,${svg}`
}

function airportIconUrl() {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="#5f7a78" stroke="#fff" stroke-width="3"/>
      <path fill="#fff" d="M11 22.5 28 14.5l1.2 2.2-10.2 5.5 3.1 5.4-2.1 1.1-3.4-5.1-4.6 2.5V22.5z"/>
    </svg>`,
  )
  return `data:image/svg+xml;charset=UTF-8,${svg}`
}

function numberIconUrl(n: number, active: boolean) {
  const bg = active ? '#b56a3c' : '#4a6356'
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r="13" fill="${bg}" stroke="#fff" stroke-width="2"/>
      <text x="15" y="20" text-anchor="middle" fill="#fff" font-size="13" font-family="Arial,sans-serif" font-weight="700">${n}</text>
    </svg>`,
  )
  return `data:image/svg+xml;charset=UTF-8,${svg}`
}

function collectNavLegs(navPlan: DayNavPlan): ResolvedDayLeg[] {
  const legs: ResolvedDayLeg[] = []
  if (navPlan.hotelToFirst) legs.push(navPlan.hotelToFirst)
  for (const leg of navPlan.betweenStops) {
    if (leg) legs.push(leg)
  }
  return legs
}

interface Props {
  hotel: SelectedHotel
  day: DayPlan
  customPlaces?: Record<string, Place>
  navPlan: DayNavPlan
  navLoading: boolean
  selectedPlaceId: string | null
  onSelectPlace: (id: string) => void
}

export function TripMap({
  hotel,
  day,
  customPlaces = {},
  navPlan,
  navLoading,
  selectedPlaceId,
  onSelectPlace,
}: Props) {
  const { isLoaded, loadError } = useGoogleMapsReady()
  const dayOrigin = useMemo(() => getDayOrigin(day.day, hotel), [day.day, hotel])

  const stops = useMemo(() => {
    const list: Place[] = []
    for (const s of day.stops) {
      try {
        const place = getPlace(s.placeId, customPlaces)
        if (Number.isFinite(place.location.lat) && Number.isFinite(place.location.lng)) {
          list.push(place)
        }
      } catch {
        /* skip */
      }
    }
    return list
  }, [day, customPlaces])

  const directionsLegs = useMemo(
    () => collectNavLegs(navPlan).filter((leg) => Boolean(leg.directionsResult)),
    [navPlan],
  )

  const [map, setMap] = useState<google.maps.Map | null>(null)
  const onLoad = useCallback((m: google.maps.Map) => setMap(m), [])
  const onUnmount = useCallback(() => setMap(null), [])

  useEffect(() => {
    if (!map || !isLoaded) return

    const points: google.maps.LatLngLiteral[] = [
      { lat: dayOrigin.lat, lng: dayOrigin.lng },
      ...stops.map((s) => s.location),
    ]
    const padding = { top: 80, right: 80, bottom: 80, left: 80 }

    if (points.length === 1) {
      map.setCenter(points[0])
      map.setZoom(14)
      return
    }

    const bounds = new google.maps.LatLngBounds()
    for (const p of points) bounds.extend(p)

    let cancelled = false
    const applyFit = () => {
      if (cancelled) return
      map.fitBounds(bounds, padding)
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if (cancelled) return
        const zoom = map.getZoom()
        if (zoom != null && zoom > 15) map.setZoom(15)
      })
    }

    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(applyFit)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [map, isLoaded, dayOrigin.lat, dayOrigin.lng, dayOrigin.id, stops, day.day, navPlan.stopsKey])

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">Google Maps 主图加载失败：当前 API Key 的项目未启用所需接口。</p>
        <p className="mt-2">
          请启用{' '}
          <a
            className="underline"
            href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Maps JavaScript API
          </a>
          。
        </p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-white/70 bg-[var(--card)] md:h-[560px]">
        <p className="text-sm text-[var(--stone)]">正在加载 Google Maps…</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/50 bg-[var(--card)] px-3 py-2 text-xs text-[var(--stone)]">
        <span>Google Maps · 原生导航路线</span>
        <span>
          {navLoading
            ? '正在获取实时导航…'
            : directionsLegs.length
              ? `实时 Directions · ${directionsLegs.length} 段`
              : '等待导航数据'}
        </span>
      </div>

      {navPlan.error && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {navPlan.error} 请启用{' '}
          <a
            className="underline"
            href="https://console.cloud.google.com/apis/library/directions-backend.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Directions API
          </a>
          ，然后刷新页面。
        </div>
      )}

      <div className="h-[420px] w-full md:h-[560px]">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={{ lat: dayOrigin.lat, lng: dayOrigin.lng }}
          zoom={13}
          options={mapOptions}
          onLoad={onLoad}
          onUnmount={onUnmount}
        >
          {directionsLegs.map((leg, i) => (
            <DirectionsRenderer
              key={`${navPlan.stopsKey || 'nav'}-gdir-${i}-${leg.displayMode}-${leg.durationSeconds}-${leg.distanceMeters}`}
              directions={leg.directionsResult}
              options={{
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: {
                  strokeColor: GOOGLE_ROUTE_BLUE,
                  strokeOpacity: 0.9,
                  strokeWeight: 6,
                },
              }}
            />
          ))}

          <Marker
            position={{ lat: dayOrigin.lat, lng: dayOrigin.lng }}
            title={dayOrigin.label}
            icon={{
              url: dayOrigin.kind === 'airport' ? airportIconUrl() : homeIconUrl(),
              scaledSize: new google.maps.Size(40, 40),
              anchor: new google.maps.Point(20, 20),
            }}
            zIndex={1000}
          />
          {stops.map((place, index) => {
            const n = index + 1
            const active = selectedPlaceId === place.id
            return (
              <Marker
                key={`${day.day}-${place.id}-${n}`}
                position={place.location}
                title={`${n}. ${place.name}`}
                onClick={() => onSelectPlace(place.id)}
                icon={{
                  url: numberIconUrl(n, active),
                  scaledSize: new google.maps.Size(30, 30),
                  anchor: new google.maps.Point(15, 15),
                }}
                zIndex={active ? 900 : n * 10}
                opacity={!selectedPlaceId || active ? 1 : 0.55}
              />
            )
          })}
        </GoogleMap>
      </div>
    </div>
  )
}
