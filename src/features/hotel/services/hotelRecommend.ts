import { runtimeCopy } from '../../../shared/i18n/copy/hotelRecommend-runtime-cb1951'
import { getOpenAIModel, recommendHotelsForTrip } from '../../../shared/services/llm/llm'
import { translate } from '../../../shared/i18n'
import { clearLlmMemo } from '../../../shared/services/llm/llmMemo'
import { hotelSelectionFingerprint, loadHotelCache, saveHotelCache } from './hotelCache'
import {
  candidateToSelected,
  resolveHotelCandidate,
  resolveHotelCandidates,
} from './hotelResolve'
import type { HotelCandidate, SelectedHotel } from '../../../types'
import { searchBookingHotelCandidates } from './bookingHotels'
import { loadTripDates } from '../../itinerary/services/tripDates'
import { isHotelSelected } from '../constants/hotels'

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
  // When a real hotel is selected, "其他候选项" must default to collapsed so
  // the picker surface stays compact. Callers can still force the list open
  // by passing options.othersCollapsed = false (e.g. after clearing selection).
  const hasRealSelection = isHotelSelected(selected)
  const othersCollapsed =
    options?.othersCollapsed !== undefined
      ? options.othersCollapsed
      : hasRealSelection
        ? true
        : Boolean(prev?.othersCollapsed)
  const sameSelection =
    hotelSelectionFingerprint(prev?.candidates || [], prev?.selected?.id) ===
    hotelSelectionFingerprint(candidates, selected?.id)
  saveHotelCache({
    candidates,
    selected,
    model: getOpenAIModel(),
    batch: 1,
    fetchedAt: sameSelection ? prev?.fetchedAt ?? Date.now() : Date.now(),
    lastPreferences,
    othersCollapsed,
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
    throw new Error(translate('errors.pickTripDatesFirstHotels'))
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
    throw new Error(translate('errors.bookingNoCandidates'))
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
    throw new Error(translate('errors.couldNotParseHotels'))
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
      reason: runtimeCopy('m64daac63aa', { p0: (from.name) }),
    })
  } else {
    const [card] = await fetchResolvedHotelRecommendations({
      count: 1,
      batch: 2,
      excludeNames: input.current.map((c) => c.name),
      preferences:
        input.preferences?.trim() ||
        runtimeCopy('m770bb9ca1c', { p0: (from.name), p1: (from.area) }),
    })
    if (!card) throw new Error(translate('errors.couldNotGenerateReplacement'))
    replacement = {
      ...card,
      reason: card.reason || runtimeCopy('m64daac63aa', { p0: (from.name) }),
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
      note: runtimeCopy('mf43c61089f', { p0: (from.name), p1: (replacement.name) }),
    }
  }

  const prevBest =
    next.find((h) => h.id === input.selected.id) || next.find((h) => h.isBest) || next[0]
  const marked = markBest(next, prevBest.id)
  persistHotelState(marked, selected)
  return {
    candidates: marked,
    selected,
    note: runtimeCopy('me40ebbb363', { p0: (from.name), p1: (replacement.name) }),
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
    throw new Error(translate('errors.noReplacementAvailable'))
  }

  const exclude = input.current.map((c) => c.name)
  const fresh = await fetchResolvedHotelRecommendations({
    count: input.fromHotels.length,
    batch: 2,
    excludeNames: exclude,
    preferences:
      input.preferences?.trim() ||
      runtimeCopy('m5779a99596', { p0: (input.fromHotels.map((h) => h.name).join('、')) }),
  })

  if (fresh.length < input.fromHotels.length) {
    throw new Error(translate('errors.notEnoughReplacements'))
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
      note: runtimeCopy('m746a60b63f', { p0: (input.fromHotels.length), p1: (pick.name) }),
    }
  }

  const prevBest = next.find((h) => h.id === input.selected.id) || next.find((h) => h.isBest) || next[0]
  const marked = markBest(next, prevBest.id)
  persistHotelState(marked, selected)
  return {
    candidates: marked,
    selected,
    note: runtimeCopy('md2bdc9d5dd', { p0: (input.fromHotels.length) }),
  }
}
