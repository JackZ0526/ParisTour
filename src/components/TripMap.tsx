import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DirectionsRenderer, GoogleMap, Marker } from '@react-google-maps/api'
import { getPlace } from '../data/places'
import type { DayNavPlan, ResolvedDayLeg } from '../services/googleNav'
import type { DayPlan, Place, SelectedHotel } from '../types'
import {
  getDayOrigin,
  isAirportPlace,
  isHotelPlace,
  numberedStopIndexes,
} from '../utils/dayOrigin'
import { useGoogleMapsReady } from './GoogleMapsProvider'
import { googleMapsLoadErrorHelp } from '../services/googleMapsErrors'
import { LoadingIndicator } from './LoadingIndicator'
import {
  airportIconUrl,
  homeIconUrl,
  numberIconUrl,
} from './markerIcons'

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

function collectNavLegs(navPlan: DayNavPlan): ResolvedDayLeg[] {
  const legs: ResolvedDayLeg[] = []
  if (navPlan.hotelToFirst) legs.push(navPlan.hotelToFirst)
  for (const leg of navPlan.betweenStops) {
    if (leg) legs.push(leg)
  }
  if (navPlan.lastToDestination) legs.push(navPlan.lastToDestination)
  return legs
}

/** All coordinates that should stay inside the map viewport (markers + route geometry). */
function collectViewportPoints(
  origin: { lat: number; lng: number },
  stops: Place[],
  navPlan: DayNavPlan,
): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = [
    { lat: origin.lat, lng: origin.lng },
    ...stops.map((s) => s.location),
  ]

  const pushPath = (path: google.maps.LatLngLiteral[] | undefined | null) => {
    if (!path?.length) return
    for (const p of path) {
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) points.push(p)
    }
  }

  pushPath(navPlan.hotelLinkPath)
  pushPath(navPlan.routePath)
  for (const leg of collectNavLegs(navPlan)) {
    pushPath(leg.path)
    const overview = leg.directionsResult?.routes?.[0]?.overview_path
    if (overview?.length) {
      for (const ll of overview) {
        const lat = typeof ll.lat === 'function' ? ll.lat() : Number(ll.lat)
        const lng = typeof ll.lng === 'function' ? ll.lng() : Number(ll.lng)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          points.push({ lat, lng })
        }
      }
    }
  }

  return points
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
  // Depend on hotel primitives so other-day edits (new hotel object, same coords) do not churn.
  const dayOrigin = useMemo(
    () => getDayOrigin(day.day, hotel),
    [day.day, hotel.id, hotel.lat, hotel.lng, hotel.name],
  )

  /** Stable center for GoogleMap — new object identity would pan the map on every parent render. */
  const mapCenter = useMemo(
    () => ({ lat: dayOrigin.lat, lng: dayOrigin.lng }),
    [dayOrigin.lat, dayOrigin.lng],
  )

  /** Place id + coords for this day only — ignores unrelated customPlaces churn (e.g. Day 1 edits). */
  const stopsFingerprint = useMemo(
    () =>
      day.stops
        .map((s) => {
          try {
            const place = getPlace(s.placeId, customPlaces)
            const { lat, lng } = place.location
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return s.placeId
            return `${s.placeId}@${lat.toFixed(5)},${lng.toFixed(5)}`
          } catch {
            return s.placeId
          }
        })
        .join('|'),
    [day.stops, customPlaces],
  )

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
    // Fingerprint captures id/order/coords; omit day/customPlaces identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsFingerprint])

  const stopNumbers = useMemo(() => numberedStopIndexes(stops), [stops])

  const directionsLegs = useMemo(
    () => collectNavLegs(navPlan).filter((leg) => Boolean(leg.directionsResult)),
    [navPlan],
  )

  const [map, setMap] = useState<google.maps.Map | null>(null)
  const onLoad = useCallback((m: google.maps.Map) => setMap(m), [])
  const onUnmount = useCallback(() => setMap(null), [])

  /** Only refit when this day's route/places change — not when other days' data updates. */
  const viewportKey = useMemo(
    () => `${day.day}|${dayOrigin.id}|${stopsFingerprint}|${navPlan.stopsKey || ''}`,
    [day.day, dayOrigin.id, stopsFingerprint, navPlan.stopsKey],
  )
  const lastFittedKeyRef = useRef('')

  useEffect(() => {
    if (!map || !isLoaded) return
    // Wait until nav settles so route geometry is included (cached days are instant).
    if (navLoading) return
    // Same day viewport — skip. Avoids one-shot pan when parent re-renders after other-day edits.
    if (lastFittedKeyRef.current === viewportKey) return

    const points = collectViewportPoints(dayOrigin, stops, navPlan)
    if (!points.length) return

    const padding = { top: 72, right: 72, bottom: 72, left: 72 }

    if (points.length === 1) {
      map.setCenter(points[0])
      map.setZoom(14)
      lastFittedKeyRef.current = viewportKey
      return
    }

    const bounds = new google.maps.LatLngBounds()
    for (const p of points) bounds.extend(p)
    if (bounds.isEmpty()) return

    let cancelled = false
    const applyFit = () => {
      if (cancelled) return
      map.fitBounds(bounds, padding)
      lastFittedKeyRef.current = viewportKey
      // Avoid over-zooming on short hops; never zoom in past this (keeps path padding).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, navLoading, viewportKey])

  // Switching days must allow a fresh fit even if a previous day shared a key shape.
  useEffect(() => {
    lastFittedKeyRef.current = ''
  }, [day.day])

  if (loadError) {
    const help = googleMapsLoadErrorHelp(loadError)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">{help.title}</p>
        <p className="mt-2">{help.detail}</p>
        {help.refererHint && (
          <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-[var(--ink)]">
            需要添加：<strong>{help.refererHint}</strong>
            <br />
            建议同时添加：
            <code className="ml-1">http://127.0.0.1:5173/*</code>、
            <code className="ml-1">http://localhost:5173/*</code>、
            <code className="ml-1">https://paristour.vercel.app/*</code>
          </p>
        )}
        <p className="mt-2">
          另请确认已启用{' '}
          <a
            className="underline"
            href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Maps JavaScript API
          </a>
          、
          <a
            className="underline"
            href="https://console.cloud.google.com/apis/library/places.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Places API (New)
          </a>
          、
          <a
            className="underline"
            href="https://console.cloud.google.com/apis/library/directions-backend.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Directions API
          </a>
          。
        </p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[min(52vh,360px)] items-center justify-center rounded-2xl border border-white/70 bg-[var(--card)] md:h-[560px]">
        <LoadingIndicator variant="block" label="正在加载 Google Maps…" showDots size="md" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/50 bg-[var(--card)] px-3 py-2 text-xs text-[var(--stone)]">
        <span>Google Maps · 原生导航路线</span>
        {navLoading ? (
          <LoadingIndicator label="正在获取实时导航…" size="sm" showDots />
        ) : (
          <span>
            {directionsLegs.length
              ? `实时 Directions · ${directionsLegs.length} 段`
              : '等待导航数据'}
          </span>
        )}
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

      <div className="h-[min(52vh,360px)] w-full md:h-[560px]">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
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
            const n = stopNumbers[index]
            const active = selectedPlaceId === place.id
            // Day 1: hotel is a stop (origin is CDG). Mid-trip + last day: hotel is
            // origin only (house marker above); airport stop uses plane icon.
            // Hotel/airport markers do not consume sequence numbers.
            const isHotelStop = isHotelPlace(place)
            const isAirportStop = isAirportPlace(place)
            const title =
              isHotelStop || isAirportStop || n == null
                ? place.name
                : `${n}. ${place.name}`
            return (
              <Marker
                key={`${day.day}-${place.id}-${index}`}
                position={place.location}
                title={title}
                onClick={() => onSelectPlace(place.id)}
                icon={
                  isHotelStop
                    ? {
                        url: homeIconUrl(),
                        scaledSize: new google.maps.Size(40, 40),
                        anchor: new google.maps.Point(20, 20),
                      }
                    : isAirportStop
                      ? {
                          url: airportIconUrl(),
                          scaledSize: new google.maps.Size(40, 40),
                          anchor: new google.maps.Point(20, 20),
                        }
                      : {
                          url: numberIconUrl(n ?? index + 1, active),
                          scaledSize: new google.maps.Size(30, 30),
                          anchor: new google.maps.Point(15, 15),
                        }
                }
                zIndex={
                  isHotelStop || isAirportStop
                    ? 1000
                    : active
                      ? 900
                      : (n ?? index + 1) * 10
                }
                opacity={
                  !selectedPlaceId || active || isHotelStop || isAirportStop ? 1 : 0.55
                }
              />
            )
          })}
        </GoogleMap>
      </div>
    </div>
  )
}
