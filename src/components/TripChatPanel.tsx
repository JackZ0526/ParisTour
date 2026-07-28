import { useEffect, useRef, useState } from 'react'
import {
  fetchGooglePlaceDetails,
} from '../services/googlePlaceDetails'
import {
  generatePlaceDescription,
  getOpenAIModelLabel,
  isLlmConfigured,
} from '../services/llm'
import {
  persistHotelState,
  refreshHotelCandidates,
  replaceHotelCandidates,
  replaceOneHotelCandidate,
} from '../services/hotelRecommend'
import { candidateToSelected, resolveHotelCandidate } from '../services/hotelResolve'
import {
  matchHotelCandidate,
  matchPlaceInDay,
  sendTripChatMessage,
  type TripChatAction,
  type TripChatTurn,
} from '../services/tripChat'
import type { DayPlan, HotelCandidate, Place, PlaceType, SelectedHotel } from '../types'
import { useGoogleMapsReady } from './GoogleMapsProvider'
import { ButtonSpinner, LoadingIndicator } from './LoadingIndicator'

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'

export interface TripChatHandlers {
  switchDay: (day: number) => void
  selectPlace: (placeId: string) => void
  removeStop: (day: number, stopId: string) => void
  addPlace: (
    day: number,
    place: Place,
    options?: { mode?: 'best' | 'end'; insertAt?: number },
  ) => void
  replaceStop: (day: number, stopId: string, place: Place) => void
  reorderStop: (day: number, from: number, to: number) => void
  setHotel: (hotel: SelectedHotel) => void
  setHotelCandidates: (candidates: HotelCandidate[]) => void
}

interface Props {
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  days: DayPlan[]
  currentDay: number
  customPlaces: Record<string, Place>
  handlers: TripChatHandlers
}

const SUGGESTIONS = [
  '介绍一下当前选中的酒店',
  '按左岸、中档重新推荐一批酒店',
  '介绍一下今天行程里的第一个地点',
  '帮我在今天加上一家附近的咖啡馆',
  '把凯旋门从行程里删掉',
]

export function TripChatPanel({
  hotel,
  hotelCandidates,
  days,
  currentDay,
  customPlaces,
  handlers,
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<TripChatTurn[]>([])
  const [actionNotes, setActionNotes] = useState<string[]>([])
  const [panelMounted, setPanelMounted] = useState(false)
  const [panelEntered, setPanelEntered] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const wasOpenRef = useRef(false)

  // Keep the panel mounted through the close animation so exit can play.
  useEffect(() => {
    if (open) {
      setPanelMounted(true)
      return
    }
    setPanelEntered(false)
  }, [open])

  useEffect(() => {
    if (!panelMounted || !open) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [panelMounted, open])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    // Jump instantly when opening so we don't animate through the whole history.
    const behavior: ScrollBehavior = wasOpenRef.current ? 'smooth' : 'auto'
    wasOpenRef.current = true
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [history, actionNotes, busy, open])

  async function buildPlaceFromQuery(input: {
    placeName: string
    placeType?: PlaceType
    note?: string
    dayNum: number
  }): Promise<Place> {
    if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试添加地点。')

    const details = await fetchGooglePlaceDetails(`${input.placeName} Paris`)
    if (!details?.location) {
      throw new Error(`找不到地点「${input.placeName}」，请换个更完整的名称。`)
    }

    const placeType: PlaceType = input.placeType || 'attraction'
    let description =
      input.note ||
      details.summary ||
      `${details.name}，适合安排进第 ${input.dayNum} 天行程。`

    if (isLlmConfigured() && !input.note) {
      const blurb = await generatePlaceDescription({
        name: details.name,
        type: placeType,
        address: details.address,
        googleSummary: details.summary,
      })
      if (blurb) description = blurb
    }

    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: details.name,
      type: placeType,
      description,
      ratingHint: details.rating ? `Google ${details.rating}` : 'Google 地点',
      image: details.photos[0] || FALLBACK_IMAGE,
      location: details.location,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.name + ' Paris')}`,
      durationHint: placeType === 'cafe' ? '45 分钟' : '90 分钟',
    }
  }

  async function resolveAddHotel(
    action: Extract<TripChatAction, { type: 'add_hotel' }>,
    workingCandidates: HotelCandidate[],
    workingHotel: SelectedHotel,
  ): Promise<{ note: string; candidates: HotelCandidate[]; hotel: SelectedHotel }> {
    if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试添加酒店。')

    const existing = matchHotelCandidate(workingCandidates, action.hotelName)
    if (existing) {
      const selectedHotel = candidateToSelected(existing)
      if (action.select !== false) {
        handlers.setHotel(selectedHotel)
        persistHotelState(workingCandidates, selectedHotel)
        return {
          note: `候选项里已有「${existing.name}」，已设为当前酒店`,
          candidates: workingCandidates,
          hotel: selectedHotel,
        }
      }
      return {
        note: `候选项里已有「${existing.name}」`,
        candidates: workingCandidates,
        hotel: workingHotel,
      }
    }

    const card = await resolveHotelCandidate({
      name: action.hotelName,
      source: 'custom',
    })
    const next = [card, ...workingCandidates]
    handlers.setHotelCandidates(next)
    const selectedHotel = candidateToSelected(card)
    if (action.select !== false) {
      handlers.setHotel(selectedHotel)
      persistHotelState(next, selectedHotel)
      return {
        note: `已添加酒店「${card.name}」并设为当前住宿`,
        candidates: next,
        hotel: selectedHotel,
      }
    }
    persistHotelState(next, workingHotel)
    return {
      note: `已添加酒店候选项「${card.name}」`,
      candidates: next,
      hotel: workingHotel,
    }
  }

  async function resolveAddPlace(action: Extract<TripChatAction, { type: 'add_place' }>) {
    const dayNum = action.day || currentDay
    const place = await buildPlaceFromQuery({
      placeName: action.placeName,
      placeType: action.placeType,
      note: action.note,
      dayNum,
    })
    // Non-replace adds always prefer 最顺路 unless user asked for the end.
    const mode = action.mode === 'end' ? 'end' : 'best'
    handlers.addPlace(dayNum, place, { mode })
    return mode === 'end'
      ? `已将「${place.name}」加到第 ${dayNum} 天末尾`
      : `已将「${place.name}」按最顺路插入第 ${dayNum} 天`
  }

  async function resolveReplacePlace(
    action: Extract<TripChatAction, { type: 'replace_place' }>,
    workingDays: DayPlan[],
    activeDay: number,
  ) {
    const dayNum = action.day || activeDay
    const day = workingDays.find((d) => d.day === dayNum)
    if (!day) throw new Error(`没有第 ${dayNum} 天`)

    const hit = matchPlaceInDay(day, customPlaces, action.fromPlaceName)
    if (!hit) throw new Error(`第 ${dayNum} 天没有「${action.fromPlaceName}」`)

    const place = await buildPlaceFromQuery({
      placeName: action.toPlaceName,
      placeType: action.placeType || hit.place.type,
      note: action.note,
      dayNum,
    })

    handlers.replaceStop(dayNum, hit.stopId, place)
    return {
      note: `已将第 ${dayNum} 天的「${hit.place.name}」替换为「${place.name}」（仍在第 ${hit.stopIndex + 1} 位）`,
      dayNum,
      removedIndex: hit.stopIndex,
      newPlace: place,
      oldStopId: hit.stopId,
    }
  }

  async function applyActions(actions: TripChatAction[]) {
    const notes: string[] = []
    let workingDays = days.map((d) => ({ ...d, stops: [...d.stops] }))
    let workingCandidates = [...hotelCandidates]
    let workingHotel = hotel
    let activeDay = currentDay

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      try {
        if (action.type === 'switch_day') {
          activeDay = action.day
          handlers.switchDay(action.day)
          notes.push(`已切换到第 ${action.day} 天`)
          continue
        }

        if (action.type === 'select_place') {
          const day = workingDays.find((d) => d.day === activeDay) || workingDays[0]
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(
              `当前第 ${activeDay} 天没有「${action.placeName}」。若要改其它天，请明确说「第N天」。`,
            )
            continue
          }
          handlers.selectPlace(hit.placeId)
          notes.push(`已选中「${hit.place.name}」`)
          continue
        }

        if (action.type === 'remove_place') {
          const dayNum = action.day || activeDay
          const next = actions[i + 1]
          // Coalesce remove+add into in-place replace (keeps original slot).
          if (
            next?.type === 'add_place' &&
            (next.day || activeDay) === dayNum
          ) {
            const result = await resolveReplacePlace(
              {
                type: 'replace_place',
                day: dayNum,
                fromPlaceName: action.placeName,
                toPlaceName: next.placeName,
                placeType: next.placeType,
                note: next.note,
              },
              workingDays,
              activeDay,
            )
            workingDays = workingDays.map((d) => {
              if (d.day !== result.dayNum) return d
              const stops = [...d.stops]
              const idx = result.removedIndex
              if (idx < 0 || idx >= stops.length) return d
              stops[idx] = {
                ...stops[idx],
                id: `d${d.day}-${result.newPlace.id}-replaced`,
                placeId: result.newPlace.id,
                note: result.newPlace.description,
              }
              return { ...d, stops }
            })
            notes.push(result.note)
            i += 1
            continue
          }

          const day = workingDays.find((d) => d.day === dayNum)
          if (!day) {
            notes.push(`没有第 ${dayNum} 天`)
            continue
          }
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(`第 ${dayNum} 天没有「${action.placeName}」`)
            continue
          }
          handlers.removeStop(dayNum, hit.stopId)
          workingDays = workingDays.map((d) =>
            d.day === dayNum
              ? { ...d, stops: d.stops.filter((_, stopIdx) => stopIdx !== hit.stopIndex) }
              : d,
          )
          notes.push(`已从第 ${dayNum} 天移除「${hit.place.name}」`)
          continue
        }

        if (action.type === 'replace_place') {
          const result = await resolveReplacePlace(action, workingDays, activeDay)
          workingDays = workingDays.map((d) => {
            if (d.day !== result.dayNum) return d
            const stops = [...d.stops]
            const idx = result.removedIndex
            if (idx < 0 || idx >= stops.length) return d
            stops[idx] = {
              ...stops[idx],
              id: `d${d.day}-${result.newPlace.id}-replaced`,
              placeId: result.newPlace.id,
              note: result.newPlace.description,
            }
            return { ...d, stops }
          })
          notes.push(result.note)
          continue
        }

        if (action.type === 'reorder_place') {
          const dayNum = action.day || activeDay
          const day = workingDays.find((d) => d.day === dayNum)
          if (!day) {
            notes.push(`没有第 ${dayNum} 天`)
            continue
          }
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(`第 ${dayNum} 天没有「${action.placeName}」`)
            continue
          }
          const to = Math.min(action.toIndex, Math.max(0, day.stops.length - 1))
          handlers.reorderStop(dayNum, hit.stopIndex, to)
          notes.push(`已将「${hit.place.name}」调整到第 ${dayNum} 天第 ${to + 1} 位`)
          continue
        }

        if (action.type === 'add_place') {
          const dayNum = action.day || activeDay
          const note = await resolveAddPlace({
            ...action,
            day: dayNum,
          })
          notes.push(note)
          continue
        }

        if (action.type === 'select_hotel') {
          const hit = matchHotelCandidate(workingCandidates, action.hotelName)
          if (!hit) {
            notes.push(`候选项里没有「${action.hotelName}」，可让我用 add_hotel 添加`)
            continue
          }
          const selectedHotel = candidateToSelected(hit)
          handlers.setHotel(selectedHotel)
          persistHotelState(workingCandidates, selectedHotel)
          workingHotel = selectedHotel
          notes.push(`已将住宿切换为「${hit.name}」`)
          continue
        }

        if (action.type === 'add_hotel') {
          const result = await resolveAddHotel(action, workingCandidates, workingHotel)
          workingCandidates = result.candidates
          workingHotel = result.hotel
          notes.push(result.note)
          continue
        }

        if (action.type === 'remove_hotel') {
          const hit = matchHotelCandidate(workingCandidates, action.hotelName)
          if (!hit) {
            notes.push(`候选项里没有「${action.hotelName}」`)
            continue
          }
          if (workingCandidates.length <= 1) {
            notes.push('至少保留一家酒店候选项')
            continue
          }
          const next = workingCandidates.filter((h) => h.id !== hit.id)
          handlers.setHotelCandidates(next)
          workingCandidates = next
          if (workingHotel.id === hit.id) {
            const fallback = next.find((h) => h.isBest) || next[0]
            const selectedHotel = candidateToSelected(fallback)
            handlers.setHotel(selectedHotel)
            persistHotelState(next, selectedHotel)
            workingHotel = selectedHotel
            notes.push(`已移除「${hit.name}」，并改选「${fallback.name}」`)
          } else {
            persistHotelState(next, workingHotel)
            notes.push(`已从候选项移除「${hit.name}」`)
          }
          continue
        }

        if (action.type === 'refresh_hotels') {
          if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试推荐酒店。')
          const result = await refreshHotelCandidates({
            current: workingCandidates,
            preferences: action.preferences,
            keepCustom: action.keepCustom,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(
            action.preferences?.trim()
              ? `已按「${action.preferences.trim()}」重新推荐 ${result.candidates.filter((c) => c.source === 'llm').length} 家酒店，并选中「${result.selected.name}」`
              : `已重新推荐一批酒店，并选中「${result.selected.name}」`,
          )
          continue
        }

        if (action.type === 'replace_hotel') {
          if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试替换酒店。')
          const from = matchHotelCandidate(workingCandidates, action.fromHotelName)
          if (!from) {
            notes.push(`候选项里没有「${action.fromHotelName}」`)
            continue
          }
          const result = await replaceOneHotelCandidate({
            current: workingCandidates,
            selected: workingHotel,
            from,
            toHotelName: action.toHotelName,
            preferences: action.preferences,
            select: action.select,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(result.note)
          continue
        }

        if (action.type === 'replace_hotels') {
          if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试替换酒店。')
          const fromHotels: HotelCandidate[] = []
          for (const name of action.fromHotelNames) {
            const hit = matchHotelCandidate(workingCandidates, name)
            if (!hit) {
              notes.push(`候选项里没有「${name}」`)
              continue
            }
            if (!fromHotels.some((h) => h.id === hit.id)) fromHotels.push(hit)
          }
          if (!fromHotels.length) continue
          const result = await replaceHotelCandidates({
            current: workingCandidates,
            selected: workingHotel,
            fromHotels,
            preferences: action.preferences,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(result.note)
        }
      } catch (err) {
        notes.push(err instanceof Error ? err.message : '操作失败')
      }
    }

    return notes
  }

  async function submit(text: string) {
    const message = text.trim()
    if (!message || busy) return
    if (!isLlmConfigured()) {
      setError('未配置 OpenAI API Key，无法对话。')
      return
    }

    setBusy(true)
    setError(null)
    setActionNotes([])
    setInput('')
    setHistory((prev) => [...prev, { role: 'user', content: message }])

    try {
      const result = await sendTripChatMessage({
        ctx: {
          hotel,
          hotelCandidates,
          days,
          currentDay,
          customPlaces,
        },
        history,
        userMessage: message,
      })

      setHistory((prev) => [...prev, { role: 'assistant', content: result.reply }])
      if (result.actions.length) {
        const notes = await applyActions(result.actions)
        setActionNotes(notes)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[2000] rounded-full bg-[var(--ink)] px-3.5 py-3 text-sm font-medium text-[var(--paper)] shadow-[var(--shadow)] transition hover:bg-[var(--sage)] sm:bottom-5 sm:right-5 sm:px-4"
      >
        <span className="sm:hidden">{open ? '关闭' : '助手'}</span>
        <span className="hidden sm:inline">{open ? '关闭助手' : '行程助手'}</span>
      </button>

      {panelMounted && (
        <button
          type="button"
          aria-label="关闭行程助手"
          className={`fixed inset-0 z-[1999] bg-black/45 transition-opacity duration-300 sm:hidden ${
            panelEntered ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setOpen(false)}
        />
      )}

      {panelMounted && (
        <div
          role="dialog"
          aria-label="行程助手"
          aria-hidden={!open}
          inert={!open || undefined}
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return
            if (!open) setPanelMounted(false)
          }}
          className={`fixed z-[2000] flex flex-col overflow-hidden border border-white/70 bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] inset-x-0 bottom-0 h-[min(85dvh,640px)] w-full rounded-t-3xl sm:inset-x-auto sm:bottom-20 sm:right-5 sm:h-[min(70vh,560px)] sm:w-[min(92vw,380px)] sm:rounded-2xl ${
            panelEntered
              ? 'translate-x-0 translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-6 opacity-0 sm:translate-x-2 sm:translate-y-3'
          }`}
        >
          <div className="border-b border-[var(--mist)] px-4 py-3">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--mist)] sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-xl leading-tight">行程助手</h3>
                <p className="mt-0.5 text-xs text-[var(--stone)]">
                  当前第 {currentDay} 天 · {getOpenAIModelLabel()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-2.5 py-1 text-sm text-[var(--stone)] hover:bg-[var(--mist)] hover:text-[var(--ink)] sm:hidden"
                aria-label="关闭助手"
              >
                关闭
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
            {!history.length && (
              <div className="space-y-2">
                <p className="text-sm text-[var(--stone)]">
                  试试问我：介绍酒店、换一批住宿、介绍今天地点、加咖啡馆，或删改行程。
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => void submit(s)}
                      className="rounded-full bg-[var(--mist)] px-2.5 py-1 text-left text-xs text-[var(--ink)] hover:bg-[var(--sage)]/20 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((turn, i) => (
              <div
                key={`${turn.role}-${i}`}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  turn.role === 'user'
                    ? 'ml-auto bg-[var(--ink)] text-[var(--paper)]'
                    : 'bg-white/80 text-[var(--ink)]'
                }`}
              >
                {turn.content}
              </div>
            ))}

            {!!actionNotes.length && (
              <ul className="space-y-1 rounded-xl bg-[var(--sage)]/10 px-3 py-2 text-xs text-[var(--sage)]">
                {actionNotes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            )}

            {busy && (
              <div className="rounded-2xl bg-white/80 px-3 py-2">
                <LoadingIndicator label="助手思考中…" showDots size="sm" mode="thinking" />
              </div>
            )}
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-[var(--mist)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault()
              void submit(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="跟我说你想怎么改行程…"
              disabled={busy || !open}
              tabIndex={open ? undefined : -1}
              aria-busy={busy || undefined}
              className="min-w-0 flex-1 rounded-full border border-[var(--ink)]/10 bg-white/80 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim() || !open}
              tabIndex={open ? undefined : -1}
              aria-busy={busy || undefined}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--sage)] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? (
                <>
                  <ButtonSpinner mode="thinking" />
                  思考中
                </>
              ) : (
                '发送'
              )}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
