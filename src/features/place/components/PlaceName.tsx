import { useEffect, useState } from 'react'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import {
  looksChinese,
  peekPlaceNameZh,
  translatePlaceNameToChinese,
} from '../../chat/services/translate'
import type { Coordinates } from '../../../types'
import {
  formatPlaceLabel,
  placeChineseLabel,
  placeOriginalLabel,
  placeTitleLines,
} from '../../../shared/utils/placeTitle'
import { ActivityBars } from '../../../shared/components/LoadingIndicator'

const EXCLUDE_PROP_CJK_OPTIONS = { excludePropCjk: true } as const

function hasCjk(text: string) {
  return /[\u3400-\u9fff]/.test(text)
}

function TranslateBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        className ||
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--mist)] text-[var(--stone)]'
      }
      title="非公认中文名，由 AI 翻译"
      aria-label="非公认中文名，由 AI 翻译"
    >
      <svg
        width="10"
        height="10"
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
    </span>
  )
}

interface Props {
  name: string
  nameLocal?: string
  location?: Coordinates
  googleName?: string
  googleOriginal?: string
  /** Wrap class (default none). */
  className?: string
  titleClassName?: string
  subtitleClassName?: string
  /** Inline one-line form (title · original). */
  inline?: boolean
  /**
   * `bilingual` — Chinese + original (detail-style).
   * `original` — original / non-Chinese only.
   * `originalWithZh` — original primary + Chinese on its own row (itinerary).
   */
  mode?: 'bilingual' | 'original' | 'originalWithZh'
  /** @deprecated Kept for caller compatibility; names no longer query Google. */
  enrichFromGoogle?: boolean
  /**
   * Hint that prop CJK (`name` / `nameLocal`) is recommend-authored, not an
   * official catalog name. PlaceName then prefers Google zh, waits for Google
   * before LLM translate, and never badges Google/official Chinese.
   */
  zhIsLlmTranslated?: boolean
}

/** Place name display — bilingual, original-only, or original + Chinese below. */
export function PlaceName({
  name,
  nameLocal,
  googleName,
  googleOriginal,
  className,
  titleClassName = 'font-medium',
  subtitleClassName = 'text-sm text-[var(--stone)]',
  inline = false,
  mode = 'bilingual',
  zhIsLlmTranslated = false,
}: Props) {
  const excludePropCjk = zhIsLlmTranslated
  const chineseOpts = excludePropCjk ? EXCLUDE_PROP_CJK_OPTIONS : undefined
  const [llmZh, setLlmZh] = useState<string | null>(() => {
    if (
      placeChineseLabel(
        name,
        nameLocal,
        googleName,
        googleOriginal,
        undefined,
        chineseOpts,
      ).zh
    ) {
      return null
    }
    const original = placeOriginalLabel(
      name,
      nameLocal,
      googleName,
      googleOriginal,
    )
    const peeked = peekPlaceNameZh(original)
    return peeked && looksChinese(peeked) ? peeked : null
  })
  const [llmZhTranslating, setLlmZhTranslating] = useState(false)

  const resolvedName = googleName
  const resolvedOriginal = googleOriginal

  // Reuse a durable translation, otherwise stream one LLM translation and cache it.
  useEffect(() => {
    if (mode !== 'originalWithZh') return
    const official = placeChineseLabel(
      name,
      nameLocal,
      resolvedName,
      resolvedOriginal,
      undefined,
      chineseOpts,
    )
    if (official.zh) {
      setLlmZh(null)
      setLlmZhTranslating(false)
      return
    }

    const original = placeOriginalLabel(
      name,
      nameLocal,
      resolvedName,
      resolvedOriginal,
    )
    if (!original.trim() || hasCjk(original)) {
      setLlmZhTranslating(false)
      return
    }

    const peeked = peekPlaceNameZh(original)
    if (peeked && looksChinese(peeked)) {
      setLlmZh(peeked)
      setLlmZhTranslating(false)
      return
    }

    if (!isLlmConfigured()) {
      setLlmZh(null)
      setLlmZhTranslating(false)
      return
    }

    let cancelled = false
    setLlmZh(null)
    setLlmZhTranslating(true)
    void translatePlaceNameToChinese(original, {
      onPartial: (zh) => {
        if (!cancelled) setLlmZh(zh)
      },
    })
      .then((zh) => {
        if (cancelled) return
        setLlmZh(zh)
        setLlmZhTranslating(false)
      })
      .catch(() => {
        if (cancelled) return
        setLlmZh(null)
        setLlmZhTranslating(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    mode,
    name,
    nameLocal,
    resolvedName,
    resolvedOriginal,
    chineseOpts,
  ])

  if (mode === 'original') {
    const label = placeOriginalLabel(
      name,
      nameLocal,
      resolvedName,
      resolvedOriginal,
    )
    const classes = [className, titleClassName].filter(Boolean).join(' ')
    return <p className={classes}>{label}</p>
  }

  if (mode === 'originalWithZh') {
    const title = placeOriginalLabel(
      name,
      nameLocal,
      resolvedName,
      resolvedOriginal,
    )
    const chinese = placeChineseLabel(
      name,
      nameLocal,
      resolvedName,
      resolvedOriginal,
      llmZh || undefined,
      chineseOpts,
    )
    // Google / catalog Chinese stays unbadged. LLM output streams into the
    // reserved row and receives its source badge only after completion.
    const zhFromLlm = Boolean(chinese.isLlmTranslated)
    const displayedZh = chinese.zh
    const reserveZhRow = excludePropCjk
    const showBadgeOnTitle = zhFromLlm && !displayedZh
    const showBadgeOnZh = Boolean(
      zhFromLlm && displayedZh && !llmZhTranslating,
    )
    return (
      <div className={['min-w-0', className].filter(Boolean).join(' ')}>
        <div className="flex min-w-0 flex-col gap-0">
          <p
            className={`${titleClassName} flex min-w-0 items-center gap-1.5`}
          >
            <span className="min-w-0 truncate">{title}</span>
            {showBadgeOnTitle ? <TranslateBadge /> : null}
          </p>
          {displayedZh || reserveZhRow ? (
            <p
              aria-hidden={displayedZh || llmZhTranslating ? undefined : true}
              aria-live={llmZhTranslating ? 'polite' : undefined}
              className="-mt-px flex min-h-[15px] min-w-0 items-center gap-1.5 text-xs font-normal leading-tight text-[var(--copper)]"
            >
              {llmZhTranslating && !displayedZh ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-[var(--stone)]/70">
                  <ActivityBars size="sm" />
                  <span>翻译中…</span>
                </span>
              ) : (
                <span className="min-w-0 truncate">
                  {displayedZh}
                  {llmZhTranslating ? (
                    <span
                      className="ml-0.5 inline-block h-[0.9em] w-px translate-y-px animate-pulse bg-current align-baseline"
                      aria-hidden
                    />
                  ) : null}
                </span>
              )}
              {showBadgeOnZh ? <TranslateBadge /> : null}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (inline) {
    return (
      <span className={className || titleClassName}>
        {formatPlaceLabel(
          name,
          nameLocal,
          resolvedName,
          resolvedOriginal,
          undefined,
          chineseOpts,
        )}
      </span>
    )
  }

  const { title, subtitle } = placeTitleLines(
    name,
    nameLocal,
    resolvedName,
    resolvedOriginal,
    undefined,
    chineseOpts,
  )

  return (
    <div className={className}>
      <p className={titleClassName}>{title}</p>
      {subtitle && <p className={subtitleClassName}>{subtitle}</p>}
    </div>
  )
}
