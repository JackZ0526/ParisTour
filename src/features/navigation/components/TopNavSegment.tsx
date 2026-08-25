import { CalendarDays, Luggage, User } from 'lucide-react'
import type { AppTab } from '../types'
import { useTranslation } from '../../../shared/i18n'
import { BoundedLiquidPill } from '../../../shared/components/BoundedLiquidPill'
import { useLiquidPillInteraction } from '../../../shared/hooks/useLiquidPillInteraction'

export interface TopNavSegmentProps {
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  itineraryReady?: boolean
  className?: string
}

export function TopNavSegment({
  activeTab,
  onSelectTab,
  itineraryReady,
  className = '',
}: TopNavSegmentProps) {
  const { t } = useTranslation()
  const pillInteraction = useLiquidPillInteraction<AppTab>()

  const tabs: Array<{
    id: AppTab
    label: string
    Icon: typeof CalendarDays
  }> = [
    { id: 'logistics', label: t('nav.logistics'), Icon: Luggage },
    { id: 'itinerary', label: t('nav.itineraryDaily'), Icon: CalendarDays },
    { id: 'profile', label: t('nav.profile'), Icon: User },
  ]
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)
  return (
    <div
      role="tablist"
      aria-label={t('nav.itinerary')}
      className={`relative inline-flex items-center overflow-hidden rounded-full bg-white/45 dark:bg-[#151c18]/75 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.08),inset_0_1px_1.5px_0_rgba(255,255,255,1),inset_0_-1px_1px_0_rgba(255,255,255,0.6),inset_0_0_12px_rgba(255,255,255,0.35)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45),inset_0_1px_1.5px_0_rgba(255,255,255,0.15),inset_0_-1px_1px_0_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-[180%] transition-colors ${className}`}
    >
      {/* Liquid Glass Flowing Gradient Border (流光折射渐变发丝描边) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full p-[1px]"
        style={{
          background: 'var(--nav-capsule-border-gradient)',
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

      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (id === activeTab) return
              pillInteraction.activate(id)
              onSelectTab(id)
            }}
            className="relative isolate flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors outline-none cursor-pointer"
          >
            {isActive && (
              <BoundedLiquidPill
                layoutId="light-top-nav-active-pill"
                layoutDependency={activeTab}
                className="overflow-hidden rounded-full bg-white/70 dark:bg-white/10 shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.7)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.3),inset_0_1px_1.5px_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.4)] backdrop-blur-md"
                interactionToken={pillInteraction.tokenFor(id)}
                onInteractionSettled={pillInteraction.onInteractionSettled}
                edge={activeIndex === 0 ? 'left' : activeIndex === tabs.length - 1 ? 'right' : null}
              >
                {/* Dynamic Pill Gradient Border (活动滑块流光描边) */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 block rounded-full p-[1px]"
                  style={{
                    background: 'var(--nav-pill-border-gradient)',
                    WebkitMask:
                      'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white dark:via-white/20 to-transparent"
                />
              </BoundedLiquidPill>
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
