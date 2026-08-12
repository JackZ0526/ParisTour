import { useEffect, useMemo, useRef } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { Icon, latLngBounds, type LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getPlace } from '../../place/constants/places'
import type { DayNavPlan, ResolvedDayLeg } from '../services/navigation'
import type { DayPlan, Place, SelectedHotel } from '../../../types'
import {
  getDayOriginFromHotelFields,
  isAirportPlace,
  isHotelPlace,
  numberedStopIndexes,
} from '../../itinerary/utils/dayOrigin'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { airportIconUrl, homeIconUrl, numberIconUrl } from './markerIcons'
import { placeOriginalLabel } from '../../../shared/utils/placeTitle'
import { peekPlaceDetails } from '../services/placeDetails'

const ROUTE_BLUE = '#1a73e8'

type MapPoint = { lat: number; lng: number }

function collectNavLegs(navPlan: DayNavPlan): ResolvedDayLeg[] {
  const legs: ResolvedDayLeg[] = []
  if (navPlan.hotelToFirst) legs.push(navPlan.hotelToFirst)
  for (const leg of navPlan.betweenStops) {
    if (leg) legs.push(leg)
  }
  if (navPlan.lastToDestination) legs.push(navPlan.lastToDestination)
  return legs
}

function pathFromLeg(leg: ResolvedDayLeg): MapPoint[] {
  return leg.path.length >= 2 ? leg.path : []
}

/** All coordinates that should stay inside the map viewport. */
function collectViewportPoints(
  origin: MapPoint,
  stops: Place[],
  navPlan: DayNavPlan,
): MapPoint[] {
  const points: MapPoint[] = [origin, ...stops.map((stop) => stop.location)]

  const pushPath = (path: MapPoint[] | undefined | null) => {
    if (!path?.length) return
    for (const point of path) {
      if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) points.push(point)
    }
  }

  pushPath(navPlan.hotelLinkPath)
  pushPath(navPlan.routePath)
  for (const leg of collectNavLegs(navPlan)) pushPath(pathFromLeg(leg))

  return points
}

function markerIcon(url: string, size: number) {
  return new Icon({
    iconUrl: url,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function ViewportController({
  points,
  viewportKey,
  navLoading,
}: {
  points: MapPoint[]
  viewportKey: string
  navLoading: boolean
}) {
  const map = useMap()
  const lastFittedKeyRef = useRef('')

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => map.invalidateSize())
    return () => window.cancelAnimationFrame(raf)
  }, [map])

  useEffect(() => {
    if (navLoading || !points.length || lastFittedKeyRef.current === viewportKey) return

    const raf = window.requestAnimationFrame(() => {
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 14, { animate: false })
      } else {
        const bounds = latLngBounds(points.map((point) => [point.lat, point.lng]))
        map.fitBounds(bounds, {
          paddingTopLeft: [72, 72],
          paddingBottomRight: [72, 72],
          maxZoom: 15,
          animate: false,
        })
      }
      lastFittedKeyRef.current = viewportKey
    })

    return () => window.cancelAnimationFrame(raf)
  }, [map, navLoading, points, viewportKey])

  return null
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
  const dayOrigin = useMemo(
    () =>
      getDayOriginFromHotelFields(
        day.day,
        hotel.id,
        hotel.name,
        hotel.lat,
        hotel.lng,
      ),
    [day.day, hotel.id, hotel.lat, hotel.lng, hotel.name],
  )

  const mapCenter = useMemo<LatLngExpression>(
    () => [dayOrigin.lat, dayOrigin.lng],
    [dayOrigin.lat, dayOrigin.lng],
  )

  const stopsFingerprint = useMemo(
    () =>
      day.stops
        .map((stop) => {
          try {
            const place = getPlace(stop.placeId, customPlaces)
            const { lat, lng } = place.location
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return stop.placeId
            return `${stop.placeId}@${lat.toFixed(5)},${lng.toFixed(5)}`
          } catch {
            return stop.placeId
          }
        })
        .join('|'),
    [day.stops, customPlaces],
  )

  const stops = useMemo(() => {
    const list: Place[] = []
    for (const stop of day.stops) {
      try {
        const place = getPlace(stop.placeId, customPlaces)
        if (
          !place.locationPending &&
          Number.isFinite(place.location.lat) &&
          Number.isFinite(place.location.lng)
        ) {
          list.push(place)
        }
      } catch {
        // Ignore stale stops that are not present in the current place dictionary.
      }
    }
    return list
    // The fingerprint already captures the relevant ids, order, and coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsFingerprint])

  const stopNumbers = useMemo(() => numberedStopIndexes(stops), [stops])
  const routePaths = useMemo(
    () => collectNavLegs(navPlan).map(pathFromLeg).filter((path) => path.length >= 2),
    [navPlan],
  )
  const viewportPoints = useMemo(
    () => collectViewportPoints(dayOrigin, stops, navPlan),
    [dayOrigin, stops, navPlan],
  )
  const viewportKey = useMemo(
    () => `${day.day}|${dayOrigin.id}|${stopsFingerprint}|${navPlan.stopsKey || ''}`,
    [day.day, dayOrigin.id, stopsFingerprint, navPlan.stopsKey],
  )
  const originIcon = useMemo(
    () => markerIcon(dayOrigin.kind === 'airport' ? airportIconUrl() : homeIconUrl(), 40),
    [dayOrigin.kind],
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/50 bg-[var(--card)] px-3 py-2 text-xs text-[var(--stone)]">
        <span>OpenStreetMap · 当日路线</span>
        {navLoading ? (
          <LoadingIndicator label="正在获取导航" size="sm" showDots />
        ) : (
          <span>{routePaths.length ? `已显示 ${routePaths.length} 段路线` : '等待路线数据'}</span>
        )}
      </div>

      {navPlan.error && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {navPlan.error} 请稍后重试。
        </div>
      )}

      <div className="h-[min(52vh,360px)] w-full md:h-[560px]">
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ViewportController
            points={viewportPoints}
            viewportKey={viewportKey}
            navLoading={navLoading}
          />

          {routePaths.map((path, index) => (
            <Polyline
              key={`${navPlan.stopsKey || 'nav'}-route-${index}`}
              positions={path.map((point) => [point.lat, point.lng])}
              pathOptions={{ color: ROUTE_BLUE, opacity: 0.9, weight: 6 }}
            />
          ))}

          <Marker
            position={[dayOrigin.lat, dayOrigin.lng]}
            title={dayOrigin.label}
            icon={originIcon}
            zIndexOffset={1000}
          />

          {stops.map((place, index) => {
            const number = stopNumbers[index]
            const active = selectedPlaceId === place.id
            const hotelStop = isHotelPlace(place)
            const airportStop = isAirportPlace(place)
            const cached = peekPlaceDetails(
              place.name,
              place.nameLocal,
              place.location,
            )
            const label = placeOriginalLabel(
              place.name,
              place.nameLocal,
              cached?.name,
              cached?.nameOriginal,
            )
            const title =
              hotelStop || airportStop || number == null ? label : `${number}. ${label}`
            const icon = hotelStop
              ? markerIcon(homeIconUrl(), 40)
              : airportStop
                ? markerIcon(airportIconUrl(), 40)
                : markerIcon(numberIconUrl(number ?? index + 1, active), 30)

            return (
              <Marker
                key={`${day.day}-${place.id}-${index}`}
                position={[place.location.lat, place.location.lng]}
                title={title}
                icon={icon}
                opacity={!selectedPlaceId || active || hotelStop || airportStop ? 1 : 0.55}
                zIndexOffset={
                  hotelStop || airportStop ? 1000 : active ? 900 : (number ?? index + 1) * 10
                }
                eventHandlers={{ click: () => onSelectPlace(place.id) }}
              />
            )
          })}
        </MapContainer>
      </div>
      <div className="border-t border-white/50 bg-[var(--card)] px-3 py-1.5 text-[10px] text-[var(--stone)]">
        公共交通数据由{' '}
        <a
          href="https://transitous.org/sources/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Transitous 开放数据源
        </a>
        {' '}提供
      </div>
    </div>
  )
}
