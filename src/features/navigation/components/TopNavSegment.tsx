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
      className={`inline-flex items-center rounded-2xl border border-[var(--copper)]/20 bg-[var(--card)]/90 p-1.5 shadow-sm backdrop-blur-md ${className}`}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(id)}
            className="relative isolate flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors outline-none"
          >
            {isActive && (
              <motion.span
                layoutId="top-nav-active-pill"
                className="absolute inset-0 z-0 rounded-xl bg-[var(--ink)] shadow-sm"
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 32,
                  mass: 0.8,
                }}
              />
            )}

            <Icon
              size={16}
              strokeWidth={isActive ? 2.2 : 1.8}
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
