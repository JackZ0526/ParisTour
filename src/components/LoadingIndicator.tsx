import type { ReactNode } from 'react'

type Tone = 'sage' | 'copper' | 'ink' | 'paper'
type Size = 'sm' | 'md'
type Variant = 'inline' | 'block' | 'badge'

const toneClass: Record<Tone, string> = {
  sage: 'text-[var(--sage)]',
  copper: 'text-[var(--copper)]',
  ink: 'text-[var(--ink)]',
  paper: 'text-[var(--paper)]',
}

const sizeClass: Record<Size, { gap: string; text: string; spinner: string; dot: string }> = {
  sm: {
    gap: 'gap-1.5',
    text: 'text-xs',
    spinner: 'h-3.5 w-3.5 border-[1.5px]',
    dot: 'h-1 w-1',
  },
  md: {
    gap: 'gap-2',
    text: 'text-sm',
    spinner: 'h-4 w-4 border-2',
    dot: 'h-1.5 w-1.5',
  },
}

function Spinner({ size, className = '' }: { size: Size; className?: string }) {
  return (
    <span
      className={`loading-spinner inline-block shrink-0 rounded-full border-current border-r-transparent ${sizeClass[size].spinner} ${className}`}
      aria-hidden
    />
  )
}

function Dots({ size, className = '' }: { size: Size; className?: string }) {
  const dot = sizeClass[size].dot
  return (
    <span className={`loading-dots inline-flex items-center gap-1 ${className}`} aria-hidden>
      <span className={`loading-dot rounded-full bg-current ${dot}`} />
      <span className={`loading-dot rounded-full bg-current ${dot}`} />
      <span className={`loading-dot rounded-full bg-current ${dot}`} />
    </span>
  )
}

/**
 * Shared wait/progress indicator — copper/sage tones, subtle spin + dots.
 * Use locally in sections; avoid full-page blockers.
 */
export function LoadingIndicator({
  label,
  variant = 'inline',
  size = 'sm',
  tone = 'sage',
  showSpinner = true,
  showDots = false,
  className = '',
  children,
}: {
  label?: ReactNode
  variant?: Variant
  size?: Size
  tone?: Tone
  /** Spinner ring (default on). */
  showSpinner?: boolean
  /** Bounce dots — good for LLM “thinking” waits. */
  showDots?: boolean
  className?: string
  children?: ReactNode
}) {
  const s = sizeClass[size]
  const text = children ?? label
  // Dots = LLM/thinking; spinner = fetch/query. Prefer one primary motion.
  const spin = showDots ? false : showSpinner
  const dots = showDots

  if (variant === 'badge') {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`loading-pulse-soft inline-flex items-center ${s.gap} rounded-full bg-[var(--gold)]/20 px-2.5 py-1 ${s.text} text-[var(--ink)] ${className}`}
      >
        {spin && <Spinner size={size} className="text-[var(--copper)]" />}
        {dots && <Dots size={size} className="text-[var(--copper)]" />}
        {text != null && text !== '' && <span>{text}</span>}
      </span>
    )
  }

  if (variant === 'block') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`loading-pulse-soft flex items-center justify-center ${s.gap} py-6 ${toneClass[tone]} ${className}`}
      >
        {spin && <Spinner size={size === 'sm' ? 'md' : size} />}
        {dots && <Dots size={size === 'sm' ? 'md' : size} />}
        {text != null && text !== '' && (
          <span className={`${s.text} text-[var(--stone)]`}>{text}</span>
        )}
      </div>
    )
  }

  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`inline-flex items-center ${s.gap} ${s.text} ${toneClass[tone]} ${className}`}
    >
      {spin && <Spinner size={size} />}
      {dots && <Dots size={size} />}
      {text != null && text !== '' && <span>{text}</span>}
    </span>
  )
}

/** Compact spinner for dark/solid buttons (inherits currentColor). */
export function ButtonSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`loading-spinner inline-block h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-current border-r-transparent ${className}`}
      aria-hidden
    />
  )
}
