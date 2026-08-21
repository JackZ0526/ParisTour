import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { lookupFlight, meaningfulFlightStatus } from '../services/flightLookup'
import { purgeNonApiFlightCache } from '../services/flightCache'
import {
  loadFlightSelection,
  saveFlightSelection,
  type FlightSelection,
  type PersistedFlightSelection,
} from '../services/flightSelection'
import {
  daysBetween,
  formatTripDayLabel,
  saveTripDates,
  type TripDateRange,
} from '../../itinerary/services/tripDates'
import type { FlightEndpoint, FlightInfo } from '../../../types'
import { formatAirportLocalTime } from '../utils/flightTime'
import { ButtonSpinner } from '../../../shared/components/LoadingIndicator'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
  glassSageCardSurfaceClass,
  glassVioletCardSurfaceClass,
} from '../../../shared/styles/glassCapsule'
import { DateRangePicker } from '../../itinerary/components/DateRangePicker'
import { Calendar, Plane, PlaneTakeoff, PlaneLanding, RefreshCw, Edit3, ArrowRight, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'

interface Props {
  tripDates: TripDateRange | null
  onTripDatesChange: (range: TripDateRange | null) => void
  destination?: string
  onFlightsChange?: (flights: FlightSelection) => void
  readOnly?: boolean
}

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

export function LogisticsTravelSection({
  tripDates,
  onTripDatesChange,
  destination = '',
  onFlightsChange,
  readOnly = false,
}: Props) {
  // Flight Selection State
  const [seed] = useState(() => loadFlightSelection() ?? emptyFlightSelection())
  const [outboundInput, setOutboundInput] = useState(seed.outboundInput)
  const [returnInput, setReturnInput] = useState(seed.returnInput)
  const [outbound, setOutbound] = useState<FlightInfo | null>(seed.outbound)
  const [inbound, setInbound] = useState<FlightInfo | null>(seed.returnFlight)
  const [busy, setBusy] = useState<'outbound' | 'return' | 'both' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Independent edit states
  const [editingOutbound, setEditingOutbound] = useState(false)
  const [editingInbound, setEditingInbound] = useState(false)
  const [outboundCardHeight, setOutboundCardHeight] = useState<number | null>(null)
  const [outboundEditorHeight, setOutboundEditorHeight] = useState<number | null>(null)
  const [inboundCardHeight, setInboundCardHeight] = useState<number | null>(null)
  const [inboundEditorHeight, setInboundEditorHeight] = useState<number | null>(null)
  const [confirmClearDatesOpen, setConfirmClearDatesOpen] = useState(false)

  const startDate = tripDates?.startDate || ''
  const endDate = tripDates?.endDate || ''
  const hasDates = Boolean(startDate && endDate)
  const destTrimmed = destination.trim()

  const nightCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    const days = daysBetween(startDate, endDate)
    return Math.max(0, days - 1)
  }, [startDate, endDate])

  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    return daysBetween(startDate, endDate)
  }, [startDate, endDate])

  function commitDates(range: TripDateRange | null) {
    if (readOnly) return
    onTripDatesChange(range)
    saveTripDates(range)
  }

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

  async function query(direction: 'outbound' | 'return') {
    setBusy(direction)
    setError(null)
    try {
      const number = direction === 'outbound' ? outboundInput : returnInput
      await loadOne(direction, number)
      if (direction === 'outbound') setEditingOutbound(false)
      else setEditingInbound(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="relative z-20 space-y-4">
      {error && (
        <p className="rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-2.5 text-xs text-red-700 backdrop-blur-sm">
          {error}
        </p>
      )}

      {/* ========================================================================= */}
      {/* 方案 2 深度优化版: 日期与往返航班综合舱                                   */}
      {/* ========================================================================= */}
      <article className={`relative z-20 rounded-3xl ${glassCardSurfaceClass} !overflow-visible p-5 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)] transition-all`}>
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-black/5 pb-3.5 sm:pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--copper)]/15 to-[var(--gold)]/10 text-[var(--copper)] shadow-inner">
              <Plane size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl leading-tight text-[var(--ink)] sm:text-2xl">
                  日期与往返航班
                </h2>
                <span
                  className={`${glassCapsuleSurfaceClass} ${
                    hasDates && outbound && inbound
                      ? glassCapsuleToneClass.sage
                      : glassCapsuleToneClass.neutral
                  } px-2.5 py-0.5 text-[11px] font-medium ${
                    hasDates && outbound && inbound ? 'text-[var(--sage)]' : 'text-[var(--stone)]'
                  }`}
                >
                  {hasDates && outbound && inbound ? '已就绪' : '待完善'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card Body: 2-Column Split (Left: Date 4 cols, Right: Flights 8 cols) */}
        <div className="mt-4 grid gap-6 lg:grid-cols-12 lg:items-stretch">
          {/* Left Column: Date & Duration (4/12) */}
          <div className="relative z-30 flex flex-col justify-between space-y-4 lg:col-span-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-[var(--copper)]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--copper)]">
                    旅行日期
                  </span>
                </div>
                {tripDates && !readOnly && (
                  <button
                    type="button"
                    title="清空日期"
                    aria-label="清空日期"
                    onClick={() => setConfirmClearDatesOpen(true)}
                    className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-red-700 transition-colors active:scale-95`}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                )}
              </div>

              <div className="mt-2.5">
                <DateRangePicker
                  value={tripDates}
                  onChange={commitDates}
                  placeholder="出发 – 返程"
                />
              </div>

              <div className={`mt-3 rounded-2xl ${glassCardSurfaceClass} p-3.5 shadow-sm`}>
                {tripDates ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {formatTripDayLabel(startDate)} 至 {formatTripDayLabel(endDate)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.copper} px-2.5 py-0.5 text-[11px] font-semibold text-[var(--copper)]`}>
                        共 {dayCount} 天 / {nightCount} 晚
                      </span>
                      <span className="text-[var(--stone)]">巴黎时间 (CET)</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--stone)] leading-relaxed">
                    选择出发与返程日期。航班次日抵达时，游玩开始日会自动按到达日对齐。
                  </p>
                )}
              </div>
            </div>

            <div className="hidden lg:block pt-2 text-[11px] text-[var(--stone)]">
              {hasDates && outbound && inbound ? (
                <span className="text-[var(--sage)] font-medium">✓ 日期与往返航班均已就绪</span>
              ) : (
                <span>建议优先选定旅行日期，随后查询各航段时刻</span>
              )}
            </div>
          </div>

          {/* Right Column: Outbound & Return Flight Cards (8/12) */}
          <div className="flex flex-col justify-between space-y-4 lg:col-span-8 lg:border-l lg:border-black/5 lg:pl-6">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Plane size={14} className="text-[var(--sage)]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--stone)]">
                    往返航班时刻
                  </span>
                </div>
                {(!outbound || !inbound) && (
                  <span className="text-xs text-[var(--copper)] font-medium">
                    {hasDates ? '分别输入航班号查询计划时刻' : '请先选定旅行日期'}
                  </span>
                )}
              </div>

              {/* Flights Grid (2 Cards Side-by-Side) */}
              <div className="grid gap-3.5 sm:grid-cols-2">
                {/* ========================================================================= */}
                {/* 1. Outbound Ticket Card / Input Form                                      */}
                {/* ========================================================================= */}
                <motion.div
                  initial={false}
                  animate={{
                    height:
                      outbound && !editingOutbound
                        ? (outboundCardHeight ?? 256)
                        : (outboundEditorHeight ?? 178),
                  }}
                  transition={{
                    height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  }}
                  className={`relative sm:min-h-64 ${glassSageCardSurfaceClass} shadow-sm transition-[border-color,box-shadow] hover:border-[var(--sage)]/70`}
                >
                  {outbound && (
                    <motion.div
                      initial={false}
                      animate={{ opacity: editingOutbound ? 0 : 1 }}
                      transition={{
                        opacity: {
                          duration: 0.14,
                          delay: editingOutbound ? 0 : 0.06,
                          ease: 'easeOut',
                        },
                      }}
                      aria-hidden={editingOutbound}
                      inert={editingOutbound}
                      ref={(node) => {
                        if (!node) return
                        const height = node.offsetHeight
                        setOutboundCardHeight((current) =>
                          current === height ? current : height,
                        )
                      }}
                      className={`absolute inset-x-0 top-0 flex flex-col justify-between p-4 sm:p-5 ${
                        editingOutbound ? 'pointer-events-none' : 'z-10'
                      }`}
                    >
                    <div>
                      {/* Outbound Card Top Actions */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 text-[var(--sage)] font-semibold text-xs uppercase tracking-wider">
                          <PlaneTakeoff size={14} />
                          <span>去程 · {outbound.flightNumber}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} px-2.5 py-0.5 text-[11px] font-medium text-[var(--sage)]`}>
                            {flightSourceLabel(outbound.source)}
                          </span>
                          {!readOnly && (
                            <>
                              <button
                                type="button"
                                title="修改去程航班"
                                aria-label="修改去程航班"
                                onClick={() => setEditingOutbound(true)}
                                className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-[var(--ink)] active:scale-95 transition-colors`}
                              >
                                <Edit3 size={14} strokeWidth={1.8} className="text-[var(--copper)]" />
                              </button>
                              <button
                                type="button"
                                title="刷新去程时刻"
                                aria-label="刷新去程时刻"
                                disabled={busy === 'outbound'}
                                onClick={() => void loadOne('outbound', outbound.flightNumber, true)}
                                className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-[var(--sage)] active:scale-95 transition-colors disabled:opacity-50`}
                              >
                                <RefreshCw size={14} strokeWidth={1.8} className={busy === 'outbound' ? 'animate-spin' : ''} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="mt-1.5 text-base font-semibold text-[var(--ink)]">
                        {outbound.airline || '航班计划'}
                      </p>

                      <div className="mt-3 grid grid-cols-5 items-center gap-1 rounded-xl bg-white/60 dark:bg-black/30 p-3 border border-white/80 dark:border-white/10 text-sm backdrop-blur-sm shadow-xs">
                        <div className="col-span-2">
                          <p className="text-xs text-[var(--stone)]">出发</p>
                          <p className="font-bold text-base text-[var(--ink)]">
                            {outbound.from?.code || '—'}
                          </p>
                          <p className="text-xs text-[var(--stone)] mt-0.5">
                            {formatEndpointTime(outbound.from?.scheduled, outbound.from)}
                          </p>
                          {outbound.from?.terminal && (
                            <span className="mt-0.5 inline-block rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[11px] text-[var(--stone)]">
                              T{outbound.from.terminal}
                            </span>
                          )}
                        </div>

                        <div className="col-span-1 flex flex-col items-center justify-center text-[var(--mist)]">
                          <ArrowRight size={14} className="text-[var(--sage)]/60 dark:text-[var(--sage)]" />
                          {outbound.duration && (
                            <span className="text-[11px] font-medium text-[var(--stone)] mt-0.5 whitespace-nowrap">
                              {outbound.duration}
                            </span>
                          )}
                        </div>

                        <div className="col-span-2 text-right">
                          <p className="text-xs text-[var(--stone)]">到达</p>
                          <p className="font-bold text-base text-[var(--ink)]">
                            {outbound.to?.code || '—'}
                          </p>
                          <p className="text-xs text-[var(--stone)] mt-0.5">
                            {formatEndpointTime(outbound.to?.scheduled, outbound.to)}
                          </p>
                          {outbound.to?.terminal && (
                            <span className="mt-0.5 inline-block rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[11px] text-[var(--stone)]">
                              T{outbound.to.terminal}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-[var(--stone)]">
                      <span>{outbound.aircraft ? `机型 ${outbound.aircraft}` : '直飞航班'}</span>
                      <span className="text-[var(--sage)] font-medium">
                        {meaningfulFlightStatus(outbound.status) || '计划正常'}
                      </span>
                    </div>
                    </motion.div>
                  )}

                  {/* Outbound Input Form */}
                  <motion.div
                    initial={false}
                    animate={{ opacity: outbound && !editingOutbound ? 0 : 1 }}
                    transition={{
                      opacity: {
                        duration: 0.14,
                        delay: outbound && !editingOutbound ? 0 : 0.06,
                        ease: 'easeOut',
                      },
                    }}
                    aria-hidden={Boolean(outbound && !editingOutbound)}
                    inert={Boolean(outbound && !editingOutbound)}
                    ref={(node) => {
                      if (!node) return
                      const height = node.offsetHeight
                      setOutboundEditorHeight((current) =>
                        current === height ? current : height,
                      )
                    }}
                    className={`absolute inset-x-0 top-0 flex flex-col justify-between p-4 sm:p-5 ${
                      outbound && !editingOutbound ? 'pointer-events-none' : 'z-10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--sage)]">
                            <PlaneTakeoff size={14} />
                            <span>去程航班</span>
                          </span>
                          {outbound && (
                            <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} px-2.5 py-0.5 text-[10px] font-medium text-[var(--sage)]`}>
                              修改中
                            </span>
                          )}
                        </div>
                        {outbound && (
                          <button
                            type="button"
                            title="取消修改"
                            aria-label="取消修改"
                            onClick={() => setEditingOutbound(false)}
                            className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-[var(--ink)] active:scale-95 transition-colors`}
                          >
                            <X size={15} strokeWidth={1.8} />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--stone)]">
                        {hasDates ? `按 ${startDate} 查询出发时刻` : '请先选定行程日期'}
                      </p>

                      <div className="mt-4 flex gap-2">
                        <input
                          value={outboundInput}
                          onChange={(e) => setOutboundInput(e.target.value.toUpperCase())}
                          aria-label="去程航班号"
                          className="min-w-0 w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/70 dark:bg-black/35 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-all placeholder:text-[var(--stone)]/70 focus:border-[var(--sage)]/60 focus:bg-white/90 dark:focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(91,113,98,0.09)]"
                          placeholder="去程航班号 例如 AF375"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && outboundInput.trim() && hasDates && busy === null) {
                              e.preventDefault()
                              void query('outbound')
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy !== null || !outboundInput.trim() || !hasDates}
                          onClick={() => query('outbound')}
                          aria-busy={busy === 'outbound' || undefined}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--ink)]/80 bg-[var(--ink)]/90 dark:bg-[var(--copper)] text-[var(--paper)] dark:text-white px-4 py-2.5 text-sm font-medium shadow-[0_4px_14px_rgba(35,42,38,0.14),inset_0_1px_1px_rgba(255,255,255,0.18)] backdrop-blur-md transition-all hover:bg-[var(--ink)] dark:hover:bg-[var(--copper)]/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {busy === 'outbound' && <ButtonSpinner />}
                          {busy === 'outbound' ? '查询中' : '查询'}
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 text-[11px] leading-relaxed text-[var(--stone)]">
                      支持主要航司航班号，自动解析起降时间
                    </div>
                  </motion.div>
                </motion.div>

                {/* ========================================================================= */}
                {/* 2. Inbound Ticket Card / Input Form                                       */}
                {/* ========================================================================= */}
                <motion.div
                  initial={false}
                  animate={{
                    height:
                      inbound && !editingInbound
                        ? (inboundCardHeight ?? 256)
                        : (inboundEditorHeight ?? 178),
                  }}
                  transition={{
                    height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  }}
                  className={`relative sm:min-h-64 ${glassVioletCardSurfaceClass} shadow-sm transition-[border-color,box-shadow] hover:border-purple-300`}
                >
                  {inbound && (
                    <motion.div
                      initial={false}
                      animate={{ opacity: editingInbound ? 0 : 1 }}
                      transition={{
                        opacity: {
                          duration: 0.14,
                          delay: editingInbound ? 0 : 0.06,
                          ease: 'easeOut',
                        },
                      }}
                      aria-hidden={editingInbound}
                      inert={editingInbound}
                      ref={(node) => {
                        if (!node) return
                        const height = node.offsetHeight
                        setInboundCardHeight((current) =>
                          current === height ? current : height,
                        )
                      }}
                      className={`absolute inset-x-0 top-0 flex flex-col justify-between p-4 sm:p-5 ${
                        editingInbound ? 'pointer-events-none' : 'z-10'
                      }`}
                    >
                    <div>
                      {/* Inbound Card Top Actions */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 text-purple-900 dark:text-purple-300 font-semibold text-xs uppercase tracking-wider">
                          <PlaneLanding size={14} />
                          <span>返程 · {inbound.flightNumber}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.violet} px-2.5 py-0.5 text-[11px] font-medium text-purple-900 dark:text-purple-300`}>
                            {flightSourceLabel(inbound.source)}
                          </span>
                          {!readOnly && (
                            <>
                              <button
                                type="button"
                                title="修改返程航班"
                                aria-label="修改返程航班"
                                onClick={() => setEditingInbound(true)}
                                className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-[var(--ink)] active:scale-95 transition-colors`}
                              >
                                <Edit3 size={14} strokeWidth={1.8} className="text-[var(--copper)]" />
                              </button>
                              <button
                                type="button"
                                title="刷新返程时刻"
                                aria-label="刷新返程时刻"
                                disabled={busy === 'return'}
                                onClick={() => void loadOne('return', inbound.flightNumber, true)}
                                className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-purple-900 dark:hover:text-purple-300 active:scale-95 transition-colors disabled:opacity-50`}
                              >
                                <RefreshCw size={14} strokeWidth={1.8} className={busy === 'return' ? 'animate-spin' : ''} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="mt-1.5 text-base font-semibold text-[var(--ink)]">
                        {inbound.airline || '航班计划'}
                      </p>

                      <div className="mt-3 grid grid-cols-5 items-center gap-1 rounded-xl bg-white/60 dark:bg-black/30 p-3 border border-white/80 dark:border-white/10 text-sm backdrop-blur-sm shadow-xs">
                        <div className="col-span-2">
                          <p className="text-xs text-[var(--stone)]">出发</p>
                          <p className="font-bold text-base text-[var(--ink)]">
                            {inbound.from?.code || '—'}
                          </p>
                          <p className="text-xs text-[var(--stone)] mt-0.5">
                            {formatEndpointTime(inbound.from?.scheduled, inbound.from)}
                          </p>
                          {inbound.from?.terminal && (
                            <span className="mt-0.5 inline-block rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[11px] text-[var(--stone)]">
                              T{inbound.from.terminal}
                            </span>
                          )}
                        </div>

                        <div className="col-span-1 flex flex-col items-center justify-center text-[var(--mist)]">
                          <ArrowRight size={14} className="text-purple-400 dark:text-purple-300" />
                          {inbound.duration && (
                            <span className="text-[11px] font-medium text-[var(--stone)] mt-0.5 whitespace-nowrap">
                              {inbound.duration}
                            </span>
                          )}
                        </div>

                        <div className="col-span-2 text-right">
                          <p className="text-xs text-[var(--stone)]">到达</p>
                          <p className="font-bold text-base text-[var(--ink)]">
                            {inbound.to?.code || '—'}
                          </p>
                          <p className="text-xs text-[var(--stone)] mt-0.5">
                            {formatEndpointTime(inbound.to?.scheduled, inbound.to)}
                          </p>
                          {inbound.to?.terminal && (
                            <span className="mt-0.5 inline-block rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[11px] text-[var(--stone)]">
                              T{inbound.to.terminal}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-[var(--stone)]">
                      <span>{inbound.aircraft ? `机型 ${inbound.aircraft}` : '直飞航班'}</span>
                      <span className="text-purple-900 dark:text-purple-300 font-medium">
                        {meaningfulFlightStatus(inbound.status) || '计划正常'}
                      </span>
                    </div>
                    </motion.div>
                  )}

                  {/* Inbound Input Form */}
                  <motion.div
                    initial={false}
                    animate={{ opacity: inbound && !editingInbound ? 0 : 1 }}
                    transition={{
                      opacity: {
                        duration: 0.14,
                        delay: inbound && !editingInbound ? 0 : 0.06,
                        ease: 'easeOut',
                      },
                    }}
                    aria-hidden={Boolean(inbound && !editingInbound)}
                    inert={Boolean(inbound && !editingInbound)}
                    ref={(node) => {
                      if (!node) return
                      const height = node.offsetHeight
                      setInboundEditorHeight((current) =>
                        current === height ? current : height,
                      )
                    }}
                    className={`absolute inset-x-0 top-0 flex flex-col justify-between p-4 sm:p-5 ${
                      inbound && !editingInbound ? 'pointer-events-none' : 'z-10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-purple-900 dark:text-purple-300">
                            <PlaneLanding size={14} />
                            <span>返程航班</span>
                          </span>
                          {inbound && (
                            <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.violet} px-2.5 py-0.5 text-[10px] font-medium text-purple-900 dark:text-purple-300`}>
                              修改中
                            </span>
                          )}
                        </div>
                        {inbound && (
                          <button
                            type="button"
                            title="取消修改"
                            aria-label="取消修改"
                            onClick={() => setEditingInbound(false)}
                            className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} h-8 w-8 inline-flex items-center justify-center text-[var(--stone)] hover:text-[var(--ink)] active:scale-95 transition-colors`}
                          >
                            <X size={15} strokeWidth={1.8} />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--stone)]">
                        {hasDates ? `按 ${endDate} 查询返程时刻` : '请先选定行程日期'}
                      </p>

                      <div className="mt-4 flex gap-2">
                        <input
                          value={returnInput}
                          onChange={(e) => setReturnInput(e.target.value.toUpperCase())}
                          aria-label="返程航班号"
                          className="min-w-0 w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/70 dark:bg-black/35 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-all placeholder:text-[var(--stone)]/70 focus:border-purple-400/60 focus:bg-white/90 dark:focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(109,78,150,0.08)]"
                          placeholder="返程航班号 例如 AF374"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && returnInput.trim() && hasDates && busy === null) {
                              e.preventDefault()
                              void query('return')
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy !== null || !returnInput.trim() || !hasDates}
                          onClick={() => query('return')}
                          aria-busy={busy === 'return' || undefined}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--ink)]/80 bg-[var(--ink)]/90 dark:bg-[var(--copper)] text-[var(--paper)] dark:text-white px-4 py-2.5 text-sm font-medium shadow-[0_4px_14px_rgba(35,42,38,0.14),inset_0_1px_1px_rgba(255,255,255,0.18)] backdrop-blur-md transition-all hover:bg-[var(--ink)] dark:hover:bg-[var(--copper)]/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {busy === 'return' && <ButtonSpinner />}
                          {busy === 'return' ? '查询中' : '查询'}
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 text-[11px] leading-relaxed text-[var(--stone)]">
                      支持主要航司航班号，自动解析起降时间
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </article>

      <ConfirmDialog
        open={confirmClearDatesOpen}
        onClose={() => setConfirmClearDatesOpen(false)}
        onConfirm={() => commitDates(null)}
        title="清空旅行日期"
        description="确定清空旅行起止日期吗？相关的行程天数与航班时间对齐将恢复默认。"
        confirmText="清空日期"
        tone="danger"
        icon="trash"
      />
    </section>
  )
}
