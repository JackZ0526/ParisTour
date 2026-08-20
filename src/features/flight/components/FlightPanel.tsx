import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { lookupFlight, meaningfulFlightStatus } from '../services/flightLookup'
import { purgeNonApiFlightCache } from '../services/flightCache'
import {
  loadFlightSelection,
  saveFlightSelection,
  type FlightSelection,
  type PersistedFlightSelection,
} from '../services/flightSelection'
import type { TripDateRange } from '../../itinerary/services/tripDates'
import type { FlightEndpoint, FlightInfo } from '../../../types'
import { formatAirportLocalTime } from '../utils/flightTime'
import { ButtonSpinner, LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
} from '../../../shared/styles/glassCapsule'

function emptyFlightSelection(): PersistedFlightSelection {
  return {
    outbound: null,
    returnFlight: null,
    outboundInput: '',
    returnInput: '',
  }
}

function formatEndpointTime(raw: string | undefined, endpoint?: FlightEndpoint): string {
  return formatAirportLocalTime(raw, {
    timeZone: endpoint?.timeZone,
    airportCode: endpoint?.code,
  })
}

/** Origin label for the flight-card badge. */
function flightSourceLabel(source: FlightInfo['source']): string {
  switch (source) {
    case 'timetable':
      return '计划时刻'
    case 'aerodatabox':
      return '在线时刻'
    case 'recommended':
      return '推荐班次'
    case 'live':
      return '实时动态'
    case 'manual':
      return '手动录入'
    case 'llm':
      return '备用数据'
    default:
      return '未知来源'
  }
}

function FlightCard({
  title,
  info,
  loading,
}: {
  title: string
  info: FlightInfo
  loading?: boolean
}) {
  const status = meaningfulFlightStatus(info.status)

  return (
    <article className={`rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 transition-all`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--stone)]">{title}</p>
          <h3 className="font-display text-2xl">
            {info.airline ? `${info.airline} · ` : ''}
            {info.flightNumber}
          </h3>
        </div>
        {loading ? (
          <LoadingIndicator variant="badge" label="查询中…" size="sm" showDots />
        ) : (
          <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} inline-flex items-center px-2.5 py-1 text-xs text-[var(--sage)]`}>
            {flightSourceLabel(info.source)}
          </span>
        )}
      </div>
      <div
        className={`mt-3 grid gap-3 sm:grid-cols-2 ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading || undefined}
      >
        <div>
          <p className="text-xs text-[var(--stone)]">出发</p>
          <p className="font-medium">
            {info.from?.name || info.from?.city || '—'} ({info.from?.code || '—'})
          </p>
          <p className="text-sm text-[var(--stone)]">
            计划 {formatEndpointTime(info.from?.scheduled, info.from)}
          </p>
          {info.from?.actual && (
            <p className="text-sm text-[var(--sage)]">
              实际/预计 {formatEndpointTime(info.from.actual, info.from)}
            </p>
          )}
          {info.from?.terminal && <p className="text-xs">航站楼 {info.from.terminal}</p>}
        </div>
        <div>
          <p className="text-xs text-[var(--stone)]">到达</p>
          <p className="font-medium">
            {info.to?.name || info.to?.city || '—'} ({info.to?.code || '—'})
          </p>
          <p className="text-sm text-[var(--stone)]">
            计划 {formatEndpointTime(info.to?.scheduled, info.to)}
          </p>
          {info.to?.actual && (
            <p className="text-sm text-[var(--sage)]">
              实际/预计 {formatEndpointTime(info.to.actual, info.to)}
            </p>
          )}
          {info.to?.terminal && <p className="text-xs">航站楼 {info.to.terminal}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--stone)]">
        {info.duration && <span>飞行 {info.duration}</span>}
        {info.aircraft && <span>机型 {info.aircraft}</span>}
      </div>
      {status && (
        <p className="mt-2 text-sm text-[var(--stone)]">状态 {status}</p>
      )}
    </article>
  )
}

export function FlightPanel({
  tripDates = null,
  destination = '',
  onFlightsChange,
  readOnly = false,
}: {
  tripDates?: TripDateRange | null
  destination?: string
  onFlightsChange?: (flights: FlightSelection) => void
  readOnly?: boolean
}) {
  const [seed] = useState(() => loadFlightSelection() ?? emptyFlightSelection())
  const [outboundInput, setOutboundInput] = useState(seed.outboundInput)
  const [returnInput, setReturnInput] = useState(seed.returnInput)
  const [outbound, setOutbound] = useState<FlightInfo | null>(seed.outbound)
  const [inbound, setInbound] = useState<FlightInfo | null>(seed.returnFlight)
  const [busy, setBusy] = useState<'outbound' | 'return' | 'both' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasCards = outbound !== null || inbound !== null
  const [showSearchForm, setShowSearchForm] = useState(!hasCards)
  const hasDates = Boolean(tripDates?.startDate && tripDates?.endDate)
  const destTrimmed = destination.trim()

  useEffect(() => {
    purgeNonApiFlightCache()
  }, [])

  useEffect(() => {
    onFlightsChange?.({ outbound, returnFlight: inbound })
  }, [outbound, inbound, onFlightsChange])

  useEffect(() => {
    saveFlightSelection({
      outbound,
      returnFlight: inbound,
      outboundInput,
      returnInput,
    })
  }, [outbound, inbound, outboundInput, returnInput])

  function travelFor(direction: 'outbound' | 'return') {
    return {
      startDate: tripDates?.startDate || null,
      endDate: tripDates?.endDate || null,
      destination: destTrimmed || null,
      direction,
    }
  }

  async function loadOne(
    direction: 'outbound' | 'return',
    flightNumber: string,
    forceRefresh = false,
  ): Promise<void> {
    const trimmed = flightNumber.trim()
    if (!trimmed) {
      throw new Error('请先输入航班号')
    }
    const travel = travelFor(direction)
    const info = await lookupFlight(trimmed, travel, { forceRefresh })
    if (direction === 'outbound') setOutbound(info)
    else setInbound(info)
  }

  async function refreshBoth(outNo: string, inNo: string) {
    setBusy('both')
    setError(null)
    const errors: string[] = []
    await Promise.all([
      outNo.trim()
        ? loadOne('outbound', outNo, true).catch((e) => {
            errors.push(`去程：${e instanceof Error ? e.message : '失败'}`)
          })
        : Promise.resolve(),
      inNo.trim()
        ? loadOne('return', inNo, true).catch((e) => {
            errors.push(`返程：${e instanceof Error ? e.message : '失败'}`)
          })
        : Promise.resolve(),
    ])
    if (errors.length) setError(errors.join(' · '))
    setBusy(null)
  }

  async function query(direction: 'outbound' | 'return') {
    setBusy(direction)
    setError(null)
    try {
      const number = direction === 'outbound' ? outboundInput : returnInput
      await loadOne(direction, number)
      setShowSearchForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl">航班</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--stone)]">
            {readOnly
              ? '当前为只读共享，无法修改航班。'
              : '填写去程与返程航班号并查询计划起降时间。'}
          </p>
        </div>
        {hasCards && !readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSearchForm((prev) => !prev)}
              className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} px-3.5 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--ink)] active:scale-95`}
            >
              {showSearchForm ? '收起输入' : '修改航班号'}
            </button>
            <button
              type="button"
              disabled={busy !== null || !hasDates || (!outboundInput.trim() && !returnInput.trim())}
              onClick={() => {
                void refreshBoth(
                  outboundInput.trim() || outbound?.flightNumber || '',
                  returnInput.trim() || inbound?.flightNumber || '',
                )
              }}
              className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--sage)] active:scale-95 disabled:opacity-50`}
            >
              {busy === 'both' && <ButtonSpinner />}
              {busy === 'both' ? '刷新中…' : '刷新时刻'}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {(!hasCards || showSearchForm) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className={`rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 transition-colors ${
                readOnly ? 'pointer-events-none opacity-80' : ''
              }`}
            >
              <p className="font-medium text-base text-[var(--ink)]">输入我的航班号并查询计划时刻</p>
              <p className="mt-1 text-xs text-[var(--stone)] leading-relaxed">
                按行程日期查询计划起降时间。查不到时请核对航班号与日期；时刻可能与订票网站略有差异，请以机票为准。
                {hasDates
                  ? ` 将按行程日期查询：出发 ${tripDates!.startDate} · 返程 ${tripDates!.endDate}${
                      destTrimmed ? ` · 目的地 ${destTrimmed}` : ''
                    }。`
                  : ''}
              </p>
              {!hasDates && (
                <p className="mt-2 text-sm text-[var(--copper)] font-medium">
                  请先选好行程日期，再查询航班。
                </p>
              )}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-[var(--stone)] font-medium">去程航班号</span>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      value={outboundInput}
                      onChange={(e) => setOutboundInput(e.target.value.toUpperCase())}
                      className="w-full rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-sm outline-none backdrop-blur-sm transition-all focus:border-[var(--copper)] focus:bg-white focus:shadow-sm"
                      placeholder="例如 AF375"
                    />
                    <button
                      type="button"
                      disabled={busy !== null || !outboundInput.trim() || !hasDates}
                      onClick={() => query('outbound')}
                      aria-busy={busy === 'outbound' || undefined}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-40"
                    >
                      {busy === 'outbound' && <ButtonSpinner />}
                      {busy === 'outbound' ? '查询中' : '查询'}
                    </button>
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="text-[var(--stone)] font-medium">返程航班号</span>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      value={returnInput}
                      onChange={(e) => setReturnInput(e.target.value.toUpperCase())}
                      className="w-full rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-sm outline-none backdrop-blur-sm transition-all focus:border-[var(--copper)] focus:bg-white focus:shadow-sm"
                      placeholder="例如 AF374"
                    />
                    <button
                      type="button"
                      disabled={busy !== null || !returnInput.trim() || !hasDates}
                      onClick={() => query('return')}
                      aria-busy={busy === 'return' || undefined}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-40"
                    >
                      {busy === 'return' && <ButtonSpinner />}
                      {busy === 'return' ? '查询中' : '查询'}
                    </button>
                  </div>
                </label>
              </div>

              {(busy === 'outbound' || busy === 'return' || busy === 'both') && !hasCards && (
                <div className="mt-4">
                  <LoadingIndicator label="正在查询航班计划时刻…" showDots size="sm" />
                </div>
              )}

              {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasCards && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              height: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.25, ease: 'easeOut' },
            }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {outbound && (
                  <motion.div
                    key={`flight-outbound-${outbound.flightNumber}`}
                    layout
                    initial={{ opacity: 0, scale: 0.96, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -6 }}
                    transition={{
                      duration: 0.32,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <FlightCard
                      title="去程"
                      info={outbound}
                      loading={busy === 'outbound' || busy === 'both'}
                    />
                  </motion.div>
                )}
                {inbound && (
                  <motion.div
                    key={`flight-inbound-${inbound.flightNumber}`}
                    layout
                    initial={{ opacity: 0, scale: 0.96, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -6 }}
                    transition={{
                      duration: 0.32,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <FlightCard
                      title="返程"
                      info={inbound}
                      loading={busy === 'return' || busy === 'both'}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
