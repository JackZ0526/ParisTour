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
  | 'visualAnalysis'
  | 'webSearch'
  | 'generate'
  | 'parse'
  | 'resolvePlaces'
  | 'apply'

export type ChatWorkStep = TripChatWorkStep & { id: ChatWorkStepId }

type WorkStepLabelKey =
  | 'chat.workStepPreprocessPlan'
  | 'chat.workStepPreprocessFallback'
  | 'chat.workStepVisualAnalysis'
  | 'chat.workStepWebSearch'
  | 'chat.workStepGenerate'
  | 'chat.workStepParse'
  | 'chat.workStepResolvePlaces'
  | 'chat.workStepApply'

const STEP_LABEL_KEYS: Record<ChatWorkStepId, WorkStepLabelKey> = {
  preprocessPlan: 'chat.workStepPreprocessPlan',
  preprocessFallback: 'chat.workStepPreprocessFallback',
  visualAnalysis: 'chat.workStepVisualAnalysis',
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
  visualAnalysis: '解析图片',
  webSearch: '搜索网络',
  generate: '生成回答',
  parse: '解析动作',
  resolvePlaces: '核对地点',
  apply: '应用改动',
}

export function initialChatWorkSteps(_userText: string, hasImages = false): ChatWorkStep[] {
  const labels = getChatWorkStepLabels()
  return [
    { id: 'preprocessPlan', label: labels.preprocessPlan, status: 'active' },
    { id: 'preprocessFallback', label: labels.preprocessFallback, status: 'skipped' },
    { id: 'visualAnalysis', label: labels.visualAnalysis, status: hasImages ? 'pending' : 'skipped' },
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
  _plan?: TripChatRequestPlan,
  locale: Locale = getLocale(),
): string {
  return (
    translate('chat.workStepPlanLabel' as never, undefined, locale) ||
    (locale === 'en' ? 'Analyzing question' : '分析问题')
  )
}

export function requestPlanStepBadges(
  plan: TripChatRequestPlan,
  locale: Locale = getLocale(),
  hasImages = false,
): string[] {
  const intent = plan.intent

  let intentLabel: string
  if (hasImages && intent === 'answer') {
    intentLabel = locale === 'en' ? 'Visual Recognition' : '识图识别'
  } else if (intent === 'recommend') {
    intentLabel =
      translate('chat.workStepPlanIntentRecommend' as never, undefined, locale) ||
      (locale === 'en' ? 'Recommend' : '推荐')
  } else if (intent === 'mutate') {
    intentLabel =
      translate('chat.workStepPlanIntentMutate' as never, undefined, locale) ||
      (locale === 'en' ? 'Edit Plan' : '行程调整')
  } else if (intent === 'answer') {
    intentLabel =
      translate('chat.workStepPlanIntentAnswer' as never, undefined, locale) ||
      (locale === 'en' ? 'Info Query' : '信息查询')
  } else {
    intentLabel =
      translate('chat.workStepPlanIntentUnderstand' as never, undefined, locale) ||
      (locale === 'en' ? 'Analyze' : '理解问题')
  }

  const needsWebLabel = plan.needsWeb
    ? (locale === 'en' ? 'Web Search' : '联网搜索')
    : (locale === 'en' ? 'No Web' : '无需联网')

  const effort = plan.recommendedEffort
  const effortLabel =
    effort === 'off'
      ? (locale === 'en' ? 'Reasoning: Off' : '推理: 关')
      : effort === 'low'
        ? (locale === 'en' ? 'Reasoning: Low' : '推理: 低')
        : effort === 'medium'
          ? (locale === 'en' ? 'Reasoning: Med' : '推理: 中')
          : (locale === 'en' ? 'Reasoning: High' : '推理: 高')

  return [intentLabel, needsWebLabel, effortLabel]
}

export function parseStepDisplay(step: TripChatWorkStep): { label: string; badges: string[] } {
  if (step.badges && step.badges.length > 0) {
    return { label: step.label, badges: step.badges }
  }
  // Fallback for legacy persisted format: "分析问题：信息查询 · 无需联网 · 推理强度：中"
  const colonIdx =
    step.label.indexOf('：') !== -1 ? step.label.indexOf('：') : step.label.indexOf(':')
  if (colonIdx !== -1 && step.label.includes('·')) {
    const mainLabel = step.label.slice(0, colonIdx).trim()
    const rawBadges = step.label
      .slice(colonIdx + 1)
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean)
    if (rawBadges.length > 0) {
      return { label: mainLabel, badges: rawBadges }
    }
  }
  return { label: step.label, badges: [] }
}

export function visualAnalysisStepBadges(
  imageCount: number,
  isProxy: boolean,
  locale: Locale = getLocale(),
): string[] {
  const badges: string[] = []
  if (isProxy) {
    badges.push(locale === 'en' ? 'V4 Vision Proxy' : '调用 V4 Vision')
  } else {
    badges.push(locale === 'en' ? 'Multimodal Vision' : '多模态识图')
  }
  if (imageCount > 0) {
    badges.push(
      locale === 'en'
        ? `${imageCount} ${imageCount === 1 ? 'image' : 'images'}`
        : `${imageCount} 张图片`,
    )
  }
  return badges
}

export function searchStepBadges(
  detail?: TripChatWebSearchDetail,
  locale: Locale = getLocale(),
): string[] {
  const badges: string[] = []
  if (detail?.sourcesCount && detail.sourcesCount > 0) {
    badges.push(
      locale === 'en'
        ? `Ref ${detail.sourcesCount} ${detail.sourcesCount === 1 ? 'source' : 'sources'}`
        : `参考了 ${detail.sourcesCount} 篇资料`,
    )
  } else if (detail?.source === 'google_places') {
    badges.push(locale === 'en' ? 'Nearby places' : '周边候选')
  }
  return badges
}

export function resolvePlacesStepBadges(
  placeNames: string[],
  totalCount?: number,
  locale: Locale = getLocale(),
): string[] {
  if (!placeNames.length) return []
  const uniqueNames = [...new Set(placeNames.filter(Boolean))]
  if (!uniqueNames.length) return []
  const summaryName = uniqueNames.slice(0, 2).join(' · ') + (uniqueNames.length > 2 ? '…' : '')
  const count = totalCount || uniqueNames.length
  return [
    summaryName,
    `${count}/${count} ${locale === 'en' ? 'verified' : '已核实'}`,
  ]
}

export function applyStepBadges(
  notes: string[],
): string[] {
  if (!notes.length) return []
  return notes.slice(0, 2)
}

export function activateChatWorkStep(
  steps: ChatWorkStep[],
  id: ChatWorkStepId,
  options?: {
    insert?: ChatWorkStep[]
    labels?: Partial<Record<ChatWorkStepId, string>>
    badges?: Partial<Record<ChatWorkStepId, string[]>>
  },
): ChatWorkStep[] {
  const insert = options?.insert || []
  const labels = options?.labels || {}
  const badges = options?.badges || {}
  // Preserve the current step's active state when relabeling the same step.
  // This avoids restarting shimmer on repeated callbacks for the same step
  // (e.g. web-search provisional query → real query).
  const next = steps
    .filter((s) => !insert.find((i) => i.id === s.id))
    .map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'active' as const,
            label: labels[id] || s.label,
            badges: badges[id] || s.badges,
          }
        : s.status === 'active'
          ? { ...s, status: 'done' as const }
          : s,
    )
  return [
    ...next,
    ...insert
      .filter((i) => !next.find((s) => s.id === i.id))
      .map((i) => ({
        id: i.id as ChatWorkStepId,
        label: labels[i.id as ChatWorkStepId] || i.label,
        badges: badges[i.id as ChatWorkStepId] || i.badges,
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
  hasReasoning: boolean = false,
  locale: Locale = getLocale(),
): string {
  const visible = steps.filter((s) => s.status !== 'skipped')
  const doneSteps = visible.filter((s) => s.status === 'done')
  const doneCount = doneSteps.length || visible.length
  const doneIds = new Set(doneSteps.map((s) => s.id))
  const hasVisual = doneIds.has('visualAnalysis')
  const hasWebSearch = doneIds.has('webSearch')
  const hasApply = doneIds.has('apply')
  const hasResolvePlaces = doneIds.has('resolvePlaces')

  if (locale === 'en') {
    const parts: string[] = []
    if (hasReasoning) parts.push('Thought')
    if (hasVisual) parts.push('Analyzed image')
    if (hasWebSearch) parts.push('Web searched')
    if (hasApply) parts.push('Applied changes')
    else if (hasResolvePlaces) parts.push('Verified places')
    else parts.push('Answer ready')
    parts.push(`${doneCount} ${doneCount === 1 ? 'step' : 'steps'}`)
    return parts.join(' · ')
  }

  // zh-CN
  const parts: string[] = []
  if (hasReasoning) parts.push('思考完成')
  if (hasVisual) parts.push('已解析图片')
  if (hasWebSearch) parts.push('联网搜索')
  if (hasApply) parts.push('已调整行程')
  else if (hasResolvePlaces) parts.push('已核实地点')
  else parts.push('已生成回答')
  parts.push(`共 ${doneCount} 步`)
  return parts.join(' · ')
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
