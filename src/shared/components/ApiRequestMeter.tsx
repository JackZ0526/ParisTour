import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  Activity,
  Compass,
  Hotel,
  Layers,
  MapPin,
  Plane,
  Sparkles,
} from 'lucide-react'
import {
  API_REQUEST_GROUPS,
  API_REQUEST_SUMMARY_GROUP_IDS,
  getApiRequestMeterSnapshot,
  groupCount,
  subscribeApiRequestMeter,
  type ApiRequestMeterSnapshot,
} from '../services/apiRequestMeter'

const SUMMARY_GROUPS = API_REQUEST_GROUPS.filter((group) =>
  (API_REQUEST_SUMMARY_GROUP_IDS as readonly string[]).includes(group.id),
)

const DETAILS_GROUP_ORDER = [
  'google-places',
  'booking',
  'tripadvisor',
  'llm',
  'flights',
  'other',
]

const DETAILS_GROUPS = [...API_REQUEST_GROUPS].sort(
  (first, second) =>
    DETAILS_GROUP_ORDER.indexOf(first.id) - DETAILS_GROUP_ORDER.indexOf(second.id),
)

const RAIL_LABELS: Record<string, string> = {
  'google-places': 'G',
  tripadvisor: 'TA',
  booking: 'Bk',
  llm: 'LLM',
}

const GROUP_ICONS: Record<string, typeof Activity> = {
  'google-places': MapPin,
  booking: Hotel,
  tripadvisor: Compass,
  llm: Sparkles,
  flights: Plane,
  other: Layers,
}

const OPEN_DELAY_MS = 380
const CLOSE_DELAY_MS = 240
const STORAGE_KEY = 'paristour_api_meter_pos_v1'
const MIN_TOP = 64
const RAIL_WIDTH = 34
const RAIL_HEIGHT = 164
const PANEL_WIDTH = 380
const PANEL_HEIGHT = 480

export interface ApiMeterPosition {
  side: 'left' | 'right'
  top: number
}

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // Ignore
  }
  return null
}

export function getInitialApiMeterPosition(): ApiMeterPosition {
  const storage = getStorage()
  if (!storage) return { side: 'left', top: 240 }
  try {
    const saved = storage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ApiMeterPosition>
      if ((parsed.side === 'left' || parsed.side === 'right') && typeof parsed.top === 'number') {
        const viewportHeight = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800
        const maxTop = Math.max(MIN_TOP, viewportHeight - RAIL_HEIGHT - 20)
        return {
          side: parsed.side,
          top: Math.min(Math.max(MIN_TOP, parsed.top), maxTop),
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  const viewportHeight = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800
  return {
    side: 'left',
    top: Math.max(MIN_TOP, Math.round(viewportHeight * 0.35)),
  }
}

export function saveApiMeterPosition(pos: ApiMeterPosition) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // Ignore storage errors
  }
}

const morphSpring = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 32,
  mass: 0.5,
}

export function ApiRequestMeter() {
  const rootRef = useRef<HTMLElement | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<ApiRequestMeterSnapshot>(() =>
    getApiRequestMeterSnapshot(),
  )
  const [position, setPosition] = useState<ApiMeterPosition>(() => getInitialApiMeterPosition())
  const [isDragging, setIsDragging] = useState(false)
  const [dragLive, setDragLive] = useState<{ x: number; y: number } | null>(null)

  const dragStartRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startTop: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    return subscribeApiRequestMeter(() => {
      setSnapshot(getApiRequestMeterSnapshot())
    })
  }, [])

  useEffect(() => {
    return () => {
      if (openTimer.current) window.clearTimeout(openTimer.current)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  // Keep inside viewport when window is resized
  useEffect(() => {
    function handleResize() {
      setPosition((prev) => {
        const maxTop = Math.max(MIN_TOP, window.innerHeight - RAIL_HEIGHT - 20)
        if (prev.top > maxTop) {
          const next = { ...prev, top: maxTop }
          saveApiMeterPosition(next)
          return next
        }
        return prev
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const scheduleDetailsOpen = useCallback(() => {
    if (isDragging) return
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (!detailsOpen && !openTimer.current) {
      openTimer.current = window.setTimeout(() => {
        setDetailsOpen(true)
        openTimer.current = null
      }, OPEN_DELAY_MS)
    }
  }, [detailsOpen, isDragging])

  const scheduleDetailsClose = useCallback(() => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (detailsOpen && !closeTimer.current) {
      closeTimer.current = window.setTimeout(() => {
        setDetailsOpen(false)
        closeTimer.current = null
      }, CLOSE_DELAY_MS)
    }
  }, [detailsOpen])

  // Drag handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return // Left click / primary touch only
    // If click inside details panel, do not drag unless on header
    if (detailsOpen && !(e.target as HTMLElement).closest('.api-meter-details-header')) {
      return
    }

    const startX = e.clientX
    const startY = e.clientY
    const startTop = position.top

    dragStartRef.current = {
      pointerId: e.pointerId,
      startX,
      startY,
      startTop,
      moved: false,
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Ignore
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const ds = dragStartRef.current
    if (!ds || ds.pointerId !== e.pointerId) return

    const dx = e.clientX - ds.startX
    const dy = e.clientY - ds.startY

    if (!ds.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      ds.moved = true
      setIsDragging(true)
      if (detailsOpen) setDetailsOpen(false)
    }

    if (ds.moved) {
      setDragLive({ x: e.clientX, y: e.clientY })
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const ds = dragStartRef.current
    if (!ds || ds.pointerId !== e.pointerId) return

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Ignore
    }

    if (ds.moved) {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      const currentX = e.clientX
      const currentY = e.clientY

      // Determine snap side: left or right
      const side: 'left' | 'right' = currentX > windowWidth / 2 ? 'right' : 'left'
      // Determine clamped top
      const maxTop = Math.max(MIN_TOP, windowHeight - RAIL_HEIGHT - 20)
      const top = Math.min(Math.max(MIN_TOP, currentY - RAIL_HEIGHT / 2), maxTop)

      const nextPos: ApiMeterPosition = { side, top }
      setPosition(nextPos)
      saveApiMeterPosition(nextPos)
    } else {
      // Tap/click toggle details
      setDetailsOpen((prev) => !prev)
    }

    dragStartRef.current = null
    setIsDragging(false)
    setDragLive(null)
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Ignore
    }
    dragStartRef.current = null
    setIsDragging(false)
    setDragLive(null)
  }

  const isRight = position.side === 'right'

  // Dynamic positioning style
  const containerStyle: React.CSSProperties = dragLive
    ? {
        position: 'fixed',
        left: dragLive.x - (isRight ? RAIL_WIDTH : 0),
        top: Math.max(MIN_TOP, dragLive.y - RAIL_HEIGHT / 2),
        zIndex: 2000,
        touchAction: 'none',
        cursor: 'grabbing',
        userSelect: 'none',
        pointerEvents: 'auto',
      }
    : {
        position: 'fixed',
        top: position.top,
        left: isRight ? undefined : 0,
        right: isRight ? 0 : undefined,
        zIndex: 2000,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: isDragging ? 'none' : 'top 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }

  return createPortal(
    <aside
      ref={rootRef}
      className="api-meter"
      aria-label="今日 API 请求次数"
      style={containerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <motion.div
        className="api-meter-shell"
        onMouseEnter={scheduleDetailsOpen}
        onMouseLeave={scheduleDetailsClose}
        initial={false}
        animate={{
          width: detailsOpen
            ? Math.min(PANEL_WIDTH, typeof window !== 'undefined' ? window.innerWidth - 20 : PANEL_WIDTH)
            : RAIL_WIDTH,
          height: detailsOpen ? PANEL_HEIGHT : RAIL_HEIGHT,
          borderRadius: detailsOpen ? 20 : 17,
          scale: isDragging ? 1.06 : 1,
        }}
        transition={{
          width: { ...morphSpring, delay: detailsOpen ? 0 : 0.16 },
          height: { ...morphSpring, delay: detailsOpen ? 0.16 : 0 },
          borderRadius: { duration: 0.2 },
          scale: { duration: 0.15 },
        }}
        style={{
          transformOrigin: isRight ? 'top right' : 'top left',
          marginLeft: isRight ? 0 : 'max(0.45rem, env(safe-area-inset-left))',
          marginRight: isRight ? 'max(0.45rem, env(safe-area-inset-right))' : 0,
        }}
      >
        {/* Layer 1: Compact Rail — visible when closed, fades out when opening */}
        <motion.div
          initial={false}
          animate={{
            opacity: detailsOpen ? 0 : 1,
            pointerEvents: detailsOpen ? 'none' : 'auto',
          }}
          transition={{
            opacity: {
              duration: 0.14,
              delay: detailsOpen ? 0 : 0.22,
              ease: 'easeOut',
            },
          }}
          className="api-meter-rail"
        >
          {/* Top highlight specular line */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white dark:via-white/20 to-transparent"
          />

          <div className="flex flex-col items-center gap-0.5">
            <Activity size={10} strokeWidth={2.4} className="text-[var(--copper)]" />
            <p className="api-meter-rail-label">API</p>
            <motion.p
              key={snapshot.used}
              initial={{ opacity: 0.4, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="api-meter-rail-value font-display"
            >
              {snapshot.used}
            </motion.p>
          </div>

          <div className="h-px w-3.5 bg-black/8 dark:bg-white/10" />

          <ul className="api-meter-rail-groups">
            {SUMMARY_GROUPS.map((group) => {
              const total = groupCount(snapshot, group)
              const isActive = total > 0
              return (
                <li key={group.id} className="relative">
                  <p className="api-meter-rail-label">
                    {RAIL_LABELS[group.id] || group.shortLabel}
                  </p>
                  <motion.p
                    key={total}
                    initial={{ opacity: 0.4, scale: 1.15 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={`api-meter-rail-group-value ${
                      isActive ? 'is-active' : ''
                    }`}
                  >
                    {total}
                  </motion.p>
                </li>
              )
            })}
          </ul>
        </motion.div>

        {/* Layer 2: Expanded Details Panel — replaces the rail completely */}
        <motion.div
          initial={false}
          animate={{
            opacity: detailsOpen ? 1 : 0,
            pointerEvents: detailsOpen ? 'auto' : 'none',
          }}
          transition={{
            opacity: {
              duration: 0.18,
              delay: detailsOpen ? 0.16 : 0,
              ease: 'easeOut',
            },
          }}
          className="api-meter-details-panel-inner"
        >
          {/* Top highlight specular line */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white dark:via-white/20 to-transparent"
          />

          <div className="api-meter-details-header">
            <div className="flex items-center gap-1.5 min-w-0">
              <Activity size={13} strokeWidth={2.4} className="text-[var(--copper)] shrink-0" />
              <span className="font-display text-[13px] font-semibold text-[var(--ink)] tracking-tight">
                API 调用明细
              </span>
            </div>
            <span className="inline-flex items-center rounded-full border border-[var(--copper)]/20 dark:border-[var(--copper)]/35 bg-[var(--copper)]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[var(--copper)] shadow-2xs">
              今日总计 {snapshot.used} 次
            </span>
          </div>

          <ul className="api-meter-details-grid">
            {DETAILS_GROUPS.map((group) => {
              const total = groupCount(snapshot, group)
              const GroupIcon = GROUP_ICONS[group.id] || Layers
              const isGroupActive = total > 0
              return (
                <li key={group.id} className="transition-colors group hover:border-[var(--mist)] dark:hover:border-white/15">
                  <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-black/[0.04] dark:border-white/[0.06]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <GroupIcon size={12} strokeWidth={2.2} className="text-[var(--sage)] dark:text-[#88b3a0] shrink-0" />
                      <span className="font-semibold text-[11.5px] text-[var(--ink)] truncate">
                        {group.label}
                      </span>
                    </div>
                    <span
                      className={`tabular-nums text-[11px] font-bold px-1 py-0.2 rounded ${
                        isGroupActive
                          ? 'text-[var(--copper)] dark:text-amber-300 bg-[var(--copper)]/10 dark:bg-[var(--copper)]/20'
                          : 'text-[var(--stone)]/60 dark:text-zinc-500'
                      }`}
                    >
                      {total}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-[var(--stone)] dark:text-zinc-400">
                    {group.kinds
                      .filter(
                        (item) =>
                          !item.legacy || Boolean(snapshot.byKind[item.kind]),
                      )
                      .map((item) => {
                        const count = snapshot.byKind[item.kind] || 0
                        return (
                          <li key={item.kind} className="flex items-center justify-between gap-2">
                            <span className="truncate">{item.label}</span>
                            <span
                              className={`tabular-nums font-medium ${
                                count > 0
                                  ? 'text-[var(--ink)] font-semibold dark:text-zinc-200'
                                  : 'opacity-50 dark:text-zinc-500'
                              }`}
                            >
                              {count}
                            </span>
                          </li>
                        )
                      })}
                  </ul>
                </li>
              )
            })}
          </ul>
        </motion.div>
      </motion.div>
    </aside>,
    document.body,
  )
}
