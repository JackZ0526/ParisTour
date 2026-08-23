import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '../../../shared/i18n'

type DayTabButtonProps = {
  dayNumber: number
  dateLabel?: string
  title: string
  pending: boolean
  active: boolean
  hasInteracted?: boolean
  onSelect: () => void
}

/**
 * Day switcher tab that animates width/height when content swaps from
 * shimmer skeleton → real title (cubic ease-out, not linear).
 * Features a fluid shared copper-amber pill that glides between active days.
 */
export function DayTabButton({
  dayNumber,
  dateLabel,
  title,
  pending,
  active,
  hasInteracted,
  onSelect,
}: DayTabButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isMountedRef = useRef(false)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const { t } = useTranslation()

  const placeholderTitle = /^第\s*\d+\s*天$/.test(title.trim())
  /** Streaming preview title while the day is still generating. */
  const streamingTitle = pending && Boolean(title) && !placeholderTitle

  useLayoutEffect(() => {
    if (!pending && !streamingTitle) {
      if (box !== null) setBox(null)
      return
    }
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
  }, [pending, title, dateLabel, active, streamingTitle, box])

  useLayoutEffect(() => {
    // Delay interaction flag availability to subsequent user actions
    const timer = window.setTimeout(() => {
      isMountedRef.current = true
    }, 50)
    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  const dateLine = `D${dayNumber}${dateLabel ? ` · ${dateLabel}` : ''}`

  const shimmerClass = active ? 'day-tab-shimmer-on-ink' : 'day-tab-shimmer'

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-busy={pending || undefined}
      aria-label={pending ? t('itinerary.dayPendingAria', { day: dayNumber }) : undefined}
      style={box ? { width: box.w, height: box.h } : undefined}
      className={`day-tab-button relative isolate snap-start shrink-0 rounded-full px-3.5 py-2 text-sm outline-none transition-all duration-200 sm:px-4 ${
        active
          ? ''
          : 'border border-white/75 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 shadow-xs hover:border-white dark:hover:border-white/20 hover:bg-white/85 dark:hover:bg-[#202b26] hover:shadow-sm'
      }`}
    >
      {active && (
        <motion.span
          layoutId="active-day-tab-ink"
          className="absolute inset-0 z-0 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] shadow-[0_3px_12px_rgba(179,107,60,0.26),inset_0_1px_1.5px_rgba(255,255,255,0.45)] border border-[#c47c4d]/50 before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent before:content-['']"
          animate={
            hasInteracted && isMountedRef.current
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
        <span
          className={`block leading-tight ${
            active ? 'font-bold text-white' : 'font-semibold text-[var(--ink)]/85'
          }`}
        >
          {dateLine}
        </span>
        <span
          className={`mt-0.5 block text-[11px] leading-[1.25] ${
            active ? 'font-medium text-white/95' : 'text-[var(--stone)]'
          }`}
        >
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
