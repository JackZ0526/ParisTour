import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchGooglePlaceDetails,
  type GooglePlaceDetails,
} from '../services/googlePlaceDetails'
import {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  getOpenAIModel,
  isLlmConfigured,
  recommendPlacesForDay,
  type HotelDetailCopy,
  type PlaceRecommendation,
  type RecommendPlaceType,
} from '../services/llm'
import {
  memoizePlaceDetailCopy,
  peekPlaceDetailCopy,
  placeDetailKeysFromGoogle,
} from '../services/placeDetailMemo'
import {
  getDayRecommendCache,
  setDayRecommendCache,
} from '../services/recommendCache'
import type { Place, PlaceType } from '../types'
import { formatPriceLevelLabel } from '../utils/priceLevel'
import { CloseIconButton } from './CloseIconButton'
import { GooglePlacePage } from './GooglePlacePage'
import { useGoogleMapsReady } from './GoogleMapsProvider'
import { ButtonSpinner, LoadingIndicator } from './LoadingIndicator'
import { PlaceName } from './PlaceName'

interface Props {
  open: boolean
  dayNumber: number
  dayTitle: string
  dayPace: string
  dayTheme?: string
  hotelArea?: string
  currentPlaceNames: string[]
  tripPlaceNames: string[]
  onClose: () => void
  onAddCustom: (place: Place, mode: 'best' | 'end') => void
}

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'

const typeLabel: Record<PlaceType, string> = {
  cafe: '咖啡馆',
  attraction: '景点',
  restaurant: '餐厅',
  transport: '交通',
  hotel: '酒店',
}

const recommendTabs: Array<{ id: RecommendPlaceType; label: string }> = [
  { id: 'attraction', label: '景点' },
  { id: 'cafe', label: '咖啡馆' },
  { id: 'restaurant', label: '餐厅' },
]

const GOOGLE_PLACE_LABELS = {
  title: '行程顾问点评',
  intro: '地点简介',
  reason: '为什么推荐',
  loadingText: '正在生成地点简介与推荐理由…',
}

export function AddPlaceDialog({
  open,
  dayNumber,
  dayTitle,
  dayPace,
  dayTheme,
  hotelArea,
  currentPlaceNames,
  tripPlaceNames,
  onClose,
  onAddCustom,
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
  const [mainTab, setMainTab] = useState<'ai' | 'google'>('ai')
  const [category, setCategory] = useState<RecommendPlaceType>('attraction')
  const [googleQuery, setGoogleQuery] = useState('')
  const [googleType, setGoogleType] = useState<PlaceType>('attraction')
  const [googleDetail, setGoogleDetail] = useState<{
    details: GooglePlaceDetails
    type: PlaceType
  } | null>(null)
  const [googleStory, setGoogleStory] = useState<HotelDetailCopy | null>(null)
  const [googleStoryLoading, setGoogleStoryLoading] = useState(false)
  const [googleStoryRegenToken, setGoogleStoryRegenToken] = useState(0)
  const [searching, setSearching] = useState(false)
  const [addingName, setAddingName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [refreshingRecs, setRefreshingRecs] = useState(false)
  const [recommendations, setRecommendations] = useState<PlaceRecommendation[]>([])
  const [recBatch, setRecBatch] = useState(1)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [detailsByKey, setDetailsByKey] = useState<Record<string, GooglePlaceDetails | null>>({})
  const [loadingDetailsKey, setLoadingDetailsKey] = useState<string | null>(null)
  const [photoIndexByKey, setPhotoIndexByKey] = useState<Record<string, number>>({})
  const chromeRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const photoSwipeStartX = useRef<number | null>(null)
  const thumbRefsByKey = useRef<Record<string, (HTMLButtonElement | null)[]>>({})
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined)
  const [heightReady, setHeightReady] = useState(false)

  const expandedPhotoIndex = expandedKey ? photoIndexByKey[expandedKey] || 0 : 0
  useEffect(() => {
    if (!expandedKey) return
    thumbRefsByKey.current[expandedKey]?.[expandedPhotoIndex]?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [expandedKey, expandedPhotoIndex])

  // Reset height animation gate when the sheet closes so reopen doesn't tween from stale size.
  useLayoutEffect(() => {
    if (!open) {
      setHeightReady(false)
      setBodyHeight(undefined)
    }
  }, [open])

  // Measure tab content and animate body height on tab / content size changes.
  useLayoutEffect(() => {
    if (!open || googleDetail) return
    const measureEl = measureRef.current
    const chromeEl = chromeRef.current
    if (!measureEl || !chromeEl) return

    const apply = () => {
      const maxBody = Math.max(0, window.innerHeight * 0.88 - chromeEl.offsetHeight)
      const next = Math.min(measureEl.scrollHeight, maxBody)
      setBodyHeight(next)
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(measureEl)
    window.addEventListener('resize', apply)

    // Opening can hydrate cached bilingual names a moment after the first
    // measurement. Keep height transitions off until that initial content has
    // settled, otherwise the sheet visibly grows by one text line on entry.
    const readyTimer = window.setTimeout(() => {
      setHeightReady(true)
    }, 360)

    return () => {
      window.clearTimeout(readyTimer)
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [open, mainTab, googleDetail])

  function applyCachedRecommendations(list: PlaceRecommendation[], batch: number) {
    setRecommendations(list)
    setRecBatch(batch)
    setError(null)
    setExpandedKey(null)
    setDetailsByKey({})
    setPhotoIndexByKey({})
  }

  async function fetchRecommendations(options?: {
    batch?: number
    excludeNames?: string[]
  }) {
    const batch = options?.batch ?? 1
    setLoadingRecs(true)
    setError(null)
    setExpandedKey(null)
    setDetailsByKey({})
    setPhotoIndexByKey({})
    try {
      const list = await recommendPlacesForDay({
        day: dayNumber,
        title: dayTitle,
        pace: dayPace,
        theme: dayTheme,
        hotelArea,
        currentPlaceNames,
        tripPlaceNames,
        excludeNames: options?.excludeNames,
        batch,
      })
      if (!list.length) {
        setError(
          isLlmConfigured()
            ? '这次没有可用推荐，请再点「换一批」或改用 Google 搜索。'
            : '推荐助手暂不可用，请改用 Google 搜索。',
        )
        return
      }
      applyCachedRecommendations(list, batch)
      setDayRecommendCache({
        day: dayNumber,
        batch,
        model: getOpenAIModel(),
        recommendations: list,
        fetchedAt: Date.now(),
      })
    } catch (err) {
      // Bare JSON.parse / res.json() SyntaxError must not surface as English noise.
      if (err instanceof SyntaxError) {
        setError('推荐结果解析失败，请再试一次。')
      } else {
        setError(err instanceof Error ? err.message : '推荐加载失败，请稍后再试。')
      }
    } finally {
      setLoadingRecs(false)
    }
  }

  // Only hit the model on first open for this day (no cache) — not every reopen.
  useEffect(() => {
    if (!open) return

    setMainTab('ai')
    setCategory('attraction')
    setError(null)
    setGoogleDetail(null)
    setGoogleStory(null)
    setGoogleStoryLoading(false)

    const cached = getDayRecommendCache(dayNumber)
    if (cached) {
      applyCachedRecommendations(cached.recommendations, cached.batch)
      return
    }

    void fetchRecommendations({ batch: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayNumber])

  async function refreshRecommendations() {
    if (loadingRecs || searching) return
    const previousNames = recommendations.map((r) => r.name)
    setRefreshingRecs(true)
    try {
      await fetchRecommendations({
        batch: recBatch + 1,
        excludeNames: previousNames,
      })
    } finally {
      setRefreshingRecs(false)
    }
  }

  /** Hide places already on the trip; restore them automatically when removed. */
  const availableRecommendations = useMemo(() => {
    const taken = new Set(
      [...currentPlaceNames, ...tripPlaceNames].map((n) => n.toLowerCase().trim()).filter(Boolean),
    )
    return recommendations.filter((item) => !taken.has(item.name.toLowerCase().trim()))
  }, [recommendations, currentPlaceNames, tripPlaceNames])

  const grouped = useMemo(() => {
    const map: Record<RecommendPlaceType, PlaceRecommendation[]> = {
      cafe: [],
      attraction: [],
      restaurant: [],
    }
    for (const item of availableRecommendations) {
      map[item.type].push(item)
    }
    return map
  }, [availableRecommendations])

  const visible = grouped[category]

  function itemKey(item: PlaceRecommendation) {
    return `${item.type}:${item.name}`
  }

  function stepPhoto(key: string, photoCount: number, delta: number) {
    if (photoCount < 2) return
    setPhotoIndexByKey((prev) => {
      const current = prev[key] || 0
      return {
        ...prev,
        [key]: (current + delta + photoCount) % photoCount,
      }
    })
  }

  async function ensureDetails(item: PlaceRecommendation) {
    const key = itemKey(item)
    if (detailsByKey[key] !== undefined) return detailsByKey[key]
    if (!isLoaded) {
      setError('Google Maps 尚未加载完成，请稍后再试。')
      return null
    }

    setLoadingDetailsKey(key)
    setError(null)
    try {
      const query = item.name.toLowerCase().includes('paris')
        ? item.name
        : `${item.name} Paris`
      const details = await fetchGooglePlaceDetails(query)
      setDetailsByKey((prev) => ({ ...prev, [key]: details }))
      setPhotoIndexByKey((prev) => ({ ...prev, [key]: 0 }))
      return details
    } catch {
      setDetailsByKey((prev) => ({ ...prev, [key]: null }))
      setError('加载 Google 地点详情失败。')
      return null
    } finally {
      setLoadingDetailsKey(null)
    }
  }

  async function toggleExpand(item: PlaceRecommendation) {
    const key = itemKey(item)
    if (expandedKey === key) {
      setExpandedKey(null)
      return
    }
    setExpandedKey(key)
    if (detailsByKey[key] === undefined) {
      await ensureDetails(item)
    }
  }

  async function resolveAndAdd(
    name: string,
    type: PlaceType,
    mode: 'best' | 'end',
    intro?: string,
    cached?: GooglePlaceDetails | null,
  ) {
    if (!isLoaded) {
      setError('Google Maps 尚未加载完成，请稍后再试。')
      return
    }
    setAddingName(`${name}:${mode}`)
    setSearching(true)
    setError(null)
    try {
      const query = name.toLowerCase().includes('paris') ? name : `${name} Paris`
      const details = cached?.location
        ? cached
        : await fetchGooglePlaceDetails(query)
      if (!details?.location) {
        throw new Error('未找到该地点或缺少坐标，请换个关键词。')
      }

      let description =
        intro || details.summary || details.address || '自定义添加的地点'
      // AI 推荐已有 intro 时不再二次生成简介，避免重复烧 token。
      const hasUsefulIntro = Boolean(intro && intro.trim().length >= 12)
      if (isLlmConfigured() && !hasUsefulIntro) {
        const blurb = await generatePlaceDescription({
          name: details.name,
          type: typeLabel[type] || type,
          address: details.address,
          googleSummary: details.summary || intro,
        })
        if (blurb) description = blurb
      }

      const place: Place = {
        id: `custom-${Date.now()}`,
        name: details.name,
        type,
        description,
        ratingHint:
          details.rating != null
            ? `Google ★ ${details.rating.toFixed(1)}`
            : 'AI 推荐 / Google 地点',
        priceHint: details.priceLevel,
        image: details.photos[0] || FALLBACK_IMAGE,
        location: details.location,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.name)}`,
        durationHint: '自定',
      }
      onAddCustom(place, mode)
      setGoogleQuery('')
      setGoogleDetail(null)
      // Parent also closes; dismiss detail + add sheet after join.
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败')
    } finally {
      setSearching(false)
      setAddingName(null)
    }
  }

  async function searchGooglePlace() {
    const q = googleQuery.trim()
    if (!q || searching) return
    if (!isLoaded) {
      setError('Google Maps 尚未加载完成，请稍后再试。')
      return
    }
    setSearching(true)
    setError(null)
    try {
      const query = q.toLowerCase().includes('paris') ? q : `${q} Paris`
      const details = await fetchGooglePlaceDetails(query)
      if (!details?.location) {
        throw new Error('未找到该地点或缺少坐标，请换个关键词。')
      }
      setGoogleDetail({ details, type: googleType })
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  function closeGoogleDetail() {
    setGoogleDetail(null)
    setGoogleStory(null)
    setGoogleStoryLoading(false)
    setError(null)
  }

  // Generate intro + 推荐理由 when Google detail opens (same memo as PlacePanel).
  useEffect(() => {
    if (!googleDetail) {
      setGoogleStory(null)
      setGoogleStoryLoading(false)
      return
    }

    const { details, type } = googleDetail
    const detailKeys = placeDetailKeysFromGoogle(details)
    const bypass = googleStoryRegenToken > 0
    if (!bypass) {
      const memoHit = peekPlaceDetailCopy(...detailKeys)
      if (memoHit) {
        setGoogleStory({ ...memoHit, tripFit: '' })
        setGoogleStoryLoading(false)
        return
      }
    }

    if (!isLlmConfigured()) {
      setGoogleStory({
        intro: details.summary || '',
        reason: '',
        tripFit: '',
      })
      setGoogleStoryLoading(false)
      return
    }

    let cancelled = false
    setGoogleStory({ intro: '', reason: '', tripFit: '' })
    setGoogleStoryLoading(true)
    void memoizePlaceDetailCopy(
      detailKeys,
      () =>
        generatePlaceDetailCopy({
          name: details.name,
          type: typeLabel[type] || type,
          address: details.address,
          existingDescription: details.summary,
          day: dayNumber,
          dayTitle,
          dayTheme,
          dayPace,
          hotelArea,
          onPartial: (partial) => {
            if (cancelled) return
            setGoogleStory((prev) => ({
              intro: partial.intro ?? prev?.intro ?? '',
              reason: partial.reason ?? prev?.reason ?? '',
              tripFit: '',
            }))
          },
        }).then((copy) => {
          if (!copy) {
            return {
              intro: details.summary || '',
              reason: '',
              tripFit: '',
            }
          }
          return { ...copy, tripFit: '' }
        }),
      { bypass },
    )
      .then((copy) => {
        if (cancelled || !copy) return
        setGoogleStory(copy)
      })
      .finally(() => {
        if (!cancelled) setGoogleStoryLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Snapshot day context on open; remount / same place should hit memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleDetail, googleStoryRegenToken])

  useEffect(() => {
    setGoogleStoryRegenToken(0)
  }, [googleDetail])

  if (!open || typeof document === 'undefined') return null

  const googleBusyBest =
    googleDetail != null && addingName === `${googleDetail.details.name}:best`
  const googleBusyEnd =
    googleDetail != null && addingName === `${googleDetail.details.name}:end`

  return createPortal(
    <>
      {/* Keep search sheet under the Google detail page while previewing. */}
      <div
        className={`fixed inset-0 z-[2100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4 ${
          googleDetail ? 'pointer-events-none invisible' : ''
        }`}
      >
      <button type="button" className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[var(--paper)] shadow-[var(--shadow)] sm:rounded-3xl"
      >
        <div ref={chromeRef} className="shrink-0">
          <div className="flex items-center justify-between border-b border-[var(--mist)] px-4 py-3">
            <div>
              <h3 className="font-display text-2xl">添加地点</h3>
            </div>
            <CloseIconButton onClick={onClose} className="mt-0.5" />
          </div>

          <div className="flex gap-2 px-4 pt-3">
            <button
              type="button"
              onClick={() => {
                setMainTab('ai')
                closeGoogleDetail()
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${
                mainTab === 'ai' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--mist)]'
              }`}
            >
              AI 推荐
            </button>
            <button
              type="button"
              onClick={() => {
                setMainTab('google')
                closeGoogleDetail()
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${
                mainTab === 'google' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--mist)]'
              }`}
            >
              Google 搜索
            </button>
          </div>
        </div>

        <div
          className={`add-place-body min-h-0${heightReady ? ' add-place-body--ready' : ''}`}
          style={bodyHeight != null ? { height: bodyHeight } : undefined}
        >
          <div className="h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div
              ref={measureRef}
              key={mainTab}
              className="add-place-tab-pane p-4"
            >
          {mainTab === 'ai' ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--stone)]">
                根据今天「{dayTitle}」给出推荐。点「换一批」可刷新列表；已加入行程的地点会暂时隐藏。
              </p>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {recommendTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setCategory(tab.id)
                      setExpandedKey(null)
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                      category === tab.id
                        ? 'bg-[var(--sage)] text-white'
                        : 'bg-[var(--mist)] text-[var(--ink)]'
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1 opacity-70">({grouped[tab.id].length})</span>
                  </button>
                ))}
              </div>

              {loadingRecs && !refreshingRecs ? (
                <LoadingIndicator
                  variant="block"
                  thinkingLabel="AI 正在思考推荐"
                  generatingLabel="AI 正在根据行程推荐"
                  showDots
                  size="md"
                  mode="thinking"
                  task="placeRecommend"
                />
              ) : (
                <ul className="space-y-2">
                  {visible.map((item) => {
                    const key = itemKey(item)
                    const expanded = expandedKey === key
                    const details = detailsByKey[key]
                    const loadingDetails = loadingDetailsKey === key
                    const busyBest = addingName === `${item.name}:best`
                    const busyEnd = addingName === `${item.name}:end`
                    const photos = details?.photos?.length ? details.photos : []
                    const photoIndex = photoIndexByKey[key] || 0
                    const activePhoto = photos[photoIndex]
                    const priceLevelLabel = formatPriceLevelLabel(details?.priceLevel)

                    return (
                      <li key={key}>
                        <div
                          className={`overflow-hidden rounded-xl border bg-[var(--card)] transition ${
                            expanded
                              ? 'border-[var(--copper)] shadow-[var(--shadow)]'
                              : 'border-white/70 hover:border-[var(--gold)]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void toggleExpand(item)}
                            className="flex w-full items-start gap-3 p-3 text-left"
                          >
                            <div className="min-w-0 flex-1">
                              <PlaceName
                                mode="originalWithZh"
                                name={item.name}
                                nameLocal={item.nameLocal}
                                enrichFromGoogle
                                // Recommend nameLocal is LLM-authored — exclude from official zh
                                zhIsLlmTranslated
                              />
                              {!expanded && (
                                <p className="mt-1.5 text-sm text-[var(--stone)] line-clamp-2">
                                  {item.intro || item.reason}
                                </p>
                              )}
                            </div>
                          </button>

                          {expanded && (
                            <div className="space-y-3 border-t border-[var(--mist)] px-3 pb-3 pt-3">
                              {loadingDetails ? (
                                <LoadingIndicator
                                  label="正在加载 Google 照片…"
                                  showDots
                                  size="sm"
                                />
                              ) : (
                                <>
                                  {activePhoto ? (
                                    <div className="space-y-2">
                                      <div
                                        className="relative overflow-hidden rounded-xl select-none"
                                        onPointerDown={(e) => {
                                          if (photos.length < 2) return
                                          photoSwipeStartX.current = e.clientX
                                        }}
                                        onPointerUp={(e) => {
                                          if (
                                            photoSwipeStartX.current == null ||
                                            photos.length < 2
                                          )
                                            return
                                          const dx = e.clientX - photoSwipeStartX.current
                                          photoSwipeStartX.current = null
                                          if (Math.abs(dx) < 40) return
                                          stepPhoto(key, photos.length, dx < 0 ? 1 : -1)
                                        }}
                                        onPointerCancel={() => {
                                          photoSwipeStartX.current = null
                                        }}
                                      >
                                        <img
                                          src={activePhoto}
                                          alt={item.name}
                                          className="h-44 w-full object-cover"
                                          referrerPolicy="no-referrer-when-downgrade"
                                          draggable={false}
                                        />
                                        {photos.length > 1 && (
                                          <>
                                            <button
                                              type="button"
                                              aria-label="上一张"
                                              onClick={() => stepPhoto(key, photos.length, -1)}
                                              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
                                            >
                                              <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden
                                              >
                                                <path d="M15 18l-6-6 6-6" />
                                              </svg>
                                            </button>
                                            <button
                                              type="button"
                                              aria-label="下一张"
                                              onClick={() => stepPhoto(key, photos.length, 1)}
                                              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
                                            >
                                              <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden
                                              >
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
                                          {photos.slice(0, 8).map((url, i) => (
                                            <button
                                              key={url + i}
                                              ref={(el) => {
                                                if (!thumbRefsByKey.current[key]) {
                                                  thumbRefsByKey.current[key] = []
                                                }
                                                thumbRefsByKey.current[key][i] = el
                                              }}
                                              type="button"
                                              onClick={() =>
                                                setPhotoIndexByKey((prev) => ({
                                                  ...prev,
                                                  [key]: i,
                                                }))
                                              }
                                              className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                                                i === photoIndex
                                                  ? 'border-[var(--copper)]'
                                                  : 'border-transparent'
                                              }`}
                                            >
                                              <img
                                                src={url}
                                                alt=""
                                                className="h-full w-full object-cover"
                                                referrerPolicy="no-referrer-when-downgrade"
                                              />
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-[var(--stone)]">
                                      暂未获取到 Google 照片，仍可查看介绍后加入。
                                    </p>
                                  )}

                                  <div className="flex flex-wrap gap-2 text-xs">
                                    {details?.rating != null && (
                                      <span className="rounded-full bg-[var(--gold)]/25 px-2.5 py-1">
                                        ★ {details.rating.toFixed(1)}
                                        {details.userRatingCount != null
                                          ? `（${details.userRatingCount}）`
                                          : ''}
                                      </span>
                                    )}
                                    {priceLevelLabel && (
                                      <span className="rounded-full bg-[var(--mist)] px-2.5 py-1">
                                        {priceLevelLabel}
                                      </span>
                                    )}
                                  </div>

                                  {details?.address && (
                                    <p className="text-xs text-[var(--stone)]">{details.address}</p>
                                  )}

                                  <div className="space-y-2 text-sm leading-relaxed text-[var(--ink)]/90">
                                    <p>{item.intro}</p>
                                    <p className="text-[var(--stone)]">
                                      <span className="font-medium text-[var(--ink)]">为何适合今天：</span>
                                      {item.reason}
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      disabled={searching}
                                      onClick={() =>
                                        void resolveAndAdd(
                                          item.name,
                                          item.type,
                                          'best',
                                          item.intro || item.reason,
                                          details,
                                        )
                                      }
                                      aria-busy={busyBest || undefined}
                                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--sage)] px-3 py-2.5 text-sm text-white disabled:opacity-50"
                                    >
                                      {busyBest && <ButtonSpinner mode="thinking" task="placeDetail" />}
                                      {busyBest ? '加入中…' : '最顺路'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={searching}
                                      onClick={() =>
                                        void resolveAndAdd(
                                          item.name,
                                          item.type,
                                          'end',
                                          item.intro || item.reason,
                                          details,
                                        )
                                      }
                                      aria-busy={busyEnd || undefined}
                                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--paper)] disabled:opacity-50"
                                    >
                                      {busyEnd && <ButtonSpinner mode="thinking" task="placeDetail" />}
                                      {busyEnd ? '加入中…' : '加到最后'}
                                    </button>
                                  </div>
                                  <p className="text-xs text-[var(--stone)]">
                                    「最顺路」会插到当天更合适的位置；「加到最后」追加到当天末尾。
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                  {!visible.length && (
                    <p className="py-6 text-center text-sm text-[var(--stone)]">
                      这一类暂时没有推荐，可切换其他分类、换一批，或用 Google 搜索。
                    </p>
                  )}
                </ul>
              )}

              {(!loadingRecs || refreshingRecs) && (
                <button
                  type="button"
                  disabled={loadingRecs || searching}
                  onClick={() => void refreshRecommendations()}
                  aria-busy={refreshingRecs || undefined}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--sage)]/50 bg-[var(--sage)]/5 px-3 py-2.5 text-sm font-medium text-[var(--sage)] hover:bg-[var(--sage)]/10 disabled:opacity-50"
                >
                  {refreshingRecs && (
                    <ButtonSpinner mode="thinking" task="placeRecommend" />
                  )}
                  {refreshingRecs ? '正在换一批…' : '换一批'}
                </button>
              )}

              {error && mainTab === 'ai' && <p className="text-sm text-red-700">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                value={googleQuery}
                onChange={(e) => setGoogleQuery(e.target.value)}
                placeholder="例如：Musée Rodin Paris"
                className="w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void searchGooglePlace()
                  }
                }}
              />
              <label className="block text-sm">
                <span className="text-[var(--stone)]">类型</span>
                <select
                  value={googleType}
                  onChange={(e) => setGoogleType(e.target.value as PlaceType)}
                  className="mt-1 w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2"
                >
                  <option value="attraction">景点</option>
                  <option value="cafe">咖啡馆</option>
                  <option value="restaurant">餐厅</option>
                  <option value="transport">交通</option>
                </select>
              </label>
              <button
                type="button"
                disabled={searching || !googleQuery.trim()}
                onClick={() => void searchGooglePlace()}
                aria-busy={searching || undefined}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--paper)] disabled:opacity-50"
              >
                {searching && <ButtonSpinner />}
                {searching ? '搜索中…' : '搜索地点'}
              </button>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
      </div>

      <GooglePlacePage
        open={Boolean(googleDetail)}
        name={googleDetail?.details.name || ''}
        nameLocal={googleDetail?.details.nameOriginal}
        location={googleDetail?.details.location}
        fallbackImage={googleDetail?.details.photos?.[0] || FALLBACK_IMAGE}
        showMap={false}
        overlayClassName="z-[2200]"
        llmNarrative={
          googleDetail
            ? {
                intro:
                  googleStory?.intro ||
                  (!googleStoryLoading
                    ? googleDetail.details.summary || undefined
                    : undefined),
                reason: googleStory?.reason || undefined,
                loading: googleStoryLoading,
                labels: GOOGLE_PLACE_LABELS,
                onRegenerate: isLlmConfigured()
                  ? () => setGoogleStoryRegenToken((n) => n + 1)
                  : undefined,
                regenerating: googleStoryLoading && googleStoryRegenToken > 0,
              }
            : null
        }
        footer={
          googleDetail ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={searching}
                  onClick={() =>
                    void resolveAndAdd(
                      googleDetail.details.name,
                      googleDetail.type,
                      'best',
                      googleStory?.intro || googleDetail.details.summary,
                      googleDetail.details,
                    )
                  }
                  aria-busy={googleBusyBest || undefined}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--sage)] px-3 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {googleBusyBest && <ButtonSpinner mode="thinking" task="placeDetail" />}
                  {googleBusyBest ? '加入中…' : '最顺路'}
                </button>
                <button
                  type="button"
                  disabled={searching}
                  onClick={() =>
                    void resolveAndAdd(
                      googleDetail.details.name,
                      googleDetail.type,
                      'end',
                      googleStory?.intro || googleDetail.details.summary,
                      googleDetail.details,
                    )
                  }
                  aria-busy={googleBusyEnd || undefined}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--paper)] disabled:opacity-50"
                >
                  {googleBusyEnd && <ButtonSpinner mode="thinking" task="placeDetail" />}
                  {googleBusyEnd ? '加入中…' : '加到最后'}
                </button>
              </div>
              <p className="text-xs text-[var(--stone)]">
                「最顺路」按当日路线插入最佳位置；「加到最后」追加到当天末尾。
              </p>
            </div>
          ) : null
        }
        onClose={closeGoogleDetail}
      />
    </>,
    document.body,
  )
}
