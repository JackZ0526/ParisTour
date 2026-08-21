import { useState } from 'react'
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
  { id: 'logistics', label: '出行预订', Icon: Luggage },
  { id: 'itinerary', label: '每日行程', Icon: CalendarDays },
  { id: 'profile', label: '我的', Icon: User },
]

export function TopNavSegment({
  activeTab,
  onSelectTab,
  itineraryReady,
  className = '',
}: TopNavSegmentProps) {
  const [hasInteracted, setHasInteracted] = useState(false)
  return (
    <div
      role="tablist"
      aria-label="主要导航"
      className={`relative inline-flex items-center overflow-hidden rounded-full bg-white/45 dark:bg-[#151c18]/75 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.08),inset_0_1px_1.5px_0_rgba(255,255,255,1),inset_0_-1px_1px_0_rgba(255,255,255,0.6),inset_0_0_12px_rgba(255,255,255,0.35)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45),inset_0_1px_1.5px_0_rgba(255,255,255,0.15),inset_0_-1px_1px_0_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-[180%] transition-colors ${className}`}
    >
      {/* Liquid Glass Flowing Gradient Border (流光折射渐变发丝描边) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full p-[1px]"
        style={{
          background:
            'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.22) 28%, rgba(255, 255, 255, 0.06) 55%, rgba(255, 255, 255, 0.75) 85%, rgba(255, 255, 255, 0.3) 100%)',
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />

      {/* Specular Light Reflection Highlights (顶部与底部玻璃反光弧光) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 z-20 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white dark:via-white/20 to-transparent opacity-95"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 bottom-0 z-20 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent opacity-75"
      />

      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              setHasInteracted(true)
              onSelectTab(id)
            }}
            className="relative isolate flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors outline-none cursor-pointer"
          >
            {isActive && (
              <motion.span
                layoutId="light-top-nav-active-pill"
                className="absolute inset-0 overflow-hidden rounded-full bg-white/70 dark:bg-white/10 shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.7)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.3),inset_0_1px_1.5px_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.4)] backdrop-blur-md"
                animate={
                  hasInteracted
                    ? {
                        scaleX: [1, 1.15, 0.95, 1],
                        scaleY: [1, 0.88, 1.04, 1],
                      }
                    : undefined
                }
                transition={{
                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                }}
              >
                {/* Dynamic Pill Gradient Border (活动滑块流光描边) */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full p-[1px]"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.32) 35%, rgba(255, 255, 255, 0.1) 65%, rgba(255, 255, 255, 0.85) 100%)',
                    WebkitMask:
                      'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
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
                  : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-100'
              }`}
            />

            <span
              className={`relative z-10 transition-colors ${
                isActive
                  ? 'font-bold text-[var(--copper)]'
                  : 'font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
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
