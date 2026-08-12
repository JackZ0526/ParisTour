import { getOpenAIModel, recommendHotelsForTrip } from '../../../shared/services/llm/llm'
import { clearLlmMemo } from '../../../shared/services/llm/llmMemo'
import { loadHotelCache, saveHotelCache } from './hotelCache'
import {
  candidateToSelected,
  resolveHotelCandidate,
  resolveHotelCandidates,
} from './hotelResolve'
import type { HotelCandidate, SelectedHotel } from '../../../types'
import { searchBookingHotelCandidates } from './bookingHotels'
import { loadTripDates } from '../../itinerary/services/tripDates'

export function persistHotelState(
  candidates: HotelCandidate[],
  selected: SelectedHotel | null,
  options?: { lastPreferences?: string | null; othersCollapsed?: boolean },
) {
  const prev = loadHotelCache()
  const lastPreferences =
    options?.lastPreferences === null
      ? undefined
      : options?.lastPreferences?.trim() || prev?.lastPreferences
  saveHotelCache({
    candidates,
    selected,
    model: getOpenAIModel(),
    batch: 1,
    fetchedAt: Date.now(),
    lastPreferences,
    othersCollapsed:
      options?.othersCollapsed !== undefined
        ? options.othersCollapsed
        : Boolean(prev?.othersCollapsed),
  })
}

function markBest(candidates: HotelCandidate[], bestId: string): HotelCandidate[] {
  return candidates.map((h) => ({ ...h, isBest: h.id === bestId }))
}

/** Fresh LLM batch selected only from Booking-verified Paris hotels. */
export async function fetchResolvedHotelRecommendations(input?: {
  count?: number
  batch?: number
  excludeNames?: string[]
  preferences?: string
  /** Itinerary daytime day count when known */
  dayCount?: number
}): Promise<HotelCandidate[]> {
  const count = Math.max(1, Math.min(8, input?.count || 5))
  const excluded = new Set(
    (input?.excludeNames || []).map((name) => name.trim().toLowerCase()),
  )
  const dates = loadTripDates()
  if (!dates?.startDate || !dates.endDate) {
    throw new Error('请先选择行程日期，再获取 Booking 酒店推荐。')
  }
  const verifiedCandidates = (
    await searchBookingHotelCandidates({
      startDate: dates.startDate,
      endDate: dates.endDate,
      limit: 20,
    })
  )
    .filter((candidate) => !excluded.has(candidate.name.trim().toLowerCase()))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      address: candidate.address,
      rating: candidate.rating,
      userRatingCount: candidate.reviewCount,
    }))
  if (!verifiedCandidates.length) {
    throw new Error('Booking 暂时没有返回可验证的巴黎酒店候选。')
  }
  const raw = await recommendHotelsForTrip({
    count,
    batch: input?.batch || 1,
    excludeNames: input?.excludeNames,
    preferences: input?.preferences,
    dayCount: input?.dayCount,
    verifiedCandidates,
  })
  const resolved = await resolveHotelCandidates(raw.slice(0, count))
  if (!resolved.length) {
    throw new Error('未能解析推荐酒店，请再试一次。')
  }
  const best = resolved.find((h) => h.isBest) || resolved[0]
  return markBest(resolved, best.id)
}

export async function refreshHotelCandidates(input: {
  current: HotelCandidate[]
  preferences?: string
  keepCustom?: boolean
  dayCount?: number
}): Promise<{ candidates: HotelCandidate[]; selected: SelectedHotel }> {
  const keepCustom = input.keepCustom !== false
  const customs = keepCustom
    ? input.current.filter((c) => c.source === 'custom')
    : []
  const exclude = input.current.map((c) => c.name)
  const llmCards = await fetchResolvedHotelRecommendations({
    count: 5,
    batch: 2,
    excludeNames: exclude,
    preferences: input.preferences,
    dayCount: input.dayCount,
  })
  const best = llmCards.find((h) => h.isBest) || llmCards[0]
  const candidates = [
    ...llmCards,
    ...customs.filter((c) => !llmCards.some((l) => l.name === c.name)),
  ]
  const selected = candidateToSelected(best)
  // New batch uses new candidate ids; drop in-memory memos only.
  // Keep durable hotel-detail artifacts so a deleted custom hotel can reuse its advisor copy.
  clearLlmMemo('hotel-detail:')
  persistHotelState(candidates, selected, {
    lastPreferences: input.preferences?.trim() || null,
  })
  return { candidates, selected }
}

/** Replace one list item by explicit name or by preference-driven recommendation. */
export async function replaceOneHotelCandidate(input: {
  current: HotelCandidate[]
  selected: SelectedHotel
  from: HotelCandidate
  toHotelName?: string
  preferences?: string
  /** Force selecting the replacement (default: only if replacing current stay). */
  select?: boolean
}): Promise<{ candidates: HotelCandidate[]; selected: SelectedHotel; note: string }> {
  const from = input.from

  let replacement: HotelCandidate
  if (input.toHotelName?.trim()) {
    replacement = await resolveHotelCandidate({
      name: input.toHotelName.trim(),
      source: 'custom',
      reason: `替换「${from.name}」`,
    })
  } else {
    const [card] = await fetchResolvedHotelRecommendations({
      count: 1,
      batch: 2,
      excludeNames: input.current.map((c) => c.name),
      preferences:
        input.preferences?.trim() ||
        `替换「${from.name}」（${from.area}），给一家更合适的巴黎酒店`,
    })
    if (!card) throw new Error('未能生成替换酒店')
    replacement = {
      ...card,
      reason: card.reason || `替换「${from.name}」`,
      isBest: false,
    }
  }

  const next = input.current.map((h) => (h.id === from.id ? replacement : h))
  const wasSelected = input.selected.id === from.id
  const shouldSelect = wasSelected || input.select === true
  let selected = input.selected

  if (shouldSelect) {
    selected = candidateToSelected(replacement)
    const marked = markBest(next, replacement.id)
    persistHotelState(marked, selected)
    return {
      candidates: marked,
      selected,
      note: `已将「${from.name}」换成「${replacement.name}」，并设为当前住宿`,
    }
  }

  const prevBest =
    next.find((h) => h.id === input.selected.id) || next.find((h) => h.isBest) || next[0]
  const marked = markBest(next, prevBest.id)
  persistHotelState(marked, selected)
  return {
    candidates: marked,
    selected,
    note: `已将「${from.name}」换成「${replacement.name}」`,
  }
}

/** Replace several list items with preference-driven recommendations. */
export async function replaceHotelCandidates(input: {
  current: HotelCandidate[]
  selected: SelectedHotel
  fromHotels: HotelCandidate[]
  preferences?: string
}): Promise<{ candidates: HotelCandidate[]; selected: SelectedHotel; note: string }> {
  if (!input.fromHotels.length) {
    throw new Error('没有可替换的酒店')
  }

  const exclude = input.current.map((c) => c.name)
  const fresh = await fetchResolvedHotelRecommendations({
    count: input.fromHotels.length,
    batch: 2,
    excludeNames: exclude,
    preferences:
      input.preferences?.trim() ||
      `替换这些酒店：${input.fromHotels.map((h) => h.name).join('、')}`,
  })

  if (fresh.length < input.fromHotels.length) {
    throw new Error('替换推荐数量不足，请再试一次')
  }

  const replaceIds = new Set(input.fromHotels.map((h) => h.id))
  let freshIdx = 0
  const next = input.current.map((h) => {
    if (!replaceIds.has(h.id)) return h
    const card = fresh[freshIdx++]
    return { ...card, isBest: false }
  })

  const selectedWasReplaced = replaceIds.has(input.selected.id)
  let selected = input.selected
  if (selectedWasReplaced) {
    const pick = fresh.find((h) => h.isBest) || fresh[0]
    selected = candidateToSelected(pick)
    const marked = markBest(next, pick.id)
    persistHotelState(marked, selected)
    return {
      candidates: marked,
      selected,
      note: `已替换 ${input.fromHotels.length} 家酒店；当前住宿改为「${pick.name}」`,
    }
  }

  const prevBest = next.find((h) => h.id === input.selected.id) || next.find((h) => h.isBest) || next[0]
  const marked = markBest(next, prevBest.id)
  persistHotelState(marked, selected)
  return {
    candidates: marked,
    selected,
    note: `已按你的要求替换 ${input.fromHotels.length} 家酒店`,
  }
}
