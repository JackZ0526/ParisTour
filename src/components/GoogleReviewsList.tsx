import { useEffect, useMemo, useState } from 'react'
import type { GoogleReview } from '../services/googlePlaceDetails'
import { looksChinese, translateTextsToChinese } from '../services/translate'
import { isLlmConfigured } from '../services/llm'
import { LoadingIndicator } from './LoadingIndicator'

interface Props {
  reviews: GoogleReview[]
}

export function GoogleReviewsList({ reviews }: Props) {
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [showOriginal, setShowOriginal] = useState<Record<number, boolean>>({})
  const [translating, setTranslating] = useState(false)
  const [translationFailed, setTranslationFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const reviewKey = useMemo(
    () => reviews.map((r) => r.text).join('\n---\n'),
    [reviews],
  )

  useEffect(() => {
    let cancelled = false
    const nonChinese = reviews
      .map((r) => r.text.trim())
      .filter((t) => t && !looksChinese(t))

    if (!nonChinese.length || !isLlmConfigured()) {
      setTranslations({})
      setTranslating(false)
      setTranslationFailed(false)
      return
    }

    setTranslations({})
    setTranslationFailed(false)
    setTranslating(true)
    void translateTextsToChinese(nonChinese)
      .then((map) => {
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const [k, v] of map) {
          if (v && v !== k) next[k] = v
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewKey, retryCount])

  if (!reviews.length) return null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Google 评论</p>
        {translating && (
          <LoadingIndicator
            thinkingLabel="正在翻译非中文评论…"
            generatingLabel="正在翻译非中文评论…"
            size="sm"
            showDots
            mode="thinking"
            task="translate"
          />
        )}
        {translationFailed && !translating && (
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="text-xs text-[var(--sage)] underline-offset-2 hover:underline"
          >
            翻译暂不可用，点击重试
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

          return (
            <article key={`${original.slice(0, 24)}-${i}`} className="rounded-xl bg-white/70 px-3 py-2 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--stone)]">
                {review.author && <span>{review.author}</span>}
                {review.rating != null && <span>★ {review.rating}</span>}
                {review.relativeTime && <span>{review.relativeTime}</span>}
                {isTranslated && !showingOriginal && (
                  <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-[var(--ink)]">
                    已翻译
                  </span>
                )}
              </div>
              <p className="leading-relaxed text-[var(--ink)]">{body}</p>
              {isTranslated && (
                <button
                  type="button"
                  onClick={() =>
                    setShowOriginal((prev) => ({ ...prev, [i]: !prev[i] }))
                  }
                  className="mt-1.5 text-xs text-[var(--sage)] underline-offset-2 hover:underline"
                >
                  {showingOriginal ? '查看译文' : '查看原文'}
                </button>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
