import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlace } from '../data/places'
import {
  generatePlaceDetailCopy,
  isLlmConfigured,
  type HotelDetailCopy,
} from '../services/llm'
import {
  memoizePlaceDetailCopy,
  peekPlaceDetailCopy,
  placeDetailKeysFromPlace,
} from '../services/placeDetailMemo'
import type { DayPlan, Place, SelectedHotel } from '../types'
import { GooglePlacePage } from './GooglePlacePage'

interface Props {
  placeId: string | null
  customPlaces?: Record<string, Place>
  day: DayPlan
  hotel: SelectedHotel
  days: DayPlan[]
  onClose: () => void
}

const PLACE_LABELS = {
  title: '行程顾问点评',
  intro: '地点简介',
  reason: '为什么推荐',
  loadingText: '正在生成地点简介与推荐理由…',
}

export function PlacePanel({
  placeId,
  customPlaces = {},
  day,
  hotel,
  days,
  onClose,
}: Props) {
  const [story, setStory] = useState<HotelDetailCopy | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)

  const place = useMemo(() => {
    if (!placeId) return null
    try {
      return getPlace(placeId, customPlaces)
    } catch {
      return null
    }
  }, [placeId, customPlaces])

  const stopNote = useMemo(() => {
    if (!placeId) return ''
    return day.stops.find((s) => s.placeId === placeId)?.note || ''
  }, [day.stops, placeId])

  // Snapshot context in refs so itinerary title/theme updates don't re-fire LLM.
  const ctxRef = useRef({ place, stopNote, day, hotel, days })
  ctxRef.current = { place, stopNote, day, hotel, days }

  useEffect(() => {
    if (!placeId || !place) {
      setStory(null)
      setStoryLoading(false)
      return
    }

    const detailKeys = placeDetailKeysFromPlace(place)
    const memoHit = peekPlaceDetailCopy(...detailKeys)
    if (memoHit) {
      setStory({ ...memoHit, tripFit: '' })
      setStoryLoading(false)
      return
    }

    setStory({
      intro: place.description,
      reason: stopNote || '',
      tripFit: '',
    })

    if (!isLlmConfigured()) return

    let cancelled = false
    setStoryLoading(true)

    const ctx = ctxRef.current
    const p = ctx.place
    if (!p) return

    void memoizePlaceDetailCopy(detailKeys, () =>
      generatePlaceDetailCopy({
        name: p.name,
        nameLocal: p.nameLocal,
        type: p.type,
        existingDescription: p.description,
        stopNote: ctx.stopNote,
        day: ctx.day.day,
        dayTitle: ctx.day.title,
        dayTheme: ctx.day.theme,
        dayPace: ctx.day.pace,
        hotelArea: ctx.hotel.areaKey,
        tripDays: ctx.days.map((d) => ({
          day: d.day,
          title: d.title,
          pace: d.pace,
          theme: d.theme,
        })),
      }).then((copy) => {
        if (!copy) return { intro: p.description, reason: ctx.stopNote || '', tripFit: '' }
        return { ...copy, tripFit: '' }
      }),
    )
      .then((copy) => {
        if (cancelled || !copy) return
        setStory(copy)
      })
      .finally(() => {
        if (!cancelled) setStoryLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Only re-run when the selected place changes — not when day copy / days array updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId])

  return (
    <>
      <aside className="rounded-2xl border border-dashed border-[var(--stone)]/30 bg-[var(--card)] px-4 py-6 text-center text-sm text-[var(--stone)]">
        {place
          ? `已选中「${place.name}」，详情以弹层展示。`
          : '点击地图标记或左侧行程地点，打开与酒店相同的 Google 详情页'}
      </aside>

      <GooglePlacePage
        open={Boolean(place)}
        name={place?.name || ''}
        nameLocal={place?.nameLocal}
        location={place?.location}
        fallbackImage={place?.image}
        showMap={false}
        llmNarrative={
          place
            ? {
                intro: story?.intro || place.description,
                reason: story?.reason || stopNote || undefined,
                loading: storyLoading,
                labels: PLACE_LABELS,
              }
            : null
        }
        onClose={onClose}
      />
    </>
  )
}
