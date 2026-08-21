import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

export type DayTabTheme = 'glass-copper' | 'copper-gradient' | 'ink'

type DayTabButtonProps = {
  dayNumber: number
  dateLabel?: string
  title: string
  pending: boolean
  active: boolean
  hasInteracted?: boolean
  theme?: DayTabTheme
  onSelect: () => void
}

/**
 * Day switcher tab that animates width/height when content swaps from
 * shimmer skeleton → real title (cubic ease-out, not linear).
 * Features a fluid shared "ink blob" that glides between active days.
 */
export function DayTabButton({
  dayNumber,
  dateLabel,
  title,
  pending,
  active,
  hasInteracted,
  theme = 'glass-copper',
  onSelect,
}: DayTabButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)

  const placeholderTitle = /^第\s*\d+\s*天$/.test(title.trim())
  /** Streaming preview title while the day is still generating. */
  const streamingTitle = pending && Boolean(title) && !placeholderTitle

  useLayoutEffect(() => {
    const button = buttonRef.current
    if (!button) return

    // Release fixed size so we measure the natural content box, then restore
    // the previous inline size before React commits the next animated box.
    const prevW = button.style.width
    const prevH = button.style.height
    button.style.width = 'auto'
    button.style.height = 'auto'
    const nextW = Math.ceil(button.getBoundingClientRect().width)
    const nextH = Math.ceil(button.getBoundingClientRect().height)
    button.style.width = prevW
    button.style.height = prevH

    setBox((prev) => {
      if (prev && prev.w === nextW && prev.h === nextH) return prev
      return { w: nextW, h: nextH }
    })
  }, [pending, title, dateLabel, active, streamingTitle])

  const dateLine = `D${dayNumber}${dateLabel ? ` · ${dateLabel}` : ''}`

  const activePillClass =
    theme === 'glass-copper'
      ? 'absolute inset-0 z-0 rounded-full border border-white bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-md'
      : theme === 'copper-gradient'
        ? 'absolute inset-0 z-0 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] shadow-[0_4px_16px_rgba(179,107,60,0.32),inset_0_1px_1.5px_rgba(255,255,255,0.45)] border border-[#c47c4d]/50'
        : 'absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)]'

  const dateTextColor = active
    ? theme === 'glass-copper'
      ? 'text-[var(--copper)] font-bold'
      : theme === 'copper-gradient'
        ? 'text-white font-bold'
        : 'text-[var(--paper)] font-bold'
    : 'text-[var(--ink)]/85 font-medium'

  const subtitleTextColor = active
    ? theme === 'glass-copper'
      ? 'text-[var(--ink)] font-medium'
      : theme === 'copper-gradient'
        ? 'text-white/90 font-medium'
        : 'text-[var(--paper)]/85'
    : 'text-[var(--stone)]'

  const shimmerClass = active
    ? theme === 'glass-copper'
      ? 'day-tab-shimmer'
      : 'day-tab-shimmer-on-ink'
    : 'day-tab-shimmer'

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-busy={pending || undefined}
      aria-label={pending ? `第 ${dayNumber} 天，正在生成` : undefined}
      style={box ? { width: box.w, height: box.h } : undefined}
      className={`day-tab-button relative isolate snap-start shrink-0 rounded-full px-3.5 py-2 text-sm outline-none transition-all duration-200 sm:px-4 ${
        active
          ? ''
          : 'border border-white/70 bg-white/60 shadow-xs hover:border-white hover:bg-white/85 hover:shadow'
      }`}
    >
      {active && (
        <motion.span
          layoutId="active-day-tab-ink"
          className={activePillClass}
          animate={
            hasInteracted
              ? {
                  scaleX: [1, 1.15, 0.95, 1],
                  scaleY: [1, 0.88, 1.03, 1],
                }
              : undefined
          }
          transition={{
            layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
            scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
            scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
          }}
        />
      )}

      <span className="relative z-10 block w-max max-w-none transition-colors duration-200">
        <span className={`block leading-tight ${dateTextColor}`}>{dateLine}</span>
        <span className={`mt-0.5 block text-[11px] leading-[1.25] ${subtitleTextColor}`}>
          {pending && !streamingTitle ? (
            <span
              aria-hidden
              className={`block h-[1em] w-full rounded-full ${shimmerClass}`}
            />
          ) : (
            <span
              className={`block max-w-[9.5rem] truncate sm:max-w-none ${
                streamingTitle ? 'chat-step-shimmer' : ''
              }`}
            >
              {title}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
