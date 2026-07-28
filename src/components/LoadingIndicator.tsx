import type { ReactNode } from 'react'

type Tone = 'sage' | 'copper' | 'ink' | 'paper'
type Size = 'sm' | 'md'
type Variant = 'inline' | 'block' | 'badge'
/** sync = CloudSave family; thinking = LLM / AI “casting” HUD */
type Mode = 'sync' | 'thinking'

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
    <svg
      className={`cloud-sync-orbit ${spinning ? 'is-spinning' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
      <path
        d="M16 5a11 11 0 0 1 11 11"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 27A11 11 0 0 1 5 16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  )
}

/**
 * LLM thinking mark — dual orbits + rune ticks + breathing core.
 * Sized for the CloudSave icon slot (28); gold/sage reads on dark HUD chrome.
 */
export function ThinkingOrbitIcon({
  size = 28,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`llm-think-orbit ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <circle className="llm-think-aura" cx="16" cy="16" r="15" fill="currentColor" />
      <circle
        className="llm-think-pulse-ring"
        cx="16"
        cy="16"
        r="13.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.8" />
      <g className="llm-think-ticks" stroke="currentColor" strokeLinecap="round">
        <path d="M16 2.8v2.6" strokeWidth="1.7" />
        <path d="M29.2 16h-2.6" strokeWidth="1.7" />
        <path d="M16 29.2v-2.6" strokeWidth="1.7" />
        <path d="M2.8 16h2.6" strokeWidth="1.7" />
        <path d="M25.4 6.6l-1.8 1.8" strokeWidth="1.4" />
        <path d="M6.6 25.4l1.8-1.8" strokeWidth="1.4" />
      </g>
      <g className="llm-think-arc-a">
        <path
          d="M16 5a11 11 0 0 1 11 11"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="27" cy="16" r="1.8" fill="currentColor" />
      </g>
      <g className="llm-think-arc-b">
        <path
          d="M16 27A11 11 0 0 1 5 16"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeOpacity="0.65"
        />
      </g>
      <circle
        className="llm-think-core-ring"
        cx="16"
        cy="16"
        r="4.4"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        fill="none"
      />
      <circle className="llm-think-core" cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
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

/** Dark charcoal HUD pill — same chrome as CloudSaveIndicator toast. */
function ThinkingHudBadge({
  label,
  kicker = 'AI THINKING',
  className = '',
  embed = true,
}: {
  label: ReactNode
  kicker?: string
  className?: string
  /** When true, sits inline (not fixed corner toast). */
  embed?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`cloud-save-toast is-busy ${embed ? 'llm-think-embed' : ''} ${className}`}
    >
      <div className="cloud-save-toast-glow llm-think-toast-glow" aria-hidden />
      <div className="cloud-save-toast-inner">
        <div className="cloud-save-icon-wrap">
          <ThinkingOrbitIcon size={28} />
        </div>
        <div className="cloud-save-copy">
          <span className="cloud-save-kicker">{kicker}</span>
          <span className="cloud-save-label">{label}</span>
        </div>
        <ChargeBars size="md" className="cloud-save-toast-bars" />
      </div>
    </div>
  )
}

/**
 * Shared wait/progress indicator — sync-orbit + equalizer bars (CloudSave style).
 * Pass mode="thinking" for LLM / AI generation.
 * Block / badge thinking → dark AUTO-SAVE-style HUD pill; inline stays compact.
 */
export function LoadingIndicator({
  label,
  variant = 'inline',
  size = 'sm',
  tone = 'sage',
  mode = 'sync',
  showSpinner = true,
  showDots = false,
  kicker,
  className = '',
  children,
}: {
  label?: ReactNode
  variant?: Variant
  size?: Size
  tone?: Tone
  /** sync = save/sync family; thinking = game-style LLM casting HUD */
  mode?: Mode
  /** Orbit spinner (default on). Kept for API compat with older call sites. */
  showSpinner?: boolean
  /**
   * Equalizer / charge bars. When true alone (legacy “thinking”), still uses
   * orbit + bars so all loaders share one visual language.
   */
  showDots?: boolean
  /** Eyebrow for thinking HUD (default AI THINKING). */
  kicker?: string
  className?: string
  children?: ReactNode
}) {
  const s = sizeClass[size]
  const text = children ?? label
  const active = showSpinner || showDots
  const thinking = mode === 'thinking'

  // Block / badge thinking → same dark HUD toast shell as CloudSave.
  if (thinking && (variant === 'block' || variant === 'badge')) {
    const hud = (
      <ThinkingHudBadge
        label={text ?? '思考中…'}
        kicker={kicker ?? 'AI THINKING'}
        className={variant === 'badge' ? className : undefined}
      />
    )
    if (variant === 'block') {
      return (
        <div className={`flex items-center justify-center py-6 ${className}`}>{hud}</div>
      )
    }
    return hud
  }

  const Orbit = thinking ? ThinkingOrbitIcon : SyncOrbitIcon
  const Bars = thinking ? ChargeBars : ActivityBars
  const pulseClass = thinking ? 'llm-think-pulse' : 'loading-pulse-soft'
  const orbitExtra = thinking ? 'text-[var(--gold)]' : ''
  const barsExtra = thinking ? 'text-[var(--gold)]' : ''

  if (variant === 'badge') {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`${pulseClass} inline-flex items-center ${s.gap} rounded-full bg-[var(--gold)]/20 px-2.5 py-1 ${s.text} text-[var(--ink)] ${className}`}
      >
        {active && (
          <Orbit size={s.orbit} className={`shrink-0 text-[var(--copper)]`} />
        )}
        {active && <Bars size={size} className="text-[var(--copper)]" />}
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
      className={`${thinking ? pulseClass : ''} inline-flex items-center ${s.gap} ${s.text} ${
        thinking ? 'text-[var(--ink)]' : toneClass[tone]
      } ${className}`}
    >
      {active && <Orbit size={thinking ? 16 : s.orbit} className={`shrink-0 ${orbitExtra}`} />}
      {active && <Bars size={size} className={barsExtra} />}
      {text != null && text !== '' && <span>{text}</span>}
    </span>
  )
}

/** Compact orbit for dark/solid buttons (inherits currentColor). */
export function ButtonSpinner({
  className = '',
  mode = 'sync',
}: {
  className?: string
  mode?: Mode
}) {
  if (mode === 'thinking') {
    return <ThinkingOrbitIcon size={16} className={`shrink-0 text-[var(--gold)] ${className}`} />
  }
  return <SyncOrbitIcon size={14} className={`shrink-0 ${className}`} />
}
