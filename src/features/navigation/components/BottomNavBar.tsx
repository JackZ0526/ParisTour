import { motion } from 'framer-motion'
import { CalendarDays, Luggage, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { AppTab } from '../types'

export interface BottomNavBarProps {
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  itineraryReady?: boolean
  unreadAssistant?: boolean
  onOpenPreferences?: () => void
}

const TABS: Array<{
  id: AppTab
  label: string
  Icon: typeof CalendarDays
}> = [
  { id: 'itinerary', label: '行程', Icon: CalendarDays },
  { id: 'logistics', label: '出行', Icon: Luggage },
  { id: 'assistant', label: '助手', Icon: Sparkles },
]

export function BottomNavBar({
  activeTab,
  onSelectTab,
  itineraryReady,
  unreadAssistant,
  onOpenPreferences,
}: BottomNavBarProps) {
  return (
    <aside
      aria-label="悬浮导航栏"
      className="fixed bottom-[max(1.15rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[340px] select-none lg:hidden"
    >
      {/* Clean Frosted Glass Capsule */}
      <nav
        aria-label="主要导航"
        className="flex h-[58px] items-center justify-between gap-1 rounded-full border border-black/5 bg-white/70 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-2xl transition-colors dark:border-white/10 dark:bg-zinc-900/75 dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)]"
      >
        {/* Navigation Tabs */}
        <div className="flex flex-1 items-center justify-around gap-1">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                whileTap={{ scale: 0.92 }}
                className="relative flex h-[46px] flex-1 items-center justify-center rounded-full outline-none transition-colors"
              >
                {/* Clean Translucent Active Pill */}
                {isActive && (
                  <motion.div
                    layoutId="clean-frosted-active-pill"
                    className="absolute inset-0 rounded-full bg-[var(--copper)]/12 dark:bg-[var(--copper)]/20"
                    transition={{
                      type: 'spring',
                      stiffness: 480,
                      damping: 32,
                      mass: 0.65,
                    }}
                  />
                )}

                {/* Tab Icon & Label */}
                <div className="relative z-10 flex flex-col items-center justify-center">
                  <div className="relative">
                    <motion.div
                      animate={{
                        scale: isActive ? 1.05 : 1,
                      }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    >
                      <Icon
                        size={18}
                        strokeWidth={isActive ? 2.3 : 1.8}
                        className={
                          isActive
                            ? 'text-[var(--copper)]'
                            : 'text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                        }
                      />
                    </motion.div>

                    {/* Setup / Unread indicator dot */}
                    {id === 'logistics' && !itineraryReady && (
                      <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--copper)]" />
                    )}

                    {id === 'assistant' && unreadAssistant && (
                      <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                  </div>

                  <span
                    className={`text-[10px] tracking-tight transition-colors ${
                      isActive
                        ? 'font-semibold text-[var(--copper)]'
                        : 'font-medium text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Right Preferences Button */}
        {onOpenPreferences && (
          <motion.button
            type="button"
            onClick={onOpenPreferences}
            whileTap={{ scale: 0.9 }}
            title="偏好设置"
            aria-label="偏好设置"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-zinc-600 transition-colors hover:bg-black/[0.08] hover:text-zinc-900 active:bg-black/[0.12] dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
          >
            <SlidersHorizontal size={16} strokeWidth={1.9} />
          </motion.button>
        )}
      </nav>
    </aside>
  )
}
