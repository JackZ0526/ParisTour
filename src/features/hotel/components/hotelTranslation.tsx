import { useEffect, useMemo, useState } from 'react'
import { looksChinese, translateTextsToChinese } from '../../chat/services/translate'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'

function TranslateIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  )
}

function LanguageToggleButton({
  showOriginal,
  onToggle,
}: {
  showOriginal: boolean
  onToggle: () => void
}) {
  const label = showOriginal ? '查看译文' : '查看原文'

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--mist)] text-[var(--stone)] transition-colors hover:bg-[var(--mist)]/70"
      title={label}
      aria-label={label}
    >
      <TranslateIcon />
    </button>
  )
}

function useBatchTranslation(texts: string[]) {
  const originals = useMemo(
    () => [...new Set(texts.map((text) => text.trim()).filter(Boolean))],
    [texts],
  )
  const sourceKey = originals.join('\n---\n')
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState(false)
  const [translationFailed, setTranslationFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const needTranslate = originals.filter((text) => !looksChinese(text))
    if (!needTranslate.length || !isLlmConfigured()) {
      setTranslations({})
      setTranslating(false)
      setTranslationFailed(false)
      return
    }

    let cancelled = false
    setTranslations({})
    setTranslationFailed(false)
    setTranslating(true)

    void translateTextsToChinese(needTranslate)
      .then((map) => {
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const [original, translated] of map) {
          const zh = translated.trim()
          if (zh && zh !== original && looksChinese(zh)) {
            next[original] = zh
          }
        }
        setTranslations(next)
      })
      .catch(() => {
        if (!cancelled) setTranslationFailed(true)
      })
      .finally(() => {
        if (!cancelled) setTranslating(false)
      })

    return () => {
      cancelled = true
    }
  }, [sourceKey, retryCount])

  const hasTranslation = originals.some((text) => translations[text])

  return {
    originals,
    translations,
    translating,
    translationFailed,
    hasTranslation,
    retry: () => setRetryCount((count) => count + 1),
  }
}

function TranslationStatus({
  loadingLabel,
  sampleText,
  translating,
  translationFailed,
  onRetry,
}: {
  loadingLabel: string
  sampleText: string
  translating: boolean
  translationFailed: boolean
  onRetry: () => void
}) {
  if (!translating && !translationFailed) return null

  return (
    <div className="flex items-center gap-2">
      {translating && (
        <LoadingIndicator
          thinkingLabel={loadingLabel}
          generatingLabel={loadingLabel}
          mode="thinking"
          task="translate"
          userText={sampleText.slice(0, 120)}
          size="sm"
          showDots
        />
      )}
      {translationFailed && !translating && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-[var(--sage)] underline-offset-2 hover:underline"
        >
          翻译暂不可用，点击重试
        </button>
      )}
    </div>
  )
}

export function HotelTranslatedText({
  text,
  loadingLabel = '正在翻译…',
}: {
  text: string
  loadingLabel?: string
}) {
  const original = text.trim()
  const [showOriginal, setShowOriginal] = useState(false)
  const {
    translations,
    translating,
    translationFailed,
    hasTranslation,
    retry,
  } = useBatchTranslation([original])

  const showingTranslation = hasTranslation && !showOriginal
  const body = showingTranslation ? translations[original] || original : original

  if (!original) return null

  return (
    <div className="space-y-2">
      <TranslationStatus
        loadingLabel={loadingLabel}
        sampleText={original}
        translating={translating}
        translationFailed={translationFailed}
        onRetry={retry}
      />
      <div className="relative">
        <p className="whitespace-pre-line text-[var(--ink)]/80">{body}</p>
        {hasTranslation && (
          <div className="mt-1 flex justify-end">
            <LanguageToggleButton
              showOriginal={showOriginal}
              onToggle={() => setShowOriginal((current) => !current)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function HotelTranslatedPolicyList({
  policies,
  lineClampFirst = false,
}: {
  policies: string[]
  lineClampFirst?: boolean
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const {
    translations,
    translating,
    translationFailed,
    hasTranslation,
    retry,
  } = useBatchTranslation(policies)

  const showingTranslation = hasTranslation && !showOriginal
  const sampleText = policies[0] || ''

  if (!policies.length) return null

  return (
    <div className="space-y-2">
      <TranslationStatus
        loadingLabel="正在翻译重要须知…"
        sampleText={sampleText}
        translating={translating}
        translationFailed={translationFailed}
        onRetry={retry}
      />
      <div className="relative">
        <div className="space-y-2 text-[var(--ink)]/80">
          {policies.map((policy, index) => {
            const original = policy.trim()
            const body =
              showingTranslation && translations[original]
                ? translations[original]
                : original
            return (
              <p
                key={`${original}-${index}`}
                className={`leading-relaxed ${lineClampFirst && index === 0 && original.length > 160 ? 'line-clamp-3' : ''}`}
              >
                {body}
              </p>
            )
          })}
        </div>
        {hasTranslation && (
          <div className="mt-1 flex justify-end">
            <LanguageToggleButton
              showOriginal={showOriginal}
              onToggle={() => setShowOriginal((current) => !current)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
