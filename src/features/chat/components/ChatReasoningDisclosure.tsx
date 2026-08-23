/**
 * Reasoning disclosure for the trip chat panel.
 *
 * Shows a compact "思考中 / 思考完成" header with the live or stored
 * reasoning text below. Live and stored variants share the same UI;
 * the stored one owns its own disclosure state.
 */
import { useState } from 'react'
import { Check, ChevronRight, Sparkles } from 'lucide-react'
import { useTranslation } from '../../../shared/i18n'

function DisclosureChevron({ open }: { open: boolean }) {
  return <ChevronRight aria-hidden strokeWidth={1.6} className={`h-3.5 w-3.5 shrink-0 text-[var(--stone)]/60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--stone)]/80 ${open ? 'rotate-90' : ''}`} />
}

function CompletedCheckIcon() {
  return <Check aria-hidden className="h-4 w-4" strokeWidth={2} />
}

function ThinkingSparkleIcon() {
  return <Sparkles aria-hidden className="h-4 w-4 animate-pulse" strokeWidth={1.8} />
}

export function ChatReasoningDisclosure({
  text,
  open,
  onToggle,
  completed = false,
}: {
  text: string
  open: boolean
  onToggle: () => void
  completed?: boolean
}) {
  const { t } = useTranslation()
  const trimmed = text.trim()
  if (!trimmed) return null
  return (
    <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-1.5 rounded-sm text-left text-[var(--stone)]/78 outline-none transition hover:text-[var(--stone)] focus-visible:ring-1 focus-visible:ring-[var(--sage)]/25"
        aria-expanded={open}
      >
        <span className="shrink-0" aria-hidden>
          {completed ? <CompletedCheckIcon /> : <ThinkingSparkleIcon />}
        </span>
        <span className={`min-w-0 truncate ${completed ? '' : 'chat-step-shimmer'}`}>
          {completed ? t('chat.thinkingDone') : t('chat.thinkingNow')}
        </span>
        <DisclosureChevron open={open} />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-[1.375rem] mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1 text-[var(--stone)]/68">
            {trimmed}
          </div>
        </div>
      </div>
    </div>
  )
}

export function StoredChatReasoningDisclosure({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <ChatReasoningDisclosure
      text={text}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      completed
    />
  )
}
