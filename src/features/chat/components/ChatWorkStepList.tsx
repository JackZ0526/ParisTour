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

export const CHAT_WORK_STEP_LABELS: Record<ChatWorkStepId, string> = {
  preprocessPlan: '理解问题',
  preprocessFallback: '兜底路由',
  webSearch: '搜索网络',
  resolvePlaces: '核对地点',
  generate: '生成回答',
  apply: '应用改动',
  parse: '解析动作',
}

export function initialChatWorkSteps(_userText: string): ChatWorkStep[] {
  return [
    { id: 'preprocessPlan', label: CHAT_WORK_STEP_LABELS.preprocessPlan, status: 'active' },
    { id: 'preprocessFallback', label: CHAT_WORK_STEP_LABELS.preprocessFallback, status: 'skipped' },
    { id: 'webSearch', label: CHAT_WORK_STEP_LABELS.webSearch, status: 'pending' },
    { id: 'generate', label: CHAT_WORK_STEP_LABELS.generate, status: 'pending' },
    { id: 'parse', label: CHAT_WORK_STEP_LABELS.parse, status: 'pending' },
    // Keep these steps in the pipeline so the UI can always render the full
    // progress layout, even when a turn doesn't require them.
    { id: 'resolvePlaces', label: CHAT_WORK_STEP_LABELS.resolvePlaces, status: 'skipped' },
    { id: 'apply', label: CHAT_WORK_STEP_LABELS.apply, status: 'skipped' },
  ] as ChatWorkStep[]
}

export function searchStepLabel(
  detail: TripChatWebSearchDetail | undefined,
  userText: string,
): string {
  if (detail?.query) {
    const extracted = extractSearchKeyword(detail.query)
    return extracted ? `搜索：${extracted}` : CHAT_WORK_STEP_LABELS.webSearch
  }
  if (userText.trim()) return `搜索：${userText.trim().slice(0, 24)}`
  return CHAT_WORK_STEP_LABELS.webSearch
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

export function requestPlanStepLabel(plan: TripChatRequestPlan): string {
  const intent = plan.intent

  const intentLabel =
    intent === 'recommend'
      ? '推荐'
      : intent === 'mutate'
        ? '行程调整'
        : intent === 'answer'
          ? '信息查询'
          : '理解问题'

  const needsWebLabel = plan.needsWeb ? '需要联网' : '无需联网'
  const effort = plan.recommendedEffort
  const effortLabel =
    effort === 'off' ? 'off' : effort === 'low' ? '低' : effort === 'medium' ? '中' : '高'

  // Preprocess step: explicitly show routing + whether we’ll do web search
  // and the chosen reasoning depth.
  return `分析问题：${intentLabel} · ${needsWebLabel} · 推理强度：${effortLabel}`
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

export function completedWorkSummary(steps: TripChatWorkStep[]): string {
  const visible = steps.filter((s) => s.status !== 'skipped')
  const doneIds = new Set(visible.filter((s) => s.status === 'done').map((s) => s.id))
  const hasWebSearch = doneIds.has('webSearch')
  const hasGenerate = doneIds.has('generate')
  const hasResolvePlaces = doneIds.has('resolvePlaces')
  const hasApply = doneIds.has('apply')

  // Prefer a natural, user-facing completion hint over the raw internal label.
  if (hasApply) {
    return hasWebSearch ? '已联网搜索并完成行程改动' : '已完成行程改动'
  }
  if (hasResolvePlaces && !hasApply) {
    return hasWebSearch ? '已联网搜索并核对地点' : '已核对地点'
  }
  if (hasWebSearch && hasGenerate) return '已完成联网搜索并生成回答'
  if (hasWebSearch && !hasGenerate) return '已完成联网搜索'
  if (hasGenerate) return '已生成回答'

  const lastDone = [...visible].reverse().find((s) => s.status === 'done')
  return lastDone?.label || CHAT_WORK_STEP_LABELS.generate
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
