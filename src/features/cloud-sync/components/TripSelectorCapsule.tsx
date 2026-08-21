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
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'

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
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const isShared = activeTrip ? activeTrip.role !== 'owner' : false
  const canSwitch = trips.length > 1

  // Handle opening and measuring button location
  const toggleOpen = () => {
    if (!canSwitch) return
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const popoverWidth = Math.min(300, window.innerWidth - 32)
      let left = rect.left
      if (left + popoverWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - 16 - popoverWidth)
      }
      setPopoverPos({
        top: rect.bottom + 6,
        left: Math.max(16, left),
      })
    }
    setIsOpen((prev) => !prev)
  }

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
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

  return (
    <div className={`relative inline-flex shrink-0 items-center ${className}`}>
      {/* Trigger Capsule Button */}
      <button
        ref={buttonRef}
        type="button"
        disabled={!canSwitch}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`当前行程：${displayTitle}，点击切换`}
        className={`group relative isolate inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2 text-[11px] font-medium text-[var(--ink)] shadow-xs backdrop-blur-md transition-all duration-200 ${
          canSwitch
            ? 'cursor-pointer hover:bg-white/95 hover:shadow hover:border-white active:scale-95'
            : 'cursor-default opacity-90'
        } ${isOpen ? 'ring-1.5 ring-[var(--copper)]/40 bg-white' : ''}`}
      >
        {/* Subtle Specular Top Highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-80"
        />

        {/* Icon & Source indicator */}
        <span className="flex shrink-0 items-center">
          {switchingId ? (
            <Loader2 size={11} className="animate-spin text-[var(--copper)]" />
          ) : isShared ? (
            <Users size={11} strokeWidth={2.2} className="text-[var(--sage)]" />
          ) : (
            <Sparkles size={10.5} strokeWidth={2.2} className="text-[var(--copper)]" />
          )}
        </span>

        {/* Title / Owner Handle */}
        <span className="max-w-[120px] truncate text-[11px] font-medium leading-none text-[var(--ink)] sm:max-w-[160px]">
          {displayTitle}
        </span>

        {/* Dropdown Chevron */}
        {canSwitch && (
          <ChevronDown
            size={10.5}
            strokeWidth={2.4}
            className={`shrink-0 text-[var(--stone)] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[var(--ink)]' : 'group-hover:text-[var(--ink)]'
            }`}
          />
        )}
      </button>

      {/* Floating Popover Overlay */}
      <AnimatePresence>
        {isOpen && popoverPos && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Click-outside backdrop */}
            <div
              className="absolute inset-0 bg-black/10 backdrop-blur-[1px] transition-opacity"
              onClick={() => setIsOpen(false)}
            />

            {/* Popover Card */}
            <motion.div
              style={{
                position: 'fixed',
                top: popoverPos.top,
                left: popoverPos.left,
                width: 'min(300px, calc(100vw - 32px))',
              }}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              role="listbox"
              aria-label="选择行程"
              className={`overflow-hidden rounded-3xl p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.18),inset_0_1px_1.5px_rgba(255,255,255,1)] ${glassModalSurfaceClass}`}
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
        </div>
      )}
    </AnimatePresence>
  </div>
)
}
