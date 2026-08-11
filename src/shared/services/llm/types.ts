/**
 * Public type definitions used across the LLM layer.
 *
 * Lives in its own file so every other llm/* module can import from one
 * place without dragging in transport / business code.
 */

export type LlmProvider = 'openai' | 'gemini'

export type ThinkingMode = 'auto' | 'off' | 'low' | 'medium' | 'high'

export type ThinkingEffortUi = 'low' | 'medium' | 'high'

export type ResolvedThinkingEffort = 'off' | ThinkingEffortUi

export type DeepSeekReasoningEffort = 'low' | 'high' | 'max'

export type OpenAIReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export type ThinkingToggle = 'auto' | 'off' | 'on'

export type LlmBusyVisual = 'thinking' | 'generating'

/**
 * Call-site task kinds for 「自动」 baselines.
 * Annotate major LLM entry points so auto mode can pick a sensible default.
 */
export type LlmTaskKind =
  | 'default'
  | 'tripChat'
  | 'dayCopy'
  | 'translate'
  | 'placeRecommend'
  | 'placeDescription'
  | 'placeDetail'
  | 'placeName'
  | 'placeReviews'
  | 'hotelRecommend'
  | 'hotelDetail'
  | 'itineraryGenerate'
  | 'itineraryDayGenerate'
  | 'itineraryStart'
  | 'destinationSuggest'
  | 'router'

export type ResolvedThinking = {
  enabled: boolean
  effort: ResolvedThinkingEffort
  /**
   * Where the classifier resolution came from.
   * - auto: derived from UI mode + task heuristics / classifier
   * - manual: explicitly chosen by the user (low/medium/high/off)
   */
  source?: 'auto' | 'manual'
  /** Classifier-inferred "we should not think" override, even when mode=on. */
  overrideToOff?: boolean
}

export type OpenAIChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ChatCallOptions = {
  task?: LlmTaskKind
  /** Public (non-secret) model id override. */
  model?: string
  userText?: string
  signal?: AbortSignal
  /** Explicit thinking resolution; when omitted, derived from UI mode + task. */
  thinking?: ResolvedThinking
  /** Skip the semantic preflight router (used by the router itself). */
  preflight?: boolean
  /** Context blob for the preflight classifier (trimmed before send). */
  preflightContext?: unknown
  /** Force OpenAI-style `response_format: json_object`. */
  responseFormat?: 'json_object'
  /**
   * Web research:
   * - chat Completions + preflight: true force research injection / false forbid / 'auto' let preflight decide
   * - DeepSeek Responses itinerary: true|'auto'|omit = expose `web_search` with `tool_choice: "auto"` (never forced); false = no tool
   */
  webSearch?: boolean | 'auto'
  /** Force non-streaming JSON mode for a single call. */
  json?: boolean
  /** Return a `string` body (no SSE) — used for compact classifier. */
  plainText?: boolean
  /** Auto-retry on empty / invalid JSON body (default true). */
  retryEmpty?: boolean
  /** Incremental assistant text (Responses / chat stream). */
  onDelta?: (delta: string, fullText: string) => void
}

export type ChatStreamOptions = ChatCallOptions & {
  onDelta?: (delta: string, fullText: string) => void
  /** Optional reasoning token stream for CoT (separated from visible content). */
  onReasoningDelta?: (delta: string, fullReasoning: string) => void
  /** Fires once per emitted web search query (OpenAI Responses API). */
  onWebSearchQuery?: (query: string) => void
}

export interface HotelDetailCopy {
  intro: string
  reason: string
  tripFit: string
}

export interface ItineraryStartInput {
  tripStartDate: string
  tripEndDate?: string | null
  destination?: string
  hotelName?: string | null
  outbound: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  }
  returnFlight?: ItineraryStartInput['outbound'] | null
}

export interface ItineraryStartResult {
  /** Paris local arrival calendar date YYYY-MM-DD */
  arrivalDateParis: string
  /** Paris local arrival time if known, e.g. 14:35 */
  arrivalTimeParis?: string
  /** Calendar date that itinerary Day 1 should map to */
  itineraryStartDate: string
  /** True when Day 1 stays on trip startDate */
  startsOnTripStartDate: boolean
  /** Short Chinese explanation for the itinerary section */
  reasonZh: string
}

export type RecommendPlaceType = 'cafe' | 'attraction' | 'restaurant'

export interface PlaceRecommendation {
  googlePlaceId?: string
  name: string
  nameLocal?: string
  type: RecommendPlaceType
  reason: string
  intro: string
  area?: string
}

export interface VerifiedPlaceCandidate {
  id?: string
  name: string
  type: RecommendPlaceType
  address?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  distanceMeters?: number
}

export interface HotelRecommendation {
  googlePlaceId?: string
  name: string
  area: string
  address?: string
  description: string
  nearestMetro?: string
  priceHint?: string
  reason: string
  isBest: boolean
}

export interface DestinationSuggestion {
  name: string
  subtitle?: string
}

export type PlaceTypeForItinerary =
  | 'cafe'
  | 'attraction'
  | 'restaurant'
  | 'transport'
  | 'hotel'

export interface FullItineraryPlaceDraft {
  key: string
  googlePlaceId?: string
  name: string
  nameLocal?: string
  type: PlaceTypeForItinerary
  area?: string
  description?: string
  ratingHint?: string
  durationHint?: string
}

export interface FullItineraryStopDraft {
  time: string
  placeKey: string
  note: string
  transport?: string
  walkLevel?: '很少走' | '短步行' | '中等步行'
  duration?: string
}

export interface FullItineraryDayDraft {
  day: number
  title: string
  theme: string
  pace: '轻松' | '适中' | '乐园日' | '自驾日'
  summary: string
  metroHintFromArea?: Record<string, string>
  stops: FullItineraryStopDraft[]
}

export interface FullItineraryDraft {
  days: FullItineraryDayDraft[]
  places: FullItineraryPlaceDraft[]
}

export interface GenerateFullItineraryInput {
  destination: string
  dayCount: number
  tripStartDate: string
  tripEndDate: string
  itineraryStartDate: string
  nights?: number
  hotel: {
    name: string
    address: string
    area?: string
    areaKey?: string
    lat: number
    lng: number
    nearestMetro?: string
  }
  outbound?: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  } | null
  returnFlight?: GenerateFullItineraryInput['outbound'] | null
  preferences?: string
  recommendationPreferences: import('../../../features/place/services/recommendationPreferences').RecommendationPreferences
  verifiedCandidates: VerifiedPlaceCandidate[]
}

export interface OccupiedPlaceBrief {
  name: string
  placeId?: string
}

export interface GenerateSingleDayItineraryInput {
  destination: string
  dayCount: number
  /** Day number (1-based) being regenerated. */
  dayNumber: number
  tripStartDate: string
  tripEndDate: string
  itineraryStartDate: string
  /** Optional ISO date for the day being regenerated (timezone-aware). */
  calendarDate?: string
  nights?: number
  hotel: GenerateFullItineraryInput['hotel']
  outbound?: GenerateFullItineraryInput['outbound']
  returnFlight?: GenerateFullItineraryInput['returnFlight']
  preferences?: string
  recommendationPreferences: GenerateFullItineraryInput['recommendationPreferences']
  verifiedCandidates: VerifiedPlaceCandidate[]
  /** Already-placed places (other days + same day minus deleted) used for de-dup. */
  occupiedPlaces: OccupiedPlaceBrief[]
}

export interface SingleDayItineraryDraft {
  days: FullItineraryDayDraft[]
  places: FullItineraryPlaceDraft[]
}

// Local re-import to keep the type self-contained.
// (No runtime cost — types are erased.)
import type { FlightInfo } from '../../../types'
