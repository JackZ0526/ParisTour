import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  looksChinese,
  translateHotelLocationTextsToChinese,
  translateTextsToChinese,
} from '../../chat/services/translate'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import { ShimmerLines } from '../../../shared/components/ShimmerLines'
import { useTranslation } from '../../../shared/i18n'

type TranslateFn = (
  texts: string[],
  options?: { onPartial?: (map: Map<string, string>) => void },
) => Promise<Map<string, string>>

function useBatchTranslation(
  texts: string[],
  translateFn: TranslateFn = translateTextsToChinese,
) {
  const { locale } = useTranslation()
  const sourceKey = JSON.stringify([
    ...new Set(texts.map((text) => text.trim()).filter(Boolean)),
  ])
  const originals = useMemo<string[]>(
    () => JSON.parse(sourceKey) as string[],
    [sourceKey],
  )
  const needsTranslate =
    locale === 'zh-CN' && originals.some((text) => !looksChinese(text)) && isLlmConfigured()
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState(needsTranslate)
  const [translationFailed, setTranslationFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (locale !== 'zh-CN') {
      setTranslations({})
      setTranslating(false)
      setTranslationFailed(false)
      return
    }
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

    const applyMap = (map: Map<string, string>) => {
      const next: Record<string, string> = {}
      for (const [original, translated] of map) {
        const zh = translated.trim()
        if (zh && zh !== original) next[original] = zh
      }
      setTranslations(next)
    }

    void translateFn(needTranslate, { onPartial: (map) => {
      if (!cancelled) applyMap(map)
    } })
      .then((map) => {
        if (cancelled) return
        applyMap(map)
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
  }, [originals, retryCount, translateFn, locale])

  const hasTranslation = originals.some((text) => translations[text])
  const pending = Boolean(needsTranslate && translating && !hasTranslation && !translationFailed)

  return {
    originals,
    translations,
    translating,
    translationFailed,
    hasTranslation,
    pending,
    retry: () => setRetryCount((count) => count + 1),
  }
}

function usePendingNotify(
  pending: boolean,
  onPendingChange?: (pending: boolean) => void,
) {
  useLayoutEffect(() => {
    onPendingChange?.(pending)
  }, [pending, onPendingChange])
}

function TranslationStatus({
  translating,
  translationFailed,
  onRetry,
}: {
  translating: boolean
  translationFailed: boolean
  onRetry: () => void
}) {
  if (translating || !translationFailed) return null

  return (
    <button
      type="button"
      onClick={onRetry}
      className="text-xs text-[var(--sage)] underline-offset-2 hover:underline"
    >
      翻译暂不可用，点击重试
    </button>
  )
}

type HotelLocationSection =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

function normalizeHotelLocationSource(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
}

function parseHotelLocationSections(text: string): HotelLocationSection[] {
  const normalized = normalizeHotelLocationSource(text)
  if (!normalized) return []

  const prepared = normalized
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s*·\s*/g, '\n• ')

  const lines = prepared.split('\n').map((line) => line.trim()).filter(Boolean)
  const sections: HotelLocationSection[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (!listItems.length) return
    sections.push({ type: 'list', items: listItems })
    listItems = []
  }

  for (const line of lines) {
    const isBullet = /^[•\-–·]/.test(line)
    if (isBullet) {
      listItems.push(line.replace(/^[•\-–·]\s*/, ''))
      continue
    }

    flushList()
    sections.push({ type: 'paragraph', text: line })
  }

  flushList()
  return sections
}

function FormattedHotelLocationText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const sections = parseHotelLocationSections(text)

  if (!sections.length) return null

  return (
    <div className={`flex flex-col gap-3${className ? ` ${className}` : ''}`}>
      {sections.map((section, index) => {
        if (section.type === 'list') {
          return (
            <ul key={index} className="m-0 list-none space-y-1.5">
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2">
                  <span className="shrink-0 text-[var(--sage)]" aria-hidden>
                    •
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={index} className="m-0">
            {section.text}
          </p>
        )
      })}
    </div>
  )
}

export function HotelTranslatedText({
  text,
  loadingLabel = '正在翻译…',
  className,
  layout = 'plain',
  showShimmer = true,
  onPendingChange,
}: {
  text: string
  loadingLabel?: string
  className?: string
  layout?: 'plain' | 'hotelLocation'
  showShimmer?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  const translateFn = useMemo(
    () => (layout === 'hotelLocation' ? translateHotelLocationTextsToChinese : translateTextsToChinese),
    [layout],
  )
  const original = text.trim()
  const {
    translations,
    translating,
    translationFailed,
    hasTranslation,
    pending,
    retry,
  } = useBatchTranslation([original], translateFn)
  usePendingNotify(pending, onPendingChange)

  const body = hasTranslation ? translations[original] || original : original
  const showLocalShimmer = showShimmer && pending

  if (!original) return null

  return (
    <>
      <TranslationStatus
        translating={translating}
        translationFailed={translationFailed}
        onRetry={retry}
      />
      {showLocalShimmer ? (
        <div>
          <ShimmerLines lines={layout === 'hotelLocation' ? 4 : 2} className={className} />
          <span className="sr-only">{loadingLabel}</span>
        </div>
      ) : pending ? (
        <span className="sr-only">{loadingLabel}</span>
      ) : layout === 'hotelLocation' ? (
        <FormattedHotelLocationText text={body} className={className || 'text-[var(--ink)]/85'} />
      ) : (
        <p className={`m-0 whitespace-pre-line${className ? ` ${className}` : ' text-[var(--ink)]/80'}`}>
          {body}
        </p>
      )}
    </>
  )
}

function PolicyParagraph({
  original,
  body,
  clamp,
}: {
  original: string
  body: string
  clamp: boolean
}) {
  const isLong = original.length > 160
  return (
    <p
      className={`leading-relaxed overflow-hidden motion-safe:transition-[max-height] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
        clamp && isLong ? 'line-clamp-3 max-h-[4.5rem]' : 'max-h-[1000px]'
      }`}
    >
      {body}
    </p>
  )
}

export function HotelExpandablePolicyList({
  policies,
  expanded,
  showShimmer = true,
  onPendingChange,
}: {
  policies: string[]
  expanded: boolean
  showShimmer?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  const {
    translations,
    translating,
    translationFailed,
    hasTranslation,
    pending,
    retry,
  } = useBatchTranslation(policies)
  usePendingNotify(pending, onPendingChange)

  const headPolicies = policies.slice(0, 2)
  const tailPolicies = policies.slice(2)

  if (!policies.length) return null

  const renderBody = (original: string) =>
    hasTranslation && translations[original] ? translations[original] : original

  const renderPolicy = (original: string, index: number, clamp: boolean) => {
    if (showShimmer && translating && !translations[original]) {
      return <ShimmerLines key={`${original}-${index}`} lines={clamp ? 3 : 2} />
    }
    return (
      <PolicyParagraph
        key={`${original}-${index}`}
        original={original}
        body={renderBody(original)}
        clamp={clamp}
      />
    )
  }

  return (
    <div className="space-y-2">
      <TranslationStatus
        translating={translating}
        translationFailed={translationFailed}
        onRetry={retry}
      />
      <div className="space-y-2 text-[var(--ink)]/80">
        {headPolicies.map((policy, index) =>
          renderPolicy(policy.trim(), index, !expanded && index === 0),
        )}
        {tailPolicies.length > 0 && (
          <div
            className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
              expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
            aria-hidden={!expanded}
          >
            <div className="min-h-0 space-y-2 overflow-hidden">
              {tailPolicies.map((policy, index) =>
                renderPolicy(policy.trim(), index + 2, false),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
