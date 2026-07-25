import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DayTimeline } from './components/DayTimeline'
import { FlightPanel } from './components/FlightPanel'
import { HotelPicker } from './components/HotelPicker'
import { PlacePanel } from './components/PlacePanel'
import { TripChatPanel } from './components/TripChatPanel'
import { TripMap } from './components/TripMap'
import { PENDING_HOTEL } from './data/hotels'
import { getPlace } from './data/places'
import { useDayNav } from './hooks/useDayNav'
import { loadHotelCache } from './services/hotelCache'
import { generateDayCopy } from './services/llm'
import type { DayPlan, HotelCandidate, ItineraryStop, Place, SelectedHotel } from './types'
import {
  getDayOrigin,
  placeFromHotel,
  SELECTED_HOTEL_PLACE_ID,
} from './utils/dayOrigin'
import {
  cloneSeedItinerary,
  findBestInsertIndex,
  loadItineraryState,
  makeStopId,
  reorderStops,
  saveItineraryState,
} from './utils/itineraryState'

function ensureStopId(day: number, stop: ItineraryStop, index: number): string {
  return stop.id || `d${day}-${stop.placeId}-${index}`
}

function initialHotelState(): { hotel: SelectedHotel; candidates: HotelCandidate[] } {
  const cached = loadHotelCache()
  if (cached?.selected && cached.candidates.length) {
    return { hotel: cached.selected, candidates: cached.candidates }
  }
  return { hotel: PENDING_HOTEL, candidates: cached?.candidates || [] }
}

export default function App() {
  const initialHotels = useMemo(() => initialHotelState(), [])
  const [hotel, setHotel] = useState<SelectedHotel>(initialHotels.hotel)
  const [hotelCandidates, setHotelCandidates] = useState<HotelCandidate[]>(
    initialHotels.candidates,
  )
  const [dayIndex, setDayIndex] = useState(0)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [days, setDays] = useState<DayPlan[]>(() => loadItineraryState().days)
  const [customPlaces, setCustomPlaces] = useState<Record<string, Place>>(
    () => loadItineraryState().customPlaces,
  )
  const [copyRefreshing, setCopyRefreshing] = useState(false)
  const prevStopsKeyRef = useRef<string | null>(null)
  const suppressCopyRef = useRef(false)

  useEffect(() => {
    saveItineraryState(days, customPlaces)
  }, [days, customPlaces])

  const day = days[dayIndex] ?? days[0]
  const placesWithHotel = useMemo(
    () => ({
      ...customPlaces,
      [SELECTED_HOTEL_PLACE_ID]: placeFromHotel(hotel),
    }),
    [customPlaces, hotel],
  )
  const dayPlacesKey = useMemo(() => day.stops.map((s) => s.placeId).join(','), [day])
  const tripPlaceNames = useMemo(() => {
    const names: string[] = []
    for (const d of days) {
      for (const s of d.stops) {
        try {
          names.push(getPlace(s.placeId, placesWithHotel).name)
        } catch {
          /* skip */
        }
      }
    }
    return names
  }, [days, placesWithHotel])
  const { plan: navPlan, loading: navLoading } = useDayNav(day, hotel, placesWithHotel)

  // Auto-generate day title / theme / summary after itinerary edits.
  useEffect(() => {
    const key = `${day.day}:${dayPlacesKey}`

    if (prevStopsKeyRef.current === null) {
      prevStopsKeyRef.current = key
      return
    }

    if (prevStopsKeyRef.current === key) return

    const prevDay = Number(prevStopsKeyRef.current.split(':')[0])
    prevStopsKeyRef.current = key

    if (suppressCopyRef.current) {
      suppressCopyRef.current = false
      return
    }

    // Switching day tabs should not rewrite copy.
    if (prevDay !== day.day) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      const names = day.stops.map((s) => {
        try {
          return getPlace(s.placeId, placesWithHotel).name
        } catch {
          return s.placeId
        }
      })

      setCopyRefreshing(true)
      void generateDayCopy({
        day: day.day,
        pace: day.pace,
        placeNames: names,
        hotelArea: hotel.areaKey,
      })
        .then((copy) => {
          if (cancelled || !copy) return
          setDays((prev) =>
            prev.map((d, i) =>
              i === dayIndex
                ? { ...d, title: copy.title, theme: copy.theme, summary: copy.summary }
                : d,
            ),
          )
        })
        .finally(() => {
          if (!cancelled) setCopyRefreshing(false)
        })
    }, 900)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dayPlacesKey, day.day, day.pace, day.stops, dayIndex, placesWithHotel, hotel.areaKey])

  const updateDayStops = useCallback(
    (updater: (stops: ItineraryStop[]) => ItineraryStop[]) => {
      setDays((prev) =>
        prev.map((d, i) => (i === dayIndex ? { ...d, stops: updater(d.stops) } : d)),
      )
    },
    [dayIndex],
  )

  function keepDay1HotelFirst(dayNum: number, stops: ItineraryStop[]): ItineraryStop[] {
    if (dayNum !== 1) return stops
    const hotelIdx = stops.findIndex((s) => s.placeId === SELECTED_HOTEL_PLACE_ID)
    if (hotelIdx <= 0) return stops
    const next = [...stops]
    const [hotelStop] = next.splice(hotelIdx, 1)
    return [hotelStop, ...next]
  }

  function handleReorder(from: number, to: number) {
    updateDayStops((stops) => keepDay1HotelFirst(day.day, reorderStops(stops, from, to)))
  }

  function handleReorderOnDay(dayNum: number, from: number, to: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.day === dayNum
          ? { ...d, stops: keepDay1HotelFirst(d.day, reorderStops(d.stops, from, to)) }
          : d,
      ),
    )
  }

  function handleDelete(stopId: string) {
    updateDayStops((stops) => {
      const removed = stops.find((s, i) => ensureStopId(day.day, s, i) === stopId)
      // Day 1 hotel check-in stop cannot be removed.
      if (day.day === 1 && removed?.placeId === SELECTED_HOTEL_PLACE_ID) {
        return stops
      }
      const next = stops.filter((s, i) => ensureStopId(day.day, s, i) !== stopId)
      if (removed && selectedPlaceId === removed.placeId) {
        setSelectedPlaceId(null)
      }
      return next
    })
  }

  function handleDeleteOnDay(dayNum: number, stopId: string) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d
        const removed = d.stops.find((s, i) => ensureStopId(d.day, s, i) === stopId)
        if (d.day === 1 && removed?.placeId === SELECTED_HOTEL_PLACE_ID) {
          return d
        }
        const next = d.stops.filter((s, i) => ensureStopId(d.day, s, i) !== stopId)
        if (removed && selectedPlaceId === removed.placeId) {
          setSelectedPlaceId(null)
        }
        return { ...d, stops: next }
      }),
    )
  }

  function handleAddCustom(place: Place, mode: 'best' | 'end') {
    handleAddOnDay(day.day, place, { mode })
  }

  function handleAddOnDay(
    dayNum: number,
    place: Place,
    options?: { mode?: 'best' | 'end'; insertAt?: number },
  ) {
    const mode = options?.mode || 'best'
    setCustomPlaces((prev) => ({ ...prev, [place.id]: place }))

    const newStop: ItineraryStop = {
      id: makeStopId(dayNum, place.id),
      time: '12:00',
      placeId: place.id,
      note: place.description,
      walkLevel: '短步行',
      duration: place.durationHint || '60 分钟',
    }

    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d

        const next = [...d.stops]
        // Explicit index only for rare internal cases; normal adds use 最顺路.
        if (typeof options?.insertAt === 'number') {
          const at = Math.max(0, Math.min(options.insertAt, next.length))
          next.splice(at, 0, newStop)
          return { ...d, stops: next }
        }

        if (mode === 'end') {
          return { ...d, stops: [...d.stops, newStop] }
        }

        // Default / best: insert where day-origin → stops path is shortest.
        // Day 1 origin is CDG; other days use the hotel.
        if (!d.stops.length) {
          return { ...d, stops: [newStop] }
        }

        const origin = getDayOrigin(d.day, hotel)
        const placesLookup = {
          ...placesWithHotel,
          [place.id]: place,
        }
        const stopLocations = d.stops.map((s) => {
          try {
            return getPlace(s.placeId, placesLookup).location
          } catch {
            return { lat: origin.lat, lng: origin.lng }
          }
        })
        let insertAt = findBestInsertIndex(
          { lat: origin.lat, lng: origin.lng },
          stopLocations,
          place.location,
        )
        // Keep day-1 hotel check-in as the first stop (airport → hotel → …).
        if (d.day === 1 && d.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID) {
          insertAt = Math.max(1, insertAt)
        }
        next.splice(insertAt, 0, newStop)
        return { ...d, stops: next }
      }),
    )

    const targetIndex = days.findIndex((d) => d.day === dayNum)
    if (targetIndex >= 0) setDayIndex(targetIndex)
    setSelectedPlaceId(place.id)
  }

  function handleSwitchDay(dayNum: number) {
    const idx = days.findIndex((d) => d.day === dayNum)
    if (idx >= 0) {
      setDayIndex(idx)
      setSelectedPlaceId(null)
    }
  }

  /** Atomically replace a stop in-place so the new place keeps the old index. */
  function handleReplaceOnDay(dayNum: number, stopId: string, place: Place) {
    setCustomPlaces((prev) => ({ ...prev, [place.id]: place }))

    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d
        const idx = d.stops.findIndex((s, i) => ensureStopId(d.day, s, i) === stopId)
        if (idx < 0) return d

        const old = d.stops[idx]
        // Day 1 hotel check-in cannot be replaced.
        if (d.day === 1 && old.placeId === SELECTED_HOTEL_PLACE_ID) return d

        const newStop: ItineraryStop = {
          id: makeStopId(dayNum, place.id),
          time: old.time || '12:00',
          placeId: place.id,
          note: place.description,
          walkLevel: old.walkLevel || '短步行',
          duration: place.durationHint || old.duration || '60 分钟',
          transport: old.transport,
        }
        const next = [...d.stops]
        next[idx] = newStop
        return { ...d, stops: next }
      }),
    )

    const targetIndex = days.findIndex((d) => d.day === dayNum)
    if (targetIndex >= 0) setDayIndex(targetIndex)
    setSelectedPlaceId(place.id)
  }

  function handleResetDay() {
    suppressCopyRef.current = true
    const seed = cloneSeedItinerary()
    const fresh = seed.find((d) => d.day === day.day) || seed[dayIndex]
    setDays((prev) => prev.map((d, i) => (i === dayIndex ? structuredClone(fresh) : d)))
    setSelectedPlaceId(null)
  }

  function handleResetAll() {
    suppressCopyRef.current = true
    setDays(cloneSeedItinerary())
    setCustomPlaces({})
    setSelectedPlaceId(null)
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <header className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[linear-gradient(135deg,rgba(28,36,32,0.92),rgba(74,99,86,0.88))] px-6 py-10 text-[var(--paper)] shadow-[var(--shadow)] sm:px-10 sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            mixBlendMode: 'luminosity',
          }}
        />
        <div className="relative max-w-2xl animate-fade-up">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--gold)]">Autumn Escape</p>
          <h1 className="font-display mt-2 text-5xl leading-none sm:text-6xl md:text-7xl">
            Paris Tour
          </h1>
          <p className="mt-4 max-w-lg text-base text-[var(--paper)]/85 sm:text-lg">
            温哥华往返 · 秋季七日。节奏留白，每日从咖啡馆开始；香榭丽舍与凯旋门在列，卢浮宫与凡尔赛留作回忆。
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">9 月中旬 – 10 月初</span>
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">市内地铁 + 步行</span>
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">一日迪士尼 · 一日自驾</span>
          </div>
        </div>
      </header>

      <main className="mt-10 space-y-12">
        <FlightPanel />
        <HotelPicker
          selected={hotel}
          candidates={hotelCandidates}
          days={days}
          onSelect={setHotel}
          onCandidatesChange={setHotelCandidates}
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--stone)]">Itinerary</p>
              <h2 className="font-display text-3xl">七日行程</h2>
              <p className="mt-1 text-sm text-[var(--stone)]">
                拖拽排序、增删地点；步行距离与标题会随行程自动更新。
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetAll}
              className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)]"
            >
              恢复全部默认行程
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d, i) => (
              <button
                key={d.day}
                type="button"
                onClick={() => {
                  setDayIndex(i)
                  setSelectedPlaceId(null)
                }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${
                  i === dayIndex
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'bg-white/70 text-[var(--ink)] hover:bg-white'
                }`}
              >
                D{d.day} {d.title}
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <DayTimeline
              key={`timeline-${day.day}-${hotel.id}`}
              day={day}
              hotel={hotel}
              customPlaces={placesWithHotel}
              selectedPlaceId={selectedPlaceId}
              navPlan={navPlan}
              navLoading={navLoading}
              copyRefreshing={copyRefreshing}
              onSelectPlace={setSelectedPlaceId}
              onReorder={handleReorder}
              onDelete={handleDelete}
              onAddCustom={handleAddCustom}
              onResetDay={handleResetDay}
              tripPlaceNames={tripPlaceNames}
            />
            <div className="space-y-4">
              <TripMap
                key={`map-${day.day}-${hotel.id}-${dayPlacesKey}`}
                hotel={hotel}
                day={day}
                customPlaces={placesWithHotel}
                navPlan={navPlan}
                navLoading={navLoading}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={setSelectedPlaceId}
              />
              <PlacePanel
                placeId={selectedPlaceId}
                customPlaces={placesWithHotel}
                day={day}
                hotel={hotel}
                days={days}
                onClose={() => setSelectedPlaceId(null)}
              />
            </div>
          </div>
        </section>

        <footer className="rounded-2xl border border-white/60 bg-[var(--card)] px-4 py-5 text-sm text-[var(--stone)]">
          <p>
            航班与营业信息会变动；餐厅评分以 Google Maps 实时为准。自驾日请确认低排放区（Crit’Air）与租车保险。
          </p>
        </footer>
      </main>

      <TripChatPanel
        hotel={hotel}
        hotelCandidates={hotelCandidates}
        days={days}
        currentDay={day.day}
        customPlaces={placesWithHotel}
        handlers={{
          switchDay: handleSwitchDay,
          selectPlace: setSelectedPlaceId,
          removeStop: handleDeleteOnDay,
          addPlace: handleAddOnDay,
          replaceStop: handleReplaceOnDay,
          reorderStop: handleReorderOnDay,
          setHotel,
          setHotelCandidates,
        }}
      />
    </div>
  )
}
