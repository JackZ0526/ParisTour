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
      className={`inline-flex items-center rounded-full border border-black/5 bg-white/70 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-colors dark:border-white/10 dark:bg-zinc-900/75 dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] ${className}`}
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
            className="relative isolate flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none"
          >
            {isActive && (
              <motion.span
                layoutId="top-nav-active-pill"
                className="absolute inset-0 z-0 rounded-full bg-[var(--copper)]/12 dark:bg-[var(--copper)]/20"
                transition={{
                  type: 'spring',
                  stiffness: 480,
                  damping: 32,
                  mass: 0.65,
                }}
              />
            )}

            <Icon
              size={16}
              strokeWidth={isActive ? 2.3 : 1.8}
              className={`relative z-10 transition-colors ${
                isActive
                  ? 'text-[var(--copper)]'
                  : 'text-zinc-500 group-hover:text-zinc-800 dark:text-zinc-400 dark:group-hover:text-zinc-200'
              }`}
            />

            <span
              className={`relative z-10 transition-colors ${
                isActive
                  ? 'font-semibold text-[var(--copper)]'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              {label}
            </span>

            {id === 'logistics' && !itineraryReady && (
              <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-[var(--copper)]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
