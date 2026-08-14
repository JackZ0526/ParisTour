import { useState } from 'react'
import {
  Braces,
  Check,
  ChevronRight,
  ClipboardList,
  Globe2,
  MapPin,
  MessageSquareText,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import type { TripChatWorkStep } from '../services/tripChat'
import { completedWorkSummary } from './ChatWorkStepList'

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
    return id === 'preprocessPlan' ? (
      <MessageSquareText aria-hidden className={common} strokeWidth={1.8} />
    ) : (
      <TriangleAlert aria-hidden className={common} strokeWidth={1.8} />
    )
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
  return <Check aria-hidden className="h-4 w-4" strokeWidth={2} />
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
  const visible = steps.filter((step) => step.status !== 'skipped')
  if (!visible.length) return null

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
          <ol className="ml-[1.375rem] space-y-0.5 border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1">
            {visible.map((step) => {
              const done = step.status === 'done'
              return (
                <li
                  key={step.id}
                  className={`flex items-center gap-1.5 ${
                    done
                      ? 'text-[var(--stone)]/62'
                      : 'text-[var(--stone)]/45'
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

export function StoredChatWorkStepsPanel({
  steps,
}: {
  steps: TripChatWorkStep[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <ChatWorkStepsPanel
      steps={steps}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      completed
    />
  )
}
