import { useEffect, useMemo, useState } from 'react'
import { recommendedFlights } from '../data/flights'
import { lookupFlight, lookupRouteFlight, templateToFlightInfo } from '../services/flightLookup'
import type { FlightInfo } from '../types'

function FlightCard({
  title,
  info,
  loading,
}: {
  title: string
  info: FlightInfo
  loading?: boolean
}) {
  return (
    <article className="rounded-2xl border border-white/70 bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--stone)]">{title}</p>
          <h3 className="font-display text-2xl">
            {info.airline ? `${info.airline} · ` : ''}
            {info.flightNumber}
          </h3>
        </div>
        <span className="rounded-full bg-[var(--sage)]/15 px-2.5 py-1 text-xs text-[var(--sage)]">
          {loading
            ? '查询中…'
            : info.source === 'live'
              ? 'AviationStack 实时'
              : info.source === 'llm'
                ? '联网补查'
                : '推荐班次'}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[var(--stone)]">出发</p>
          <p className="font-medium">
            {info.from?.name || info.from?.city || '—'} ({info.from?.code || '—'})
          </p>
          <p className="text-sm text-[var(--stone)]">计划 {info.from?.scheduled || '—'}</p>
          {info.from?.actual && (
            <p className="text-sm text-[var(--sage)]">实际/预计 {info.from.actual}</p>
          )}
          {info.from?.terminal && <p className="text-xs">航站楼 {info.from.terminal}</p>}
        </div>
        <div>
          <p className="text-xs text-[var(--stone)]">到达</p>
          <p className="font-medium">
            {info.to?.name || info.to?.city || '—'} ({info.to?.code || '—'})
          </p>
          <p className="text-sm text-[var(--stone)]">计划 {info.to?.scheduled || '—'}</p>
          {info.to?.actual && (
            <p className="text-sm text-[var(--sage)]">实际/预计 {info.to.actual}</p>
          )}
          {info.to?.terminal && <p className="text-xs">航站楼 {info.to.terminal}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--stone)]">
        {info.duration && <span>飞行 {info.duration}</span>}
        {info.aircraft && <span>机型 {info.aircraft}</span>}
        {info.status && <span>状态 {info.status}</span>}
      </div>
      {info.rawNote && <p className="mt-2 text-xs text-[var(--stone)]">{info.rawNote}</p>}
    </article>
  )
}

export function FlightPanel() {
  const defaults = useMemo(
    () => ({
      outbound: templateToFlightInfo(recommendedFlights[0]),
      inbound: templateToFlightInfo(recommendedFlights[1]),
    }),
    [],
  )

  const [outboundInput, setOutboundInput] = useState(recommendedFlights[0].flightNumber)
  const [returnInput, setReturnInput] = useState(recommendedFlights[1].flightNumber)
  const [outbound, setOutbound] = useState<FlightInfo>(defaults.outbound)
  const [inbound, setInbound] = useState<FlightInfo>(defaults.inbound)
  const [busy, setBusy] = useState<'outbound' | 'return' | 'both' | null>('both')
  const [error, setError] = useState<string | null>(null)

  async function loadOne(
    direction: 'outbound' | 'return',
    flightNumber: string,
  ): Promise<void> {
    try {
      const info = await lookupFlight(flightNumber)
      if (direction === 'outbound') setOutbound(info)
      else setInbound(info)
    } catch (e) {
      // Return AF374 sometimes empty — fallback to CDG→YVR route search
      if (direction === 'return') {
        try {
          const route = await lookupRouteFlight('CDG', 'YVR', 'AF')
          setInbound(route)
          setReturnInput(route.flightNumber)
          return
        } catch {
          /* fall through */
        }
      }
      throw e
    }
  }

  async function refreshBoth(outNo: string, inNo: string) {
    setBusy('both')
    setError(null)
    const errors: string[] = []
    await Promise.all([
      loadOne('outbound', outNo).catch((e) => {
        errors.push(`去程：${e instanceof Error ? e.message : '失败'}`)
      }),
      loadOne('return', inNo).catch((e) => {
        errors.push(`返程：${e instanceof Error ? e.message : '失败'}`)
      }),
    ])
    if (errors.length) setError(errors.join(' · '))
    setBusy(null)
  }

  useEffect(() => {
    void refreshBoth(recommendedFlights[0].flightNumber, recommendedFlights[1].flightNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function query(direction: 'outbound' | 'return') {
    setBusy(direction)
    setError(null)
    try {
      const number = direction === 'outbound' ? outboundInput : returnInput
      await loadOne(direction, number)
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
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--stone)]">Flights</p>
          <h2 className="font-display text-3xl">航班</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--stone)]">
            优先用 AviationStack 拉取真实航班；若接口额度不足或失败，会自动用大模型联网补查。推荐去程
            AF375、返程 AF374；确定机票后可改航班号重新查询。
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setOutboundInput(recommendedFlights[0].flightNumber)
            setReturnInput(recommendedFlights[1].flightNumber)
            void refreshBoth(recommendedFlights[0].flightNumber, recommendedFlights[1].flightNumber)
          }}
          className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)] disabled:opacity-50"
        >
          刷新实时航班
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FlightCard title="去程" info={outbound} loading={busy === 'outbound' || busy === 'both'} />
        <FlightCard title="返程" info={inbound} loading={busy === 'return' || busy === 'both'} />
      </div>

      <div className="rounded-2xl border border-white/70 bg-[var(--card)] p-4">
        <p className="font-medium">输入我的航班号并查询真实信息</p>
        <p className="mt-1 text-xs text-[var(--stone)]">
          使用 AviationStack API（开发环境走本地代理）；失败时自动切换到 OpenAI 联网检索。
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[var(--stone)]">去程航班号</span>
            <div className="mt-1 flex gap-2">
              <input
                value={outboundInput}
                onChange={(e) => setOutboundInput(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 outline-none focus:border-[var(--sage)]"
                placeholder="AF375"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => query('outbound')}
                className="shrink-0 rounded-xl bg-[var(--ink)] px-3 py-2 text-[var(--paper)] disabled:opacity-50"
              >
                {busy === 'outbound' ? '查询中' : '查询'}
              </button>
            </div>
          </label>

          <label className="block text-sm">
            <span className="text-[var(--stone)]">返程航班号</span>
            <div className="mt-1 flex gap-2">
              <input
                value={returnInput}
                onChange={(e) => setReturnInput(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 outline-none focus:border-[var(--sage)]"
                placeholder="AF374"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => query('return')}
                className="shrink-0 rounded-xl bg-[var(--ink)] px-3 py-2 text-[var(--paper)] disabled:opacity-50"
              >
                {busy === 'return' ? '查询中' : '查询'}
              </button>
            </div>
          </label>
        </div>

        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    </section>
  )
}
