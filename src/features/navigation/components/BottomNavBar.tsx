import { motion } from 'framer-motion'
import { CalendarDays, Luggage, Sparkles } from 'lucide-react'
import type { AppTab } from '../types'

export interface BottomNavBarProps {
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  itineraryReady?: boolean
  unreadAssistant?: boolean
}

const TABS: Array<{
  id: AppTab
  label: string
  Icon: typeof CalendarDays
}> = [
  { id: 'itinerary', label: '行程', Icon: CalendarDays },
  { id: 'logistics', label: '出行', Icon: Luggage },
  { id: 'assistant', label: 'AI 助手', Icon: Sparkles },
]

export function BottomNavBar({
  activeTab,
  onSelectTab,
  itineraryReady,
  unreadAssistant,
}: BottomNavBarProps) {
  return (
    <aside
      aria-label="悬浮导航栏"
      className="fixed bottom-[max(1.15rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2.25rem)] max-w-[360px] select-none lg:hidden"
    >
      {/* Liquid Glass Outer Floating Capsule */}
      <nav
        aria-label="主要导航"
        className="relative flex h-[62px] items-center justify-around rounded-[32px] border border-white/60 bg-white/70 p-1.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),0_18px_40px_-8px_rgba(0,0,0,0.18),0_6px_16px_-4px_rgba(0,0,0,0.08)] backdrop-blur-2xl backdrop-saturate-[200%] dark:border-white/15 dark:bg-[rgba(26,26,28,0.75)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_20px_45px_rgba(0,0,0,0.5)]"
      >
        {/* Specular Liquid Light Flare (Top Glass Reflection) */}
        <div className="pointer-events-none absolute inset-x-5 top-0 h-[40%] rounded-t-[32px] bg-gradient-to-b from-white/40 via-white/10 to-transparent dark:from-white/15" />

        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <motion.button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              whileTap={{ scale: 0.92 }}
              className="relative flex h-full flex-1 items-center justify-center rounded-[26px] outline-none"
            >
              {/* Fluid Active Pill with Liquid Depth */}
              {isActive && (
                <motion.div
                  layoutId="liquid-floating-pill"
                  className="absolute inset-0 rounded-[26px] bg-[var(--ink)] shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.25)]"
                  transition={{
                    type: 'spring',
                    stiffness: 480,
                    damping: 32,
                    mass: 0.7,
                  }}
                >
                  {/* Subtle glossy sheen inside active pill */}
                  <div className="absolute inset-x-2 top-0 h-[45%] rounded-t-[26px] bg-gradient-to-b from-white/20 to-transparent" />
                </motion.div>
              )}

              {/* Icon & Label with Fluid Transitions */}
              <div className="relative z-10 flex flex-col items-center justify-center">
                <div className="relative">
                  <motion.div
                    animate={{
                      scale: isActive ? 1.06 : 1,
                      y: isActive ? -1 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                  >
                    <Icon
                      size={19}
                      strokeWidth={isActive ? 2.3 : 1.9}
                      className={
                        isActive
                          ? 'text-[var(--paper)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
                          : 'text-[var(--stone)] transition-colors group-hover:text-[var(--ink)]'
                      }
                    />
                  </motion.div>

                  {/* Dot indicator for setup status */}
                  {id === 'logistics' && !itineraryReady && (
                    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[var(--copper)] ring-2 ring-white/80 dark:ring-black/80" />
                  )}

                  {id === 'assistant' && unreadAssistant && (
                    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white/80 dark:ring-black/80" />
                  )}
                </div>

                <span
                  className={`mt-0.5 text-[10.5px] tracking-tight transition-all duration-200 ${
                    isActive
                      ? 'font-semibold text-[var(--paper)]'
                      : 'font-medium text-[var(--stone)]'
                  }`}
                >
                  {label}
                </span>
              </div>
            </motion.button>
          )
        })}
      </nav>
    </aside>
  )
}
