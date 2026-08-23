import { useEffect, useState } from 'react'
import { saveDestination } from '../services/destination'
import {
  FALLBACK_DESTINATIONS,
  loadPopularDestinations,
  refreshPopularDestinations,
} from '../services/destinationSuggest'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import type { DestinationSuggestion } from '../../../shared/services/llm/llm'
import { ButtonSpinner, LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { useTranslation } from '../../../shared/i18n'

interface Props {
  value: string
  onChange: (destination: string) => void
}

export function DestinationPanel({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [chips, setChips] = useState<DestinationSuggestion[]>(FALLBACK_DESTINATIONS)
  const [loadingChips, setLoadingChips] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshBatch, setRefreshBatch] = useState(1)
  const [chipSource, setChipSource] = useState<'cache' | 'llm' | 'fallback' | null>(null)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
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
      setRefreshError(e instanceof Error ? e.message : t('destination.refreshFailed'))
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
          <h2 className="font-display text-3xl">{t('destination.panelTitle')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--stone)]">
            {t('destination.panelDesc')}
          </p>
        </div>
        {trimmed && (
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)]"
          >
            {t('destination.clearButton')}
          </button>
        )}
      </div>

      <div className="rounded-2xl sm:rounded-3xl border border-white/80 bg-white/70 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl transition-colors">
        <label className="block text-sm">
          <span className="text-[var(--stone)]">{t('destination.inputLabel')}</span>
          <input
            type="text"
            value={value}
            onChange={(e) => commit(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--mist)] bg-[var(--paper)] px-3 py-2.5 outline-none focus:border-[var(--sage)]"
            placeholder={t('destination.inputPlaceholder')}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--stone)]">{t('destination.popularTitle')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {loadingChips && (
                <LoadingIndicator
                  thinkingLabel={t('destination.thinkingLabel')}
                  generatingLabel={t('destination.generatingLabel')}
                  size="sm"
                  showDots
                  mode="thinking"
                  task="destinationSuggest"
                />
              )}
              {!loadingChips && chipSource === 'fallback' && (
                <p className="text-xs text-[var(--mist)]">{t('destination.fallbackNotice')}</p>
              )}
              {canRefresh && (
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void handleRefreshBatch()}
                  aria-busy={refreshing || undefined}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)] disabled:opacity-50"
                >
                  {refreshing && <ButtonSpinner mode="thinking" task="destinationSuggest" />}
                  {refreshing ? t('destination.refreshBusy') : t('destination.refreshIdle')}
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
                thinkingLabel={t('destination.candidatesLoadingThinking')}
                generatingLabel={t('destination.candidatesLoadingGenerating')}
                showDots
                size="sm"
                mode="thinking"
                task="destinationSuggest"
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
              <LoadingIndicator
                thinkingLabel={t('destination.candidatesRefreshThinking')}
                generatingLabel={t('destination.candidatesRefreshGenerating')}
                size="sm"
                showDots
                mode="thinking"
                task="destinationSuggest"
              />
            </div>
          )}

          {refreshError && (
            <p className="mt-2 text-sm text-red-700">{refreshError}</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={clearDestination}
        title={t('destination.clearConfirmTitle')}
        description={t('destination.clearConfirmDesc')}
        confirmText={t('destination.clearConfirmButton')}
        tone="warning"
        icon="alert"
      />
    </section>
  )
}
