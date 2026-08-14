import { useEffect, useRef, useState } from 'react'
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

  const className = ['api-meter', detailsOpen ? 'is-details-open' : '']
    .filter(Boolean)
    .join(' ')

  return createPortal(
    <aside className={className} aria-label="今日 API 请求次数">
      <div
        className="api-meter-shell"
        onMouseEnter={scheduleDetailsOpen}
        onMouseLeave={scheduleDetailsClose}
      >
        <div className="api-meter-rail">
          <p className="api-meter-rail-label">API</p>
          <p className="api-meter-rail-value">{snapshot.used}</p>
          <ul className="api-meter-rail-groups">
            {SUMMARY_GROUPS.map((group) => {
              const total = groupCount(snapshot, group)
              return (
                <li key={group.id}>
                  <p className="api-meter-rail-label">{RAIL_LABELS[group.id] || group.shortLabel}</p>
                  <p
                    className={`api-meter-rail-group-value ${
                      total > 0 ? 'is-active' : ''
                    }`}
                  >
                    {total}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="api-meter-details">
          <div className="api-meter-details-panel">
            <ul className="api-meter-details-grid">
              {DETAILS_GROUPS.map((group) => {
                const total = groupCount(snapshot, group)
                return (
                  <li key={group.id}>
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="text-[var(--ink)]">{group.label}</span>
                      <span className="tabular-nums text-[var(--sage)]">{total}</span>
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
          </div>
        </div>
      </div>
    </aside>,
    document.body,
  )
}
