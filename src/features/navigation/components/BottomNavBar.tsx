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
      {/* Light Frosted Glass Island */}
      <nav
        aria-label="主要导航"
        className="flex h-[58px] items-center justify-between gap-1 rounded-full border border-white/80 bg-white/85 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-colors"
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
                {/* Light Crisp White Active Floating Pill */}
                {isActive && (
                  <motion.div
                    layoutId="light-frosted-active-pill"
                    className="absolute inset-0 rounded-full border border-black/[0.04] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
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
                        scale: isActive ? 1.06 : 1,
                      }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    >
                      <Icon
                        size={18}
                        strokeWidth={isActive ? 2.3 : 1.8}
                        className={
                          isActive
                            ? 'text-[var(--copper)]'
                            : 'text-zinc-400 transition-colors hover:text-zinc-700'
                        }
                      />
                    </motion.div>

                    {/* Setup indicator dot */}
                    {id === 'logistics' && !itineraryReady && (
                      <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--copper)]" />
                    )}

                    {id === 'assistant' && unreadAssistant && (
                      <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                  </div>

                  <span
                    className={`text-[10.5px] tracking-tight transition-colors ${
                      isActive
                        ? 'font-semibold text-[var(--copper)]'
                        : 'font-medium text-zinc-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Right Preferences Button (Light Frosted Circle) */}
        {onOpenPreferences && (
          <motion.button
            type="button"
            onClick={onOpenPreferences}
            whileTap={{ scale: 0.9 }}
            title="偏好设置"
            aria-label="偏好设置"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-black/[0.04] bg-white/70 text-zinc-500 shadow-sm transition-all hover:bg-white hover:text-zinc-800 active:bg-white"
          >
            <SlidersHorizontal size={16} strokeWidth={1.9} />
          </motion.button>
        )}
      </nav>
    </aside>
  )
}
