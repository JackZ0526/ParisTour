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
    <nav
      aria-label="主要导航"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--copper)]/15 bg-[var(--card)]/85 px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-colors lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <motion.button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              whileTap={{ scale: 0.92 }}
              className="relative flex flex-1 flex-col items-center justify-center py-1 outline-none transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-active-pill"
                  className="absolute inset-0 mx-auto -top-0.5 h-full w-14 rounded-2xl bg-[var(--copper)]/10"
                  transition={{
                    type: 'spring',
                    stiffness: 450,
                    damping: 32,
                    mass: 0.8,
                  }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center">
                <div className="relative">
                  <motion.div
                    animate={{
                      scale: isActive ? 1.08 : 1,
                      y: isActive ? -1 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                  >
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.3 : 1.8}
                      className={
                        isActive
                          ? 'text-[var(--copper)]'
                          : 'text-[var(--stone)] transition-colors hover:text-[var(--ink)]'
                      }
                    />
                  </motion.div>

                  {id === 'logistics' && !itineraryReady && (
                    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[var(--copper)] ring-2 ring-[var(--card)]" />
                  )}

                  {id === 'assistant' && unreadAssistant && (
                    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[var(--card)]" />
                  )}
                </div>

                <span
                  className={`mt-1 text-[11px] font-medium tracking-tight transition-colors ${
                    isActive
                      ? 'font-semibold text-[var(--copper)]'
                      : 'text-[var(--stone)]'
                  }`}
                >
                  {label}
                </span>
              </div>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
