/**
 * Work-step pipeline UI for the trip chat panel.
 *
 * Owns:
 *   - the per-step SVG icon (ChatWorkStepIcon)
 *   - the disclosure chevron + completed check icons
 *   - the live (in-flight) and stored (post-turn) work step panels
 *   - the pure helpers (initialChatWorkSteps, activateChatWorkStep,
 *     finishChatWorkSteps, completedWorkSummary, searchStepLabel,
 *     requestPlanStepLabel, actionsNeedPlaceLookup)
 */
import { useState } from 'react'
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

function ChatWorkStepIcon({
  id,
  status,
}: {
  id: string
  status: TripChatWorkStep['status']
}) {
  if (status === 'done') return <CompletedCheckIcon />
  const common = `h-4 w-4 ${status === 'active' ? 'animate-pulse' : ''} ${
    status === 'skipped' ? 'opacity-55' : ''
  }`
  if (id === 'preprocessPlan' || id === 'preprocessFallback') {
    return (
      id === 'preprocessPlan' ? (
        <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 18.5 6.5 15H18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 9v4m0 4h.01" />
          <path d="m12 2 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 2Z" />
        </svg>
      )
    )
  }
  if (id === 'webSearch') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
    )
  }
  if (id === 'resolvePlaces') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    )
  }
  if (id === 'apply') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
      </svg>
    )
  }
  if (id === 'parse') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 4H5v16h3M16 4h3v16h-3M10 9h4M10 13h4" />
      </svg>
    )
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z" />
      <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </svg>
  )
}

function CompletedCheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  )
}

export function ChatWorkStepsPanel({
  steps,
  open,
  onToggle,
  completed = false,
}: {
  steps: TripChatWorkStep[]
  open: boolean
  onToggle: () => void
  completed?: boolean
}) {
  void onToggle
  // UI request: don't display skipped steps.
  const visible = steps.filter((s) => s.status !== 'skipped')
  if (!visible.length) return null

  // Live turn: always show the full pipeline (all steps, including skipped ones).
  if (!completed) {
    // When not explicitly expanded, only show the current active step.
    // This matches the "do just that step" UX request and avoids forcing
    // users to scroll through the whole list while web-search is running.
    const active = steps.find((s) => s.status === 'active')
    const toShow = open
      ? visible
      : active
        ? [active]
        : // Fallback: show the first pending/step so the UI never goes blank.
          visible.filter((s) => s.status === 'pending')[0]
            ? visible.filter((s) => s.status === 'pending')
            : visible.slice(0, 1)

    // When collapsed (open=false), avoid the vertical rule + indentation.
    const olClassName = open
      ? 'ml-[1.375rem] mt-1 space-y-0.5 border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1'
      : 'mt-1 space-y-0.5 py-0.5 pl-0 pr-1'

    return (
      <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
        <ol className={olClassName}>
          {toShow.map((step) => {
            const done = step.status === 'done'
            const activeStep = step.status === 'active'
            const skipped = step.status === 'skipped'
            const label =
              step.status === 'pending'
                ? step.label.replace(/^正在/, '等待')
                : skipped
                  ? `已跳过：${step.label}`
                  : step.label

            return (
              <li
                key={step.id}
                className={`flex items-center gap-1.5 ${
                  activeStep
                    ? 'text-[var(--stone)]/90'
                    : done
                      ? 'text-[var(--stone)]/62'
                      : skipped
                        ? 'text-[var(--stone)]/38'
                        : 'text-[var(--stone)]/45'
                }`}
              >
                <span className="w-4 shrink-0" aria-hidden>
                  <ChatWorkStepIcon id={step.id} status={step.status} />
                </span>

                {/* Stable text + active shimmer overlay for smooth active→done transition */}
                <span className="relative inline-block max-w-[16rem] shrink-0">
                  <span
                    aria-hidden
                    className={`absolute left-0 top-0 whitespace-nowrap overflow-hidden text-ellipsis transition-opacity duration-250 ${
                      activeStep ? 'opacity-100' : 'opacity-0'
                    } chat-step-shimmer ${activeStep ? '' : 'chat-step-shimmer-paused'}`}
                  >
                    {label}
                  </span>
                  <span
                    className={`whitespace-nowrap overflow-hidden text-ellipsis transition-opacity duration-250 ${
                      activeStep ? 'opacity-0' : 'opacity-100'
                    }`}
                  >
                    {label}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  // Completed turn: show a compact summary + full timeline list.
  // (We keep the list expanded so users can always see which step completed.)
  const collapsedLabel = completedWorkSummary(visible)

  return (
    <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-1.5 rounded-sm text-left text-[var(--stone)]/78 outline-none transition hover:text-[var(--stone)] focus-visible:ring-1 focus-visible:ring-[var(--sage)]/25"
        aria-expanded={open}
      >
        <span className="shrink-0" aria-hidden>
          <CompletedCheckIcon />
        </span>
        <span className="min-w-0 truncate">{collapsedLabel}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 shrink-0 text-[var(--stone)]/60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--stone)]/80 ${
            open ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m7 4.5 5.5 5.5L7 15.5" />
        </svg>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <ol className="ml-[1.375rem] space-y-0.5 border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1">
            {visible.map((step) => {
              const done = step.status === 'done'
              return (
                <li
                  key={step.id}
                  className={`flex items-center gap-1.5 ${
                    done ? 'text-[var(--stone)]/62' : 'text-[var(--stone)]/45'
                  }`}
                >
                  <span className="w-4 shrink-0" aria-hidden>
                    <ChatWorkStepIcon id={step.id} status={step.status} />
                  </span>
                  <span className="truncate">{step.label}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

export function StoredChatWorkStepsPanel({ steps }: { steps: TripChatWorkStep[] }) {
  const [open, setOpen] = useState(false)
  return (
    <ChatWorkStepsPanel
      steps={steps}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      completed
    />
  )
}
