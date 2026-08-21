import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Compass,
  Check,
  ChevronDown,
  Clock,
  Sparkles,
  Loader2,
} from 'lucide-react'
import type { AccessibleTrip } from '../services/tripCloud'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassModalSurfaceClass,
} from '../../../shared/styles/glassCapsule'

export interface TripSelectorCapsuleProps {
  trips: AccessibleTrip[]
  activeTrip: AccessibleTrip | null
  onSelectTrip: (tripId: string) => Promise<void> | void
  className?: string
}

/**
 * Format relative time in Chinese (e.g. "刚刚", "10分钟前", "昨天")
 */
function formatRelativeTime(isoString?: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}小时前`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays}天前`
    return `${date.getMonth() + 1}月${date.getDate()}日`
  } catch {
    return ''
  }
}

export function TripSelectorCapsule({
  trips,
  activeTrip,
  onSelectTrip,
  className = '',
}: TripSelectorCapsuleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isShared = activeTrip ? activeTrip.role !== 'owner' : false
  const canSwitch = trips.length > 1

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = async (tripId: string) => {
    if (tripId === activeTrip?.id) {
      setIsOpen(false)
      return
    }
    try {
      setSwitchingId(tripId)
      await onSelectTrip(tripId)
      setIsOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '切换失败')
    } finally {
      setSwitchingId(null)
    }
  }

  // Determine current capsule label & badge
  const displayTitle = activeTrip
    ? activeTrip.role === 'owner'
      ? activeTrip.isPrimary
        ? '我的主行程'
        : activeTrip.title || '我的行程'
      : `来自 ${activeTrip.ownerName || '他人'}`
    : '行程空间'

  const roleTone =
    activeTrip?.role === 'owner'
      ? glassCapsuleToneClass.copper
      : activeTrip?.role === 'editor'
        ? glassCapsuleToneClass.sage
        : glassCapsuleToneClass.neutral

  const roleText =
    activeTrip?.role === 'owner'
      ? activeTrip.isPrimary
        ? '主'
        : '拥有者'
      : activeTrip?.role === 'editor'
        ? '协作'
        : '只读'

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger Capsule Button */}
      <button
        type="button"
        disabled={!canSwitch}
        onClick={() => canSwitch && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`当前行程：${displayTitle}，点击切换`}
        className={`group relative isolate flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-[var(--ink)] shadow-sm backdrop-blur-md transition-all duration-200 ${
          canSwitch
            ? 'cursor-pointer hover:bg-white/95 hover:shadow hover:border-white active:scale-95'
            : 'cursor-default opacity-90'
        } ${isOpen ? 'ring-2 ring-[var(--copper)]/30 bg-white' : ''}`}
      >
        {/* Subtle Specular Top Highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent"
        />

        {/* Icon & Source indicator */}
        <span className="flex shrink-0 items-center text-[var(--copper)]">
          {switchingId ? (
            <Loader2 size={12} className="animate-spin text-[var(--copper)]" />
          ) : isShared ? (
            <Users size={12} strokeWidth={2} className="text-[var(--sage)]" />
          ) : (
            <Sparkles size={11} strokeWidth={2} className="text-[var(--copper)]" />
          )}
        </span>

        {/* Title / Owner Handle */}
        <span className="max-w-[130px] truncate text-[11px] font-medium tracking-tight text-[var(--ink)] sm:max-w-[160px]">
          {displayTitle}
        </span>

        {/* Micro Role Pill */}
        <span
          className={`${glassCapsuleSurfaceClass} ${roleTone} inline-flex items-center px-1.5 py-0.2 text-[9.5px] font-semibold leading-tight`}
        >
          {roleText}
        </span>

        {/* Dropdown Chevron */}
        {canSwitch && (
          <ChevronDown
            size={11}
            strokeWidth={2.2}
            className={`shrink-0 text-[var(--stone)] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[var(--ink)]' : 'group-hover:text-[var(--ink)]'
            }`}
          />
        )}
      </button>

      {/* Dropdown Menu Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            role="listbox"
            aria-label="选择行程"
            className={`absolute left-0 top-full z-50 mt-2 w-[270px] sm:w-[300px] overflow-hidden rounded-2xl p-2 shadow-[0_16px_40px_rgba(0,0,0,0.12),inset_0_1px_1.5px_rgba(255,255,255,1)] ${glassModalSurfaceClass}`}
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--mist)]/50 pb-2">
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--stone)]">
                行程空间切换
              </span>
              <span className="text-[10.5px] text-[var(--stone)]/80">
                共 {trips.length} 个行程
              </span>
            </div>

            {/* Trips List */}
            <div className="mt-1.5 max-h-[260px] space-y-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {trips.map((trip) => {
                const isActive = trip.id === activeTrip?.id
                const isItemShared = trip.role !== 'owner'
                const isSwitchingThis = switchingId === trip.id

                return (
                  <button
                    key={trip.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={isSwitchingThis}
                    onClick={() => handleSelect(trip.id)}
                    className={`group relative w-full flex items-center justify-between gap-2.5 rounded-xl p-2.5 text-left transition-all duration-150 outline-none ${
                      isActive
                        ? 'bg-[var(--copper)]/10 border border-[var(--copper)]/25 shadow-sm'
                        : 'hover:bg-white/80 border border-transparent hover:border-white/60 active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Trip Icon / Avatar */}
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                          isActive
                            ? 'bg-[var(--copper)] text-white shadow-sm'
                            : isItemShared
                              ? 'bg-[var(--sage)]/15 text-[var(--sage)]'
                              : 'bg-[var(--copper)]/15 text-[var(--copper)]'
                        }`}
                      >
                        {isSwitchingThis ? (
                          <Loader2 size={13} className="animate-spin text-white" />
                        ) : isItemShared ? (
                          <Users size={13} strokeWidth={2.2} />
                        ) : (
                          <Compass size={13} strokeWidth={2.2} />
                        )}
                      </div>

                      {/* Text info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`truncate text-xs font-medium ${
                              isActive ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink)]'
                            }`}
                          >
                            {trip.isPrimary ? '我的主行程' : trip.title || '行程规划'}
                          </span>
                          {trip.isPrimary && (
                            <span className="shrink-0 rounded bg-[var(--copper)]/15 px-1 py-0.2 text-[9px] font-bold text-[var(--copper)]">
                              默认
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-[10.5px] text-[var(--stone)] mt-0.5">
                          <span>
                            {isItemShared
                              ? `来自 ${trip.ownerName || '他人'}`
                              : '自己创建'}
                          </span>
                          {trip.updatedAt && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Clock size={9} className="opacity-60" />
                                {formatRelativeTime(trip.updatedAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side status / badge */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium ${
                          trip.role === 'owner'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                            : trip.role === 'editor'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                              : 'bg-zinc-100 text-zinc-600 border border-zinc-200/50'
                        }`}
                      >
                        {trip.role === 'owner'
                          ? '拥有者'
                          : trip.role === 'editor'
                            ? '协作'
                            : '只读'}
                      </span>

                      {isActive && (
                        <Check
                          size={14}
                          strokeWidth={2.4}
                          className="text-[var(--copper)]"
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
