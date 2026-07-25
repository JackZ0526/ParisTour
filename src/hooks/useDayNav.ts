import { useEffect, useMemo, useRef, useState } from 'react'
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

export function useDayNav(
  day: DayPlan,
  hotel: SelectedHotel,
  customPlaces: Record<string, Place>,
) {
  const { isLoaded } = useGoogleMapsReady()
  const origin = useMemo(() => getDayOrigin(day.day, hotel), [day.day, hotel])
  const [plan, setPlan] = useState<DayNavPlan>(() => emptyPlan('', undefined, origin.kind))
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  const stopsKey = useMemo(
    () =>
      `${day.day}|${origin.kind}:${origin.id}|${day.stops.map((s) => `${s.id || ''}:${s.placeId}`).join(',')}`,
    [day.day, day.stops, origin.kind, origin.id],
  )

  const stopPoints = useMemo(() => {
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
  }, [day.stops, customPlaces, stopsKey])

  useEffect(() => {
    if (!isLoaded) return

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
