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
      {/* High-transparency Semi-transparent Frosted Glass Capsule with Specular Reflection */}
      <nav
        aria-label="主要导航"
        className="relative flex h-[58px] items-center justify-around gap-1 overflow-hidden rounded-full bg-white/45 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.1),inset_0_1px_1.5px_0_rgba(255,255,255,1),inset_0_-1px_1px_0_rgba(255,255,255,0.6),inset_0_0_12px_rgba(255,255,255,0.35)] backdrop-blur-2xl backdrop-saturate-[180%] transition-colors"
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
          className="pointer-events-none absolute inset-x-6 top-0 z-20 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-12 bottom-0 z-20 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-75"
        />

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
              {/* Semi-transparent Active Frosted Pill with Specular Reflection */}
              {isActive && (
                <motion.div
                  layoutId="semi-translucent-active-pill"
                  className="absolute inset-0 overflow-hidden rounded-full bg-white/70 shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.7)] backdrop-blur-md"
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
                </motion.div>
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
