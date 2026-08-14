import { useLayoutEffect, useRef, useState } from 'react'

type DayTabButtonProps = {
  dayNumber: number
  dateLabel?: string
  title: string
  pending: boolean
  active: boolean
  onSelect: () => void
}

/**
 * Day switcher tab that animates width/height when content swaps from
 * shimmer skeleton → real title (cubic ease-out, not linear).
 */
export function DayTabButton({
  dayNumber,
  dateLabel,
  title,
  pending,
  active,
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

  const shimmerClass = active ? 'day-tab-shimmer-on-ink' : 'day-tab-shimmer'
  const dateLine = `D${dayNumber}${dateLabel ? ` · ${dateLabel}` : ''}`

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-busy={pending || undefined}
      aria-label={pending ? `第 ${dayNumber} 天，正在生成` : undefined}
      style={box ? { width: box.w, height: box.h } : undefined}
      className={`day-tab-button snap-start shrink-0 overflow-hidden rounded-full px-3 py-2 text-sm sm:px-4 ${
        active
          ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'bg-white/70 text-[var(--ink)] hover:bg-white'
      }`}
    >
      <span className="block w-max max-w-none">
        <span className="block leading-tight">{dateLine}</span>
        <span className="mt-0.5 block text-[11px] leading-[1.25]">
          {pending && !streamingTitle ? (
            <span
              aria-hidden
              className={`block h-[1em] w-full rounded-full ${shimmerClass}`}
            />
          ) : (
            <span
              className={`block max-w-[9.5rem] truncate sm:max-w-none ${
                streamingTitle
                  ? 'chat-step-shimmer'
                  : 'opacity-80 animate-fade-up'
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
