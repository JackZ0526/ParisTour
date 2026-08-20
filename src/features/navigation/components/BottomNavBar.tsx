import { motion } from 'framer-motion'
import { CalendarDays, Luggage, User } from 'lucide-react'
import type { AppTab } from '../types'

export interface BottomNavBarProps {
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  itineraryReady?: boolean
}

const TABS: Array<{
  id: AppTab
  label: string
  Icon: typeof CalendarDays
}> = [
  { id: 'itinerary', label: '行程', Icon: CalendarDays },
  { id: 'logistics', label: '出行', Icon: Luggage },
  { id: 'profile', label: '我的', Icon: User },
]

export function BottomNavBar({
  activeTab,
  onSelectTab,
  itineraryReady,
}: BottomNavBarProps) {
  return (
    <aside
      aria-label="悬浮导航栏"
      className="fixed bottom-[max(1.15rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[320px] select-none lg:hidden"
    >
      {/* High-transparency Semi-transparent Frosted Glass Capsule */}
      <nav
        aria-label="主要导航"
        className="flex h-[58px] items-center justify-around gap-1 rounded-full border border-white/50 bg-white/35 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-2xl backdrop-saturate-[180%] transition-colors"
      >
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
              {/* Semi-transparent Active Frosted Pill with Dynamic Jelly Spring Physics */}
              {isActive && (
                <motion.div
                  layoutId="semi-translucent-active-pill"
                  className="absolute inset-0 rounded-full border border-white/60 bg-white/45 shadow-[0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md"
                  animate={{
                    scaleX: [1, 1.15, 0.95, 1],
                    scaleY: [1, 0.88, 1.04, 1],
                  }}
                  transition={{
                    layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                    scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                    scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
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
                      strokeWidth={isActive ? 2.4 : 1.9}
                      className={
                        isActive
                          ? 'text-[var(--copper)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                          : 'text-zinc-600 transition-colors hover:text-zinc-950'
                      }
                    />
                  </motion.div>

                  {/* Setup indicator dot */}
                  {id === 'logistics' && !itineraryReady && (
                    <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--copper)]" />
                  )}
                </div>

                <span
                  className={`text-[10.5px] tracking-tight transition-colors ${
                    isActive
                      ? 'font-bold text-[var(--copper)]'
                      : 'font-medium text-zinc-600'
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
