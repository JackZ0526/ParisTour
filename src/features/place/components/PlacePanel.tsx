import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlace } from '../constants/places'
import {
  generatePlaceDetailCopy,
  isLlmConfigured,
  type HotelDetailCopy,
} from '../../../shared/services/llm/llm'
import {
  memoizePlaceDetailCopy,
  peekPlaceDetailCopy,
  placeDetailKeysFromPlace,
} from '../services/placeDetailMemo'
import {
  nearbyStopsForAdvisor,
  placeAdvisorCopyFields,
  placeAdvisorFactsSignature,
  type PlaceAdvisorFacts,
} from '../services/placeAdvisorFacts'
import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { GooglePlacePage } from './GooglePlacePage'
import { SELECTED_HOTEL_PLACE_ID } from '../../itinerary/utils/dayOrigin'

interface Props {
  placeId: string | null
  customPlaces?: Record<string, Place>
  day: DayPlan
  hotel: SelectedHotel
  days: DayPlan[]
  onGoogleIdentityResolved?: (
    placeId: string,
    googlePlaceId: string,
    nameOriginal?: string,
  ) => void
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
  onGoogleIdentityResolved,
  onClose,
}: Props) {
  const [story, setStory] = useState<HotelDetailCopy | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [regenToken, setRegenToken] = useState(0)
  const [advisorFacts, setAdvisorFacts] = useState<PlaceAdvisorFacts | null>(null)
  const [advisorFactsPlaceId, setAdvisorFactsPlaceId] = useState<string | null>(null)

  const place = useMemo(() => {
    if (!placeId || placeId === SELECTED_HOTEL_PLACE_ID) return null
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
  const ctxRef = useRef({ place, stopNote, day, hotel, days, customPlaces })
  ctxRef.current = { place, stopNote, day, hotel, days, customPlaces }
  const factsForPlace = advisorFactsPlaceId === placeId ? advisorFacts : null
  const factsSig = placeAdvisorFactsSignature(factsForPlace)

  useEffect(() => {
    setRegenToken(0)
  }, [placeId])

  useEffect(() => {
    if (!placeId || !place) {
      setStory(null)
      setStoryLoading(false)
      return
    }

    const detailKeys = placeDetailKeysFromPlace(place)
    const bypass = regenToken > 0
    if (!bypass) {
      const memoHit = peekPlaceDetailCopy(...detailKeys)
      if (memoHit) {
        setStory({ ...memoHit, tripFit: '' })
        setStoryLoading(false)
        return
      }
    }

    if (!isLlmConfigured()) {
      setStory({
        intro: place.description,
        reason: stopNote || '',
        tripFit: '',
      })
      setStoryLoading(false)
      return
    }

    if (!factsSig) {
      setStory({ intro: '', reason: '', tripFit: '' })
      setStoryLoading(true)
      return
    }

    let cancelled = false
    setStory({ intro: '', reason: '', tripFit: '' })
    setStoryLoading(true)

    const ctx = ctxRef.current
    const p = ctx.place
    if (!p) return
    const facts = placeAdvisorCopyFields(factsForPlace)
    const nearbyStops = nearbyStopsForAdvisor(ctx.day.stops, p.id, ctx.customPlaces)

    void memoizePlaceDetailCopy(
      detailKeys,
      () =>
        generatePlaceDetailCopy({
          name: p.name,
          nameLocal: p.nameLocal,
          type: p.type,
          address: facts.address,
          existingDescription: p.description,
          listingDescription: facts.listingDescription,
          stopNote: ctx.stopNote,
          rating: facts.rating,
          reviewCount: facts.reviewCount,
          priceLevel: facts.priceLevel,
          cuisine: facts.cuisine,
          featuredReviews: facts.featuredReviews,
          nearbyStops,
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
          onPartial: (partial) => {
            if (cancelled) return
            setStory((prev) => ({
              intro: partial.intro ?? prev?.intro ?? '',
              reason: partial.reason ?? prev?.reason ?? '',
              tripFit: '',
            }))
          },
        }).then((copy) => {
          if (!copy) return { intro: p.description, reason: ctx.stopNote || '', tripFit: '' }
          return { ...copy, tripFit: '' }
        }),
      { bypass },
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
    // Wait for listing facts (reviews / cuisine / price) before the first write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, regenToken, factsSig])

  useEffect(() => {
    if (!placeId || !place || !isLlmConfigured()) return
    if (factsSig) return
    const timer = window.setTimeout(() => {
      setAdvisorFactsPlaceId(placeId)
      setAdvisorFacts((prev) =>
        prev?.settled ? prev : { reviews: prev?.reviews || [], settled: true },
      )
    }, 12_000)
    return () => window.clearTimeout(timer)
  }, [placeId, place, factsSig])

  return (
    <GooglePlacePage
      open={Boolean(place)}
      name={place?.name || ''}
      nameLocal={place?.nameLocal}
      googlePlaceId={place?.googlePlaceId}
      tripadvisorContentId={place?.tripadvisorContentId}
      location={place?.location}
      placeType={place?.type}
      fallbackImage={place?.image}
      showMap={false}
      llmNarrative={
        place
          ? {
              intro:
                story?.intro ||
                (!storyLoading ? place.description : undefined),
              reason:
                story?.reason ||
                (!storyLoading ? stopNote || undefined : undefined),
              loading: storyLoading,
              labels: PLACE_LABELS,
              onRegenerate: isLlmConfigured()
                ? () => setRegenToken((n) => n + 1)
                : undefined,
              regenerating: storyLoading && regenToken > 0,
            }
          : null
      }
      onAdvisorFacts={(next) => {
        setAdvisorFactsPlaceId(placeId)
        setAdvisorFacts(next)
      }}
      onDetailsResolved={(resolved) => {
        if (!placeId || !resolved.id) return
        onGoogleIdentityResolved?.(
          placeId,
          resolved.id,
          resolved.nameOriginal,
        )
      }}
      onClose={onClose}
    />
  )
}
