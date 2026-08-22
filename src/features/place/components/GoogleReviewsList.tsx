import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { GoogleReview } from '../../map/services/googlePlaceDetails'
import { looksChinese, translateTextsToChinese } from '../../chat/services/translate'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import { ShimmerLines } from '../../../shared/components/ShimmerLines'
import { PlaceSourceMark } from './PlaceSourceMark'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'
import { useTranslation } from '../../../shared/i18n'

interface Props {
  reviews: GoogleReview[]
  sourceLabel?: string
  source?: 'google' | 'tripadvisor' | 'booking'
  showHeader?: boolean
  showShimmer?: boolean
  onPendingChange?: (pending: boolean) => void
}

export function GoogleReviewsList({
  reviews,
  sourceLabel,
  source,
  showHeader = true,
  showShimmer = true,
  onPendingChange,
}: Props) {
  const { t, locale } = useTranslation()
  const resolvedSourceLabel = sourceLabel || t('place.reviews')
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [showOriginal, setShowOriginal] = useState<Record<number, boolean>>({})
  const [translationFailed, setTranslationFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const nonChinese = useMemo(
    () =>
      reviews.map((r) => r.text.trim()).filter((t) => t && !looksChinese(t)),
    [reviews],
  )
  const needsTranslate = locale === 'zh-CN' && nonChinese.length > 0 && isLlmConfigured()
  const [translating, setTranslating] = useState(needsTranslate)

  const reviewKey = useMemo(
    () => reviews.map((r) => r.text).join('\n---\n'),
    [reviews],
  )
  const pending = Boolean(needsTranslate && translating && !Object.keys(translations).length && !translationFailed)

  useLayoutEffect(() => {
    onPendingChange?.(pending)
  }, [pending, onPendingChange])

  useEffect(() => {
    let cancelled = false
    const nonChinese = reviews
      .map((r) => r.text.trim())
      .filter((t) => t && !looksChinese(t))

    if (locale !== 'zh-CN' || !nonChinese.length || !isLlmConfigured()) {
      setTranslations({})
      setTranslating(false)
      setTranslationFailed(false)
      return
    }

    const applyMap = (map: Map<string, string>) => {
      const next: Record<string, string> = {}
      for (const [k, v] of map) {
        if (v && v !== k) next[k] = v
      }
      setTranslations(next)
    }

    setTranslations({})
    setTranslationFailed(false)
    setTranslating(true)
    void translateTextsToChinese(nonChinese, {
      onPartial: (map) => {
        if (!cancelled) applyMap(map)
      },
    })
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
  }, [reviewKey, retryCount, locale])

  if (!reviews.length) return null

  return (
    <div>
      <div className={`${showHeader ? 'mb-2' : 'mb-3'} flex flex-wrap items-center justify-between gap-2`}>
        {showHeader && (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {source === 'google' || source === 'tripadvisor' ? (
              <PlaceSourceMark source={source} showLabel={false} />
            ) : null}
            {resolvedSourceLabel}
          </p>
        )}
        {translationFailed && !translating && (
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="text-xs text-[var(--sage)] underline-offset-2 hover:underline"
          >
            {t('place.translationUnavailableRetry')}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {reviews.map((review, i) => {
          const original = review.text.trim()
          const translated = translations[original]
          const isTranslated = Boolean(translated)
          const showingOriginal = Boolean(showOriginal[i])
          const body = isTranslated && !showingOriginal ? translated : original
          const showItemShimmer = showShimmer && translating && !translated && !looksChinese(original)

          return (
            <article
              key={`${original.slice(0, 24)}-${i}`}
              className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-[#18201c]/80 p-3.5 text-sm shadow-sm backdrop-blur-md transition-all hover:bg-white/80 dark:hover:bg-[#1f2824]"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--stone)]">
                {review.author && <span>{review.author}</span>}
                {review.rating != null && <span>★ {review.rating}</span>}
                {review.relativeTime && <span>{review.relativeTime}</span>}
                {isTranslated && !showingOriginal && (
                  <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.blue} inline-flex items-center px-2 py-0.5 text-[var(--stone)]`}>
                    {t('place.translatedBadge')}
                  </span>
                )}
              </div>
              {showItemShimmer ? (
                <ShimmerLines lines={3} />
              ) : (
                <p className="leading-relaxed text-[var(--ink)]">{body}</p>
              )}
              {isTranslated && (
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setShowOriginal((prev) => ({ ...prev, [i]: !prev[i] }))
                    }
                    className="text-xs text-[var(--sage)] underline-offset-2 hover:underline"
                  >
                    {showingOriginal ? t('place.viewTranslation') : t('place.viewOriginal')}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
