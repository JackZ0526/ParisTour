import { useState } from 'react'
import {
  Braces,
  Check,
  ChevronRight,
  ClipboardList,
  Globe2,
  Image as ImageIcon,
  MapPin,
  MessageSquareText,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import type { TripChatWorkStep } from '../services/tripChat'
import { useTranslation } from '../../../shared/i18n'
import { completedWorkSummary, parseStepDisplay } from './ChatWorkStepList'

function ChatWorkStepIcon({
  id,
  status,
}: {
  id: string
  status: TripChatWorkStep['status']
}) {
  if (status === 'done') return <CompletedCheckIcon />
  const common = `h-3.5 w-3.5 ${status === 'active' ? 'animate-pulse text-[var(--sage)]' : ''} ${
    status === 'skipped' ? 'opacity-55' : ''
  }`
  if (id === 'preprocessPlan' || id === 'preprocessFallback') {
    return id === 'preprocessPlan' ? (
      <MessageSquareText aria-hidden className={common} strokeWidth={1.8} />
    ) : (
      <TriangleAlert aria-hidden className={common} strokeWidth={1.8} />
    )
  }
  if (id === 'visualAnalysis') {
    return <ImageIcon aria-hidden className={common} strokeWidth={1.8} />
  }
  if (id === 'webSearch') {
    return <Globe2 aria-hidden className={common} strokeWidth={1.8} />
  }
  if (id === 'resolvePlaces') {
    return <MapPin aria-hidden className={common} strokeWidth={1.8} />
  }
  if (id === 'apply') {
    return <ClipboardList aria-hidden className={common} strokeWidth={1.8} />
  }
  if (id === 'parse') {
    return <Braces aria-hidden className={common} strokeWidth={1.8} />
  }
  return <Sparkles aria-hidden className={common} strokeWidth={1.8} />
}

function CompletedCheckIcon() {
  return <Check aria-hidden className="h-3.5 w-3.5 text-[var(--sage)] dark:text-[#9fc4b1]" strokeWidth={2.2} />
}

export function ChatWorkStepsPanel({
  steps,
  reasoning,
  open,
  onToggle,
  completed = false,
}: {
  steps: TripChatWorkStep[]
  reasoning?: string
  open: boolean
  onToggle: () => void
  completed?: boolean
}) {
  void onToggle
  const [reasoningExpanded, setReasoningExpanded] = useState(false)
  // UI request: don't display skipped steps.
  const { t, locale } = useTranslation()
  const visible = steps.filter((step) => step.status !== 'skipped')
  const hasReasoning = Boolean(reasoning?.trim())
  if (!visible.length && !hasReasoning) return null
  // "Skipped: " prefix used for the inline skipped-step label.
  const skippedPrefix = t('chat.workStepSkippedPrefix' as never) ||
    (locale === 'en' ? 'Skipped: ' : '已跳过：')
  // "Waiting: " prefix for the pending visual; only relevant when the label
  // starts with the active-step prefix word. In English we just show the label
  // as-is since we don't have a 1:1 active→pending word swap.
  const waitingPrefix = t('chat.workStepWaitingPrefix' as never) ||
    (locale === 'en' ? 'Waiting: ' : '等待：')

  // Live turn: always show the full pipeline (all steps, including skipped ones).
  if (!completed) {
    // When not explicitly expanded, only show the current active step.
    // This matches the "do just that step" UX request and avoids forcing
    // users to scroll through the whole list while web-search is running.
    const active = steps.find((step) => step.status === 'active')
    const toShow = open
      ? visible
      : active
        ? [active]
        : // Fallback: show the first pending/step so the UI never goes blank.
          visible.filter((step) => step.status === 'pending')[0]
          ? visible.filter((step) => step.status === 'pending')
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
            const { label: cleanLabel, badges } = parseStepDisplay(step)
            const label =
              step.status === 'pending'
                ? locale === 'zh-CN'
                  ? cleanLabel.replace(/^正在/, '等待')
                  : `${waitingPrefix}${cleanLabel}`
                : skipped
                  ? `${skippedPrefix}${cleanLabel}`
                  : cleanLabel

            return (
              <li
                key={step.id}
                className={`flex items-start gap-1.5 py-0.5 ${
                  activeStep
                    ? 'text-[var(--stone)]/90'
                    : done
                      ? 'text-[var(--stone)]/62'
                      : skipped
                        ? 'text-[var(--stone)]/38'
                        : 'text-[var(--stone)]/45'
                }`}
              >
                <span className="flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden>
                  <ChatWorkStepIcon id={step.id} status={step.status} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex min-h-[1.25rem] items-center gap-1.5 leading-5">
                    <span className={activeStep ? 'chat-step-shimmer font-medium' : 'font-medium'}>
                      {label}
                    </span>
                  </div>
                  {badges.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {badges.map((badge, bIdx) => (
                        <span
                          key={bIdx}
                          className="inline-flex items-center rounded-full border border-[var(--sage)]/25 bg-[var(--sage)]/10 dark:border-[var(--sage)]/35 dark:bg-[var(--sage)]/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--sage)] dark:text-[#9fc4b1] select-none"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  // Completed turn: show a compact summary + full timeline list with optional reasoning.
  const collapsedLabel = completedWorkSummary(visible, hasReasoning, locale)

  return (
    <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-1.5 rounded-sm text-left text-[var(--stone)]/78 outline-none transition hover:text-[var(--stone)] focus-visible:ring-1 focus-visible:ring-[var(--sage)]/25 cursor-pointer"
        aria-expanded={open}
      >
        <span className="shrink-0" aria-hidden>
          <CompletedCheckIcon />
        </span>
        <span className="min-w-0 truncate">{collapsedLabel}</span>
        <ChevronRight
          aria-hidden
          strokeWidth={1.6}
          className={`h-3.5 w-3.5 shrink-0 text-[var(--stone)]/60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--stone)]/80 ${open ? 'rotate-90' : ''}`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-[1.375rem] mt-1 space-y-1 border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1">
            <ol className="space-y-1">
              {hasReasoning && (
                <li className="flex items-start gap-1.5 py-0.5 text-[var(--stone)]/62">
                  <span className="flex h-5 w-4 shrink-0 items-center justify-center text-[var(--sage)] dark:text-[#9fc4b1]" aria-hidden>
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setReasoningExpanded((v) => !v)}
                      className="group flex min-h-[1.25rem] w-full items-center justify-between gap-1.5 leading-5 text-left font-medium hover:text-[var(--stone)]/90 cursor-pointer outline-none"
                    >
                      <span>{locale === 'en' ? 'Reasoning Process' : '深度思考过程'}</span>
                      <span className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] text-[var(--stone)]/60 group-hover:text-[var(--stone)]/80">
                        <span>{reasoningExpanded ? (locale === 'en' ? 'Collapse' : '收起') : (locale === 'en' ? 'View' : '展开')}</span>
                        <ChevronRight size={12} className={`transition-transform duration-200 ${reasoningExpanded ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                    {reasoningExpanded && (
                      <div className="relative mt-1.5 overflow-hidden rounded-lg bg-[var(--sage)]/[0.06] dark:bg-[var(--sage)]/[0.12] ring-1 ring-inset ring-[var(--sage)]/12 dark:ring-white/[0.06]">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-[2.5px] rounded-full bg-[var(--sage)]/45 dark:bg-[#9fc4b1]/40"
                        />
                        <div className="max-h-48 overflow-y-auto py-2 pl-4 pr-2.5 text-[11px] leading-relaxed text-[var(--stone)]/75 dark:text-zinc-300 select-text [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {reasoning!.trim()}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              )}

              {visible.map((step) => {
                const done = step.status === 'done'
                const { label: cleanLabel, badges } = parseStepDisplay(step)
                return (
                  <li
                    key={step.id}
                    className={`flex items-start gap-1.5 py-0.5 ${
                      done
                        ? 'text-[var(--stone)]/62'
                        : 'text-[var(--stone)]/45'
                    }`}
                  >
                    <span className="flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden>
                      <ChatWorkStepIcon id={step.id} status={step.status} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-h-[1.25rem] items-center gap-1.5 leading-5">
                        <span className="font-medium">{cleanLabel}</span>
                      </div>
                      {badges.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {badges.map((badge, bIdx) => (
                            <span
                              key={bIdx}
                              className="inline-flex items-center rounded-full border border-[var(--sage)]/25 bg-[var(--sage)]/10 dark:border-[var(--sage)]/35 dark:bg-[var(--sage)]/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--sage)] dark:text-[#9fc4b1] select-none"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

export function StoredChatWorkStepsPanel({
  steps,
  reasoning,
}: {
  steps: TripChatWorkStep[]
  reasoning?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <ChatWorkStepsPanel
      steps={steps}
      reasoning={reasoning}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      completed
    />
  )
}
