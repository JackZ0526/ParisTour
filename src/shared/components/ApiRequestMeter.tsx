import { useEffect, useRef, useState } from 'react'
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

const OPEN_DELAY_MS = 420
const CLOSE_DELAY_MS = 240

const morphSpring = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 32,
  mass: 0.5,
}

export function ApiRequestMeter() {
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<ApiRequestMeterSnapshot>(() =>
    getApiRequestMeterSnapshot(),
  )

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

  function scheduleDetailsOpen() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (detailsOpen || openTimer.current) return
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      setDetailsOpen(true)
    }, OPEN_DELAY_MS)
  }

  function scheduleDetailsClose() {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (!detailsOpen || closeTimer.current) return
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setDetailsOpen(false)
    }, CLOSE_DELAY_MS)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <aside className="api-meter" aria-label="今日 API 请求次数">
      <motion.div
        className="api-meter-shell"
        onMouseEnter={scheduleDetailsOpen}
        onMouseLeave={scheduleDetailsClose}
        initial={false}
        animate={{
          width: detailsOpen ? 370 : 30,
          height: detailsOpen ? 418 : 148,
          borderRadius: detailsOpen ? 20 : 15,
        }}
        transition={{
          width: { ...morphSpring, delay: detailsOpen ? 0 : 0.16 },
          height: { ...morphSpring, delay: detailsOpen ? 0.16 : 0 },
          borderRadius: { duration: 0.2 },
        }}
        style={{ transformOrigin: 'top left' }}
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
                    <span className="tabular-nums font-semibold text-[var(--sage)]">{total}</span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5 text-[11px] text-[var(--stone)]">
                    {group.kinds
                      .filter(
                        (item) =>
                          !item.legacy || Boolean(snapshot.byKind[item.kind]),
                      )
                      .map((item) => (
                        <li key={item.kind} className="flex justify-between gap-2">
                          <span>{item.label}</span>
                          <span className="tabular-nums">
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
