import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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
  getCachedMapRouteSegment,
  type MapRouteSegmentEntry,
} from '../services/mapRouteCache'
import {
  dayRouteSegmentsToRequests,
  buildDayMapRouteSegments,
} from '../services/mapDayRoute'
import {
  getOrFetchMapRouteSegments,
  type MapRouteSegmentsResult,
} from '../services/openRouteService'

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

interface SegmentPathHandles {
  casing: SVGPathElement | null
  line: SVGPathElement | null
}

function pathDFromGeometry(
  map: MapLibreMap,
  geometry: MapRouteSegmentEntry['geometry'],
): string {
  return geometry.coordinates
    .map((coordinate, index) => {
      const point = map.project(coordinate)
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    .join(' ')
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
  const pathHandlesRef = useRef<Map<string, SegmentPathHandles>>(new Map())
  const seenSegmentCacheKeysRef = useRef<Map<string, string>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [segmentEntries, setSegmentEntries] = useState<
    Array<MapRouteSegmentEntry | null>
  >([])
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
    () => buildDayMapRouteSegments(day, hotel, customPlaces),
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
  const { origin: dayOrigin, stops, markerStops, segments } = routeRequest
  const stopNumbers = useMemo(() => numberedStopIndexes(stops), [stops])

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

  // Track the segment list we're currently rendering so the loader effect
  // can detect when the underlying day changes underneath an in-flight request.
  const segmentsKeyRef = useRef(routeRequest.fingerprint)
  segmentsKeyRef.current = routeRequest.fingerprint

  useEffect(() => {
    if (segments.length === 0) {
      setSegmentEntries([])
      setRouteError(null)
      return
    }
    setRouteError(null)

    // Prime from cache so the first paint shows already-resolved legs while
    // we wait for the network response for the rest.
    const primed: Array<MapRouteSegmentEntry | null> = segments.map(
      (segment) => getCachedMapRouteSegment(segment.cacheKey),
    )
    setSegmentEntries(primed)

    let cancelled = false
    let retryTimer: number | undefined
    const loadRoute = async (attempt: number) => {
      try {
        const requests = dayRouteSegmentsToRequests(segments)
        const result: MapRouteSegmentsResult = await getOrFetchMapRouteSegments(
          routeRequest.profile,
          requests,
        )
        if (cancelled || segmentsKeyRef.current !== routeRequest.fingerprint) {
          return
        }
        setSegmentEntries(result.segments)
        setRouteError(null)
        if (result.fetchedFromNetwork) onRouteCacheChanged?.()
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
  }, [
    onRouteCacheChanged,
    routeRequest.fingerprint,
    routeRequest.profile,
    segments,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const svg = routeSvgRef.current
    if (!svg) return

    const sync = () => {
      const width = map.getContainer().clientWidth
      const height = map.getContainer().clientHeight
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      const handles = pathHandlesRef.current
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i]
        const handle = handles.get(segment.reactKey)
        const entry = segmentEntries[i]
        if (!handle) continue
        if (!entry) {
          handle.casing?.setAttribute('d', '')
          handle.line?.setAttribute('d', '')
          continue
        }
        const d = pathDFromGeometry(map, entry.geometry)
        handle.casing?.setAttribute('d', d)
        handle.line?.setAttribute('d', d)
      }
    }
    sync()
    map.on('move', sync)
    map.on('resize', sync)
    return () => {
      map.off('move', sync)
      map.off('resize', sync)
    }
  }, [mapReady, segmentEntries, segments])

  useEffect(() => {
    const seen = seenSegmentCacheKeysRef.current
    const next = new Map<string, string>()
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i]
      const entry = segmentEntries[i]
      if (!entry) continue
      const previous = seen.get(segment.reactKey)
      const handle = pathHandlesRef.current.get(segment.reactKey)
      if (handle && previous !== entry.key) {
        for (const path of [handle.casing, handle.line]) {
          path?.classList.remove('trip-map-route-enter')
        }
        // Force reflow so re-adding the class restarts the animation.
        void handle.line?.getBoundingClientRect()
        for (const path of [handle.casing, handle.line]) {
          path?.classList.add('trip-map-route-enter')
        }
      }
      next.set(segment.reactKey, entry.key)
    }
    seenSegmentCacheKeysRef.current = next
  }, [segmentEntries, segments])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const bounds = new LngLatBounds()
    for (const segment of segments) {
      bounds.extend([segment.from.lng, segment.from.lat])
      bounds.extend([segment.to.lng, segment.to.lat])
    }
    if (segments.length === 1) {
      map.jumpTo({
        center: [segments[0].from.lng, segments[0].from.lat],
        zoom: 14,
      })
    } else if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 0 })
    }
    // Only re-fit on initial load and on day change. Editing a stop on the
    // same day must not snap the viewport back to the default — that wipes
    // the user's zoom/pan. We deliberately ignore `routeRequest.fingerprint`
    // and `segments` here; place changes are handled by the per-segment
    // route overlay, not by a global re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, day.day])

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

  const setPathRef =
    (reactKey: string, kind: 'casing' | 'line') =>
    (element: SVGPathElement | null) => {
      let handle = pathHandlesRef.current.get(reactKey)
      if (!handle) {
        handle = { casing: null, line: null }
        pathHandlesRef.current.set(reactKey, handle)
      }
      handle[kind] = element
    }

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
          {segments.map((segment) => (
            <Fragment key={segment.reactKey}>
              <path
                ref={setPathRef(segment.reactKey, 'casing')}
                pathLength="1"
                fill="none"
                stroke="#fffaf2"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
              <path
                ref={setPathRef(segment.reactKey, 'line')}
                pathLength="1"
                fill="none"
                stroke="#b9572f"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Fragment>
          ))}
        </svg>
      </div>
    </div>
  )
}
