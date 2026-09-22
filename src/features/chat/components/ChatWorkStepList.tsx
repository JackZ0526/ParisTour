import { localizeStoredUiCopy } from '../../../shared/i18n/storedUiCopy'
import { en as stepCopyEn, zhCN as stepCopyZh } from '../../../shared/i18n/copy/ChatWorkStepList-18e7b1'
import { uiCopy } from '../../../shared/i18n/copy/ui'
import { localizedCopy } from '../../../shared/i18n/copy/ChatWorkStepList-18e7b1'
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
    out[id] = key
  })
  return out
}

/** Locale-aware single-step label, without cross-language fallback. */
export function chatWorkStepLabel(id: ChatWorkStepId, locale: Locale = getLocale()): string {
  const key = STEP_LABEL_KEYS[id]
  return translate(key, undefined, locale)
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
    (locale === 'en' ? localizedCopy('mdf37b27b19', undefined, 'en') : localizedCopy('mdf37b27b19', undefined, 'zh-CN'))
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
    (locale === 'en' ? localizedCopy('md47898f16f', undefined, 'en') : localizedCopy('md47898f16f', undefined, 'zh-CN'))
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
    intentLabel = locale === 'en' ? localizedCopy('me32b064eb7', undefined, 'en') : localizedCopy('me32b064eb7', undefined, 'zh-CN')
  } else if (intent === 'recommend') {
    intentLabel =
      translate('chat.workStepPlanIntentRecommend' as never, undefined, locale) ||
      (locale === 'en' ? localizedCopy('ma7dcfbd21e', undefined, 'en') : localizedCopy('ma7dcfbd21e', undefined, 'zh-CN'))
  } else if (intent === 'mutate') {
    intentLabel =
      translate('chat.workStepPlanIntentMutate' as never, undefined, locale) ||
      (locale === 'en' ? localizedCopy('m6099d4c455', undefined, 'en') : localizedCopy('m6099d4c455', undefined, 'zh-CN'))
  } else if (intent === 'answer') {
    intentLabel =
      translate('chat.workStepPlanIntentAnswer' as never, undefined, locale) ||
      (locale === 'en' ? localizedCopy('m0a3fc2326a', undefined, 'en') : localizedCopy('m0a3fc2326a', undefined, 'zh-CN'))
  } else {
    intentLabel =
      translate('chat.workStepPlanIntentUnderstand' as never, undefined, locale) ||
      (locale === 'en' ? localizedCopy('m69f5bf446b', undefined, 'en') : localizedCopy('m69f5bf446b', undefined, 'zh-CN'))
  }

  const needsWebLabel = plan.needsWeb
    ? (locale === 'en' ? localizedCopy('mca02849fd9', undefined, 'en') : localizedCopy('mca02849fd9', undefined, 'zh-CN'))
    : (locale === 'en' ? localizedCopy('m20e1509673', undefined, 'en') : localizedCopy('m20e1509673', undefined, 'zh-CN'))

  const effort = plan.recommendedEffort
  const effortLabel =
    effort === 'off'
      ? (locale === 'en' ? localizedCopy('m36bf512180', undefined, 'en') : localizedCopy('m36bf512180', undefined, 'zh-CN'))
      : effort === 'low'
        ? (locale === 'en' ? localizedCopy('m3db2f459eb', undefined, 'en') : localizedCopy('m3db2f459eb', undefined, 'zh-CN'))
        : effort === 'medium'
          ? (locale === 'en' ? localizedCopy('md8c22d7e8b', undefined, 'en') : localizedCopy('md8c22d7e8b', undefined, 'zh-CN'))
          : (locale === 'en' ? localizedCopy('m9bc92bf2cd', undefined, 'en') : localizedCopy('m9bc92bf2cd', undefined, 'zh-CN'))

  return [intentLabel, needsWebLabel, effortLabel]
}

export function parseStepDisplay(step: TripChatWorkStep): { label: string; badges: string[] } {
  const locale = getLocale()
  const localize = (text: string) => {
    const key = (Object.keys(stepCopyEn) as Array<keyof typeof stepCopyEn>).find((key) => stepCopyEn[key] === text || stepCopyZh[key] === text)
    return key ? localizedCopy(key, undefined, locale) : localizeStoredUiCopy(text, locale)
  }
  if (step.badges && step.badges.length > 0) {
    return { label: localize(step.label), badges: step.badges.map(localize) }
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
      return { label: localize(mainLabel), badges: rawBadges.map(localize) }
    }
  }
  return { label: localize(step.label), badges: [] }
}

export function visualAnalysisStepBadges(
  imageCount: number,
  isProxy: boolean,
  locale: Locale = getLocale(),
): string[] {
  const badges: string[] = []
  if (isProxy) {
    badges.push(locale === 'en' ? localizedCopy('mdeba1736ad', undefined, 'en') : localizedCopy('mdeba1736ad', undefined, 'zh-CN'))
  } else {
    badges.push(locale === 'en' ? localizedCopy('m14b6720798', undefined, 'en') : localizedCopy('m14b6720798', undefined, 'zh-CN'))
  }
  if (imageCount > 0) {
    badges.push(
      locale === 'en'
        ? `${imageCount} ${imageCount === 1 ? 'image' : 'images'}`
        : uiCopy('m61330f39c4', { p0: (imageCount) }, locale),
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
        ? localizedCopy('m5fb1f0aeb0', { p0: (detail.sourcesCount), p1: (detail.sourcesCount === 1 ? 'source' : 'sources') }, 'en')
        : localizedCopy('m5fb1f0aeb0', { p0: (detail.sourcesCount) }, 'zh-CN'),
    )
  } else if (detail?.source === 'google_places') {
    badges.push(locale === 'en' ? localizedCopy('m0651c0084e', undefined, 'en') : localizedCopy('m0651c0084e', undefined, 'zh-CN'))
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
    `${count}/${count} ${locale === 'en' ? localizedCopy('md7c1831c9b', undefined, 'en') : localizedCopy('md7c1831c9b', undefined, 'zh-CN')}`,
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

  const parts: string[] = []
  if (hasReasoning) parts.push(uiCopy('medab852efe', undefined, locale))
  if (hasVisual) parts.push(uiCopy('m88b3aaf6e8', undefined, locale))
  if (hasWebSearch) parts.push(uiCopy('m45e62e474f', undefined, locale))
  if (hasApply) parts.push(uiCopy('m2ad3f5aed2', undefined, locale))
  else if (hasResolvePlaces) parts.push(uiCopy('m08a078b845', undefined, locale))
  else parts.push(uiCopy('m6aa6f21675', undefined, locale))
  parts.push(uiCopy(doneCount === 1 ? 'oneStep' : 'mf49f2ac957', { p0: doneCount }, locale))
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
