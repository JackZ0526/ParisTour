import { motion } from 'framer-motion'
import { CalendarDays, Luggage, Sparkles } from 'lucide-react'
import type { AppTab } from '../types'

export interface TopNavSegmentProps {
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  itineraryReady?: boolean
  className?: string
}

const TABS: Array<{
  id: AppTab
  label: string
  Icon: typeof CalendarDays
}> = [
  { id: 'itinerary', label: '每日行程', Icon: CalendarDays },
  { id: 'logistics', label: '出行预订', Icon: Luggage },
  { id: 'assistant', label: 'AI 助手', Icon: Sparkles },
]

export function TopNavSegment({
  activeTab,
  onSelectTab,
  itineraryReady,
  className = '',
}: TopNavSegmentProps) {
  return (
    <div
      role="tablist"
      aria-label="主要导航"
      className={`relative inline-flex items-center rounded-full border border-white/60 bg-white/70 p-1.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),0_12px_28px_-6px_rgba(0,0,0,0.12)] backdrop-blur-2xl backdrop-saturate-[190%] dark:border-white/15 dark:bg-[rgba(26,26,28,0.75)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_12px_28px_rgba(0,0,0,0.4)] ${className}`}
    >
      {/* Specular Liquid Light Flare */}
      <div className="pointer-events-none absolute inset-x-4 top-0 h-[40%] rounded-t-full bg-gradient-to-b from-white/40 via-white/10 to-transparent dark:from-white/15" />

      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(id)}
            className="relative isolate flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none"
          >
            {isActive && (
              <motion.span
                layoutId="top-nav-active-pill"
                className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-[0_4px_14px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.2)]"
                transition={{
                  type: 'spring',
                  stiffness: 480,
                  damping: 32,
                  mass: 0.7,
                }}
              />
            )}

            <Icon
              size={16}
              strokeWidth={isActive ? 2.3 : 1.8}
              className={`relative z-10 transition-colors ${
                isActive
                  ? 'text-[var(--paper)]'
                  : 'text-[var(--stone)] group-hover:text-[var(--ink)]'
              }`}
            />

            <span
              className={`relative z-10 transition-colors ${
                isActive ? 'text-[var(--paper)] font-semibold' : 'text-[var(--stone)] hover:text-[var(--ink)]'
              }`}
            >
              {label}
            </span>

            {id === 'logistics' && !itineraryReady && (
              <span className="relative z-10 h-2 w-2 rounded-full bg-[var(--copper)]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
