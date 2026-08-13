import { useEffect, useState } from 'react'
import { Languages } from 'lucide-react'
import {
  fetchGooglePlaceDetails,
  peekGooglePlaceDetails,
  placeDetailsQuery,
} from '../../map/services/googlePlaceDetails'
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
      <Languages size={10} strokeWidth={1.75} aria-hidden />
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
  /**
   * When props lack an original-language name, hydrate from Google details
   * (shared cache with GooglePlacePage) so list + detail stay consistent.
   */
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
  location,
  googleName,
  googleOriginal,
  className,
  titleClassName = 'font-medium',
  subtitleClassName = 'text-sm text-[var(--stone)]',
  inline = false,
  mode = 'bilingual',
  enrichFromGoogle = false,
  zhIsLlmTranslated = false,
}: Props) {
  const excludePropCjk = zhIsLlmTranslated
  const chineseOpts = excludePropCjk ? EXCLUDE_PROP_CJK_OPTIONS : undefined
  const locationLat = location?.lat
  const locationLng = location?.lng
  const cached = peekGooglePlaceDetails(name, nameLocal, location)
  const [enriched, setEnriched] = useState<{
    name?: string
    original?: string
  } | null>(() =>
    cached
      ? { name: cached.name, original: cached.nameOriginal }
      : null,
  )
  const [llmZh, setLlmZh] = useState<string | null>(() => {
    const seedName = googleName || cached?.name
    const seedOriginal = googleOriginal || cached?.nameOriginal
    if (
      placeChineseLabel(
        name,
        nameLocal,
        seedName,
        seedOriginal,
        undefined,
        chineseOpts,
      ).zh
    ) {
      return null
    }
    // A durable translation was only written after an earlier Google lookup
    // confirmed that no official Chinese label was available. Reuse it on the
    // first render instead of repeating that wait whenever a category remounts.
    const original = placeOriginalLabel(
      name,
      nameLocal,
      seedName,
      seedOriginal,
    )
    const peeked = peekPlaceNameZh(original)
    return peeked && looksChinese(peeked) ? peeked : null
  })
  const [llmZhTranslating, setLlmZhTranslating] = useState(false)

  const gName = googleName || enriched?.name
  const gOriginal = googleOriginal || enriched?.original
  const hasGoogle = Boolean(googleName || enriched)
  const initial = placeTitleLines(
    name,
    nameLocal,
    gName,
    gOriginal,
    undefined,
    chineseOpts,
  )
  const originalNow = placeOriginalLabel(name, nameLocal, gName, gOriginal)
  const needsEnrich =
    enrichFromGoogle &&
    Boolean(name.trim()) &&
    !hasGoogle &&
    (mode === 'original'
      ? hasCjk(originalNow)
      : mode === 'originalWithZh'
        ? true
        : !initial.subtitle)

  useEffect(() => {
    if (!needsEnrich) return
    let cancelled = false
    const queryLocation =
      locationLat != null && locationLng != null
        ? { lat: locationLat, lng: locationLng }
        : undefined
    const peek = peekGooglePlaceDetails(name, nameLocal, queryLocation)
    if (peek?.nameOriginal || peek?.name) {
      setEnriched({ name: peek.name, original: peek.nameOriginal })
      return
    }
    void fetchGooglePlaceDetails(
      placeDetailsQuery(name, nameLocal),
      queryLocation,
      {},
    ).then((details) => {
        if (cancelled) return
        // Mark attempted even when null so we can fall through to LLM translate.
        setEnriched(
          details
            ? { name: details.name, original: details.nameOriginal }
            : { name: undefined, original: undefined },
        )
      })
    return () => {
      cancelled = true
    }
  }, [needsEnrich, name, nameLocal, locationLat, locationLng])

  const resolvedName = googleName || enriched?.name
  const resolvedOriginal = googleOriginal || enriched?.original
  const googleReady = Boolean(googleName || enriched || !enrichFromGoogle)

  // LLM Chinese for itinerary: after Google (when enriching), peek cache, then translate.
  useEffect(() => {
    if (mode !== 'originalWithZh') return
    if (!googleReady) return

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
    googleReady,
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
    const reserveZhRow = excludePropCjk && enrichFromGoogle
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
