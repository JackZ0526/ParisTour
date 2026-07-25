import { useEffect, useMemo, useRef, useState } from 'react'
import { loadHotelCache } from '../services/hotelCache'
import {
  fetchResolvedHotelRecommendations,
  persistHotelState,
  refreshHotelCandidates,
} from '../services/hotelRecommend'
import { candidateToSelected, resolveHotelCandidate } from '../services/hotelResolve'
import { generateHotelDetailCopy, isLlmConfigured } from '../services/llm'
import { memoizeLlmCall } from '../services/llmMemo'
import type { DayPlan, HotelCandidate, SelectedHotel } from '../types'
import { GooglePlacePage } from './GooglePlacePage'
import { GooglePlacePhoto } from './GooglePlacePhoto'
import { useGoogleMapsReady } from './GoogleMapsProvider'

interface Props {
  selected: SelectedHotel
  candidates: HotelCandidate[]
  days: DayPlan[]
  onSelect: (hotel: SelectedHotel) => void
  onCandidatesChange: (candidates: HotelCandidate[]) => void
}

export function HotelPicker({
  selected,
  candidates,
  days,
  onSelect,
  onCandidatesChange,
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
  const [customQuery, setCustomQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [popupHotelId, setPopupHotelId] = useState<string | null>(null)
  const [storyLoadingId, setStoryLoadingId] = useState<string | null>(null)
  /** null = closed; choose = pick mode; prefer = type preferences */
  const [refreshPanel, setRefreshPanel] = useState<'choose' | 'prefer' | null>(null)
  const [preferText, setPreferText] = useState('')
  const [refreshHint, setRefreshHint] = useState<string | null>(null)
  const bootstrappedRef = useRef(false)
  const candidatesRef = useRef(candidates)
  const daysRef = useRef(days)
  const selectedRef = useRef(selected)
  candidatesRef.current = candidates
  daysRef.current = days
  selectedRef.current = selected

  const popupCandidate = useMemo(
    () => candidates.find((h) => h.id === popupHotelId) || null,
    [candidates, popupHotelId],
  )

  useEffect(() => {
    if (bootstrappedRef.current) return
    if (!isLoaded) return
    bootstrappedRef.current = true

    const cached = loadHotelCache()
    if (cached?.candidates.length) {
      onCandidatesChange(cached.candidates)
      if (cached.selected) onSelect(cached.selected)
      return
    }

    void bootstrapRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded])

  function selectHotel(
    card: HotelCandidate,
    openPopup = true,
    nextCandidates: HotelCandidate[] = candidates,
  ) {
    const hotel = candidateToSelected(card)
    onSelect(hotel)
    persistHotelState(nextCandidates, hotel)
    if (openPopup) setPopupHotelId(card.id)
  }

  useEffect(() => {
    if (!popupCandidate) return
    const card = popupCandidate
    // Already enriched — do not call the model again.
    if (card.tripFit?.trim() || !isLlmConfigured()) return

    let cancelled = false
    setStoryLoadingId(card.id)

    const prefs = loadHotelCache()?.lastPreferences
    const tripDays = daysRef.current.map((d) => ({
      day: d.day,
      title: d.title,
      pace: d.pace,
      theme: d.theme,
    }))

    void memoizeLlmCall(`hotel-detail:${card.id}`, () =>
      generateHotelDetailCopy({
        name: card.name,
        area: card.area,
        address: card.address,
        nearestMetro: card.nearestMetro,
        ratingHint: card.priceHint,
        existingDescription: card.description,
        existingReason: card.reason,
        isBest: card.isBest,
        userPreferences: prefs,
        tripDays,
      }),
    )
      .then((copy) => {
        if (cancelled || !copy) return
        // If another enrich already wrote tripFit, skip write.
        const current = candidatesRef.current.find((h) => h.id === card.id)
        if (current?.tripFit?.trim()) return

        const next = candidatesRef.current.map((h) =>
          h.id === card.id
            ? {
                ...h,
                description: copy.intro || h.description,
                reason: copy.reason || h.reason,
                tripFit: copy.tripFit || h.tripFit,
              }
            : h,
        )
        onCandidatesChange(next)
        const stillSelected = next.find((h) => h.id === selectedRef.current.id)
        persistHotelState(
          next,
          stillSelected ? candidateToSelected(stillSelected) : selectedRef.current,
        )
      })
      .finally(() => {
        if (!cancelled) setStoryLoadingId((id) => (id === card.id ? null : id))
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupCandidate?.id])

  async function bootstrapRecommendations() {
    if (!isLlmConfigured()) {
      setError('未配置 OpenAI API Key，无法生成酒店推荐。请使用下方自定义地址。')
      return
    }

    setRefreshing(true)
    setError(null)
    try {
      const llmCards = await fetchResolvedHotelRecommendations({ count: 5, batch: 1 })
      const best = llmCards.find((h) => h.isBest) || llmCards[0]
      onCandidatesChange(llmCards)
      const selectedHotel = candidateToSelected(best)
      onSelect(selectedHotel)
      persistHotelState(llmCards, selectedHotel)
    } catch (e) {
      setError(e instanceof Error ? e.message : '推荐酒店失败')
    } finally {
      setRefreshing(false)
    }
  }

  async function runFreshRecommendations(preferences?: string) {
    if (!isLlmConfigured()) {
      setError('未配置 OpenAI API Key，无法生成酒店推荐。请使用下方自定义地址。')
      return
    }

    const prefs = preferences?.trim() || undefined
    setRefreshPanel(null)
    setRefreshing(true)
    setRefreshHint(prefs ? '正在按你的喜好重新推荐酒店…' : '交给命运：正在让模型自由挑选一批新酒店…')
    setError(null)
    try {
      const result = await refreshHotelCandidates({
        current: candidates,
        preferences: prefs,
        keepCustom: true,
      })
      onCandidatesChange(result.candidates)
      onSelect(result.selected)
      setPreferText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '推荐酒店失败')
    } finally {
      setRefreshing(false)
      setRefreshHint(null)
    }
  }

  async function applyCustom() {
    setLoading(true)
    setError(null)
    try {
      const query = customQuery.trim()
      const card = await resolveHotelCandidate({
        name: query,
        source: 'custom',
        area: '自定义酒店',
      })

      const next = [
        card,
        ...candidates.filter(
          (c) =>
            Math.abs(c.lat - card.lat) > 0.0008 ||
            Math.abs(c.lng - card.lng) > 0.0008 ||
            c.name !== card.name,
        ),
      ]
      onCandidatesChange(next)
      setCustomQuery('')
      selectHotel(card, true, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败')
    } finally {
      setLoading(false)
    }
  }

  const showEmpty = !candidates.length && !refreshing

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--stone)]">住宿起点</p>
          <h2 className="font-display text-3xl text-[var(--ink)]">选择酒店</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--stone)]">
            首次打开由大模型推荐候选项，并自动选中最优推荐。也可自定义地址；行程助手可按你的要求换一批或替换部分酒店。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-[var(--sage)]/10 px-3 py-1 text-sm text-[var(--sage)]">
            当前：{selected.name}
          </div>
          <button
            type="button"
            disabled={refreshing || !isLlmConfigured()}
            onClick={() => {
              setError(null)
              setRefreshPanel('choose')
            }}
            className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)] disabled:opacity-50"
          >
            {refreshing ? '推荐中…' : '换一批推荐'}
          </button>
        </div>
      </div>

      {refreshPanel && (
        <div className="rounded-2xl border border-[var(--mist)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
          {refreshPanel === 'choose' ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">换一批推荐</p>
                  <p className="mt-1 text-sm text-[var(--stone)]">
                    按你的喜好定制，或交给模型自由发挥。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => setRefreshPanel(null)}
                  className="text-sm text-[var(--stone)] hover:text-[var(--ink)]"
                >
                  取消
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => setRefreshPanel('prefer')}
                  className="rounded-xl border border-[var(--mist)] bg-white/70 px-3 py-3 text-left transition hover:border-[var(--sage)] disabled:opacity-50"
                >
                  <p className="font-medium">说说我的喜好</p>
                  <p className="mt-1 text-xs text-[var(--stone)]">
                    填写区位、预算、氛围等要求后再推荐
                  </p>
                </button>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void runFreshRecommendations()}
                  className="rounded-xl border border-[var(--mist)] bg-white/70 px-3 py-3 text-left transition hover:border-[var(--copper)] disabled:opacity-50"
                >
                  <p className="font-medium">交给命运</p>
                  <p className="mt-1 text-xs text-[var(--stone)]">
                    不设条件，让模型自行挑一批新酒店
                  </p>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">你的喜好与要求</p>
                  <p className="mt-1 text-sm text-[var(--stone)]">
                    例如：左岸、地铁方便、中档、安静一点
                  </p>
                </div>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => setRefreshPanel('choose')}
                  className="text-sm text-[var(--stone)] hover:text-[var(--ink)]"
                >
                  返回
                </button>
              </div>
              <textarea
                value={preferText}
                onChange={(e) => setPreferText(e.target.value)}
                rows={3}
                placeholder="写下你对住宿的想法…"
                className="mt-3 w-full resize-none rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]"
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => setRefreshPanel(null)}
                  className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={refreshing || !preferText.trim()}
                  onClick={() => void runFreshRecommendations(preferText)}
                  className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] disabled:opacity-50"
                >
                  {refreshing ? '推荐中…' : '按喜好推荐'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {refreshing && (
        <p className="text-sm text-[var(--stone)]">
          {refreshHint || '正在请大模型推荐巴黎酒店，并核对 Google 地点信息…'}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {candidates.map((hotel) => {
          const active = selected.id === hotel.id
          return (
            <button
              key={hotel.id}
              type="button"
              onClick={() => selectHotel(hotel)}
              className={`group overflow-hidden rounded-2xl border text-left transition ${
                active
                  ? 'border-[var(--copper)] shadow-[var(--shadow)] ring-2 ring-[var(--copper)]/30'
                  : 'border-white/60 bg-[var(--card)] hover:border-[var(--gold)]'
              }`}
            >
              <GooglePlacePhoto
                name={hotel.name}
                location={{ lat: hotel.lat, lng: hotel.lng }}
                fallback={hotel.image}
                alt={hotel.name}
                asBackground
                className="h-28 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
              />
              <div className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs text-[var(--copper)]">{hotel.area}</p>
                  {hotel.isBest && (
                    <span className="rounded-full bg-[var(--copper)]/15 px-2 py-0.5 text-[10px] text-[var(--copper)]">
                      最优推荐
                    </span>
                  )}
                  {hotel.source === 'custom' && (
                    <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-[10px] text-[var(--stone)]">
                      自定义
                    </span>
                  )}
                </div>
                <p className="font-medium leading-snug">{hotel.name}</p>
                <p className="line-clamp-2 text-xs text-[var(--stone)]">
                  {hotel.reason || hotel.description}
                </p>
                <p className="text-xs text-[var(--stone)]">{hotel.priceHint}</p>
              </div>
            </button>
          )
        })}

        <div className="rounded-2xl border border-dashed border-[var(--stone)]/40 bg-[var(--card)] p-3">
          <p className="text-xs text-[var(--copper)]">自定义</p>
          <p className="font-medium">输入我自己的酒店地址</p>
          <p className="mt-1 text-xs text-[var(--stone)]">
            确认后会生成与上方相同样式的酒店卡片
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <input
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="例如：25 Rue du Temple, 75004 Paris"
              className="w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customQuery.trim() && !loading) {
                  e.preventDefault()
                  void applyCustom()
                }
              }}
            />
            <button
              type="button"
              disabled={loading || !customQuery.trim() || !isLoaded}
              onClick={() => void applyCustom()}
              className="rounded-xl bg-[var(--ink)] px-3 py-2 text-sm text-[var(--paper)] disabled:opacity-50"
            >
              {loading ? '生成卡片中…' : '生成酒店卡片'}
            </button>
          </div>
        </div>
      </div>

      {showEmpty && !error && (
        <p className="text-sm text-[var(--stone)]">暂无候选项。可点「换一批推荐」或自定义地址。</p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <GooglePlacePage
        open={Boolean(popupCandidate)}
        name={popupCandidate?.name || ''}
        location={
          popupCandidate
            ? { lat: popupCandidate.lat, lng: popupCandidate.lng }
            : undefined
        }
        fallbackImage={popupCandidate?.image}
        showMap={false}
        llmNarrative={
          popupCandidate
            ? {
                intro: popupCandidate.description,
                reason: popupCandidate.reason,
                tripFit: popupCandidate.tripFit,
                loading: storyLoadingId === popupCandidate.id,
                labels: {
                  title: '行程顾问点评',
                  intro: '酒店简介',
                  reason: '为什么推荐',
                  tripFit: '与行程 / 要求的关系',
                  loadingText: '正在生成酒店简介与推荐理由…',
                  loadingMoreText: '正在补充与行程的匹配说明…',
                },
              }
            : null
        }
        onClose={() => setPopupHotelId(null)}
      />
    </section>
  )
}
