import { useEffect, useState } from 'react'
import { saveDestination } from '../services/destination'
import {
  FALLBACK_DESTINATIONS,
  loadPopularDestinations,
  refreshPopularDestinations,
} from '../services/destinationSuggest'
import { isLlmConfigured, type DestinationSuggestion } from '../services/llm'
import { ButtonSpinner, LoadingIndicator } from './LoadingIndicator'

interface Props {
  value: string
  onChange: (destination: string) => void
}

export function DestinationPanel({ value, onChange }: Props) {
  const [chips, setChips] = useState<DestinationSuggestion[]>(FALLBACK_DESTINATIONS)
  const [loadingChips, setLoadingChips] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshBatch, setRefreshBatch] = useState(1)
  const [chipSource, setChipSource] = useState<'cache' | 'llm' | 'fallback' | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingChips(true)
    void loadPopularDestinations().then((result) => {
      if (cancelled) return
      setChips(result.destinations)
      setChipSource(result.source)
      setLoadingChips(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function commit(next: string) {
    onChange(next)
    saveDestination(next)
  }

  function clearDestination() {
    commit('')
  }

  async function handleRefreshBatch() {
    if (refreshing) return
    setRefreshError(null)
    setRefreshing(true)
    const nextBatch = refreshBatch + 1
    try {
      const result = await refreshPopularDestinations({
        currentDestinations: chips,
        selectedDestination: value.trim() || undefined,
        batch: nextBatch,
      })
      setChips(result.destinations)
      setChipSource(result.source)
      setRefreshBatch(nextBatch)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : '重新推荐失败，请稍后再试。')
    } finally {
      setRefreshing(false)
    }
  }

  const trimmed = value.trim()
  const canRefresh = isLlmConfigured() && !loadingChips

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">这次的目的地是哪儿呢？</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--stone)]">
            输入城市或地区，或点选下方热门目的地快速填入。
          </p>
        </div>
        {trimmed && (
          <button
            type="button"
            onClick={clearDestination}
            className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)]"
          >
            清空目的地
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-white/70 bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <label className="block text-sm">
          <span className="text-[var(--stone)]">目的地</span>
          <input
            type="text"
            value={value}
            onChange={(e) => commit(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--mist)] bg-[var(--paper)] px-3 py-2.5 outline-none focus:border-[var(--sage)]"
            placeholder="例如 巴黎、东京、罗马…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--stone)]">热门目的地</p>
            <div className="flex flex-wrap items-center gap-2">
              {loadingChips && (
                <LoadingIndicator label="正在生成推荐…" size="sm" showDots />
              )}
              {!loadingChips && chipSource === 'fallback' && (
                <p className="text-xs text-[var(--mist)]">推荐暂用默认列表</p>
              )}
              {canRefresh && (
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void handleRefreshBatch()}
                  aria-busy={refreshing || undefined}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)] disabled:opacity-50"
                >
                  {refreshing && <ButtonSpinner />}
                  {refreshing ? '正在想…' : '再给我来一批'}
                </button>
              )}
            </div>
          </div>

          <div
            className="mt-2 flex flex-wrap gap-2"
            aria-busy={loadingChips || refreshing || undefined}
          >
            {(loadingChips || refreshing) && !chips.length ? (
              <LoadingIndicator
                variant="block"
                className="w-full py-4"
                label="大模型正在想热门目的地…"
                showDots
                size="sm"
              />
            ) : (
              chips.map((chip) => {
              const selected =
                trimmed.length > 0 &&
                (trimmed === chip.name ||
                  (chip.subtitle != null && trimmed.toLowerCase() === chip.subtitle.toLowerCase()))
              return (
                <button
                  key={`${chip.name}-${chip.subtitle || ''}`}
                  type="button"
                  onClick={() => commit(chip.name)}
                  disabled={refreshing}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition disabled:opacity-60 ${
                    selected
                      ? 'border-[var(--copper)] bg-[var(--copper)]/12 text-[var(--ink)]'
                      : 'border-[var(--stone)]/25 bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--sage)]'
                  }`}
                >
                  <span>{chip.name}</span>
                  {chip.subtitle && (
                    <span className="ml-1.5 text-xs text-[var(--stone)]">{chip.subtitle}</span>
                  )}
                </button>
              )
            })
            )}
          </div>

          {refreshing && chips.length > 0 && (
            <div className="mt-2">
              <LoadingIndicator label="正在想下一批热门目的地…" size="sm" showDots />
            </div>
          )}

          {refreshError && (
            <p className="mt-2 text-sm text-red-700">{refreshError}</p>
          )}
        </div>
      </div>
    </section>
  )
}
