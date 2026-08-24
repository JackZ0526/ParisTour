import { useSyncExternalStore, type ReactNode } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import {
  getThinkingMode,
  llmBusyDefaultLabel,
  resolveLlmBusyVisual,
  subscribeThinking,
  type LlmBusyVisual,
  type LlmTaskKind,
} from '../services/llm/llm'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../styles/glassCapsule'

type Tone = 'sage' | 'copper' | 'ink' | 'paper'
type Size = 'sm' | 'md'
type Variant = 'inline' | 'block' | 'badge'
/**
 * sync = CloudSave family;
 * thinking = LLM call (auto-resolves to thinking vs generating visual);
 * generating = force non-thinking LLM busy visual.
 */
type Mode = 'sync' | 'thinking' | 'generating'

const toneClass: Record<Tone, string> = {
  sage: 'text-[var(--sage)]',
  copper: 'text-[var(--copper)]',
  ink: 'text-[var(--ink)]',
  paper: 'text-[var(--paper)]',
}

const sizeClass: Record<Size, { gap: string; text: string; orbit: number; bars: string }> = {
  sm: {
    gap: 'gap-1.5',
    text: 'text-xs',
    orbit: 14,
    bars: 'load-bars--sm',
  },
  md: {
    gap: 'gap-2',
    text: 'text-sm',
    orbit: 20,
    bars: 'load-bars--md',
  },
}

function useResolvedLlmVisual(options: {
  mode: Mode
  task?: LlmTaskKind
  userText?: string
  thinkingEnabled?: boolean
}): 'sync' | LlmBusyVisual {
  // Re-render when user toggles thinking in the FAB picker.
  useSyncExternalStore(subscribeThinking, getThinkingMode, getThinkingMode)

  if (options.mode === 'sync') return 'sync'
  if (options.mode === 'generating') return 'generating'
  return resolveLlmBusyVisual({
    task: options.task,
    userText: options.userText,
    thinkingEnabled: options.thinkingEnabled,
  })
}

/** Sync-orbit mark — same motion language as CloudSaveIndicator. */
export function SyncOrbitIcon({
  spinning = true,
  size = 28,
  className = '',
}: {
  spinning?: boolean
  size?: number
  className?: string
}) {
  return (
    <RefreshCw
      className={`cloud-sync-orbit ${spinning ? 'is-spinning' : ''} ${className}`}
      size={size}
      strokeWidth={2}
      aria-hidden
    />
  )
}

/**
 * LLM thinking mark — dual orbits + rune ticks + breathing core.
 * Scales via `size`; gold reads on dark HUD chrome.
 */
export function ThinkingOrbitIcon({
  size = 28,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <Sparkles
      className={`llm-think-orbit ${className}`}
      size={size}
      strokeWidth={2}
      aria-hidden
    />
  )
}

/** Equalizer bars — same as the autosave / live-sync busy indicator. */
export function ActivityBars({
  size = 'sm',
  className = '',
}: {
  size?: Size
  className?: string
}) {
  return (
    <span className={`load-bars ${sizeClass[size].bars} ${className}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** Staggered charge bars — skill-meter fill, used for LLM thinking. */
export function ChargeBars({
  size = 'sm',
  className = '',
}: {
  size?: Size
  className?: string
}) {
  return (
    <span className={`llm-charge-bars ${sizeClass[size].bars} ${className}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * Compact LLM status chip for day-header controls — single-line signal,
 * not a scaled-down CloudSave toast.
 */
function LlmHudBadge({
  label,
  visual,
  className = '',
  size = 'sm',
}: {
  label: ReactNode
  visual: LlmBusyVisual
  className?: string
  /** sm = header chip; md = slightly roomier for block loaders. */
  size?: Size
}) {
  const compact = size === 'sm'
  const thinking = visual === 'thinking'
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${thinking ? 'llm-think-chip' : 'llm-gen-chip'} ${
        compact
          ? thinking
            ? 'llm-think-chip--sm'
            : 'llm-gen-chip--sm'
          : thinking
            ? 'llm-think-chip--md'
            : 'llm-gen-chip--md'
      } ${className}`}
    >
      <span className={thinking ? 'llm-think-chip-mark' : 'llm-gen-chip-mark'} aria-hidden>
        {thinking ? (
          <ThinkingOrbitIcon size={compact ? 12 : 14} />
        ) : (
          <SyncOrbitIcon size={compact ? 12 : 14} />
        )}
      </span>
      <span className={thinking ? 'llm-think-chip-label' : 'llm-gen-chip-label'}>{label}</span>
      <span className={thinking ? 'llm-think-chip-dots' : 'llm-gen-chip-dots'} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}

/**
 * Shared wait/progress indicator — sync-orbit + equalizer bars (CloudSave style).
 * Pass mode="thinking" for LLM calls (auto-distinguishes thinking vs generating).
 * Pass mode="generating" to force the lighter non-thinking LLM busy look.
 * Block / badge LLM → compact chip (not CloudSave toast chrome).
 */
export function LoadingIndicator({
  label,
  thinkingLabel,
  generatingLabel,
  variant = 'inline',
  size = 'sm',
  tone = 'sage',
  mode = 'sync',
  task,
  userText,
  thinkingEnabled,
  showSpinner = true,
  showDots = false,
  className = '',
  children,
}: {
  label?: ReactNode
  /** When set with generatingLabel, picked by resolved LLM visual. */
  thinkingLabel?: ReactNode
  generatingLabel?: ReactNode
  variant?: Variant
  size?: Size
  tone?: Tone
  /** sync = save/sync; thinking = LLM (auto-resolves); generating = force non-thinking LLM */
  mode?: Mode
  /** Prefer resolved thinking for this call site when mode is thinking. */
  task?: LlmTaskKind
  userText?: string
  /** Explicit override for whether thinking is on for this in-flight call. */
  thinkingEnabled?: boolean
  /** Orbit spinner (default on). Kept for API compat with older call sites. */
  showSpinner?: boolean
  /**
   * Equalizer / charge bars. When true alone (legacy “thinking”), still uses
   * orbit + bars so all loaders share one visual language.
   */
  showDots?: boolean
  /** Kept for API compat; badge/block thinking chips use a single-line label. */
  kicker?: string
  className?: string
  children?: ReactNode
}) {
  const visual = useResolvedLlmVisual({ mode, task, userText, thinkingEnabled })
  const s = sizeClass[size]
  const llmVisual: LlmBusyVisual | null = visual === 'sync' ? null : visual
  const text =
    children ??
    (llmVisual && thinkingLabel != null && generatingLabel != null
      ? llmVisual === 'thinking'
        ? thinkingLabel
        : generatingLabel
      : label)
  const active = showSpinner || showDots
  const thinking = visual === 'thinking'
  const generating = visual === 'generating'
  const llmBusy = thinking || generating

  // Block / badge LLM → compact chip suited to day-header controls.
  if (llmBusy && (variant === 'block' || variant === 'badge')) {
    const hudVisual: LlmBusyVisual = thinking ? 'thinking' : 'generating'
    const hud = (
      <LlmHudBadge
        visual={hudVisual}
        label={text ?? llmBusyDefaultLabel(hudVisual)}
        size={size}
        className={variant === 'badge' ? className : undefined}
      />
    )
    if (variant === 'block') {
      return (
        <div className={`flex items-center justify-center py-4 ${className}`}>{hud}</div>
      )
    }
    return hud
  }

  const Orbit = thinking ? ThinkingOrbitIcon : SyncOrbitIcon
  const Bars = thinking ? ChargeBars : ActivityBars
  const pulseClass = thinking ? 'llm-think-pulse' : generating ? 'llm-gen-pulse' : 'loading-pulse-soft'
  const orbitExtra = thinking
    ? 'text-[var(--gold)]'
    : generating
      ? 'text-[var(--sage)]'
      : ''
  const barsExtra = thinking
    ? 'text-[var(--gold)]'
    : generating
      ? 'text-[var(--sage)]'
      : ''

  if (variant === 'badge') {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`${pulseClass} ${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.gold} inline-flex items-center ${s.gap} px-2.5 py-1 ${s.text} text-[var(--ink)] dark:text-[var(--gold)] ${className}`}
      >
        {active && (
          <Orbit size={s.orbit} className="shrink-0 text-[var(--copper)] dark:text-[var(--gold)]" />
        )}
        {active && <Bars size={size} className="text-[var(--copper)] dark:text-[var(--gold)]" />}
        {text != null && text !== '' && <span>{text}</span>}
      </span>
    )
  }

  if (variant === 'block') {
    const blockSize: Size = size === 'sm' ? 'md' : size
    const block = sizeClass[blockSize]
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`${pulseClass} flex items-center justify-center ${block.gap} py-6 ${toneClass[tone]} ${className}`}
      >
        {active && <Orbit size={block.orbit} className={`shrink-0 ${orbitExtra}`} />}
        {active && <Bars size={blockSize} className={barsExtra} />}
        {text != null && text !== '' && (
          <span className={`${block.text} text-[var(--stone)]`}>{text}</span>
        )}
      </div>
    )
  }

  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${llmBusy ? pulseClass : ''} inline-flex items-center ${s.gap} ${s.text} ${
        thinking
          ? 'text-[var(--ink)]'
          : generating
            ? 'text-[var(--sage)]'
            : toneClass[tone]
      } ${className}`}
    >
      {active && (
        <Orbit
          size={thinking ? 16 : s.orbit}
          className={`shrink-0 ${orbitExtra}`}
        />
      )}
      {active && <Bars size={size} className={barsExtra} />}
      {text != null && text !== '' && <span>{text}</span>}
    </span>
  )
}

/** Compact orbit for dark/solid buttons (inherits currentColor). */
export function ButtonSpinner({
  className = '',
  mode = 'sync',
  task,
  userText,
  thinkingEnabled,
}: {
  className?: string
  mode?: Mode
  task?: LlmTaskKind
  userText?: string
  thinkingEnabled?: boolean
}) {
  const visual = useResolvedLlmVisual({ mode, task, userText, thinkingEnabled })
  if (visual === 'thinking') {
    return <ThinkingOrbitIcon size={16} className={`shrink-0 text-[var(--gold)] ${className}`} />
  }
  if (visual === 'generating') {
    return <SyncOrbitIcon size={14} className={`shrink-0 text-[var(--sage)] ${className}`} />
  }
  return <SyncOrbitIcon size={14} className={`shrink-0 ${className}`} />
}
