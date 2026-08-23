/**
 * Pure work-step pipeline helpers for the trip chat panel.
 *
 * Owns:
 *   - the pure helpers (initialChatWorkSteps, activateChatWorkStep,
 *     finishChatWorkSteps, completedWorkSummary, searchStepLabel,
 *     requestPlanStepLabel, actionsNeedPlaceLookup)
 *
 * The React panels live in ChatWorkStepPanels.tsx so Fast Refresh sees a
 * component-only module.
 */
import type {
  TripChatAction,
  TripChatRequestPlan,
  TripChatWebSearchDetail,
  TripChatWorkStep,
} from '../services/tripChat'
import { cleanQueryString } from '../../../shared/services/llm/stream'
import { getLocale, translate, type Locale } from '../../../shared/i18n'

/** Client-side pipeline steps shown while the assistant works (Cursor-ish). */
export type ChatWorkStepId =
  | 'preprocessPlan'
  | 'preprocessFallback'
  | 'webSearch'
  | 'generate'
  | 'parse'
  | 'resolvePlaces'
  | 'apply'

export type ChatWorkStep = TripChatWorkStep & { id: ChatWorkStepId }

type WorkStepLabelKey =
  | 'chat.workStepPreprocessPlan'
  | 'chat.workStepPreprocessFallback'
  | 'chat.workStepWebSearch'
  | 'chat.workStepGenerate'
  | 'chat.workStepParse'
  | 'chat.workStepResolvePlaces'
  | 'chat.workStepApply'

const STEP_LABEL_KEYS: Record<ChatWorkStepId, WorkStepLabelKey> = {
  preprocessPlan: 'chat.workStepPreprocessPlan',
  preprocessFallback: 'chat.workStepPreprocessFallback',
  webSearch: 'chat.workStepWebSearch',
  generate: 'chat.workStepGenerate',
  parse: 'chat.workStepParse',
  resolvePlaces: 'chat.workStepResolvePlaces',
  apply: 'chat.workStepApply',
}

/** Localized labels for every pipeline step. Defaults to the active locale. */
export function getChatWorkStepLabels(locale: Locale = getLocale()): Record<ChatWorkStepId, string> {
  const out = {} as Record<ChatWorkStepId, string>
  ;(Object.keys(STEP_LABEL_KEYS) as ChatWorkStepId[]).forEach((id) => {
    const key = STEP_LABEL_KEYS[id]
    const translated = translate(key, undefined, locale)
    if (translated) {
      out[id] = translated
      return
    }
    out[id] = FALLBACK_LABELS_ZH[id]
  })
  return out
}

/** Locale-aware single-step label, with a Chinese last-resort fallback. */
export function chatWorkStepLabel(id: ChatWorkStepId, locale: Locale = getLocale()): string {
  const key = STEP_LABEL_KEYS[id]
  return translate(key, undefined, locale) || FALLBACK_LABELS_ZH[id]
}

/** Internal Chinese fallback used only when the registry is missing the key. */
const FALLBACK_LABELS_ZH: Record<ChatWorkStepId, string> = {
  preprocessPlan: '理解问题',
  preprocessFallback: '兜底路由',
  webSearch: '搜索网络',
  generate: '生成回答',
  parse: '解析动作',
  resolvePlaces: '核对地点',
  apply: '应用改动',
}

export function initialChatWorkSteps(_userText: string): ChatWorkStep[] {
  const labels = getChatWorkStepLabels()
  return [
    { id: 'preprocessPlan', label: labels.preprocessPlan, status: 'active' },
    { id: 'preprocessFallback', label: labels.preprocessFallback, status: 'skipped' },
    { id: 'webSearch', label: labels.webSearch, status: 'pending' },
    { id: 'generate', label: labels.generate, status: 'pending' },
    { id: 'parse', label: labels.parse, status: 'pending' },
    // Keep these steps in the pipeline so the UI can always render the full
    // progress layout, even when a turn doesn't require them.
    { id: 'resolvePlaces', label: labels.resolvePlaces, status: 'skipped' },
    { id: 'apply', label: labels.apply, status: 'skipped' },
  ] as ChatWorkStep[]
}

export function searchStepLabel(
  detail: TripChatWebSearchDetail | undefined,
  userText: string,
  locale: Locale = getLocale(),
): string {
  const prefix = translate('chat.workStepSearchPrefix' as never, undefined, locale) ||
    (locale === 'en' ? 'Search: ' : '搜索：')
  const fallback = chatWorkStepLabel('webSearch', locale)
  if (detail?.query) {
    const extracted = extractSearchKeyword(detail.query)
    return extracted ? `${prefix}${extracted}` : fallback
  }
  if (userText.trim()) return `${prefix}${userText.trim().slice(0, 24)}`
  return fallback
}

/**
 * DeepSeek/OpenAI web_search tool sometimes emits a "query" string with
 * internal ws_* tracing tokens + other redundant chars.
 * We want to show only the real user-intent keyword portion.
 */
function extractSearchKeyword(rawQuery: string): string | null {
  // 1) Remove known ws_call_id / ws_id tokens from OpenAI-style query strings.
  const base = cleanQueryString(rawQuery) || rawQuery

  // 2) If the model encoded the real query inside `q=` / `query=`, prefer it.
  //    We can’t rely on delimiters always being `?&`, so cover `^` + `&` + whitespace.
  const m =
    base.match(/(?:^|[?&\s])(?:q|query)=([^&\s]+)/i) ||
    base.match(/(?:^|[?&\s])search_query=([^&\s]+)/i)
  if (m?.[1]) {
    try {
      const decoded = decodeURIComponent(m[1])
      const compact = decoded.replace(/\s+/g, ' ').trim()
      if (compact) return compact.length > 44 ? compact.slice(0, 44).trim() : compact
    } catch {
      const compact = String(m[1]).replace(/\s+/g, ' ').trim()
      if (compact) return compact.length > 44 ? compact.slice(0, 44).trim() : compact
    }
  }

  // 3) Remove additional DeepSeek-ish tokens (covers cases like
  //    ws_cid-... / ws_call_id=... where they're not in query-param format).
  let s = base
  s = s.replace(/(?:^|\s)(?:ws_call_id|ws_id)=[^\s&]+/g, ' ')
  s = s.replace(/\bws[-_][a-zA-Z0-9]{6,}(?:[-_][a-zA-Z0-9]{2,})*\b/g, ' ')
  s = s.replace(/\bws[a-zA-Z0-9]{6,}(?:[-_][a-zA-Z0-9]{2,})*\b/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  if (!s) return null

  // 4) If it still contains an explicit "query=" / "q=" tail, prefer that tail.
  const tail = s.match(/(?:query|q|search_query)\s*[:=]\s*([^&]+)$/i)?.[1]
  if (tail) s = tail.trim()

  // 5) Prefer the first segment that contains real "content" characters.
  const idx = s.search(/[A-Za-z0-9\u4e00-\u9fff]/)
  if (idx > 0) s = s.slice(idx)

  // 6) Keep it compact for the UI label.
  if (s.length > 44) s = s.slice(0, 44).trim()
  return s || null
}

export function requestPlanStepLabel(
  plan: TripChatRequestPlan,
  locale: Locale = getLocale(),
): string {
  const intent = plan.intent

  const intentLabel =
    intent === 'recommend'
      ? (translate('chat.workStepPlanIntentRecommend' as never, undefined, locale) ||
          (locale === 'en' ? 'recommend' : '推荐'))
      : intent === 'mutate'
        ? (translate('chat.workStepPlanIntentMutate' as never, undefined, locale) ||
            (locale === 'en' ? 'itinerary edit' : '行程调整'))
        : intent === 'answer'
          ? (translate('chat.workStepPlanIntentAnswer' as never, undefined, locale) ||
              (locale === 'en' ? 'information query' : '信息查询'))
          : (translate('chat.workStepPlanIntentUnderstand' as never, undefined, locale) ||
              (locale === 'en' ? 'understanding the question' : '理解问题'))

  const needsWebLabel = plan.needsWeb
    ? (translate('chat.workStepPlanNeedsWebYes' as never, undefined, locale) ||
        (locale === 'en' ? 'web needed' : '需要联网'))
    : (translate('chat.workStepPlanNeedsWebNo' as never, undefined, locale) ||
        (locale === 'en' ? 'no web needed' : '无需联网'))

  const effort = plan.recommendedEffort
  const effortLabel =
    effort === 'off'
      ? 'off'
      : effort === 'low'
        ? (translate('chat.workStepPlanEffortLow' as never, undefined, locale) ||
            (locale === 'en' ? 'low' : '低'))
        : effort === 'medium'
          ? (translate('chat.workStepPlanEffortMedium' as never, undefined, locale) ||
              (locale === 'en' ? 'medium' : '中'))
          : (translate('chat.workStepPlanEffortHigh' as never, undefined, locale) ||
              (locale === 'en' ? 'high' : '高'))

  // Preprocess step: explicitly show routing + whether we’ll do web search
  // and the chosen reasoning depth. Separator is `·` in both locales for parity.
  const planLabel = translate('chat.workStepPlanLabel' as never, undefined, locale) ||
    (locale === 'en' ? 'Analyzing the question' : '分析问题')
  return `${planLabel}：${intentLabel} · ${needsWebLabel} · ${effortLabelLabel(locale)} ${effortLabel}`
}

/** "Reasoning effort" prefix used in the plan-step label (locale-aware). */
function effortLabelLabel(locale: Locale): string {
  return locale === 'en' ? 'Reasoning effort:' : '推理强度：'
}

export function activateChatWorkStep(
  steps: ChatWorkStep[],
  id: ChatWorkStepId,
  options?: {
    insert?: ChatWorkStep[]
    labels?: Partial<Record<ChatWorkStepId, string>>
  },
): ChatWorkStep[] {
  const insert = options?.insert || []
  const labels = options?.labels || {}
  // Preserve the current step's active state when relabeling the same step.
  // This avoids restarting shimmer on repeated callbacks for the same step
  // (e.g. web-search provisional query → real query).
  const next = steps
    .filter((s) => !insert.find((i) => i.id === s.id))
    .map((s) =>
      s.id === id
        ? { ...s, status: 'active' as const, label: labels[id] || s.label }
        : s.status === 'active'
          ? { ...s, status: 'done' as const }
          : s,
    )
  // Mark done steps in `insert` that match an existing id.
  for (const item of insert) {
    if (next.find((s) => s.id === item.id)) continue
  }
  return [
    ...next,
    ...insert
      .filter((i) => !next.find((s) => s.id === i.id))
      .map((i) => ({
        id: i.id as ChatWorkStepId,
        label: labels[i.id as ChatWorkStepId] || i.label,
        status: i.status,
      })),
  ]
}

export function finishChatWorkSteps(steps: ChatWorkStep[]): ChatWorkStep[] {
  return steps.map((s) =>
    s.status === 'active' || s.status === 'pending' ? { ...s, status: 'done' as const } : s,
  )
}

export function completedWorkSummary(
  steps: TripChatWorkStep[],
  locale: Locale = getLocale(),
): string {
  const visible = steps.filter((s) => s.status !== 'skipped')
  const doneIds = new Set(visible.filter((s) => s.status === 'done').map((s) => s.id))
  const hasWebSearch = doneIds.has('webSearch')
  const hasGenerate = doneIds.has('generate')
  const hasResolvePlaces = doneIds.has('resolvePlaces')
  const hasApply = doneIds.has('apply')

  const t = (key: Parameters<typeof translate>[0], zhFallback: string) =>
    translate(key, undefined, locale) || (locale === 'en' ? englishFallback(key) : zhFallback)

  // Prefer a natural, user-facing completion hint over the raw internal label.
  if (hasApply) {
    return hasWebSearch
      ? t('chat.workStepCompletedApplyWithWeb' as never, '已联网搜索并完成行程改动')
      : t('chat.workStepCompletedApply' as never, '已完成行程改动')
  }
  if (hasResolvePlaces && !hasApply) {
    return hasWebSearch
      ? t('chat.workStepCompletedResolveWithWeb' as never, '已联网搜索并核对地点')
      : t('chat.workStepCompletedResolve' as never, '已核对地点')
  }
  if (hasWebSearch && hasGenerate) {
    return t('chat.workStepCompletedGenerateWithWeb' as never, '已完成联网搜索并生成回答')
  }
  if (hasWebSearch && !hasGenerate) {
    return t('chat.workStepCompletedWebOnly' as never, '已完成联网搜索')
  }
  if (hasGenerate) {
    return t('chat.workStepCompletedGenerate' as never, '已生成回答')
  }

  const lastDone = [...visible].reverse().find((s) => s.status === 'done')
  return lastDone?.label || chatWorkStepLabel('generate', locale)
}

function englishFallback(key: Parameters<typeof translate>[0]): string {
  // Last-resort English text when the registry is missing the key.
  switch (key) {
    case 'chat.workStepCompletedApplyWithWeb':
      return 'Searched the web and applied itinerary changes'
    case 'chat.workStepCompletedApply':
      return 'Applied itinerary changes'
    case 'chat.workStepCompletedResolveWithWeb':
      return 'Searched the web and verified places'
    case 'chat.workStepCompletedResolve':
      return 'Verified places'
    case 'chat.workStepCompletedGenerateWithWeb':
      return 'Searched the web and generated answer'
    case 'chat.workStepCompletedWebOnly':
      return 'Web search complete'
    case 'chat.workStepCompletedGenerate':
      return 'Answer generated'
    default:
      return ''
  }
}

export function actionsNeedPlaceLookup(actions: TripChatAction[]): boolean {
  return actions.some(
    (a) =>
      a.type === 'add_place' ||
      a.type === 'replace_place' ||
      a.type === 'add_hotel' ||
      a.type === 'refresh_hotels' ||
      a.type === 'replace_hotel' ||
      a.type === 'replace_hotels',
  )
}
