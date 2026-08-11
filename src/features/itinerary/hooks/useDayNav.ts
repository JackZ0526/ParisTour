import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getPlace } from '../../../data/places'
import {
  planDayNavigation,
  type DayNavPlan,
  type ResolvedDayLeg,
} from '../../../services/googleNav'
import { getLlmArtifact, setLlmArtifact } from '../../../services/llmArtifactStore'
import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { getDayOriginFromHotelFields } from '../utils/dayOrigin'
import { useGoogleMapsReady } from '../../../components/GoogleMapsProvider'

const emptyPlan = (
  stopsKey = '',
  summary = '正在计算步行距离…',
  _originKind: 'hotel' | 'airport' = 'hotel',
): DayNavPlan => ({
  hotelToFirst: null,
  betweenStops: [],
  lastToDestination: null,
  walkDistanceMeters: 0,
  walkDurationSeconds: 0,
  walkSummaryText: summary,
  // Origin cue chip carries 「从酒店」/「从机场」 — keep this status cue-free.
  hotelToFirstText: '正在计算出发方式…',
  lastToDestinationText: '',
  segments: [],
  routePath: [],
  hotelLinkPath: [],
  stopsKey,
})

/** Session cache: reuse Directions results when switching days (invalidate when places/origin change). */
const navPlanCache = new Map<string, DayNavPlan>()

const NAV_ARTIFACT_PREFIX = 'day-navigation:v1:'

function artifactKey(day: number): string {
  return `${NAV_ARTIFACT_PREFIX}${day}`
}

function persistedLeg(leg: ResolvedDayLeg | null): ResolvedDayLeg | null {
  if (!leg) return null
  // Google DirectionsResult contains Maps runtime objects. All information the
  // timeline and cached-map renderer need already lives in these normalized fields.
  const { directionsResult: _directionsResult, ...serializable } = leg
  return serializable
}

function persistedPlan(plan: DayNavPlan): DayNavPlan {
  return {
    ...plan,
    hotelToFirst: persistedLeg(plan.hotelToFirst),
    betweenStops: plan.betweenStops.map(persistedLeg),
    lastToDestination: persistedLeg(plan.lastToDestination),
  }
}

function durablePlan(day: number, stopsKey: string): DayNavPlan | null {
  const stored = getLlmArtifact<DayNavPlan>(artifactKey(day))
  if (
    !stored ||
    stored.stopsKey !== stopsKey ||
    stored.error ||
    !Array.isArray(stored.betweenStops) ||
    !Array.isArray(stored.segments) ||
    !Array.isArray(stored.routePath) ||
    !Array.isArray(stored.hotelLinkPath)
  ) {
    return null
  }
  return stored
}

function cachePlan(day: number, stopsKey: string, plan: DayNavPlan) {
  navPlanCache.set(stopsKey, plan)
  setLlmArtifact(artifactKey(day), persistedPlan(plan))
}

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
    if (!enabled) {
      setLoading((prev) => (prev ? false : prev))
      const summary = '日期、航班和酒店还没齐，导航先歇着'
      const hotelToFirstText = '正在计算出发方式…'
      setPlan((prev) =>
        prev.stopsKey === stopsKey &&
        prev.walkSummaryText === summary &&
        prev.hotelToFirstText === hotelToFirstText &&
        !prev.hotelToFirst &&
        prev.betweenStops.length === 0
          ? prev
          : emptyPlan(stopsKey, summary, origin.kind),
      )
      return
    }

    const cached = navPlanCache.get(stopsKey) || durablePlan(day.day, stopsKey)
    if (cached) {
      navPlanCache.set(stopsKey, cached)
      requestIdRef.current += 1
      setLoading(false)
      setPlan((prev) => (prev === cached || prev.stopsKey === cached.stopsKey ? prev : cached))
      return
    }

    if (!isLoaded) {
      setLoading((prev) => (prev ? false : prev))
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
          cachePlan(day.day, stopsKey, next)
        }
        if (requestId !== requestIdRef.current) return
        setPlan(next)
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setPlan({
          ...emptyPlan(stopsKey, '步行距离暂时无法计算', origin.kind),
          hotelToFirstText: '出发方式暂时无法计算',
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
