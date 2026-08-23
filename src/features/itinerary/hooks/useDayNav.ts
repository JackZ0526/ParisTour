import { useMemo } from 'react'
import { getPlace } from '../../place/constants/places'
import type { DayNavPlan } from '../../map/services/googleNav'
import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { getDayOriginFromHotelFields } from '../utils/dayOrigin'
import { getLocale, translate } from '../../../shared/i18n'

/** Kept as a compatibility no-op for itinerary reset paths. */
export function clearDayNavCache() {}

/**
 * Build stable timeline slots without calling a routing API. Each connector
 * now opens a prefilled Google Maps URL assembled by DayTimeline.
 */
export function useDayNav(
  day: DayPlan,
  hotel: SelectedHotel,
  customPlaces: Record<string, Place>,
  enabled = true,
) {
  const origin = useMemo(
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

  const stopsKey = useMemo(
    () =>
      [
        day.day,
        `${origin.kind}:${origin.id}`,
        `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`,
        day.pace,
        day.stops
          .map((stop) => {
            try {
              const place = getPlace(stop.placeId, customPlaces)
              return `${stop.id || ''}:${stop.placeId}@${place.location.lat.toFixed(5)},${place.location.lng.toFixed(5)}`
            } catch {
              return `${stop.id || ''}:${stop.placeId}`
            }
          })
          .join(','),
      ].join('|'),
    [day.day, day.pace, day.stops, customPlaces, origin],
  )

  const plan = useMemo<DayNavPlan>(
    () => ({
      hotelToFirst: null,
      betweenStops: Array.from(
        { length: Math.max(0, day.stops.length - 1) },
        () => null,
      ),
      lastToDestination: null,
      walkDistanceMeters: 0,
      walkDurationSeconds: 0,
      walkSummaryText: enabled
        ? (translate('itinerary.directionsDesc' as never, undefined, getLocale()) ||
            (getLocale() === 'en'
              ? 'Click each transit leg to open live routing in Google Maps'
              : '点击每段交通，在 Google Maps 查看实时路线'))
        : (translate('itinerary.directionsNotReady' as never, undefined, getLocale()) ||
            (getLocale() === 'en'
              ? 'Route links show up after the dates, flight, and hotel are confirmed.'
              : '日期、航班和酒店确认后显示路线入口')),
      hotelToFirstText:
        translate('itinerary.openInGoogleMaps' as never, undefined, getLocale()) ||
        (getLocale() === 'en' ? 'Open route in Google Maps' : '在 Google Maps 查看路线'),
      lastToDestinationText: '',
      segments: [],
      routePath: [],
      hotelLinkPath: [],
      stopsKey,
    }),
    [day.stops.length, enabled, stopsKey],
  )

  return {
    plan,
    loading: false,
    isLoaded: true,
    stopsKey,
    origin,
  }
}
