import { motion } from 'framer-motion'
import { CalendarDays, Luggage, User } from 'lucide-react'
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
  { id: 'profile', label: '我的', Icon: User },
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
      className={`relative inline-flex items-center overflow-hidden rounded-full border-[1.5px] border-white/90 bg-white/45 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.08),inset_0_1.5px_2px_0_rgba(255,255,255,1),inset_0_-1px_1.5px_0_rgba(255,255,255,0.6),inset_0_0_12px_rgba(255,255,255,0.35)] backdrop-blur-2xl backdrop-saturate-[180%] transition-colors ${className}`}
    >
      {/* Specular Light Reflection Highlights (顶部与底部玻璃反光弧光) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 z-20 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 bottom-0 z-20 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-75"
      />

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
                layoutId="light-top-nav-active-pill"
                className="absolute inset-0 overflow-hidden rounded-full border-[1.5px] border-white/95 bg-white/70 shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.7)] backdrop-blur-md"
                animate={{
                  scaleX: [1, 1.15, 0.95, 1],
                  scaleY: [1, 0.88, 1.04, 1],
                }}
                transition={{
                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent"
                />
              </motion.span>
            )}

            <Icon
              size={16}
              strokeWidth={isActive ? 2.4 : 1.9}
              className={`relative z-10 transition-colors ${
                isActive
                  ? 'text-[var(--copper)]'
                  : 'text-zinc-500 group-hover:text-zinc-800'
              }`}
            />

            <span
              className={`relative z-10 transition-colors ${
                isActive
                  ? 'font-bold text-[var(--copper)]'
                  : 'font-medium text-zinc-600 hover:text-zinc-900'
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
