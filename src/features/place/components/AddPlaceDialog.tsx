import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  fetchGooglePlaceDetails,
  placeDetailsQuery,
  searchNearbyGooglePlaceCandidates,
  type GooglePlaceDetails,
} from '../../map/services/googlePlaceDetails'
import { fetchPlaceWebsitePhotosWithFallback } from '../services/placeWebsitePhotos'
import { fetchTripadvisorPlaceGallery } from '../services/tripadvisorPlacePhotos'
import {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  getOpenAIModel,
  isLlmConfigured,
  recommendPlacesForDay,
  type HotelDetailCopy,
  type PlaceRecommendation,
  type RecommendPlaceType,
} from '../../../shared/services/llm/llm'
import {
  memoizePlaceDetailCopy,
  peekPlaceDetailCopy,
  placeDetailKeysFromGoogle,
} from '../services/placeDetailMemo'
import {
  placeAdvisorCopyFields,
  placeAdvisorFactsSignature,
  type PlaceAdvisorFacts,
} from '../services/placeAdvisorFacts'
import {
  getDayRecommendCache,
  setDayRecommendCache,
} from '../services/recommendCache'
import type { Place, PlaceType } from '../../../types'
import type { RecommendationPreferences } from '../services/recommendationPreferences'
import { formatPriceLevelLabel } from '../../../shared/utils/priceLevel'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { GooglePlacePage } from './GooglePlacePage'
import { ButtonSpinner, LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
  glassModalSurfaceClass,
} from '../../../shared/styles/glassCapsule'
import { PlaceName } from './PlaceName'
import { PlacePhotoGallery } from './PlacePhotoGallery'
import type { PlaceInfoSource } from '../services/placeSource'
import {
  fetchWikimediaPlacePhoto,
  type WikimediaPlacePhoto,
} from '../../map/services/wikimediaPlacePhotos'

interface Props {
  open: boolean
  dayNumber: number
  dayTitle: string
  dayPace: string
  dayTheme?: string
  hotelArea?: string
  hotelLocation: { lat: number; lng: number }
  recommendationPreferences: RecommendationPreferences
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
  hotelLocation,
  recommendationPreferences,
  currentPlaceNames,
  tripPlaceNames,
  onClose,
  onAddCustom,
}: Props) {
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
  const [advisorFacts, setAdvisorFacts] = useState<PlaceAdvisorFacts | null>(null)
  const [advisorFactsKey, setAdvisorFactsKey] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [addingName, setAddingName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<PlaceRecommendation[]>([])
  const [loadingByCategory, setLoadingByCategory] = useState<
    Record<RecommendPlaceType, boolean>
  >({ attraction: false, cafe: false, restaurant: false })
  const [refreshingCategory, setRefreshingCategory] =
    useState<RecommendPlaceType | null>(null)
  const [recErrors, setRecErrors] = useState<
    Partial<Record<RecommendPlaceType, string>>
  >({})
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [detailsByKey, setDetailsByKey] = useState<Record<string, GooglePlaceDetails | null>>({})
  const [sourceByKey, setSourceByKey] = useState<Record<string, PlaceInfoSource | null>>({})
  const [wikimediaByKey, setWikimediaByKey] = useState<
    Record<string, WikimediaPlacePhoto>
  >({})
  const [loadingDetailsKey, setLoadingDetailsKey] = useState<string | null>(null)
  const [photoIndexByKey, setPhotoIndexByKey] = useState<Record<string, number>>({})
  const chromeRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const recommendationsRef = useRef<PlaceRecommendation[]>([])
  const recBatchesRef = useRef<Record<RecommendPlaceType, number>>({
    attraction: 1,
    cafe: 1,
    restaurant: 1,
  })
  const loadingCategoriesRef = useRef(new Set<RecommendPlaceType>())
  const recommendationEpochRef = useRef(0)
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined)
  const [heightReady, setHeightReady] = useState(false)
  const [tabsInteractive, setTabsInteractive] = useState(false)

  // Reset height and tab animation gate when the sheet closes so reopen doesn't tween from stale size or fly in.
  useLayoutEffect(() => {
    if (!open) {
      setTabsInteractive(false)
      setHeightReady(false)
      setBodyHeight(undefined)
    } else {
      const timer = setTimeout(() => setTabsInteractive(true), 320)
      return () => clearTimeout(timer)
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

  function updateCategoryLoading(types: RecommendPlaceType[], loading: boolean) {
    for (const type of types) {
      if (loading) loadingCategoriesRef.current.add(type)
      else loadingCategoriesRef.current.delete(type)
    }
    setLoadingByCategory({
      attraction: loadingCategoriesRef.current.has('attraction'),
      cafe: loadingCategoriesRef.current.has('cafe'),
      restaurant: loadingCategoriesRef.current.has('restaurant'),
    })
  }

  function applyCachedRecommendations(
    list: PlaceRecommendation[],
    batches?: Partial<Record<RecommendPlaceType, number>>,
    legacyBatch = 1,
  ) {
    const nextBatches: Record<RecommendPlaceType, number> = {
      attraction: batches?.attraction || legacyBatch,
      cafe: batches?.cafe || legacyBatch,
      restaurant: batches?.restaurant || legacyBatch,
    }
    recommendationsRef.current = list
    recBatchesRef.current = nextBatches
    setRecommendations(list)
    setRecErrors({})
    setError(null)
    setExpandedKey(null)
    setDetailsByKey({})
    setWikimediaByKey({})
    setPhotoIndexByKey({})
  }

  function persistRecommendations() {
    const batches = recBatchesRef.current
    setDayRecommendCache({
      day: dayNumber,
      batch: Math.max(batches.attraction, batches.cafe, batches.restaurant),
      batches,
      model: getOpenAIModel(),
      recommendations: recommendationsRef.current,
      fetchedAt: Date.now(),
    })
  }

  async function loadVerifiedCandidates(types: RecommendPlaceType[]) {
    const queryByType: Record<RecommendPlaceType, string> = {
      attraction: 'tourist attraction Paris',
      cafe: 'specialty coffee bakery brunch Paris',
      restaurant: 'restaurant Paris',
    }
    const rows = await Promise.all(
      types.map(async (type) => {
        const candidates = await searchNearbyGooglePlaceCandidates({
          textQuery: queryByType[type],
          location: hotelLocation,
          maxDistanceMeters: type === 'attraction' ? 20_000 : 12_000,
          limit: 12,
        })
        return candidates.map((candidate) => ({ ...candidate, type }))
      }),
    )
    return rows.flat().filter((candidate) => {
      const key = candidate.name.trim().toLowerCase()
      return (
        key &&
        !currentPlaceNames.some((name) => name.trim().toLowerCase() === key) &&
        !tripPlaceNames.some((name) => name.trim().toLowerCase() === key)
      )
    })
  }

  async function fetchRecommendations(options: {
    types: RecommendPlaceType[]
    batch?: number
    excludeNames?: string[]
    resetDetails?: boolean
    epoch?: number
  }): Promise<boolean> {
    const epoch = options.epoch ?? recommendationEpochRef.current
    const types = Array.from(new Set(options.types)).filter(
      (type) => !loadingCategoriesRef.current.has(type),
    )
    if (!types.length) return false

    const batch = options.batch ?? 1
    updateCategoryLoading(types, true)
    setRecErrors((prev) => {
      const next = { ...prev }
      for (const type of types) delete next[type]
      return next
    })
    setError(null)
    if (options.resetDetails) {
      setExpandedKey(null)
      setDetailsByKey({})
      setWikimediaByKey({})
      setPhotoIndexByKey({})
    }

    try {
      const verifiedCandidates = await loadVerifiedCandidates(types)
      if (!verifiedCandidates.length) {
        throw new Error('Google 暂时没有返回附近候选，请稍后重试。')
      }
      let list = await recommendPlacesForDay({
        day: dayNumber,
        title: dayTitle,
        pace: dayPace,
        theme: dayTheme,
        hotelArea,
        currentPlaceNames,
        tripPlaceNames,
        excludeNames: options.excludeNames,
        batch,
        types,
        countPerType: 4,
        verifiedCandidates,
        recommendationPreferences,
      })
      if (epoch !== recommendationEpochRef.current) return false

      // Models occasionally return a duplicate or a place already present in
      // the itinerary, which the service correctly filters out. Ask only for
      // the missing slots, in one extra call, instead of leaving a tab at 3.
      const countByType = (rows: PlaceRecommendation[]) => {
        const counts: Record<RecommendPlaceType, number> = {
          attraction: 0,
          cafe: 0,
          restaurant: 0,
        }
        for (const item of rows) counts[item.type] += 1
        return counts
      }
      const initialCounts = countByType(list)
      const missingTypes = types.filter((type) => initialCounts[type] < 4)
      if (missingTypes.length) {
        const missingCount = Math.max(
          ...missingTypes.map((type) => 4 - initialCounts[type]),
        )
        try {
          const topUp = await recommendPlacesForDay({
            day: dayNumber,
            title: dayTitle,
            pace: dayPace,
            theme: dayTheme,
            hotelArea,
            currentPlaceNames,
            tripPlaceNames,
            excludeNames: [
              ...(options.excludeNames || []),
              ...recommendationsRef.current.map((item) => item.name),
              ...list.map((item) => item.name),
            ],
            batch,
            types: missingTypes,
            countPerType: missingCount,
            verifiedCandidates,
            recommendationPreferences,
          })
          if (epoch !== recommendationEpochRef.current) return false
          list = [...list, ...topUp]
        } catch {
          // Preserve the valid first response; the current tab can retry later.
        }
      }

      const capped: PlaceRecommendation[] = []
      const cappedCounts = countByType([])
      const seenNames = new Set<string>()
      for (const item of list) {
        const nameKey = item.name.trim().toLowerCase()
        if (!nameKey || seenNames.has(nameKey) || cappedCounts[item.type] >= 4) continue
        seenNames.add(nameKey)
        cappedCounts[item.type] += 1
        capped.push(item)
      }
      list = capped

      const returnedTypes = new Set(list.map((item) => item.type))
      if (!list.length) {
        const message = isLlmConfigured()
          ? '这次没有可用推荐，请再点「换一批」或改用 Google 搜索。'
          : '推荐助手暂不可用，请改用 Google 搜索。'
        setRecErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(types.map((type) => [type, message])),
        }))
        return false
      }

      const next = [
        ...recommendationsRef.current.filter(
          (item) => !returnedTypes.has(item.type),
        ),
        ...list,
      ]
      const nextBatches = { ...recBatchesRef.current }
      for (const type of returnedTypes) nextBatches[type] = batch
      recommendationsRef.current = next
      recBatchesRef.current = nextBatches
      setRecommendations(next)
      persistRecommendations()
      return true
    } catch (err) {
      if (epoch !== recommendationEpochRef.current) return false
      const message =
        err instanceof SyntaxError
          ? '推荐结果解析失败，请再试一次。'
          : err instanceof Error
            ? err.message
            : '推荐加载失败，请稍后再试。'
      setRecErrors((prev) => ({
        ...prev,
        ...Object.fromEntries(types.map((type) => [type, message])),
      }))
      return false
    } finally {
      if (epoch === recommendationEpochRef.current) {
        updateCategoryLoading(types, false)
      }
    }
  }

  // First paint only the selected tab, then fill the two remaining tabs in one
  // background request. Reopening uses the persisted per-day cache.
  useEffect(() => {
    if (!open) {
      recommendationEpochRef.current += 1
      return
    }

    const epoch = ++recommendationEpochRef.current
    loadingCategoriesRef.current.clear()
    setLoadingByCategory({ attraction: false, cafe: false, restaurant: false })
    setRefreshingCategory(null)
    setMainTab('ai')
    setError(null)
    setGoogleDetail(null)
    setGoogleStory(null)
    setGoogleStoryLoading(false)

    const cached = getDayRecommendCache(dayNumber)
    if (cached) {
      applyCachedRecommendations(
        cached.recommendations,
        cached.batches,
        cached.batch,
      )
    } else {
      applyCachedRecommendations([], undefined, 1)
    }

    const hasFullType = (type: RecommendPlaceType) =>
      recommendationsRef.current.filter((item) => item.type === type).length >= 4
    const primaryType = category

    void (async () => {
      if (!hasFullType(primaryType)) {
        await fetchRecommendations({
          types: [primaryType],
          batch: recBatchesRef.current[primaryType],
          excludeNames: recommendationsRef.current.map((item) => item.name),
          epoch,
        })
      }
      if (epoch !== recommendationEpochRef.current) return

      const remaining = recommendTabs
        .map((tab) => tab.id)
        .filter((type) => type !== primaryType && !hasFullType(type))
      if (remaining.length) {
        await fetchRecommendations({
          types: remaining,
          batch: Math.max(...remaining.map((type) => recBatchesRef.current[type])),
          excludeNames: recommendationsRef.current.map((item) => item.name),
          epoch,
        })
      }
    })()

    return () => {
      if (recommendationEpochRef.current === epoch) {
        recommendationEpochRef.current += 1
      }
    }
    // Intentionally capture the tab selected when the dialog opens; switching
    // tabs later must not restart the whole progressive-loading sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayNumber])

  async function ensureRecommendationCategory(type: RecommendPlaceType) {
    if (
      recommendationsRef.current.filter((item) => item.type === type).length >= 4 ||
      loadingCategoriesRef.current.has(type)
    ) {
      return
    }
    await fetchRecommendations({
      types: [type],
      batch: recBatchesRef.current[type],
      excludeNames: recommendationsRef.current.map((item) => item.name),
      epoch: recommendationEpochRef.current,
    })
  }

  async function refreshRecommendations() {
    if (loadingCategoriesRef.current.has(category) || searching) return
    const type = category
    const previousNames = recommendationsRef.current
      .filter((item) => item.type === type)
      .map((item) => item.name)
    setRefreshingCategory(type)
    try {
      await fetchRecommendations({
        types: [type],
        batch: recBatchesRef.current[type] + 1,
        excludeNames: previousNames,
        resetDetails: true,
        epoch: recommendationEpochRef.current,
      })
    } finally {
      setRefreshingCategory((current) => (current === type ? null : current))
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
  const loadingRecs = loadingByCategory[category]
  const refreshingRecs = refreshingCategory === category
  const recommendationError = recErrors[category] || error

  function itemKey(item: PlaceRecommendation) {
    return `${item.type}:${item.name}`
  }

  async function ensureDetails(item: PlaceRecommendation) {
    const key = itemKey(item)
    if (detailsByKey[key] !== undefined) return detailsByKey[key]

    setLoadingDetailsKey(key)
    setError(null)
    try {
      const query = placeDetailsQuery(item.name, item.nameLocal)
      if (!query) {
        setDetailsByKey((prev) => ({ ...prev, [key]: null }))
        setError('缺少地点原文名称，无法查询 Google 详情。')
        return null
      }
      const details = await fetchGooglePlaceDetails(query, undefined, {
        placeId: item.googlePlaceId,
      })

      const isRestaurantOrCafe = item.type === 'restaurant' || item.type === 'cafe'

      // 1. Tripadvisor photos for restaurant/cafe
      let tripadvisorPhotos: string[] = []
      if (isRestaurantOrCafe) {
        tripadvisorPhotos = (
          await fetchTripadvisorPlaceGallery({
            name: details?.name || item.name,
            nameLocal: details?.nameOriginal || item.nameLocal,
            type: item.type,
          }).catch(() => null)
        )?.photos || []
      }

      // 2. Official Website photos
      const websitePhotos = (
        await fetchPlaceWebsitePhotosWithFallback({
          website: details?.website,
          name: details?.name || item.name,
          nameLocal: details?.nameOriginal || item.nameLocal,
          address: details?.address,
        }).catch(() => ({ photos: [] }))
      ).photos

      // 3. Resolve source and photos using identical priority as GooglePlacePage
      let displayPhotos: string[] = []
      let source: PlaceInfoSource | null = null

      if (isRestaurantOrCafe) {
        if (tripadvisorPhotos.length) {
          displayPhotos = tripadvisorPhotos
          source = 'tripadvisor'
        } else if (websitePhotos.length) {
          displayPhotos = websitePhotos
          source = 'website'
        } else if (details?.photos?.length) {
          displayPhotos = details.photos
          source = 'google'
        }
      } else {
        if (details?.photos?.length) {
          displayPhotos = details.photos
          source = 'google'
        } else if (websitePhotos.length) {
          displayPhotos = websitePhotos
          source = 'website'
        }
      }

      // 4. Wikimedia fallback for attractions
      let wikimedia: WikimediaPlacePhoto | null = null
      if (!displayPhotos.length && item.type === 'attraction' && details?.location) {
        wikimedia = await fetchWikimediaPlacePhoto(
          details.name || item.name,
          details.location,
        )
        if (wikimedia?.url) {
          displayPhotos = [wikimedia.url]
          source = 'wikimedia'
        }
      }

      const resolved = details
        ? { ...details, photos: displayPhotos }
        : details

      setDetailsByKey((prev) => ({ ...prev, [key]: resolved }))
      if (source) {
        setSourceByKey((prev) => ({ ...prev, [key]: source }))
      }
      if (wikimedia) {
        setWikimediaByKey((prev) => ({ ...prev, [key]: wikimedia }))
      }
      setPhotoIndexByKey((prev) => ({ ...prev, [key]: 0 }))
      return resolved
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
    setAddingName(`${name}:${mode}`)
    setSearching(true)
    setError(null)
    try {
      const query = placeDetailsQuery(name)
      if (!cached?.location && !query) {
        throw new Error('缺少地点原文名称，无法查询 Google 详情。')
      }
      const details = cached?.location
        ? cached
        : await fetchGooglePlaceDetails(query, undefined)
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

      const isRestaurantOrCafe = type === 'restaurant' || type === 'cafe'
      let tripadvisorPhotos: string[] = []
      if (isRestaurantOrCafe) {
        tripadvisorPhotos = (
          await fetchTripadvisorPlaceGallery({
            name: details.name,
            nameLocal: details.nameOriginal,
            type,
          }).catch(() => null)
        )?.photos || []
      }

      const websitePhotos = (
        await fetchPlaceWebsitePhotosWithFallback({
          website: details.website,
          name: details.name,
          nameLocal: details.nameOriginal,
          address: details.address,
        }).catch(() => ({ photos: [] }))
      ).photos

      let mainPhoto: string | null = null
      if (isRestaurantOrCafe) {
        mainPhoto = tripadvisorPhotos[0] || websitePhotos[0] || details.photos?.[0] || null
      } else {
        mainPhoto = details.photos?.[0] || websitePhotos[0] || null
      }

      const wikimediaPhoto =
        type === 'attraction' && !mainPhoto
          ? await fetchWikimediaPlacePhoto(details.name, details.location)
          : null

      const place: Place = {
        id: `custom-${Date.now()}`,
        googlePlaceId: details.id,
        name: /[\u3400-\u9fff]/.test(name) ? name : details.name,
        nameLocal: details.nameOriginal,
        type,
        description,
        googleRating: details.rating,
        googleUserRatingCount: details.userRatingCount,
        googleAddress: details.address,
        ratingHint:
          details.rating != null
            ? `Google ★ ${details.rating.toFixed(1)}`
            : 'AI 推荐 / Google 地点',
        priceHint: details.priceLevel,
        image: mainPhoto || wikimediaPhoto?.url || FALLBACK_IMAGE,
        location: details.location,
        googleMapsUrl: details.id
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              details.nameOriginal || details.name,
            )}&query_place_id=${encodeURIComponent(details.id)}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              details.nameOriginal || details.name,
            )}`,
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
    setSearching(true)
    setError(null)
    try {
      const query = placeDetailsQuery(q)
      if (!query) {
        throw new Error('请使用地点的原文名称搜索。')
      }
      const details = await fetchGooglePlaceDetails(query, undefined)
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
    setAdvisorFacts(null)
    setAdvisorFactsKey(null)
    setError(null)
  }

  const googleDetailKey = googleDetail
    ? `${googleDetail.details.id || googleDetail.details.name}:${googleDetail.type}`
    : null
  const factsForDetail = advisorFactsKey === googleDetailKey ? advisorFacts : null
  const factsSig = placeAdvisorFactsSignature(factsForDetail)

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

    if (!factsSig) {
      setGoogleStory({ intro: '', reason: '', tripFit: '' })
      setGoogleStoryLoading(true)
      return
    }

    let cancelled = false
    setGoogleStory({ intro: '', reason: '', tripFit: '' })
    setGoogleStoryLoading(true)
    const facts = placeAdvisorCopyFields(factsForDetail)
    void memoizePlaceDetailCopy(
      detailKeys,
      () =>
        generatePlaceDetailCopy({
          name: details.name,
          nameLocal: details.nameOriginal,
          type,
          address: facts.address || details.address,
          existingDescription: details.summary,
          listingDescription: facts.listingDescription,
          rating: facts.rating ?? details.rating,
          reviewCount: facts.reviewCount ?? details.userRatingCount,
          priceLevel: facts.priceLevel || details.priceLevel,
          cuisine: facts.cuisine,
          featuredReviews: facts.featuredReviews?.length
            ? facts.featuredReviews
            : details.reviews.slice(0, 6),
          nearbyStops: currentPlaceNames.slice(0, 8).map((name) => ({ name, type: '' })),
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
  }, [googleDetail, googleStoryRegenToken, factsSig])

  useEffect(() => {
    setGoogleStoryRegenToken(0)
  }, [googleDetail])

  useEffect(() => {
    if (!googleDetail || !isLlmConfigured()) return
    if (factsSig) return
    const timer = window.setTimeout(() => {
      setAdvisorFactsKey(googleDetailKey)
      setAdvisorFacts((prev) =>
        prev?.settled ? prev : { reviews: prev?.reviews || [], settled: true },
      )
    }, 12_000)
    return () => window.clearTimeout(timer)
  }, [googleDetail, googleDetailKey, factsSig])

  const googleBusyBest =
    googleDetail != null && addingName === `${googleDetail.details.name}:best`
  const googleBusyEnd =
    googleDetail != null && addingName === `${googleDetail.details.name}:end`

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        overlayZIndex={2100}
        hideBackdrop={Boolean(googleDetail)}
        className={`flex max-h-[min(88dvh,88vh)] max-w-lg flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl`}
      >
        <div ref={chromeRef} className="shrink-0">
          <div className="flex items-center justify-between border-b border-[var(--mist)] px-4 py-3">
            <div>
              <h3 className="font-display text-2xl">添加地点</h3>
            </div>
            <CloseIconButton onClick={onClose} className="hidden sm:flex mt-0.5" />
          </div>

          <div className="px-4 pt-3">
            <div
              className="relative flex gap-1 rounded-full border border-white/80 bg-white/50 p-1 shadow-sm backdrop-blur-md"
              role="tablist"
              aria-label="添加地点视图"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'ai'}
                onClick={() => {
                  setMainTab('ai')
                  closeGoogleDetail()
                }}
                className="relative isolate flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {mainTab === 'ai' &&
                  (tabsInteractive ? (
                    <motion.span
                      layoutId="add-place-main-tab-pill"
                      className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)]"
                      transition={{
                        type: 'spring',
                        stiffness: 450,
                        damping: 32,
                        mass: 0.8,
                      }}
                    />
                  ) : (
                    <span className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-sm" />
                  ))}
                <span
                  className={`relative z-10 transition-colors duration-200 ${
                    mainTab === 'ai' ? 'text-[var(--paper)]' : 'text-[var(--ink)]'
                  }`}
                >
                  AI 推荐
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'google'}
                onClick={() => {
                  setMainTab('google')
                  closeGoogleDetail()
                }}
                className="relative isolate flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {mainTab === 'google' &&
                  (tabsInteractive ? (
                    <motion.span
                      layoutId="add-place-main-tab-pill"
                      className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)]"
                      transition={{
                        type: 'spring',
                        stiffness: 450,
                        damping: 32,
                        mass: 0.8,
                      }}
                    />
                  ) : (
                    <span className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-sm" />
                  ))}
                <span
                  className={`relative z-10 transition-colors duration-200 ${
                    mainTab === 'google' ? 'text-[var(--paper)]' : 'text-[var(--ink)]'
                  }`}
                >
                  Google 搜索
                </span>
              </button>
            </div>
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

              <div className="flex gap-2 overflow-x-auto pb-1 [touch-action:pan-x] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {recommendTabs.map((tab) => {
                  const active = category === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setCategory(tab.id)
                        setExpandedKey(null)
                        void ensureRecommendationCategory(tab.id)
                      }}
                      className="relative isolate shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-sm transition-colors hover:bg-white/90"
                    >
                      {active &&
                        (tabsInteractive ? (
                          <motion.span
                            layoutId="add-place-category-pill"
                            className="absolute inset-0 z-0 rounded-full bg-[var(--sage)] shadow-[0_2px_8px_rgba(99,136,112,0.25),inset_0_1px_1.5px_rgba(255,255,255,0.25)]"
                            transition={{
                              type: 'spring',
                              stiffness: 450,
                              damping: 32,
                              mass: 0.8,
                            }}
                          />
                        ) : (
                          <span className="absolute inset-0 z-0 rounded-full bg-[var(--sage)] shadow-sm" />
                        ))}
                      <span
                        className={`relative z-10 font-medium transition-colors duration-200 ${
                          active ? 'text-white' : 'text-[var(--ink)]'
                        }`}
                      >
                        {tab.label}
                        <span className={`ml-1 ${active ? 'text-white/80' : 'opacity-70'}`}>
                          {loadingByCategory[tab.id] && !grouped[tab.id].length
                            ? '(…)'
                            : `(${grouped[tab.id].length})`}
                        </span>
                      </span>
                    </button>
                  )
                })}
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
                    const priceLevelLabel = formatPriceLevelLabel(details?.priceLevel)

                    return (
                      <motion.li
                        key={key}
                        layout="position"
                        transition={{ layout: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}
                      >
                        <div
                          className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                            expanded
                              ? 'border-[var(--copper)]/80 bg-white/90 shadow-[0_8px_32px_rgba(181,106,60,0.14),inset_0_1px_2px_rgba(255,255,255,1)] ring-2 ring-[var(--copper)]/35 backdrop-blur-2xl'
                              : `${glassCardSurfaceClass} hover:bg-white/80 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]`
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

                          <AnimatePresence initial={false}>
                            {expanded && (
                              <motion.div
                                key="recommend-expanded-panel"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{
                                  height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                                  opacity: { duration: 0.16, ease: 'easeOut' },
                                }}
                                className="overflow-hidden border-t border-[var(--mist)]"
                              >
                                <div className="space-y-3 px-3 pb-3 pt-3">
                                  {loadingDetails ? (
                                    <LoadingIndicator
                                      label="正在加载 Google 照片…"
                                      showDots
                                      size="sm"
                                    />
                                  ) : (
                                    <>
                                      {photos.length > 0 ? (
                                        <PlacePhotoGallery
                                          photos={photos}
                                          photoIndex={photoIndex}
                                          onPhotoIndexChange={(nextIdx) =>
                                            setPhotoIndexByKey((prev) => ({
                                              ...prev,
                                              [key]: nextIdx,
                                            }))
                                          }
                                          alt={item.name}
                                          photoSource={sourceByKey[key]}
                                          wikimediaPhoto={wikimediaByKey[key]}
                                          heightClass="h-44 sm:h-56"
                                        />
                                      ) : null}

                                      <div className="flex flex-wrap gap-2 text-xs">
                                        <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} inline-flex items-center px-2.5 py-1 text-[var(--sage)]`}>
                                          {item.type}
                                        </span>
                                        {details?.rating != null && (
                                          <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.gold} inline-flex items-center px-2.5 py-1`}>
                                            ★ {details.rating.toFixed(1)}
                                            {details.userRatingCount != null
                                              ? `（${details.userRatingCount}）`
                                              : ''}
                                          </span>
                                        )}
                                        {priceLevelLabel && (
                                          <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center px-2.5 py-1 text-[var(--stone)]`}>
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
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.li>
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

              {recommendationError && mainTab === 'ai' && (
                <p className="text-sm text-red-700">{recommendationError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="search"
                inputMode="search"
                autoComplete="off"
                enterKeyHint="search"
                value={googleQuery}
                onChange={(e) => setGoogleQuery(e.target.value)}
                placeholder="例如：Musée Rodin Paris"
                className="w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 outline-none focus:border-[var(--sage)]"
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
                  className="mt-1 w-full rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-base"
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
      </BottomSheet>

      <GooglePlacePage
        open={Boolean(googleDetail)}
        name={googleDetail?.details.name || ''}
        nameLocal={googleDetail?.details.nameOriginal}
        googlePlaceId={googleDetail?.details.id}
        location={googleDetail?.details.location}
        placeType={googleDetail?.type}
        googleRating={googleDetail?.details.rating}
        googleRatingCount={googleDetail?.details.userRatingCount}
        googleAddress={googleDetail?.details.address}
        fallbackImage={googleDetail?.details.photos?.[0] || FALLBACK_IMAGE}
        showMap={false}
        detailsOverride={googleDetail?.details}
        overlayClassName="z-[2200]"
        overlayZIndex={2200}
        onAdvisorFacts={(next) => {
          setAdvisorFactsKey(googleDetailKey)
          setAdvisorFacts(next)
        }}
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
    </>
  )
}
