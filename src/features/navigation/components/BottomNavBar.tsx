import { motion } from 'framer-motion'
import {
  CalendarDays,
  Luggage,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
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
      aria-label="iOS 悬浮液态玻璃导航栏"
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[350px] select-none lg:hidden"
    >
      {/* Outer Liquid Glass Island Capsule */}
      <nav
        aria-label="主要导航"
        className="relative flex h-[62px] items-center justify-between gap-1 rounded-full border border-white/70 bg-white/45 p-1.5 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-1px_1px_rgba(0,0,0,0.05),0_18px_38px_-6px_rgba(0,0,0,0.15),0_6px_14px_-2px_rgba(0,0,0,0.08)] backdrop-blur-3xl backdrop-saturate-[200%] transition-colors dark:border-white/20 dark:bg-[rgba(28,28,32,0.55)] dark:shadow-[inset_0_1.5px_1.5px_rgba(255,255,255,0.2),0_20px_42px_rgba(0,0,0,0.5)]"
      >
        {/* Specular Liquid Light Sheen on top half */}
        <div className="pointer-events-none absolute inset-x-4 top-0 h-[45%] rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent dark:from-white/20" />

        {/* Navigation Tabs (Left cluster) */}
        <div className="flex flex-1 items-center justify-around gap-1">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                whileTap={{ scale: 0.91 }}
                className="relative flex h-[50px] flex-1 items-center justify-center rounded-[22px] outline-none transition-transform"
              >
                {/* iOS Tinted Glass Active Bubble (Exact Apple Music Liquid Glass Pill) */}
                {isActive && (
                  <motion.div
                    layoutId="ios-liquid-active-pill"
                    className="absolute inset-0 rounded-[22px] border border-[var(--copper)]/30 bg-[var(--copper)]/15 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.7),0_3px_10px_rgba(190,90,50,0.18)] backdrop-blur-md dark:border-[var(--gold)]/35 dark:bg-[var(--gold)]/20"
                    transition={{
                      type: 'spring',
                      stiffness: 480,
                      damping: 32,
                      mass: 0.65,
                    }}
                  >
                    {/* Inner highlight */}
                    <div className="absolute inset-x-2 top-0 h-[40%] rounded-t-[22px] bg-gradient-to-b from-white/30 to-transparent" />
                  </motion.div>
                )}

                {/* Tab Icon & Label */}
                <div className="relative z-10 flex flex-col items-center justify-center py-0.5">
                  <div className="relative">
                    <motion.div
                      animate={{
                        scale: isActive ? 1.08 : 1,
                        y: isActive ? -1 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    >
                      <Icon
                        size={19}
                        strokeWidth={isActive ? 2.4 : 1.8}
                        className={
                          isActive
                            ? 'text-[var(--copper)] drop-shadow-[0_1px_2px_rgba(190,90,50,0.25)] dark:text-[var(--gold)]'
                            : 'text-zinc-700/80 transition-colors hover:text-zinc-950 dark:text-zinc-300'
                        }
                      />
                    </motion.div>

                    {/* Setup / Unread indicator dot */}
                    {id === 'logistics' && !itineraryReady && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[var(--copper)] ring-2 ring-white/90 dark:ring-black/90" />
                    )}

                    {id === 'assistant' && unreadAssistant && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white/90 dark:ring-black/90" />
                    )}
                  </div>

                  <span
                    className={`mt-0.5 text-[10px] tracking-tight transition-colors ${
                      isActive
                        ? 'font-bold text-[var(--copper)] dark:text-[var(--gold)]'
                        : 'font-medium text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Right Circular Quick Preferences / Action Glass Pill (Like the Search button in iOS reference) */}
        {onOpenPreferences && (
          <motion.button
            type="button"
            onClick={onOpenPreferences}
            whileTap={{ scale: 0.88 }}
            title="偏好设置"
            aria-label="偏好设置"
            className="relative flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all hover:bg-white/60 active:bg-white/80 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <SlidersHorizontal
              size={17}
              strokeWidth={2}
              className="text-zinc-700 transition-colors dark:text-zinc-200"
            />
          </motion.button>
        )}
      </nav>
    </aside>
  )
}
