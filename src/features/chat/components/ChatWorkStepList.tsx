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

/** Client-side pipeline steps shown while the assistant works (Cursor-ish). */
export type ChatWorkStepId =
  | 'understand'
  | 'webSearch'
  | 'generate'
  | 'parse'
  | 'resolvePlaces'
  | 'apply'

export type ChatWorkStep = TripChatWorkStep & { id: ChatWorkStepId }

export const CHAT_WORK_STEP_LABELS: Record<ChatWorkStepId, string> = {
  understand: '理解问题',
  webSearch: '搜索网络',
  resolvePlaces: '核对地点',
  generate: '生成回答',
  apply: '应用改动',
  parse: '解析动作',
}

export function initialChatWorkSteps(_userText: string): ChatWorkStep[] {
  return [
    { id: 'understand', label: '理解问题', status: 'active' },
    { id: 'webSearch', label: CHAT_WORK_STEP_LABELS.webSearch, status: 'pending' },
    { id: 'generate', label: CHAT_WORK_STEP_LABELS.generate, status: 'pending' },
  ].filter((s) => s.id !== 'parse' && s.id !== 'resolvePlaces' && s.id !== 'apply')
    .concat([
      { id: 'parse', label: CHAT_WORK_STEP_LABELS.parse, status: 'pending' },
    ]) as ChatWorkStep[]
}

export function searchStepLabel(
  detail: TripChatWebSearchDetail | undefined,
  userText: string,
): string {
  if (detail?.query) return `搜索：${detail.query}`
  if (userText.trim()) return `搜索：${userText.trim().slice(0, 24)}`
  return CHAT_WORK_STEP_LABELS.webSearch
}

export function requestPlanStepLabel(plan: TripChatRequestPlan): string {
  const intent = plan.intent
  if (intent === 'recommend') return '理解问题：推荐'
  if (intent === 'mutate') return '理解问题：行程调整'
  if (intent === 'answer') return '理解问题：信息查询'
  return '理解问题'
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
  // Ensure all previously-pending steps are now done, mark the target active.
  const next = steps
    .filter((s) => !insert.find((i) => i.id === s.id))
    .map((s) =>
      s.status === 'active'
        ? { ...s, status: 'done' as const }
        : s.id === id
          ? { ...s, status: 'active' as const, label: labels[id] || s.label }
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
  const common = `h-4 w-4 ${status === 'active' ? 'animate-pulse' : ''}`
  if (id === 'understand') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 18.5 6.5 15H18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2" />
        <path d="M8 9h8M8 12h5" />
      </svg>
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

function DisclosureChevron({ open }: { open: boolean }) {
  return (
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
  const visible = steps.filter((s) => s.status !== 'skipped')
  if (!visible.length) return null
  const active = visible.find((s) => s.status === 'active')
  const lastDone = [...visible].reverse().find((s) => s.status === 'done')
  const summary = completed
    ? lastDone?.label || '步骤'
    : active?.label || '处理中…'
  // While working, only show the current tool/status line. Completed turns may
  // still expose their compact history on demand.
  const expandable = completed && visible.length >= 1
  const collapsedLabel = completed ? completedWorkSummary(visible) : summary
  const summaryStep = active || lastDone || visible[0]

  return (
    <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
      {expandable ? (
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
          <DisclosureChevron open={open} />
        </button>
      ) : (
        <p className="flex items-center gap-1.5 truncate text-[var(--stone)]/78">
          <ChatWorkStepIcon id={summaryStep.id} status={summaryStep.status} />
          <span className={`truncate ${!completed && active ? 'chat-step-shimmer' : ''}`}>
            {summary}
          </span>
        </p>
      )}
      {expandable && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <ol className="ml-[1.375rem] mt-1 space-y-0.5 border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1">
              {visible.map((step) => {
                const done = step.status === 'done'
                const activeStep = step.status === 'active'
                return (
                  <li
                    key={step.id}
                    className={`flex items-center gap-1.5 ${
                      activeStep
                        ? 'text-[var(--stone)]/90'
                        : done
                          ? 'text-[var(--stone)]/62'
                          : 'text-[var(--stone)]/45'
                    }`}
                  >
                    <span className="w-4 shrink-0" aria-hidden>
                      <ChatWorkStepIcon id={step.id} status={step.status} />
                    </span>
                    <span className="truncate">
                      {step.status === 'pending'
                        ? step.label.replace(/^正在/, '等待')
                        : step.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
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
