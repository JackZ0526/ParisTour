import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
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

const OPEN_DELAY_MS = 380
const CLOSE_DELAY_MS = 240
const STORAGE_KEY = 'paristour_api_meter_pos_v1'
const MIN_TOP = 64
const RAIL_WIDTH = 30
const RAIL_HEIGHT = 148
const PANEL_WIDTH = 370
const PANEL_HEIGHT = 446

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

  // Close details on tap outside when open on mobile
  useEffect(() => {
    if (!detailsOpen) return
    function onPointerDownOutside(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDetailsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDownOutside)
    return () => document.removeEventListener('pointerdown', onPointerDownOutside)
  }, [detailsOpen])

  const scheduleDetailsOpen = useCallback(() => {
    if (isDragging || dragStartRef.current?.moved) return
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (detailsOpen || openTimer.current) return
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      setDetailsOpen(true)
    }, OPEN_DELAY_MS)
  }, [detailsOpen, isDragging])

  const scheduleDetailsClose = useCallback(() => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (!detailsOpen || closeTimer.current) return
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setDetailsOpen(false)
    }, CLOSE_DELAY_MS)
  }, [detailsOpen])

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    dragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTop: position.top,
      moved: false,
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // Ignore capture errors on unsupported nodes
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return
    const dx = e.clientX - dragStartRef.current.startX
    const dy = e.clientY - dragStartRef.current.startY

    if (!dragStartRef.current.moved && Math.hypot(dx, dy) > 5) {
      dragStartRef.current.moved = true
      setIsDragging(true)
      setDetailsOpen(false)
      if (openTimer.current) {
        window.clearTimeout(openTimer.current)
        openTimer.current = null
      }
    }

    if (dragStartRef.current.moved) {
      const maxTop = Math.max(MIN_TOP, window.innerHeight - RAIL_HEIGHT - 20)
      const clampedY = Math.min(Math.max(MIN_TOP, dragStartRef.current.startTop + dy), maxTop)
      setDragLive({
        x: e.clientX,
        y: clampedY,
      })
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return
    const wasMoved = dragStartRef.current.moved
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignore
    }

    if (wasMoved) {
      const nextSide: 'left' | 'right' = e.clientX > window.innerWidth / 2 ? 'right' : 'left'
      const maxTop = Math.max(MIN_TOP, window.innerHeight - RAIL_HEIGHT - 20)
      const nextTop = Math.min(
        Math.max(MIN_TOP, dragStartRef.current.startTop + (e.clientY - dragStartRef.current.startY)),
        maxTop,
      )
      const nextPos: ApiMeterPosition = { side: nextSide, top: nextTop }
      setPosition(nextPos)
      saveApiMeterPosition(nextPos)
    } else {
      // Click or tap without drag: toggle details on mobile / click
      if (e.pointerType === 'touch') {
        setDetailsOpen((prev) => !prev)
      }
    }

    dragStartRef.current = null
    setIsDragging(false)
    setDragLive(null)
  }

  function handlePointerCancel(e: React.PointerEvent) {
    if (dragStartRef.current && dragStartRef.current.pointerId === e.pointerId) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // Ignore
      }
      dragStartRef.current = null
      setIsDragging(false)
      setDragLive(null)
    }
  }

  if (typeof document === 'undefined') return null

  // Compute live positioning
  const currentTop = dragLive ? dragLive.y : position.top
  const currentSide = position.side
  const isRight = currentSide === 'right'

  const containerStyle: React.CSSProperties = isDragging && dragLive
    ? {
        position: 'fixed',
        zIndex: 1900,
        top: `${dragLive.y}px`,
        left: `${Math.min(Math.max(8, dragLive.x - RAIL_WIDTH / 2), window.innerWidth - RAIL_WIDTH - 8)}px`,
        right: 'auto',
        touchAction: 'none',
        cursor: 'grabbing',
        userSelect: 'none',
      }
    : {
        position: 'fixed',
        zIndex: 1900,
        top: `${currentTop}px`,
        ...(isRight ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' }),
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
          borderRadius: detailsOpen ? 20 : 15,
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
          <p className="api-meter-rail-label">API</p>
          <motion.p
            key={snapshot.used}
            initial={{ opacity: 0.4, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="api-meter-rail-value"
          >
            {snapshot.used}
          </motion.p>
          <ul className="api-meter-rail-groups">
            {SUMMARY_GROUPS.map((group) => {
              const total = groupCount(snapshot, group)
              return (
                <li key={group.id}>
                  <p className="api-meter-rail-label">{RAIL_LABELS[group.id] || group.shortLabel}</p>
                  <motion.p
                    key={total}
                    initial={{ opacity: 0.4, scale: 1.15 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={`api-meter-rail-group-value ${
                      total > 0 ? 'is-active' : ''
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
          <div className="api-meter-details-header">
            <span className="text-[12px] font-semibold text-[var(--ink)]">API 调用明细</span>
            <span className="text-[11px] text-[var(--stone)]">今日总计: {snapshot.used} 次</span>
          </div>
          <ul className="api-meter-details-grid">
            {DETAILS_GROUPS.map((group) => {
              const total = groupCount(snapshot, group)
              return (
                <li key={group.id}>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-medium text-[var(--ink)]">{group.label}</span>
                    <span className="tabular-nums font-semibold text-[var(--sage)] dark:text-[#88b3a0]">{total}</span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5 text-[11px] text-[var(--stone)] dark:text-zinc-400">
                    {group.kinds
                      .filter(
                        (item) =>
                          !item.legacy || Boolean(snapshot.byKind[item.kind]),
                      )
                      .map((item) => (
                        <li key={item.kind} className="flex justify-between gap-2">
                          <span>{item.label}</span>
                          <span className="tabular-nums dark:text-zinc-300">
                            {snapshot.byKind[item.kind] || 0}
                          </span>
                        </li>
                      ))}
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
