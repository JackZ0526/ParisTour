/**
 * Public entry point for the LLM layer.
 *
 * This file is a thin re-export. The actual implementations live in:
 *   - `./types`               — shared types
 *   - `./errors`              — `LlmRequestError`
 *   - `./thinking`            — thinking mode + effort + busy label
 *   - `./model-state`         — global OpenAI/DeepSeek model + thinking state
 *   - `./provider-state`      — OpenAI/Gemini provider switch
 *   - `./stream`              — SSE / partial-JSON helpers + Responses web_search
 *   - `./json`                — lenient JSON object extraction
 *   - `./transport`           — chat-completions HTTP transport (openai / deepseek / gemini)
 *   - `./prompts`             — shared prompt fragments
 *   - `./prompts-runtime`     — preflight (semantic router) + web-research injection
 *   - `./business/*`          — domain-specific LLM call sites
 *
 * External code (features, App.tsx) keeps importing from
 * `'./shared/services/llm/llm'` so this barrel is the only stable surface.
 */

// ── Config re-exports (LLM pickers reference the model ids) ──────────────
export {
  DEEPSEEK_MODEL_IDS,
  DEEPSEEK_MODEL_OPTIONS,
  ENABLE_LLM_PROVIDER_SWITCH,
  OPENAI_MODEL_IDS,
  OPENAI_MODEL_OPTIONS,
  OPENAI_ONLY_MODEL_OPTIONS,
  defaultOpenAIModelFromEnv,
  isLlmConfigured,
  llmStorageKeys,
  type OpenAIModelId,
} from '../../../config/llmModels'

// ── Types ────────────────────────────────────────────────────────────────
export type {
  ChatCallOptions,
  ChatStreamOptions,
  DeepSeekReasoningEffort,
  HotelDetailCopy,
  ItineraryStartInput,
  ItineraryStartResult,
  LlmBusyVisual,
  LlmProvider,
  LlmTaskKind,
  OpenAIChatMessage,
  OpenAIReasoningEffort,
  PlaceRecommendation,
  PlaceTypeForItinerary,
  RecommendPlaceType,
  ResolvedThinking,
  ResolvedThinkingEffort,
  ThinkingEffortUi,
  ThinkingMode,
  ThinkingToggle,
  VerifiedPlaceCandidate,
} from './types'

// ── Errors ───────────────────────────────────────────────────────────────
export { LlmRequestError } from './errors'

// ── Thinking ─────────────────────────────────────────────────────────────
export {
  THINKING_EFFORT_OPTIONS,
  THINKING_MODE_OPTIONS,
  autoEffortToDeepSeekApi,
  deepSeekResponsesReasoning,
  deepSeekThinkingParams,
  isLockedThinkingMode,
  llmBusyDefaultLabel,
  llmBusyLabel,
  resolvedThinkingToDeepSeekApi,
  resolveLlmBusyVisual,
  resolveThinkingForTask,
  thinkingHeuristicDelta,
  uiEffortToApi,
  uiEffortToOpenAI,
} from './thinking'

// ── Model state ─────────────────────────────────────────────────────────
export {
  getActiveLlmLabel,
  getLlmChipSummary,
  getOpenAIModel,
  getOpenAIModelLabel,
  getOpenAIModelShortLabel,
  getThinkingEffort,
  getThinkingEffortLabel,
  getThinkingEnabled,
  getThinkingMode,
  getThinkingModeLabel,
  isDeepSeekModel,
  setOpenAIModel,
  setThinkingEffort,
  setThinkingEnabled,
  setThinkingMode,
  setThinkingToggle,
  subscribeOpenAIModel,
  subscribeThinking,
  supportsThinkingControls,
  thinkingModeToToggle,
} from './model-state'

// ── Provider state ──────────────────────────────────────────────────────
export {
  canSwitchLlmProvider,
  consumeLlmSwitchNotice,
  getLlmProvider,
  getProviderLabel,
  getProviderModelName,
  isProviderConfigured,
  peekLlmSwitchNotice,
  setLlmProvider,
  subscribeLlmProvider,
  toggleLlmProvider,
} from './provider-state'

// ── JSON / streaming helpers ────────────────────────────────────────────
export { extractLlmJsonObject, extractJsonObject } from './json'
export {
  cleanQueryString,
  consumeResponsesStream,
  extractPartialJsonStringArray,
  extractPartialJsonStringField,
  extractWebSearchQueries,
  openaiResponsesWithWebSearch,
  openaiWebSearchModel,
} from './stream'

// ── HTTP transport (chat-completions / streaming / provider dispatch) ──
export {
  buildDeepSeekResponsesBody,
  buildOpenAIChatBody,
  callGemini,
  callOpenAIMessages,
  callOpenAIMessagesStream,
  chatBackendForModel,
  friendlyLlmError,
  openaiChat,
  openaiChatStream,
  openaiUsesRestrictedSampling,
  prepareOpenAIChatBody,
  readResponseJson,
  shouldUseDeepSeekResponses,
} from './transport'

// ── Prompts ─────────────────────────────────────────────────────────────
export {
  buildPrompt,
  jsonContract,
  CAFE_VS_RESTAURANT_RULE,
  COMMON_RULES,
  NO_HALLUCINATION,
  PLACE_RESEARCH_DISCIPLINE,
  ROUTER_EXAMPLES,
} from './prompts'

// ── Preflight + web-research injection ──────────────────────────────────
export {
  addGenericWebResearch,
  resolveModelCallPreflight,
} from './prompts-runtime'

// ── Business call sites (place / hotel / itinerary / destination) ───────
export {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  generateDayCopy,
  recommendPlacesForDay,
  resolveOfficialWebsite,
  resolveTripadvisorRestaurantListing,
  resolveAttractionCanonicalName,
  type AttractionCanonicalName,
} from './business/place'

export {
  generateHotelDetailCopy,
  generateHotelCardBlurb,
  recommendHotelsForTrip,
  regenerateHotelLanguageFields,
  type HotelRecommendation,
} from './business/hotel'

export {
  resolveItineraryStart,
  resolveItineraryStartSync,
  generateFullItinerary,
  generateSingleDayItinerary,
  type FullItineraryPlaceDraft,
  type FullItineraryStopDraft,
  type FullItineraryDayDraft,
  type FullItineraryDraft,
  type GenerateFullItineraryInput,
  type GenerateSingleDayItineraryInput,
  type OccupiedPlaceBrief,
  type SingleDayItineraryDraft,
} from './business/itinerary'

export {
  suggestPopularDestinations,
  type DestinationSuggestion,
} from './business/destination'

export {
  extractPreferenceTags,
} from './business/preference'
