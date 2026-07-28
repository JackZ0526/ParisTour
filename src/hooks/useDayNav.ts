import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getPlace } from '../data/places'
import {
  planDayNavigation,
  type DayNavPlan,
} from '../services/googleNav'
import type { DayPlan, Place, SelectedHotel } from '../types'
import { getDayOrigin } from '../utils/dayOrigin'
import { useGoogleMapsReady } from '../components/GoogleMapsProvider'

const emptyPlan = (
  stopsKey = '',
  summary = '正在计算步行距离…',
  originKind: 'hotel' | 'airport' = 'hotel',
): DayNavPlan => ({
  hotelToFirst: null,
  betweenStops: [],
  lastToDestination: null,
  walkDistanceMeters: 0,
  walkDurationSeconds: 0,
  walkSummaryText: summary,
  hotelToFirstText:
    originKind === 'airport' ? '正在计算从机场出发的方式…' : '正在计算从酒店出发的方式…',
  lastToDestinationText: '',
  segments: [],
  routePath: [],
  hotelLinkPath: [],
  stopsKey,
})

/** Session cache: reuse Directions results when switching days (invalidate when places/origin change). */
const navPlanCache = new Map<string, DayNavPlan>()

export function clearDayNavCache() {
  navPlanCache.clear()
}

function cacheablePlan(plan: DayNavPlan): boolean {
  return !plan.error
}

export function useDayNav(
  day: DayPlan,
  hotel: SelectedHotel,
  customPlaces: Record<string, Place>,
  enabled = true,
) {
  const { isLoaded } = useGoogleMapsReady()
  const origin = useMemo(
    () => getDayOrigin(day.day, hotel),
    [day.day, hotel.id, hotel.lat, hotel.lng, hotel.name],
  )
  const [plan, setPlan] = useState<DayNavPlan>(() => emptyPlan('', undefined, origin.kind))
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  const stopsKey = useMemo(
    () =>
      [
        day.day,
        `${origin.kind}:${origin.id}`,
        `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`,
        day.pace,
        day.stops
          .map((s) => {
            try {
              const place = getPlace(s.placeId, customPlaces)
              const { lat, lng } = place.location
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return `${s.id || ''}:${s.placeId}@${lat.toFixed(5)},${lng.toFixed(5)}`
              }
            } catch {
              /* fall through */
            }
            return `${s.id || ''}:${s.placeId}`
          })
          .join(','),
      ].join('|'),
    [day.day, day.stops, day.pace, origin.kind, origin.id, origin.lat, origin.lng, customPlaces],
  )

  const stopPoints = useMemo(() => {
    if (!enabled) return [] as { lat: number; lng: number }[]
    const list: { lat: number; lng: number }[] = []
    for (const s of day.stops) {
      try {
        const place = getPlace(s.placeId, customPlaces)
        if (Number.isFinite(place.location.lat) && Number.isFinite(place.location.lng)) {
          list.push(place.location)
        }
      } catch {
        /* skip */
      }
    }
    return list
    // stopsKey encodes place order/ids — omit customPlaces identity so other-day
    // place dictionary churn does not refetch this day's navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, enabled])

  useLayoutEffect(() => {
    if (!enabled || !isLoaded) {
      setLoading((prev) => (prev ? false : prev))
      if (!enabled) {
        const summary = '日期、航班和酒店还没齐，导航先歇着'
        const hotelToFirstText =
          origin.kind === 'airport'
            ? '正在计算从机场出发的方式…'
            : '正在计算从酒店出发的方式…'
        setPlan((prev) =>
          prev.stopsKey === stopsKey &&
          prev.walkSummaryText === summary &&
          prev.hotelToFirstText === hotelToFirstText &&
          !prev.hotelToFirst &&
          prev.betweenStops.length === 0
            ? prev
            : emptyPlan(stopsKey, summary, origin.kind),
        )
      }
      return
    }

    const cached = navPlanCache.get(stopsKey)
    if (cached) {
      requestIdRef.current += 1
      setLoading(false)
      setPlan((prev) => (prev === cached || prev.stopsKey === cached.stopsKey ? prev : cached))
      return
    }

    const requestId = ++requestIdRef.current
    setPlan(
      emptyPlan(
        stopsKey,
        stopPoints.length ? '正在根据最新行程计算导航…' : '今天还没有行程点',
        origin.kind,
      ),
    )
    setLoading(true)

    void planDayNavigation(
      { lat: origin.lat, lng: origin.lng },
      stopPoints,
      day.pace,
      stopsKey,
      { originKind: origin.kind },
    )
      .then((next) => {
        // Always cache a successful result so switching back does not refetch,
        // even if this request was superseded for the UI.
        if (cacheablePlan(next)) {
          navPlanCache.set(stopsKey, next)
        }
        if (requestId !== requestIdRef.current) return
        setPlan(next)
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setPlan({
          ...emptyPlan(stopsKey, '步行距离暂时无法计算', origin.kind),
          hotelToFirstText:
            origin.kind === 'airport'
              ? '从机场出发的方式暂时无法计算'
              : '从酒店出发的方式暂时无法计算',
          error: '导航计算失败',
        })
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [
    enabled,
    isLoaded,
    origin.lat,
    origin.lng,
    origin.id,
    origin.kind,
    stopPoints,
    day.pace,
    day.day,
    stopsKey,
  ])

  return { plan, loading, isLoaded, stopsKey, origin }
}
