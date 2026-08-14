import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FullscreenControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  type StyleSpecification,
} from 'maplibre-gl'
import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { getPlace } from '../../place/constants/places'
import {
  isAirportPlace,
  isHotelPlace,
  numberedStopIndexes,
} from '../../itinerary/utils/dayOrigin'
import {
  airportIconUrl,
  homeIconUrl,
  numberIconUrl,
  SPECIAL_MARKER_SIZE,
} from '../services/markerIconUrls'
import { placeOriginalLabel } from '../../../shared/utils/placeTitle'
import { peekGooglePlaceDetails } from '../services/googlePlaceDetails'
import {
  getCachedMapRoute,
  type MapRouteCacheEntry,
} from '../services/mapRouteCache'
import { getOrFetchMapRoute } from '../services/openRouteService'
import { buildDayMapRouteRequest } from '../services/mapDayRoute'

const OPEN_STREET_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'openstreetmap-raster': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'openstreetmap-raster',
      type: 'raster',
      source: 'openstreetmap-raster',
    },
  ],
}
interface Props {
  hotel: SelectedHotel
  day: DayPlan
  customPlaces?: Record<string, Place>
  selectedPlaceId: string | null
  onSelectPlace: (id: string) => void
  onRouteCacheChanged?: () => void
}

function markerElement(
  imageUrl: string,
  size: number,
  title: string,
  options?: { faded?: boolean; onClick?: () => void },
): HTMLElement {
  const element = document.createElement(options?.onClick ? 'button' : 'div')
  element.title = title
  element.setAttribute('aria-label', title)
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.style.padding = '0'
  element.style.border = '0'
  element.style.background = 'transparent'
  element.style.opacity = options?.faded ? '0.55' : '1'
  element.style.cursor = options?.onClick ? 'pointer' : 'default'
  element.style.zIndex = '2'

  const image = document.createElement('img')
  image.src = imageUrl
  image.alt = ''
  image.draggable = false
  image.style.display = 'block'
  image.style.width = '100%'
  image.style.height = '100%'
  element.appendChild(image)
  if (options?.onClick) element.addEventListener('click', options.onClick)
  return element
}

function syncRouteOverlay(
  map: MapLibreMap,
  route: MapRouteCacheEntry | null,
  svg: SVGSVGElement | null,
  paths: readonly (SVGPathElement | null)[],
): void {
  if (!svg) return
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  if (!route) {
    for (const path of paths) path?.setAttribute('d', '')
    return
  }
  const d = route.geometry.coordinates
    .map((coordinate, index) => {
      const point = map.project(coordinate)
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    .join(' ')
  for (const path of paths) path?.setAttribute('d', d)
}

export function TripMap({
  hotel,
  day,
  customPlaces = {},
  selectedPlaceId,
  onSelectPlace,
  onRouteCacheChanged,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const routeSvgRef = useRef<SVGSVGElement | null>(null)
  const routeCasingRef = useRef<SVGPathElement | null>(null)
  const routeLineRef = useRef<SVGPathElement | null>(null)
  const lastAnimatedRouteKeyRef = useRef('')
  const [mapReady, setMapReady] = useState(false)
  const [route, setRoute] = useState<MapRouteCacheEntry | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const stopsFingerprint = useMemo(
    () =>
      day.stops
        .map((stop) => {
          try {
            const place = getPlace(stop.placeId, customPlaces)
            return `${stop.placeId}@${place.location.lat.toFixed(5)},${place.location.lng.toFixed(5)}`
          } catch {
            return stop.placeId
          }
        })
        .join('|'),
    [day.stops, customPlaces],
  )

  const routeRequest = useMemo(
    () => buildDayMapRouteRequest(day, hotel, customPlaces),
    // The fingerprint captures the only custom-place fields used by the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      day.day,
      hotel.id,
      hotel.name,
      hotel.lat,
      hotel.lng,
      stopsFingerprint,
    ],
  )
  const { origin: dayOrigin, stops, markerStops } = routeRequest
  const stopNumbers = useMemo(() => numberedStopIndexes(stops), [stops])
  const routePoints = routeRequest.points
  const routeProfile = routeRequest.profile
  const routeKey = routeRequest.key

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: OPEN_STREET_MAP_STYLE,
      center: [dayOrigin.lng, dayOrigin.lat],
      zoom: 13,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new FullscreenControl({
        container: fullscreenContainerRef.current || containerRef.current,
      }),
      'top-right',
    )
    map.once('load', () => setMapReady(true))
    mapRef.current = map

    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
    // The map instance is deliberately retained while days change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (routePoints.length < 2) {
      setRoute(null)
      setRouteError(null)
      return
    }
    setRouteError(null)
    const cached = getCachedMapRoute(routeKey)
    if (cached) setRoute(cached)
    else setRoute(null)

    let cancelled = false
    let retryTimer: number | undefined
    const loadRoute = async (attempt: number) => {
      try {
        const { route: resolved, fromCache } = await getOrFetchMapRoute(
          routePoints,
          routeProfile,
        )
        if (cancelled) return
        setRoute(resolved)
        setRouteError(null)
        if (!fromCache) onRouteCacheChanged?.()
      } catch (error: unknown) {
        if (cancelled) return
        if (attempt === 0) {
          retryTimer = window.setTimeout(() => void loadRoute(1), 900)
          return
        }
        setRouteError(
          error instanceof Error ? error.message : '道路路线暂不可用。',
        )
      }
    }
    void loadRoute(0)
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [onRouteCacheChanged, routeKey, routePoints, routeProfile])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const paths = [routeCasingRef.current, routeLineRef.current]
    const sync = () =>
      syncRouteOverlay(map, route, routeSvgRef.current, paths)
    sync()
    if (route && lastAnimatedRouteKeyRef.current !== route.key) {
      lastAnimatedRouteKeyRef.current = route.key
      for (const path of paths) path?.classList.remove('trip-map-route-enter')
      void routeLineRef.current?.getBoundingClientRect()
      for (const path of paths) path?.classList.add('trip-map-route-enter')
    }
    map.on('move', sync)
    map.on('resize', sync)
    return () => {
      map.off('move', sync)
      map.off('resize', sync)
    }
  }, [mapReady, route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const bounds = new LngLatBounds()
    for (const point of routePoints) bounds.extend([point.lng, point.lat])
    if (routePoints.length === 1) {
      map.jumpTo({ center: [routePoints[0].lng, routePoints[0].lat], zoom: 14 })
    } else if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 0 })
    }
  }, [mapReady, routeKey, routePoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const markers: MapLibreMarker[] = []
    markers.push(
      new MapLibreMarker({
        element: markerElement(
          dayOrigin.kind === 'airport' ? airportIconUrl() : homeIconUrl(),
          SPECIAL_MARKER_SIZE,
          dayOrigin.label,
        ),
        anchor: 'center',
      })
        .setLngLat([dayOrigin.lng, dayOrigin.lat])
        .addTo(map),
    )

    for (const { place, index } of markerStops) {
      const number = stopNumbers[index]
      const active = selectedPlaceId === place.id
      const isHotelStop = isHotelPlace(place)
      const isAirportStop = isAirportPlace(place)
      const cached = peekGooglePlaceDetails(place.name, place.nameLocal, place.location)
      const label = placeOriginalLabel(
        place.name,
        place.nameLocal,
        cached?.name,
        cached?.nameOriginal,
      )
      const title =
        isHotelStop || isAirportStop || number == null
          ? label
          : `${number}. ${label}`
      const icon = isHotelStop
        ? homeIconUrl()
        : isAirportStop
          ? airportIconUrl()
          : numberIconUrl(number ?? index + 1, active)
      const size = isHotelStop || isAirportStop ? SPECIAL_MARKER_SIZE : 30
      markers.push(
        new MapLibreMarker({
          element: markerElement(icon, size, title, {
            faded:
              Boolean(selectedPlaceId) &&
              !active &&
              !isHotelStop &&
              !isAirportStop,
            onClick: () => onSelectPlace(place.id),
          }),
          anchor: 'center',
        })
          .setLngLat([place.location.lng, place.location.lat])
          .addTo(map),
      )
    }

    return () => {
      for (const marker of markers) marker.remove()
    }
  }, [
    dayOrigin,
    mapReady,
    markerStops,
    onSelectPlace,
    selectedPlaceId,
    stopNumbers,
  ])

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/50 bg-[var(--card)] px-3 py-2 text-xs text-[var(--stone)]">
        <span>MapLibre · OpenStreetMap</span>
        <span title={routeError || undefined}>
          {routeError ? '道路路线暂不可用' : '按实际道路连接地点'}
        </span>
      </div>
      <div
        ref={fullscreenContainerRef}
        className="relative h-[min(52vh,360px)] w-full bg-[var(--mist)] md:h-[560px]"
      >
        <div
          ref={containerRef}
          className="h-full w-full bg-[var(--mist)]/35"
          style={{ position: 'absolute', inset: 0 }}
          aria-label={`第 ${day.day} 天地图`}
        />
        <svg
          ref={routeSvgRef}
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            ref={routeCasingRef}
            pathLength="1"
            fill="none"
            stroke="#fffaf2"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <path
            ref={routeLineRef}
            pathLength="1"
            fill="none"
            stroke="#b9572f"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}
