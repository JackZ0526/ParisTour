import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchPlaceDetails,
  placeDetailsQuery,
  type PlaceDetails,
} from '../../map/services/placeDetails'
import { openStreetMapPlaceUrl } from '../../map/services/openStreetMap'
import { OpenStreetMapEmbed } from '../../map/components/OpenStreetMapEmbed'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import {
  looksChinese,
  peekPlaceNameZh,
  translatePlaceNameToChinese,
} from '../../chat/services/translate'
import type { Coordinates } from '../../../types'
import { placeOriginalLabel, placeTitleLines } from '../../../shared/utils/placeTitle'
import { formatPriceLevelLabel } from '../../../shared/utils/priceLevel'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { PlaceReviewsList } from './PlaceReviewsList'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'

export interface LlmPlaceNarrative {
  intro?: string
  reason?: string
  tripFit?: string
  loading?: boolean
  /** Customize section copy; defaults suit hotels, override for places. */
  labels?: {
    title?: string
    intro?: string
    reason?: string
    tripFit?: string
    loadingText?: string
    loadingMoreText?: string
  }
  /** When set, show a control to regenerate the saved LLM narrative. */
  onRegenerate?: () => void
  regenerating?: boolean
}

interface Props {
  open: boolean
  name: string
  nameLocal?: string
  googlePlaceId?: string
  location?: Coordinates
  fallbackImage?: string
  showMap?: boolean
  /** Optional LLM story block (used for hotel detail). */
  llmNarrative?: LlmPlaceNarrative | null
  /** Sticky footer (e.g. custom-hotel decision buttons). */
  footer?: ReactNode
  /** When true, backdrop / Esc call onClose (default true). */
  closeOnBackdrop?: boolean
  /** Overlay stacking class; default sits under AddPlaceDialog (z-2100). */
  overlayClassName?: string
  /**
   * Explicit stacking order (inline style). Prefer this when the overlay must
   * reliably sit above fixed chat/sheets — Tailwind arbitrary z-* on props can
   * be easy to miss visually when another fixed layer shares the viewport.
   */
  overlayZIndex?: number
  /** Persist a recovered Google identity in the owning trip record. */
  onDetailsResolved?: (details: PlaceDetails) => void
  onClose: () => void
}

export function PlaceDetailsPage({
  open,
  name,
  nameLocal,
  googlePlaceId,
  location,
  fallbackImage,
  showMap = true,
  llmNarrative,
  footer,
  closeOnBackdrop = true,
  overlayClassName = 'z-[2000]',
  overlayZIndex,
  onDetailsResolved,
  onClose,
}: Props) {
  const [details, setDetails] = useState<PlaceDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [llmZh, setLlmZh] = useState<string | null>(null)
  /** idle = not finished; loading = in flight; done = success or gave up */
  const [nameZhPhase, setNameZhPhase] = useState<'idle' | 'loading' | 'done'>('idle')
  const swipeStartX = useRef<number | null>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onDetailsResolvedRef = useRef(onDetailsResolved)
  onDetailsResolvedRef.current = onDetailsResolved

  const query = placeDetailsQuery(name, nameLocal)
  const nameTranslateKey = `${open ? 1 : 0}|${name}|${nameLocal || ''}`
  const nameTranslateKeyRef = useRef(nameTranslateKey)
  if (nameTranslateKeyRef.current !== nameTranslateKey) {
    nameTranslateKeyRef.current = nameTranslateKey
    setLlmZh(null)
    setNameZhPhase('idle')
  }

  const photos =
    details?.photos?.length ? details.photos : fallbackImage ? [fallbackImage] : []
  const activePhoto = photos[photoIndex] || photos[0]
  const googleMapsPlaceUrl = details
    ? openStreetMapPlaceUrl(
        details.nameOriginal || details.name || query,
        details.location,
      )
    : null

  function stepPhoto(delta: number) {
    if (photos.length < 2) return
    setPhotoIndex((i) => (i + delta + photos.length) % photos.length)
  }

  useEffect(() => {
    thumbRefs.current[photoIndex]?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [photoIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnBackdrop) {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepPhoto(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepPhoto(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, closeOnBackdrop, photos.length])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setPhotoIndex(0)

    void fetchPlaceDetails(query, location, {
      placeId: googlePlaceId,
      recoverFromLocation: !googlePlaceId && !query,
    })
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setError('未找到该地点的 OpenStreetMap 详情。')
          setDetails(null)
        } else {
          setDetails(result)
          onDetailsResolvedRef.current?.(result)
        }
      })
      .catch(() => {
        if (!cancelled) setError('加载地点详情失败，请稍后再试。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, query, googlePlaceId, location])

  // When Google / trip data has no Chinese display name, LLM-translate the original.
  useEffect(() => {
    if (!open) {
      setLlmZh(null)
      setNameZhPhase('idle')
      return
    }

    const base = placeTitleLines(
      name,
      nameLocal,
      details?.name,
      details?.nameOriginal,
    )
    if (looksChinese(base.title)) {
      setLlmZh(null)
      setNameZhPhase('done')
      return
    }
    if (!isLlmConfigured()) {
      setLlmZh(null)
      setNameZhPhase('done')
      return
    }

    const original = placeOriginalLabel(
      name,
      nameLocal,
      details?.name,
      details?.nameOriginal,
    )
    const cached = peekPlaceNameZh(original)
    if (cached && looksChinese(cached)) {
      setLlmZh(cached)
      setNameZhPhase('done')
      return
    }

    // Reserve the Chinese title slot immediately — don't flash the English name first.
    setLlmZh(null)
    setNameZhPhase('loading')
    let cancelled = false
    void translatePlaceNameToChinese(original, {
      onPartial: (partial) => {
        if (cancelled || !partial.trim()) return
        setLlmZh(partial)
      },
    })
      .then((zh) => {
        if (cancelled) return
        setLlmZh(zh)
        setNameZhPhase('done')
      })
      .catch(() => {
        if (!cancelled) {
          setLlmZh(null)
          setNameZhPhase('done')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, name, nameLocal, details?.name, details?.nameOriginal])

  if (!open) return null

  const originalLabel = placeOriginalLabel(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
  )
  const official = placeTitleLines(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
  )
  const cachedZh = peekPlaceNameZh(originalLabel)
  const effectiveLlmZh =
    llmZh ||
    (cachedZh && looksChinese(cachedZh) ? cachedZh : null) ||
    null
  const needsLlmZh = !looksChinese(official.title) && isLlmConfigured()
  // Empty Chinese slot + translate animation until first streamed chars (or done).
  const showNameLoader = needsLlmZh && !effectiveLlmZh && nameZhPhase !== 'done'
  const nameStreaming = nameZhPhase === 'loading' && Boolean(effectiveLlmZh)

  const resolved = placeTitleLines(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
    effectiveLlmZh || undefined,
  )
  // While streaming, prefer the live partial even before placeTitleLines accepts it as CJK.
  const title = showNameLoader
    ? ''
    : nameStreaming && llmZh?.trim()
      ? llmZh.trim()
      : resolved.title
  const subtitle =
    showNameLoader || nameStreaming ? originalLabel : resolved.subtitle
  const titleIsLlmTranslated = Boolean(
    resolved.titleIsLlmTranslated && nameZhPhase === 'done',
  )
  const dialogLabel = showNameLoader
    ? `正在翻译「${originalLabel}」`
    : `${title || originalLabel} 地点详情`
  const priceLevelLabel = formatPriceLevelLabel(details?.priceLevel)

  return createPortal(
    <div
      data-google-place-page="1"
      data-pending-place-confirm={footer ? '1' : undefined}
      className={`fixed inset-0 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4 ${overlayClassName}`}
      style={{ zIndex: overlayZIndex ?? 2000 }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭"
        onClick={() => {
          if (closeOnBackdrop) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        className="relative z-10 flex max-h-[min(92vh,100dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[var(--paper)] shadow-[var(--shadow)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--mist)] px-4 py-3">
          <div className="min-w-0 pr-3">
            <div className="flex min-h-[2rem] flex-wrap items-center gap-2">
              {showNameLoader ? (
                <LoadingIndicator
                  thinkingLabel="正在翻译名称…"
                  generatingLabel="正在翻译名称…"
                  mode="thinking"
                  task="translate"
                  userText={originalLabel}
                  size="sm"
                  showDots
                  className="font-display text-2xl leading-tight"
                />
              ) : (
                <h3 className="font-display text-2xl leading-tight">
                  {title}
                  {nameStreaming ? (
                    <span
                      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                      aria-hidden
                    />
                  ) : null}
                </h3>
              )}
              {titleIsLlmTranslated && (
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--mist)] text-[var(--stone)]"
                  title="非公认中文名，由 AI 翻译"
                  aria-label="非公认中文名，由 AI 翻译"
                >
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
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-[var(--stone)]">{subtitle}</p>
            )}
          </div>
          <CloseIconButton onClick={onClose} className="mt-0.5" />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {loading && (
            <LoadingIndicator label="正在加载 OpenStreetMap 地点信息…" showDots size="sm" />
          )}
          {error && <p className="text-sm text-amber-800">{error}</p>}

          {activePhoto && (
            <div className="space-y-2">
              <div
                className="relative overflow-hidden rounded-2xl select-none"
                onPointerDown={(e) => {
                  if (photos.length < 2) return
                  swipeStartX.current = e.clientX
                }}
                onPointerUp={(e) => {
                  if (swipeStartX.current == null || photos.length < 2) return
                  const dx = e.clientX - swipeStartX.current
                  swipeStartX.current = null
                  if (Math.abs(dx) < 40) return
                  stepPhoto(dx < 0 ? 1 : -1)
                }}
                onPointerCancel={() => {
                  swipeStartX.current = null
                }}
              >
                <img
                  src={activePhoto}
                  alt={details?.name || name}
                  className="h-56 w-full object-cover sm:h-72"
                  referrerPolicy="no-referrer-when-downgrade"
                  draggable={false}
                />
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="上一张"
                      onClick={() => stepPhoto(-1)}
                      className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="下一张"
                      onClick={() => stepPhoto(1)}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                    <div className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                      {photoIndex + 1} / {photos.length}
                    </div>
                  </>
                )}
              </div>
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {photos.map((url, i) => (
                    <button
                      key={url + i}
                      ref={(el) => {
                        thumbRefs.current[i] = el
                      }}
                      type="button"
                      onClick={() => setPhotoIndex(i)}
                      className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${
                        i === photoIndex ? 'border-[var(--copper)]' : 'border-transparent'
                      }`}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer-when-downgrade" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            {details?.rating != null && (
              <span className="rounded-full bg-[var(--gold)]/25 px-3 py-1">
                ★ {details.rating.toFixed(1)}
                {details.userRatingCount != null ? `（${details.userRatingCount}）` : ''}
              </span>
            )}
            {priceLevelLabel && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{priceLevelLabel}</span>
            )}
            {details?.phone && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{details.phone}</span>
            )}
          </div>

          {details?.address && <p className="text-sm text-[var(--stone)]">{details.address}</p>}

          {llmNarrative &&
            (llmNarrative.loading ||
              llmNarrative.intro ||
              llmNarrative.reason ||
              llmNarrative.tripFit) && (
              <div className="space-y-3 rounded-2xl border border-[var(--sage)]/25 bg-[var(--sage)]/8 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage)]">
                    {llmNarrative.labels?.title || '行程顾问点评'}
                  </p>
                  {llmNarrative.onRegenerate &&
                    (llmNarrative.intro ||
                      llmNarrative.reason ||
                      llmNarrative.tripFit ||
                      llmNarrative.regenerating) && (
                      <button
                        type="button"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--sage)]/30 bg-white/70 text-[var(--sage)] transition hover:bg-white disabled:opacity-60"
                        disabled={Boolean(llmNarrative.loading || llmNarrative.regenerating)}
                        aria-label={llmNarrative.regenerating ? '正在重新生成' : '重新生成点评'}
                        title={llmNarrative.regenerating ? '正在重新生成' : '重新生成点评'}
                        onClick={llmNarrative.onRegenerate}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={
                            llmNarrative.regenerating || llmNarrative.loading
                              ? 'animate-spin'
                              : undefined
                          }
                          aria-hidden
                        >
                          <path d="M21 12a9 9 0 1 1-2.6-6.3" />
                          <path d="M21 3v6h-6" />
                        </svg>
                      </button>
                    )}
                </div>
                {llmNarrative.loading && !llmNarrative.intro && !llmNarrative.reason && (
                  <LoadingIndicator
                    thinkingLabel="正在思考简介与推荐理由…"
                    generatingLabel={
                      llmNarrative.labels?.loadingText || '正在生成简介与推荐理由…'
                    }
                    showDots
                    size="sm"
                    mode="thinking"
                    task="placeDetail"
                  />
                )}
                {llmNarrative.intro && (
                  <div>
                    <p className="text-sm font-medium">
                      {llmNarrative.labels?.intro || '简介'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {llmNarrative.intro}
                      {llmNarrative.loading &&
                      !llmNarrative.reason &&
                      !llmNarrative.labels?.tripFit ? (
                        <span
                          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                          aria-hidden
                        />
                      ) : null}
                    </p>
                  </div>
                )}
                {llmNarrative.reason && (
                  <div>
                    <p className="text-sm font-medium">
                      {llmNarrative.labels?.reason || '为什么推荐'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {llmNarrative.reason}
                      {llmNarrative.loading && !llmNarrative.labels?.tripFit ? (
                        <span
                          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                          aria-hidden
                        />
                      ) : null}
                    </p>
                  </div>
                )}
                {llmNarrative.tripFit && (
                  <div>
                    <p className="text-sm font-medium">
                      {llmNarrative.labels?.tripFit || '与行程 / 要求的关系'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {llmNarrative.tripFit}
                    </p>
                  </div>
                )}
                {llmNarrative.loading &&
                  (llmNarrative.intro || llmNarrative.reason) &&
                  !llmNarrative.tripFit &&
                  llmNarrative.labels?.tripFit &&
                  llmNarrative.labels?.loadingMoreText && (
                    <LoadingIndicator
                      thinkingLabel={llmNarrative.labels.loadingMoreText}
                      generatingLabel={llmNarrative.labels.loadingMoreText}
                      showDots
                      size="sm"
                      mode="thinking"
                      task="placeDetail"
                    />
                  )}
              </div>
            )}

          {details?.reviews?.length ? <PlaceReviewsList reviews={details.reviews} /> : null}

          {details &&
            !loading &&
            !details.reviews.length &&
            (details.userRatingCount || 0) > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">地点评论</p>
                <div className="rounded-xl bg-white/70 px-3 py-2 text-sm">
                  <p className="leading-relaxed text-[var(--stone)]">
                    当前数据源提供了汇总评分，但没有可公开展示的评论正文。
                  </p>
                  {googleMapsPlaceUrl && (
                    <a
                      href={googleMapsPlaceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 font-medium text-[var(--sage)] underline-offset-2 hover:underline"
                    >
                      在 OpenStreetMap 查看位置
                      <span aria-hidden>↗</span>
                    </a>
                  )}
                </div>
              </div>
            )}

          {showMap && (details?.location || location) && (
            <div>
              <p className="mb-2 text-sm font-medium">地图位置（本页嵌入）</p>
              <div className="overflow-hidden rounded-xl border border-[var(--mist)]">
                <OpenStreetMapEmbed
                  title={name}
                  location={details?.location || location!}
                />
              </div>
            </div>
          )}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--mist)] bg-[var(--paper)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
