import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { PENDING_HOTEL, isHotelSelected } from '../constants/hotels'
import { loadHotelCache } from '../services/hotelCache'
import {
  fetchResolvedHotelRecommendations,
  persistHotelState,
  refreshHotelCandidates,
} from '../services/hotelRecommend'
import { candidateToSelected, resolveHotelCandidate } from '../services/hotelResolve'
import {
  hydrateHotelAdvisorFromCache,
  memoizeHotelAdvisorCopy,
  rememberHotelAdvisorCopy,
} from '../services/hotelAdvisorMemo'
import { generateHotelCardBlurb, generateHotelDetailCopy, isLlmConfigured } from '../../../shared/services/llm/llm'
import { looksChinese } from '../../chat/services/translate'
import { memoizeLlmCall } from '../../../shared/services/llm/llmMemo'
import type { DayPlan, HotelCandidate, SelectedHotel } from '../../../types'
import { GooglePlacePage } from '../../place/components/GooglePlacePage'
import { HotelLocationDescription } from './HotelLocationDescription'
import { HotelExpandablePolicyList, HotelTranslatedText } from './hotelTranslation'
import { ShimmerLines } from '../../../shared/components/ShimmerLines'
import { GooglePlacePhoto } from '../../place/components/GooglePlacePhoto'
import { GoogleReviewsList } from '../../place/components/GoogleReviewsList'
import { ButtonSpinner, LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import {
  fetchBookingHotelFeaturedReviews,
  fetchBookingHotelDetails,
  fetchBookingHotelPhotos,
  isBookingApiEnabled,
  bookingPhotoUrl,
  resolveBookingHotelIdentity,
} from '../services/bookingHotels'
import {
  hotelScoreText,
  localizeFacility,
  localizePaymentMethod,
  localizePropertyType,
} from '../utils/hotelDisplay'
import {
  Accessibility,
  ArrowUpDown,
  BarChart3,
  Bath,
  Bed,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleMinus,
  CircleParking,
  CigaretteOff,
  Coffee,
  Dumbbell,
  ExternalLink,
  Flame,
  Info,
  Lock,
  Luggage,
  MapPin,
  MessageSquareQuote,
  PawPrint,
  Refrigerator,
  ShowerHead,
  Snowflake,
  Sparkles,
  Trees,
  Trash2,
  Tv,
  Utensils,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import { loadTripDates } from '../../itinerary/services/tripDates'

interface Props {
  selected: SelectedHotel
  candidates: HotelCandidate[]
  days: DayPlan[]
  onSelect: (hotel: SelectedHotel) => void
  onCandidatesChange: (candidates: HotelCandidate[]) => void
  readOnly?: boolean
  /** Fired when hotel GooglePlacePage opens/closes (for trip chat viewing context). */
  onDetailChange?: (hotel: HotelCandidate | null) => void
  /** Increment to open the selected hotel's Booking detail overlay. */
  openSelectedDetailToken?: number
}

/** Match DayTimeline float settle. */
const HOTEL_DRAG_SETTLE_MS = 200
const BOOKING_DETAILS_VERSION = 6
/** Start float after this pointer travel so clicks still open the card. */
const HOTEL_DRAG_THRESHOLD_PX = 6
/** Viscous follow — same language as DayTimeline tickFloat. */
const HOTEL_FLOAT_EASE = 0.22

type HotelDragSession = {
  hotelId: string
  grabX: number
  grabY: number
  width: number
  height: number
  startLeft: number
  startTop: number
  overSlot: boolean
}

function isSameHotel(a: HotelCandidate, b: HotelCandidate) {
  return (
    a.name === b.name &&
    Math.abs(a.lat - b.lat) <= 0.0008 &&
    Math.abs(a.lng - b.lng) <= 0.0008
  )
}

function pointInRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function needsCustomCardBlurb(hotel: HotelCandidate): boolean {
  if (hotel.source !== 'custom') return false
  const reason = hotel.reason?.trim() || ''
  if (!reason) return true
  return /^替换[「『"]/.test(reason)
}

function HotelCardFace({
  hotel,
  blurb,
  blurbLoading,
}: {
  hotel: HotelCandidate
  blurb?: string
  blurbLoading?: boolean
}) {
  const customText = (blurb || hotel.reason || '').trim()
  const showCustomShimmer = hotel.source === 'custom' && blurbLoading && !customText

  return (
    <>
      <GooglePlacePhoto
        name={hotel.name}
        location={{ lat: hotel.lat, lng: hotel.lng }}
        fallback={bookingPhotoUrl(hotel.image)}
        alt={hotel.name}
        asBackground
        className="h-28 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
      />
      <div className="flex min-h-[7.75rem] flex-col p-3">
        <div className="space-y-1">
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
          {showCustomShimmer ? (
            <ShimmerLines lines={2} />
          ) : hotel.source === 'custom' ? (
            <p className="m-0 line-clamp-2 text-xs text-[var(--stone)]">{customText}</p>
          ) : (
            <HotelTranslatedText
              text={hotel.reason || hotel.description}
              loadingLabel="正在翻译酒店简介…"
              className="line-clamp-2 text-xs text-[var(--stone)]"
            />
          )}
        </div>
        {hotel.rating != null && (
          <p className="mt-auto flex justify-end pt-2 text-right text-xs leading-tight text-[var(--stone)]">
            <span>
              <span className="font-medium">
                <span className="text-[#003580]">Booking</span>
                <span className="text-[#006ce4]">.com</span>
              </span>
              <span className="ml-1 tabular-nums">
                {hotel.rating.toFixed(1)}/10
                {hotel.reviewCount != null ? `（${hotel.reviewCount}）` : ''}
              </span>
            </span>
          </p>
        )}
      </div>
    </>
  )
}

function TrashIcon() {
  return <Trash2 size={14} strokeWidth={1.8} aria-hidden />
}

function UnselectIcon() {
  return <CircleMinus size={14} strokeWidth={1.8} aria-hidden />
}

function ChevronIcon({ up }: { up?: boolean }) {
  return (
    <ChevronDown
      size={14}
      strokeWidth={1.8}
      aria-hidden
      className={`transition-transform duration-300 ${up ? 'rotate-180' : ''}`}
    />
  )
}

function hasValidParisBookingIdentity(hotel: HotelCandidate): boolean {
  return Boolean(
    hotel.bookingHotelId &&
      hotel.lat >= 48.65 &&
      hotel.lat <= 49.05 &&
      hotel.lng >= 1.95 &&
      hotel.lng <= 2.7,
  )
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: '英语', fr: '法语', es: '西班牙语', pt: '葡萄牙语', de: '德语',
  'en-gb': '英语', 'en-us': '英语', it: '意大利语', zh: '中文', ja: '日语', ar: '阿拉伯语', ru: '俄语',
  'pt-pt': '葡萄牙语',
}

function localizeLanguage(value: string): string {
  return LANGUAGE_LABELS[value.trim().toLowerCase()] || value
}

function BookingSectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="mt-0.5 text-[#003b95]">
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0">
        <h4 className="text-base font-semibold">{title}</h4>
        {subtitle ? <p className="mt-0.5 text-xs text-[var(--stone)]">{subtitle}</p> : null}
      </div>
    </div>
  )
}

const HOTEL_FACT_ICONS = {
  location: MapPin,
} as const satisfies Record<string, LucideIcon>

function HotelFactIcon({ type }: { type: keyof typeof HOTEL_FACT_ICONS }) {
  const Icon = HOTEL_FACT_ICONS[type]
  return (
    <Icon
      className="h-[18px] w-[18px] shrink-0"
      strokeWidth={1.8}
      aria-hidden
    />
  )
}

function resolveFacilityIcon(facility: string): LucideIcon {
  const key = facility.trim().toLowerCase()
  const label = localizeFacility(facility)
  const haystack = `${key} ${label}`
  if (/wifi|wi-fi|internet|网络/.test(haystack)) return Wifi
  if (/restaurant|dining|kitchen|餐厅/.test(haystack)) return Utensils
  if (/minibar|迷你吧/.test(haystack)) return Wine
  if (/bar|酒吧/.test(haystack)) return Wine
  if (/breakfast|早餐/.test(haystack)) return Coffee
  if (/non-smoking|smoke-free|禁烟/.test(haystack)) return CigaretteOff
  if (/disabled|wheelchair|无障碍/.test(haystack)) return Accessibility
  if (/front desk|24-hour|reception|前台/.test(haystack)) return Bell
  if (/elevator|lift|电梯/.test(haystack)) return ArrowUpDown
  if (/heating|暖气/.test(haystack)) return Flame
  if (/laundry|洗衣/.test(haystack)) return WashingMachine
  if (/parking|停车/.test(haystack)) return CircleParking
  if (/pool|swimming|游泳/.test(haystack)) return Waves
  if (/fitness|gym|健身/.test(haystack)) return Dumbbell
  if (/air conditioning|空调/.test(haystack)) return Snowflake
  if (/pet|宠物/.test(haystack)) return PawPrint
  if (/hot tub|jacuzzi|按摩浴缸/.test(haystack)) return Sparkles
  if (/shower|淋浴/.test(haystack)) return ShowerHead
  if (/private bathroom|attached bathroom|独立浴室|\bbath\b|浴缸/.test(haystack)) return Bath
  if (/flat-screen|television|\btv\b|电视/.test(haystack)) return Tv
  if (/refrigerator|fridge|冰箱/.test(haystack)) return Refrigerator
  if (/family room|bed|客房|床/.test(haystack)) return Bed
  if (/safe|deposit box|保险箱/.test(haystack)) return Lock
  if (/hairdryer|hair dryer|吹风机/.test(haystack)) return Wind
  if (/baggage storage|行李寄存/.test(haystack)) return Luggage
  if (/room service|客房服务/.test(haystack)) return Bell
  if (/sauna|spa|水疗|桑拿/.test(haystack)) return Sparkles
  if (/terrace|garden|露台|花园/.test(haystack)) return Trees
  return Check
}

function FacilityItemIcon({ facility }: { facility: string }) {
  const Icon = resolveFacilityIcon(facility)
  return (
    <Icon
      className="h-[18px] w-[18px] shrink-0 text-[#008009]"
      strokeWidth={1.8}
      aria-hidden
    />
  )
}

const REVIEW_SCORE_ANIM_DURATION_MS = 1500
const REVIEW_SCORE_ANIM_STAGGER_MS = 100
const reviewScoreEase = cubicBezier(0.22, 1, 0.36, 1)

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  return (t: number): number => {
    let cx = t
    for (let i = 0; i < 8; i++) {
      const currentX =
        3 * x1 * (1 - cx) * (1 - cx) * cx +
        3 * x2 * (1 - cx) * cx * cx +
        cx * cx * cx
      const slope =
        3 * x1 * (1 - cx) * (1 - cx) -
        6 * x1 * (1 - cx) * cx +
        6 * x2 * (1 - cx) * cx -
        3 * x2 * cx * cx +
        3 * cx * cx
      const delta = currentX - t
      if (Math.abs(delta) < 1e-6) break
      cx -= delta / slope
    }
    return (
      3 * y1 * (1 - cx) * (1 - cx) * cx +
      3 * y2 * (1 - cx) * cx * cx +
      cx * cx * cx
    )
  }
}

function ReviewScoreBarItem({
  label,
  score,
  start,
  delayMs,
  highlighted,
  className,
}: {
  label: string
  score: number
  start: boolean
  delayMs: number
  highlighted: boolean
  className: string
}) {
  const [displayScore, setDisplayScore] = useState(0)
  const [widthPct, setWidthPct] = useState(0)
  const completedRef = useRef(false)

  useEffect(() => {
    completedRef.current = false
  }, [score, delayMs])

  useEffect(() => {
    if (!start) {
      if (!completedRef.current) {
        setDisplayScore(0)
        setWidthPct(0)
      }
      return
    }

    if (completedRef.current) return

    const targetWidth = Math.min(100, score * 10)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayScore(score)
      setWidthPct(targetWidth)
      completedRef.current = true
      return
    }

    let raf = 0
    const timeout = window.setTimeout(() => {
      const startTime = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / REVIEW_SCORE_ANIM_DURATION_MS)
        const eased = reviewScoreEase(progress)
        setDisplayScore(score * eased)
        setWidthPct(targetWidth * eased)
        if (progress < 1) {
          raf = requestAnimationFrame(tick)
        } else {
          completedRef.current = true
        }
      }
      raf = requestAnimationFrame(tick)
    }, delayMs)

    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(raf)
    }
  }, [start, score, delayMs])

  return (
    <div className={className}>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span
          className={`inline-block origin-right font-semibold tabular-nums transition-all duration-500 ease-out ${
            highlighted ? 'scale-125 text-[var(--gold)]' : 'scale-100'
          }`}
        >
          {displayScore.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#dbe7f6]">
        <div
          className={`h-full rounded-full transition-colors duration-500 ease-out ${
            highlighted ? 'bg-[var(--gold)]' : 'bg-[#006ce4]'
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  )
}

function ReviewScoreBars({
  items,
  layoutClassName,
  itemClassName,
}: {
  items: Array<{ label: string; score: number }>
  layoutClassName: string
  itemClassName: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animatedKeyRef = useRef<string | null>(null)
  const [animate, setAnimate] = useState(false)
  const [highlightTop, setHighlightTop] = useState(false)
  const itemsKey = items.map((item) => `${item.label}:${item.score}`).join('|')

  const topLabel = (() => {
    if (items.length === 0) return null
    const maxScore = Math.max(...items.map((item) => item.score))
    return items.find((item) => item.score === maxScore)?.label ?? null
  })()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (animatedKeyRef.current === itemsKey) {
      setAnimate(true)
      setHighlightTop(true)
      return
    }

    setAnimate(false)
    setHighlightTop(false)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimate(true)
      setHighlightTop(true)
      animatedKeyRef.current = itemsKey
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setAnimate(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -24px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [itemsKey])

  useEffect(() => {
    if (!animate || !topLabel) return
    if (animatedKeyRef.current === itemsKey) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHighlightTop(true)
      animatedKeyRef.current = itemsKey
      return
    }

    const totalMs =
      (items.length - 1) * REVIEW_SCORE_ANIM_STAGGER_MS + REVIEW_SCORE_ANIM_DURATION_MS
    const timeout = window.setTimeout(() => {
      setHighlightTop(true)
      animatedKeyRef.current = itemsKey
    }, totalMs)
    return () => clearTimeout(timeout)
  }, [animate, items.length, itemsKey, topLabel])

  return (
    <div ref={containerRef} className={layoutClassName}>
      {items.map((item, index) => (
        <ReviewScoreBarItem
          key={item.label}
          label={item.label}
          score={item.score}
          start={animate}
          delayMs={index * REVIEW_SCORE_ANIM_STAGGER_MS}
          highlighted={highlightTop && item.label === topLabel}
          className={itemClassName}
        />
      ))}
    </div>
  )
}

function BookingHotelFacts({
  hotel,
  identityLoading,
  identityError,
  loading,
  error,
  onIdentityRetry,
  onRetry,
}: {
  hotel: HotelCandidate
  identityLoading: boolean
  identityError: string | null
  loading: boolean
  error: string | null
  onIdentityRetry: () => void
  onRetry: () => void
}) {
  const [policiesExpanded, setPoliciesExpanded] = useState(false)
  const [locationRevealed, setLocationRevealed] = useState(false)
  const [policiesRevealed, setPoliciesRevealed] = useState(false)
  const popularFacilities = hotel.facilities || []
  const visibleLanguages = (hotel.languages || []).map(localizeLanguage)
  const reviewScores = (hotel.reviewScores || []).filter((item) => item.score > 0)
  const policies = hotel.policies || []
  const paymentMethods = (hotel.paymentMethods || []).map(localizePaymentMethod)
  const hasLocationDetails = Boolean(hotel.locationDescription)
  const factsPending = identityLoading || loading
  const locationNeedsTranslate = Boolean(
    hotel.locationDescription &&
      !looksChinese(hotel.locationDescription) &&
      isLlmConfigured(),
  )
  const policiesNeedTranslate =
    policies.some((policy) => !looksChinese(policy)) && isLlmConfigured()
  const showLocationShimmer =
    (factsPending && !hasLocationDetails) || (locationNeedsTranslate && !locationRevealed)
  const showPolicySkeleton =
    (factsPending && policies.length === 0) || (policiesNeedTranslate && !policiesRevealed)
  const policiesKey = policies.join('\n---\n')

  useLayoutEffect(() => {
    setLocationRevealed(!locationNeedsTranslate)
  }, [hotel.id, hotel.locationDescription, locationNeedsTranslate])

  useLayoutEffect(() => {
    setPoliciesRevealed(!policiesNeedTranslate)
  }, [hotel.id, policiesKey, policiesNeedTranslate])
  const starCount =
    hotel.starRating != null && hotel.starRating > 0
      ? Math.min(5, Math.round(hotel.starRating))
      : 0
  const showHotelOverview = Boolean(
    hotel.name ||
      hotel.propertyType ||
      starCount > 0 ||
      hotel.sustainability ||
      hotel.address ||
      hotel.area ||
      hotel.rating != null ||
      hasLocationDetails ||
      (hasValidParisBookingIdentity(hotel) && hotel.bookingUrl),
  )

  return (
    <section className="space-y-4">
      {showHotelOverview && (
        <div className="rounded-2xl border border-[var(--mist)] bg-white/65 p-4">
          <div className="flex items-stretch justify-between gap-3">
            <div
              className={`flex min-w-0 flex-1 flex-col ${
                hotel.address ? 'justify-between' : ''
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold leading-snug text-[var(--ink)]">
                  {hotel.name}
                </h3>
                {(hotel.propertyType || starCount > 0) && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#003b95]/8 px-2 py-1 text-[11px] font-medium text-[#003b95]">
                    {starCount > 0 && (
                      <span
                        className="text-[12px] leading-none tracking-[0.08em] text-[#f5a623]"
                        aria-label={`${starCount} 星酒店`}
                      >
                        {'★'.repeat(starCount)}
                      </span>
                    )}
                    {hotel.propertyType ? localizePropertyType(hotel.propertyType) : '酒店'}
                  </span>
                )}
                {factsPending && !hotel.propertyType && starCount === 0 && (
                  <span className="h-6 w-24 rounded-md day-tab-shimmer" aria-hidden />
                )}
              </div>
              {hotel.address && (
                <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-1 text-sm leading-relaxed">
                  <span className="mt-0.5 text-[#003b95]">
                    <HotelFactIcon type="location" />
                  </span>
                  <p className="min-w-0">{hotel.address}</p>
                </div>
              )}
            </div>
            {hotel.rating != null && (
              <div className="flex shrink-0 items-center gap-2 text-right">
                <div>
                  <p className="text-sm font-semibold">{hotelScoreText(hotel.rating)}</p>
                  {hotel.reviewCount != null && <p className="text-[11px] text-[var(--stone)]">{hotel.reviewCount.toLocaleString('zh-CN')} 条住客点评</p>}
                </div>
                <span className="flex h-10 min-w-10 items-center justify-center rounded-[10px_10px_10px_2px] bg-[#003b95] px-2 text-sm font-semibold text-white">
                  {hotel.rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {hotel.sustainability && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                可持续住宿 · {hotel.sustainability}
              </span>
            </div>
          )}

          {hasLocationDetails || showLocationShimmer ? (
            <div className="mt-2 text-sm leading-relaxed">
              {showLocationShimmer && <ShimmerLines lines={4} />}
              {hasLocationDetails && (
                <div className={showLocationShimmer ? 'hidden' : undefined}>
                  <HotelLocationDescription
                    text={hotel.locationDescription!}
                    className="min-w-0 text-[var(--ink)]/85"
                    showShimmer={false}
                    onPendingChange={(pending) => setLocationRevealed(!pending)}
                  />
                </div>
              )}
            </div>
          ) : null}

          {hasValidParisBookingIdentity(hotel) && hotel.bookingUrl && (
            <div className="mt-2 flex justify-end">
              <a
                href={hotel.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--mist)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[#003b95]/85 transition hover:border-[#003b95]/20 hover:bg-[#003b95]/5 hover:text-[#003b95]"
              >
                前往{' '}
                <span>
                  <span className="text-[#003580]">Booking</span>
                  <span className="text-[#006ce4]">.com</span>
                </span>
                <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
              </a>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {identityError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{identityError}</span>
            <button
              type="button"
              onClick={onIdentityRetry}
              className="font-medium underline underline-offset-2"
            >
              重试匹配
            </button>
          </div>
        )}
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="font-medium underline underline-offset-2"
            >
              重试
            </button>
          </div>
        )}

        {factsPending && (
          <>
            <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4" aria-busy>
              <ShimmerLines lines={1} className="mb-3 max-w-[8rem]" />
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index} className="h-5 w-24 rounded-full day-tab-shimmer" />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4" aria-busy>
              <ShimmerLines lines={1} className="mb-3 max-w-[8rem]" />
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="h-3 w-16 rounded-full day-tab-shimmer" />
                    <span className="h-2 flex-1 rounded-full day-tab-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {showPolicySkeleton && (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4" aria-busy>
            <ShimmerLines lines={1} className="mb-3 max-w-[10rem]" />
            <ShimmerLines lines={4} />
          </div>
        )}

        {popularFacilities.length ? (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <BookingSectionHeader icon={Building2} title="热门设施" />
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {popularFacilities.map((facility) => (
                <span key={facility} className="inline-flex items-center gap-2 text-sm">
                  <FacilityItemIcon facility={facility} />
                  {localizeFacility(facility)}
                </span>
              ))}
            </div>
          </div>
        ) : !factsPending && !error && hotel.bookingDetailsLoaded ? (
          <p className="text-xs text-[var(--stone)]">该酒店没有返回可展示的设施信息。</p>
        ) : null}

        {reviewScores.length > 0 && (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <BookingSectionHeader icon={BarChart3} title="住客评分细项" />
            <ReviewScoreBars
              items={reviewScores}
              layoutClassName={
                reviewScores.length <= 3
                  ? 'flex flex-wrap gap-x-5 gap-y-3'
                  : 'grid gap-x-5 gap-y-3 sm:grid-cols-2'
              }
              itemClassName={reviewScores.length <= 3 ? 'min-w-[9rem] flex-1' : ''}
            />
          </div>
        )}

        {(hotel.checkIn || hotel.checkOut || visibleLanguages.length > 0 || policies.length > 0 || paymentMethods.length > 0) && (
          <div className={showPolicySkeleton && !hotel.checkIn && !hotel.checkOut && !visibleLanguages.length && !paymentMethods.length ? 'hidden' : undefined}>
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <BookingSectionHeader icon={Info} title="住宿规定与实用信息" />
            <div className="divide-y divide-[var(--mist)] text-sm">
              {(hotel.checkIn || hotel.checkOut) && <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]"><span className="font-medium">入住与退房</span><span className="text-[var(--ink)]/80">{hotel.checkIn ? `${hotel.checkIn} 后入住` : ''}{hotel.checkIn && hotel.checkOut ? ' · ' : ''}{hotel.checkOut ? `${hotel.checkOut} 前退房` : ''}</span></div>}
              {visibleLanguages.length > 0 && <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]"><span className="font-medium">服务语言</span><span className="text-[var(--ink)]/80">{visibleLanguages.join('、')}</span></div>}
              {paymentMethods.length > 0 && <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]"><span className="font-medium">付款方式</span><span className="text-[var(--ink)]/80">{paymentMethods.join('、')}</span></div>}
              {policies.length > 0 && (
                <div className={showPolicySkeleton ? 'hidden' : 'py-3'}>
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <span className="font-medium">重要须知</span>
                    <HotelExpandablePolicyList
                      policies={policies}
                      expanded={policiesExpanded}
                      showShimmer={false}
                      onPendingChange={(pending) => setPoliciesRevealed(!pending)}
                    />
                  </div>
                  {policies.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPoliciesExpanded((current) => !current)}
                      className="mt-2 text-xs font-medium text-[var(--sage)] hover:underline"
                    >
                      {policiesExpanded ? '收起须知' : `展开全部 ${policies.length} 条须知`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--stone)]">
          房型、实时价格、早餐与取消政策会随日期变化，请前往 Booking.com 确认当前可订状态。
        </p>
      </div>
    </section>
  )
}

function BookingReviewsPanel({
  hotel,
  loading,
  error,
  onRetry,
}: {
  hotel: HotelCandidate
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [reviewsRevealed, setReviewsRevealed] = useState(false)
  const reviews = (hotel.reviews || []).map((review) => ({
    text: review.negativeText
      ? `${review.text}\n\n不足：${review.negativeText}`
      : review.text,
    rating: review.rating,
    author: review.author,
    relativeTime: review.relativeTime,
  }))
  const reviewsNeedTranslate =
    reviews.some((review) => !looksChinese(review.text)) && isLlmConfigured()
  const showReviewShimmer = loading || (reviewsNeedTranslate && !reviewsRevealed)
  const reviewsKey = reviews.map((review) => review.text).join('\n---\n')

  useLayoutEffect(() => {
    setReviewsRevealed(!reviewsNeedTranslate)
  }, [hotel.id, reviewsKey, reviewsNeedTranslate])

  return (
    <section className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
      <BookingSectionHeader
        icon={MessageSquareQuote}
        title="住客精选评论"
      />
      {showReviewShimmer && (
        <div className="space-y-3" aria-busy>
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="rounded-xl bg-white/70 px-3 py-2">
              <ShimmerLines lines={1} className="mb-2 max-w-[10rem]" />
              <ShimmerLines lines={3} />
            </div>
          ))}
        </div>
      )}
      {error && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-2"
          >
            重试
          </button>
        </div>
      )}
      {reviews.length > 0 && (
        <div className={showReviewShimmer ? 'hidden' : undefined}>
          <GoogleReviewsList
            reviews={reviews}
            sourceLabel="Booking.com 精选评论"
            showHeader={false}
            showShimmer={false}
            onPendingChange={(pending) => setReviewsRevealed(!pending)}
          />
        </div>
      )}
      {!loading && !error && hotel.bookingReviewsLoaded && !reviews.length && (
        <p className="text-sm text-[var(--stone)]">暂无可展示的精选住客评论。</p>
      )}
    </section>
  )
}

export function HotelPicker({
  selected,
  candidates,
  days,
  onSelect,
  onCandidatesChange,
  readOnly = false,
  onDetailChange,
  openSelectedDetailToken = 0,
}: Props) {
  const [customQuery, setCustomQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [popupHotelId, setPopupHotelId] = useState<string | null>(null)
  const [identityLoadingId, setIdentityLoadingId] = useState<string | null>(null)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [identityRetryToken, setIdentityRetryToken] = useState(0)
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsRetryToken, setDetailsRetryToken] = useState(0)
  const [photosLoadingId, setPhotosLoadingId] = useState<string | null>(null)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [reviewsLoadingId, setReviewsLoadingId] = useState<string | null>(null)
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  /** Custom hotel awaiting stay / consider / cancel decision. */
  const [pendingCustom, setPendingCustom] = useState<HotelCandidate | null>(null)
  const [storyLoadingId, setStoryLoadingId] = useState<string | null>(null)
  const [streamingAdvisorReason, setStreamingAdvisorReason] = useState('')
  const [cardBlurbStream, setCardBlurbStream] = useState<Record<string, string>>({})
  const [hotelStoryRegenToken, setHotelStoryRegenToken] = useState(0)
  /** null = closed; choose = pick mode; prefer = type preferences */
  const [refreshPanel, setRefreshPanel] = useState<'choose' | 'prefer' | null>(null)
  const [preferText, setPreferText] = useState('')
  const [refreshHint, setRefreshHint] = useState<string | null>(null)
  const [othersCollapsed, setOthersCollapsed] = useState(
    () => Boolean(loadHotelCache()?.othersCollapsed),
  )
  const [drag, setDrag] = useState<HotelDragSession | null>(null)
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 })
  const [dropping, setDropping] = useState(false)
  const bootstrappedRef = useRef(false)
  const lastOpenSelectedDetailTokenRef = useRef(openSelectedDetailToken)
  const candidatesRef = useRef(candidates)
  const daysRef = useRef(days)
  const selectedRef = useRef(selected)
  const pendingCustomRef = useRef(pendingCustom)
  const currentSlotRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<HotelDragSession | null>(null)
  const floatRef = useRef({ x: 0, y: 0 })
  const floatElRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const settlingRef = useRef(false)
  const pendingPointerRef = useRef<{
    hotelId: string
    startX: number
    startY: number
    cardEl: HTMLElement
    pointerId: number
  } | null>(null)
  const cardBlurbInflightRef = useRef(new Set<string>())
  const cardBlurbFailedRef = useRef(new Set<string>())
  candidatesRef.current = candidates
  daysRef.current = days
  selectedRef.current = selected
  pendingCustomRef.current = pendingCustom
  dragRef.current = drag

  const popupCandidate = useMemo(() => {
    if (pendingCustom) return pendingCustom
    return candidates.find((h) => h.id === popupHotelId) || null
  }, [candidates, popupHotelId, pendingCustom])

  const popupCandidateRef = useRef(popupCandidate)
  popupCandidateRef.current = popupCandidate

  const bookingDetailsOverride = useMemo(() => {
    if (!popupCandidate) return null
    return {
      name: popupCandidate.name,
      nameOriginal: popupCandidate.name,
      address: popupCandidate.address,
      rating: popupCandidate.rating,
      userRatingCount: popupCandidate.reviewCount,
      photos: popupCandidate.photos?.length
        ? popupCandidate.photos.map(bookingPhotoUrl)
        : popupCandidate.image
          ? [bookingPhotoUrl(popupCandidate.image)]
          : [],
      reviews: (popupCandidate.reviews || []).map((review) => ({
        text: review.negativeText
          ? `${review.text}\n\n不足：${review.negativeText}`
          : review.text,
        rating: review.rating,
        author: review.author,
        relativeTime: review.relativeTime,
      })),
      summary: popupCandidate.description,
      location: { lat: popupCandidate.lat, lng: popupCandidate.lng },
      query: popupCandidate.name,
    }
  }, [popupCandidate])

  const popupId = popupCandidate?.id ?? null

  useEffect(() => {
    if (!popupId) {
      setIdentityLoadingId(null)
      setIdentityError(null)
      return
    }
    const card =
      pendingCustomRef.current?.id === popupId
        ? pendingCustomRef.current
        : candidatesRef.current.find((hotel) => hotel.id === popupId)
    if (
      !card ||
      hasValidParisBookingIdentity(card) ||
      !isBookingApiEnabled()
    ) {
      setIdentityLoadingId(null)
      setIdentityError(null)
      return
    }
    let cancelled = false
    setIdentityLoadingId(card.id)
    setIdentityError(null)
    void resolveBookingHotelIdentity(card.name)
      .then((identity) => {
        if (cancelled) return
        if (!identity) {
          setIdentityError('没有找到对应的 Booking.com 酒店，请使用其原文名称重试。')
          return
        }
        const enrich = (hotel: HotelCandidate): HotelCandidate =>
          hotel.id !== card.id
            ? hotel
            : {
                ...hotel,
                bookingHotelId: identity.id,
                name: identity.name,
                address: identity.address || hotel.address,
                lat: identity.location.lat,
                lng: identity.location.lng,
                image: identity.image || hotel.image,
                photos: identity.photos.length ? identity.photos : hotel.photos,
                area: hotel.area || identity.area || '巴黎',
                facilities: [],
                reviews: [],
                checkIn: undefined,
                checkOut: undefined,
                bookingUrl: undefined,
                bookingDetailsLoaded: false,
                bookingPhotosLoaded: false,
                bookingReviewsLoaded: false,
              }
        if (pendingCustomRef.current?.id === card.id) {
          setPendingCustom((current) => (current ? enrich(current) : current))
          return
        }
        const next = candidatesRef.current.map(enrich)
        onCandidatesChange(next)
        const resolved = next.find((hotel) => hotel.id === card.id)
        const nextSelected =
          resolved && selectedRef.current.id === card.id
            ? candidateToSelected(resolved)
            : selectedRef.current
        if (nextSelected !== selectedRef.current) onSelect(nextSelected)
        persistHotelState(next, nextSelected)
      })
      .catch((cause) => {
        if (cancelled) return
        setIdentityError(
          cause instanceof Error ? cause.message : 'Booking.com 酒店身份匹配失败。',
        )
      })
      .finally(() => {
        if (!cancelled) {
          setIdentityLoadingId((id) => (id === card.id ? null : id))
        }
      })
    return () => {
      cancelled = true
    }
  }, [popupId, identityRetryToken, onCandidatesChange, onSelect])

  useEffect(() => {
    if (!popupId) {
      setDetailsLoadingId(null)
      setDetailsError(null)
      return
    }
    const card =
      pendingCustomRef.current?.id === popupId
        ? pendingCustomRef.current
        : candidatesRef.current.find((hotel) => hotel.id === popupId)
    if (
      !card?.bookingHotelId ||
      !hasValidParisBookingIdentity(card) ||
      !isBookingApiEnabled()
    ) {
      setDetailsLoadingId(null)
      setDetailsError(null)
      return
    }
    if (card.bookingDetailsLoaded && (card.bookingDetailsVersion || 0) >= BOOKING_DETAILS_VERSION) {
      setDetailsLoadingId(null)
      setDetailsError(null)
      return
    }
    const dates = loadTripDates()
    if (!dates) return
    let cancelled = false
    setDetailsLoadingId(card.id)
    setDetailsError(null)
    void fetchBookingHotelDetails({
      id: card.bookingHotelId,
      startDate: dates.startDate,
      endDate: dates.endDate,
    })
      .then((details) => {
        if (cancelled) return
        if (!details) {
          setDetailsError('酒店资料暂时无法解析，请稍后重试。')
          return
        }
        const enrich = (hotel: HotelCandidate): HotelCandidate =>
          hotel.id !== card.id
            ? hotel
            : {
                ...hotel,
                name: details.name,
                address: details.address,
                lat: details.location.lat,
                lng: details.location.lng,
                image: details.image || hotel.image,
                photos:
                  details.photos.length > (hotel.photos?.length || 0)
                    ? details.photos
                    : hotel.photos,
                rating: details.rating ?? hotel.rating,
                reviewCount: details.reviewCount ?? hotel.reviewCount,
                starRating: details.stars ?? hotel.starRating,
                facilities: details.facilities,
                propertyType: details.propertyType || hotel.propertyType,
                reviewScores: details.reviewScores?.length
                  ? details.reviewScores
                  : hotel.reviewScores,
                languages: details.languages?.length ? details.languages : hotel.languages,
                policies: details.policies?.length ? details.policies : hotel.policies,
                paymentMethods: details.paymentMethods?.length
                  ? details.paymentMethods
                  : hotel.paymentMethods,
                sustainability: details.sustainability || hotel.sustainability,
                description: details.description || hotel.description,
                districtLabel: details.districtLabel || hotel.districtLabel,
                distanceToCityCenterKm:
                  details.distanceToCityCenterKm ?? hotel.distanceToCityCenterKm,
                locationDescription:
                  details.locationDescription || hotel.locationDescription,
                checkIn: details.checkIn || hotel.checkIn,
                checkOut: details.checkOut || hotel.checkOut,
                bookingUrl: details.sourceUrl || hotel.bookingUrl,
                bookingDetailsLoaded: true,
                bookingDetailsVersion: BOOKING_DETAILS_VERSION,
                bookingPhotosLoaded: hotel.bookingPhotosLoaded,
                bookingReviewsLoaded:
                  details.reviews.length > 0 ? true : hotel.bookingReviewsLoaded,
                reviews: details.reviews.length
                  ? details.reviews.map((review) => ({
                      text: review.text,
                      negativeText: review.negativeText,
                      rating: review.rating,
                      author: review.author,
                      relativeTime: review.completedAt
                        ? new Date(review.completedAt * 1_000).toLocaleDateString('zh-CN')
                        : undefined,
                    }))
                  : hotel.reviews,
              }
        if (pendingCustomRef.current?.id === card.id) {
          setPendingCustom((current) => (current ? enrich(current) : current))
          return
        }
        const next = candidatesRef.current.map(enrich)
        onCandidatesChange(next)
        const resolved = next.find((hotel) => hotel.id === card.id)
        const nextSelected =
          resolved && selectedRef.current.id === card.id
            ? candidateToSelected(resolved)
            : selectedRef.current
        if (nextSelected !== selectedRef.current) onSelect(nextSelected)
        persistHotelState(next, nextSelected)
      })
      .catch((cause) => {
        if (cancelled) return
        setDetailsError(
          cause instanceof Error ? cause.message : '酒店资料加载失败，请稍后重试。',
        )
      })
      .finally(() => {
        if (!cancelled) {
          setDetailsLoadingId((id) => (id === card.id ? null : id))
        }
      })
    return () => {
      cancelled = true
    }
  }, [popupId, onCandidatesChange, onSelect, detailsRetryToken])

  useEffect(() => {
    if (!popupId) return
    const card =
      pendingCustomRef.current?.id === popupId
        ? pendingCustomRef.current
        : candidatesRef.current.find((hotel) => hotel.id === popupId)
    if (!card) return
    loadFeaturedReviews(card)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupId])

  useEffect(() => {
    onDetailChange?.(popupCandidate)
  }, [popupCandidate, onDetailChange])

  useEffect(() => {
    if (!openSelectedDetailToken) return
    if (openSelectedDetailToken === lastOpenSelectedDetailTokenRef.current) return
    lastOpenSelectedDetailTokenRef.current = openSelectedDetailToken
    const card = candidatesRef.current.find((h) => h.id === selectedRef.current.id)
    if (!card) return
    setPendingCustom(null)
    setPopupHotelId(card.id)
  }, [openSelectedDetailToken])

  const decidingCustom = Boolean(pendingCustom)

  const selectedCandidate = useMemo(
    () => candidates.find((h) => h.id === selected.id) || null,
    [candidates, selected.id],
  )
  const otherCandidates = useMemo(
    () =>
      selectedCandidate
        ? candidates.filter((h) => h.id !== selectedCandidate.id)
        : candidates,
    [candidates, selectedCandidate],
  )
  const canToggleOthers = Boolean(selectedCandidate) && otherCandidates.length > 0

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    const cached = loadHotelCache()
    if (cached && (cached.candidates.length || isHotelSelected(cached.selected))) {
      onCandidatesChange(cached.candidates)
      if (cached.selected && isHotelSelected(cached.selected)) {
        onSelect(cached.selected)
      } else {
        onSelect(PENDING_HOTEL)
      }
      setOthersCollapsed(Boolean(cached.othersCollapsed && isHotelSelected(cached.selected)))
      return
    }

    if (readOnly) return
    void bootstrapRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  function selectHotel(
    card: HotelCandidate,
    openPopup = false,
    nextCandidates: HotelCandidate[] = candidates,
    collapseOthers?: boolean,
  ) {
    const hotel = candidateToSelected(card)
    onSelect(hotel)
    const collapsed =
      collapseOthers !== undefined ? collapseOthers : othersCollapsed
    if (collapseOthers !== undefined) setOthersCollapsed(collapseOthers)
    persistHotelState(nextCandidates, hotel, { othersCollapsed: collapsed })
    if (openPopup) setPopupHotelId(card.id)
  }

  function setOthersCollapsedAndPersist(next: boolean) {
    setOthersCollapsed(next)
    persistHotelState(candidatesRef.current, selectedRef.current, {
      othersCollapsed: next,
    })
  }

  function openHotelCard(card: HotelCandidate) {
    setPendingCustom(null)
    setPopupHotelId(card.id)
  }

  useEffect(() => {
    if (!popupCandidate) return
    const card = popupCandidate
    const bypass = hotelStoryRegenToken > 0

    if (!bypass && card.tripFit?.trim() && card.hotelAdvisorVersion === 2) {
      rememberHotelAdvisorCopy(card, card.tripFit)
      return
    }

    if (!bypass) {
      const hydrated = hydrateHotelAdvisorFromCache(card)
      if (hydrated.tripFit?.trim() && hydrated.hotelAdvisorVersion === 2) {
        if (hydrated.tripFit !== card.tripFit) {
          const enrich = (h: HotelCandidate): HotelCandidate =>
            h.id === card.id ? hydrated : h
          if (pendingCustomRef.current?.id === card.id) {
            setPendingCustom((prev) => (prev && prev.id === card.id ? enrich(prev) : prev))
          } else if (candidatesRef.current.some((h) => h.id === card.id)) {
            const next = candidatesRef.current.map(enrich)
            onCandidatesChange(next)
            const stillSelected = next.find((h) => h.id === selectedRef.current.id)
            persistHotelState(
              next,
              stillSelected ? candidateToSelected(stillSelected) : selectedRef.current,
            )
          }
        }
        return
      }
    }

    if (!isLlmConfigured()) return

    const needsBookingDetails =
      Boolean(card.bookingHotelId) &&
      hasValidParisBookingIdentity(card) &&
      isBookingApiEnabled()
    if (
      needsBookingDetails &&
      (!(card.bookingDetailsLoaded && (card.bookingDetailsVersion || 0) >= BOOKING_DETAILS_VERSION) ||
        detailsLoadingId === card.id)
    ) {
      return
    }

    let cancelled = false
    setStoryLoadingId(card.id)
    setStreamingAdvisorReason('')

    const prefs = loadHotelCache()?.lastPreferences
    const tripDays = daysRef.current.map((d) => ({
      day: d.day,
      title: d.title,
      pace: d.pace,
      theme: d.theme,
    }))
    const runStory = async () => {
      const latest =
        pendingCustomRef.current?.id === card.id
          ? pendingCustomRef.current
          : candidatesRef.current.find((hotel) => hotel.id === card.id) || card
      const featuredReviews = (latest.reviews || []).map((review) => ({
        text: review.text,
        negativeText: review.negativeText,
        rating: review.rating,
        author: review.author,
      }))

      const copy = await memoizeHotelAdvisorCopy(
        latest,
        () =>
          generateHotelDetailCopy({
            name: latest.name,
            area: latest.area,
            address: latest.address,
            nearestMetro: latest.nearestMetro,
            rating: latest.rating,
            reviewCount: latest.reviewCount,
            starRating: latest.starRating,
            propertyType: latest.propertyType,
            facilities: latest.facilities,
            reviewScores: latest.reviewScores,
            locationDescription: latest.locationDescription,
            districtLabel: latest.districtLabel,
            distanceToCityCenterKm: latest.distanceToCityCenterKm,
            featuredReviews,
            existingReason: latest.reason,
            isBest: latest.isBest,
            userPreferences: prefs,
            tripDays,
            onPartial: (partial) => {
              if (cancelled || !partial.reason) return
              setStreamingAdvisorReason(partial.reason)
            },
          }),
        { bypass },
      )

      if (cancelled || !copy?.reason) return

      const enrich = (h: HotelCandidate): HotelCandidate =>
        h.id === card.id
          ? {
              ...h,
              tripFit: copy.reason || h.tripFit,
              hotelAdvisorVersion: 2,
            }
          : h

      if (pendingCustomRef.current?.id === card.id) {
        setPendingCustom((prev) => (prev && prev.id === card.id ? enrich(prev) : prev))
        return
      }

      const current = candidatesRef.current.find((h) => h.id === card.id)
      if (!bypass && current?.tripFit?.trim() && current.hotelAdvisorVersion === 2) return

      const next = candidatesRef.current.map(enrich)
      onCandidatesChange(next)
      const stillSelected = next.find((h) => h.id === selectedRef.current.id)
      persistHotelState(
        next,
        stillSelected ? candidateToSelected(stillSelected) : selectedRef.current,
      )
    }

    void runStory()
      .catch(() => {
        // Silent failure — advisor copy is optional.
      })
      .finally(() => {
        if (!cancelled) {
          setStoryLoadingId((id) => (id === card.id ? null : id))
          setStreamingAdvisorReason('')
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    popupCandidate?.id,
    popupCandidate?.bookingHotelId,
    popupCandidate?.name,
    popupCandidate?.bookingDetailsLoaded,
    popupCandidate?.bookingDetailsVersion,
    detailsLoadingId,
    hotelStoryRegenToken,
  ])

  useEffect(() => {
    setHotelStoryRegenToken(0)
    setStreamingAdvisorReason('')
  }, [popupCandidate?.id])

  useEffect(() => {
    if (readOnly || !isLlmConfigured()) return

    const hotels = [pendingCustom, ...candidates].filter(
      (hotel): hotel is HotelCandidate => Boolean(hotel),
    )

    for (const hotel of hotels) {
      if (!needsCustomCardBlurb(hotel)) continue
      if (cardBlurbInflightRef.current.has(hotel.id)) continue
      if (cardBlurbFailedRef.current.has(hotel.id)) continue
      if (identityLoadingId === hotel.id || detailsLoadingId === hotel.id) continue
      const waitingForDetails =
        Boolean(hotel.bookingHotelId) &&
        hasValidParisBookingIdentity(hotel) &&
        isBookingApiEnabled() &&
        !hotel.bookingDetailsLoaded
      if (waitingForDetails) continue

      cardBlurbInflightRef.current.add(hotel.id)
      const artifactKey = `hotel-card-blurb:v1:${hotel.bookingHotelId || hotel.name}`
      void memoizeLlmCall(
        artifactKey,
        () =>
          generateHotelCardBlurb({
            name: hotel.name,
            area: hotel.area,
            address: hotel.address,
            description: hotel.description,
            locationDescription: hotel.locationDescription,
            starRating: hotel.starRating,
            propertyType: hotel.propertyType,
            rating: hotel.rating,
            facilities: hotel.facilities,
            onPartial: (blurb) => {
              setCardBlurbStream((current) =>
                current[hotel.id] === blurb ? current : { ...current, [hotel.id]: blurb },
              )
            },
          }),
        { durable: true },
      )
        .then((blurb) => {
          if (!blurb) {
            cardBlurbFailedRef.current.add(hotel.id)
            return
          }
          const enrich = (item: HotelCandidate): HotelCandidate =>
            item.id === hotel.id ? { ...item, reason: blurb } : item
          if (pendingCustomRef.current?.id === hotel.id) {
            setPendingCustom((current) => (current ? enrich(current) : current))
          }
          if (candidatesRef.current.some((item) => item.id === hotel.id)) {
            const next = candidatesRef.current.map(enrich)
            onCandidatesChange(next)
            persistHotelState(next, selectedRef.current)
          }
          setCardBlurbStream((current) => {
            if (!(hotel.id in current)) return current
            const next = { ...current }
            delete next[hotel.id]
            return next
          })
        })
        .catch(() => {
          cardBlurbFailedRef.current.add(hotel.id)
        })
        .finally(() => {
          cardBlurbInflightRef.current.delete(hotel.id)
        })
    }
  }, [
    candidates,
    pendingCustom,
    identityLoadingId,
    detailsLoadingId,
    readOnly,
    onCandidatesChange,
  ])

  async function bootstrapRecommendations() {
    if (!isLlmConfigured()) {
      setError('暂时无法生成酒店推荐，请使用下方自定义地址。')
      return
    }

    setRefreshing(true)
    setError(null)
    try {
      const llmCards = await fetchResolvedHotelRecommendations({
        count: 5,
        batch: 1,
        dayCount: daysRef.current.length || undefined,
      })
      onCandidatesChange(llmCards)
      // Do not auto-select — user must confirm「就住这儿了」.
      onSelect(PENDING_HOTEL)
      setOthersCollapsed(false)
      persistHotelState(llmCards, null, { othersCollapsed: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : '推荐酒店失败')
    } finally {
      setRefreshing(false)
    }
  }

  async function runFreshRecommendations(preferences?: string) {
    if (!isLlmConfigured()) {
      setError('暂时无法生成酒店推荐，请使用下方自定义地址。')
      return
    }

    const prefs = preferences?.trim() || undefined
    setRefreshPanel(null)
    setRefreshing(true)
    setRefreshHint(prefs ? '正在按你的喜好重新推荐酒店…' : '交给命运：正在挑选一批新酒店…')
    setError(null)
    try {
      const result = await refreshHotelCandidates({
        current: candidates,
        preferences: prefs,
        keepCustom: true,
        dayCount: daysRef.current.length || undefined,
      })
      onCandidatesChange(result.candidates)
      // Keep current stay only if it still exists; never auto-pick a new best.
      const stillThere =
        isHotelSelected(selected) &&
        result.candidates.some(
          (c) =>
            c.id === selected.id ||
            (c.name === selected.name &&
              Math.abs(c.lat - selected.lat) <= 0.0008 &&
              Math.abs(c.lng - selected.lng) <= 0.0008),
        )
      if (stillThere) {
        persistHotelState(result.candidates, selected, { othersCollapsed: false })
      } else {
        onSelect(PENDING_HOTEL)
        persistHotelState(result.candidates, null, { othersCollapsed: false })
      }
      setOthersCollapsed(false)
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
      })
      setCustomQuery('')
      setPopupHotelId(null)
      setPendingCustom(hydrateHotelAdvisorFromCache(card))
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败')
    } finally {
      setLoading(false)
    }
  }

  function dismissPendingCustom() {
    setPendingCustom(null)
  }

  function closeHotelPopup() {
    setPhotosError(null)
    if (pendingCustom) {
      dismissPendingCustom()
      return
    }
    setPopupHotelId(null)
  }

  function loadFeaturedReviews(card: HotelCandidate) {
    if (
      card.bookingReviewsLoaded ||
      card.reviews?.length ||
      reviewsLoadingId === card.id
    ) {
      return
    }
    if (
      !card.bookingHotelId ||
      !hasValidParisBookingIdentity(card) ||
      !isBookingApiEnabled()
    ) {
      setReviewsError('该酒店暂时无法获取 Booking.com 精选评论。')
      return
    }
    setReviewsLoadingId(card.id)
    setReviewsError(null)
    void fetchBookingHotelFeaturedReviews({ id: card.bookingHotelId })
      .then((result) => {
        const enrich = (hotel: HotelCandidate): HotelCandidate =>
          hotel.id !== card.id
            ? hotel
            : {
                ...hotel,
                bookingReviewsLoaded: true,
                reviews: result.reviews.map((review) => ({
                  text: review.text,
                  negativeText: review.negativeText,
                  rating: review.rating,
                  author: review.author,
                  relativeTime: review.completedAt
                    ? new Date(review.completedAt * 1_000).toLocaleDateString('zh-CN')
                    : undefined,
                })),
              }
        if (pendingCustomRef.current?.id === card.id) {
          setPendingCustom((current) => (current ? enrich(current) : current))
          return
        }
        const next = candidatesRef.current.map(enrich)
        onCandidatesChange(next)
        persistHotelState(next, selectedRef.current)
      })
      .catch((cause) => {
        setReviewsError(
          cause instanceof Error ? cause.message : '精选评论加载失败，请稍后重试。',
        )
      })
      .finally(() => {
        setReviewsLoadingId((id) => (id === card.id ? null : id))
      })
  }

  function loadHotelPhotos(card: HotelCandidate) {
    if (card.bookingPhotosLoaded || photosLoadingId === card.id) return
    if (!card.bookingHotelId || !isBookingApiEnabled()) {
      setPhotosError('该酒店暂时无法加载完整图集。')
      return
    }
    setPhotosLoadingId(card.id)
    setPhotosError(null)
    void fetchBookingHotelPhotos({ id: card.bookingHotelId })
      .then((photos) => {
        if (!photos.length) {
          setPhotosError('图片接口本次未返回可用照片，请稍后重试。')
          return
        }
        const enrich = (hotel: HotelCandidate): HotelCandidate =>
          hotel.id !== card.id
            ? hotel
            : {
                ...hotel,
                bookingPhotosLoaded: true,
                photos,
                image: photos[0] || hotel.image,
              }
        if (pendingCustomRef.current?.id === card.id) {
          setPendingCustom((current) => (current ? enrich(current) : current))
          return
        }
        const next = candidatesRef.current.map(enrich)
        onCandidatesChange(next)
        const resolved = next.find((hotel) => hotel.id === card.id)
        const nextSelected =
          resolved && selectedRef.current.id === card.id
            ? candidateToSelected(resolved)
            : selectedRef.current
        if (nextSelected !== selectedRef.current) onSelect(nextSelected)
        persistHotelState(next, nextSelected)
      })
      .catch((cause) => {
        setPhotosError(
          cause instanceof Error ? cause.message : '酒店图集加载失败，请稍后重试。',
        )
      })
      .finally(() => {
        setPhotosLoadingId((id) => (id === card.id ? null : id))
      })
  }

  const loadHotelPhotosRef = useRef(loadHotelPhotos)
  loadHotelPhotosRef.current = loadHotelPhotos
  const handleBookingGalleryAdvance = useCallback(() => {
    const card = popupCandidateRef.current
    if (card && hasValidParisBookingIdentity(card)) {
      loadHotelPhotosRef.current(card)
    }
  }, [])

  /** 就住这儿了：选中，并收起其他酒店卡片（可再展开） */
  function decideStayHere() {
    const card = popupCandidate
    if (!card) return

    let next = candidates
    if (pendingCustom?.id === card.id) {
      next = [card, ...candidates.filter((c) => !isSameHotel(c, card))]
      onCandidatesChange(next)
      setPendingCustom(null)
    }

    selectHotel(card, false, next, true)
    setPopupHotelId(null)
  }

  /** 考虑考虑：保留在列表，不改为当前住宿 */
  function decideConsider() {
    const card = popupCandidate
    if (!card) return

    if (pendingCustom?.id === card.id) {
      const next = [card, ...candidates.filter((c) => !isSameHotel(c, card))]
      onCandidatesChange(next)
      persistHotelState(next, selected)
      setPendingCustom(null)
      return
    }

    setPopupHotelId(null)
  }

  /** 取消当前住宿选择：回到空状态并展开候选项，不自动接替 */
  function clearCurrentSelection() {
    if (!isHotelSelected(selected)) return
    onSelect(PENDING_HOTEL)
    setOthersCollapsed(false)
    setPopupHotelId(null)
    persistHotelState(candidatesRef.current, null, { othersCollapsed: false })
  }

  function applyDroppedHotel(hotelId: string) {
    const card = candidatesRef.current.find((c) => c.id === hotelId)
    if (!card) return
    selectHotel(card, false, candidatesRef.current, true)
  }

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const applyFloatPos = (x: number, y: number) => {
    floatRef.current = { x, y }
    const el = floatElRef.current
    if (el) {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
  }

  const isOverCurrentSlot = (x: number, y: number) => {
    const el = currentSlotRef.current
    if (!el) return false
    return pointInRect(x, y, el.getBoundingClientRect())
  }

  const tickFloat = () => {
    const session = dragRef.current
    if (!session) {
      rafRef.current = null
      return
    }
    const targetX = pointerRef.current.x - session.grabX
    const targetY = pointerRef.current.y - session.grabY
    applyFloatPos(
      floatRef.current.x + (targetX - floatRef.current.x) * HOTEL_FLOAT_EASE,
      floatRef.current.y + (targetY - floatRef.current.y) * HOTEL_FLOAT_EASE,
    )

    const overSlot = isOverCurrentSlot(pointerRef.current.x, pointerRef.current.y)
    if (overSlot !== session.overSlot) {
      const next = { ...session, overSlot }
      dragRef.current = next
      setFloatPos({ ...floatRef.current })
      setDrag(next)
    }

    rafRef.current = requestAnimationFrame(tickFloat)
  }

  const endDrag = (commit: boolean) => {
    stopRaf()
    pendingPointerRef.current = null
    const session = dragRef.current
    if (!session || settlingRef.current) return
    settlingRef.current = true

    const overSlot =
      commit && isOverCurrentSlot(pointerRef.current.x, pointerRef.current.y)
    const settled = { ...session, overSlot }
    dragRef.current = settled
    setDrag(settled)
    setDropping(true)

    if (overSlot) {
      const slot = currentSlotRef.current?.getBoundingClientRect()
      if (slot) {
        floatRef.current = {
          x: slot.left + (slot.width - session.width) / 2,
          y: slot.top + Math.min(12, Math.max(0, (slot.height - session.height) / 2)),
        }
        setFloatPos({ ...floatRef.current })
      }
    } else {
      floatRef.current = { x: session.startLeft, y: session.startTop }
      setFloatPos({ ...floatRef.current })
    }

    window.setTimeout(() => {
      if (overSlot) applyDroppedHotel(session.hotelId)
      dragRef.current = null
      setDrag(null)
      setDropping(false)
      settlingRef.current = false
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 40)
    }, HOTEL_DRAG_SETTLE_MS)
  }

  const beginDrag = (
    hotelId: string,
    e: { clientX: number; clientY: number; pointerId: number },
    cardEl: HTMLElement,
  ) => {
    if (readOnly || dragRef.current || settlingRef.current) return

    const rect = cardEl.getBoundingClientRect()
    const session: HotelDragSession = {
      hotelId,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
      overSlot: isOverCurrentSlot(e.clientX, e.clientY),
    }
    pointerRef.current = { x: e.clientX, y: e.clientY }
    dragRef.current = session
    applyFloatPos(rect.left, rect.top)
    setFloatPos({ x: rect.left, y: rect.top })
    setDrag(session)
    setDropping(false)
    stopRaf()
    rafRef.current = requestAnimationFrame(tickFloat)

    try {
      cardEl.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onCandidatePointerDown = (
    hotelId: string,
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (readOnly || drag || settlingRef.current) return
    if ((e.target as HTMLElement).closest('[data-hotel-no-drag]')) return
    // Left button / primary touch only.
    if (e.button !== 0) return
    pendingPointerRef.current = {
      hotelId,
      startX: e.clientX,
      startY: e.clientY,
      cardEl: e.currentTarget,
      pointerId: e.pointerId,
    }
  }

  useEffect(() => {
    if (!drag) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('timeline-dragging')
    return () => {
      document.body.style.overflow = prev
      document.body.classList.remove('timeline-dragging')
    }
  }, [drag])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }

      const pending = pendingPointerRef.current
      if (pending && !dragRef.current && !settlingRef.current) {
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        if (Math.hypot(dx, dy) >= HOTEL_DRAG_THRESHOLD_PX) {
          const { hotelId, cardEl, pointerId } = pending
          pendingPointerRef.current = null
          beginDrag(hotelId, { clientX: e.clientX, clientY: e.clientY, pointerId }, cardEl)
        }
      }
    }
    const onUp = () => {
      if (settlingRef.current) {
        pendingPointerRef.current = null
        return
      }
      if (dragRef.current) {
        endDrag(true)
        return
      }
      const pending = pendingPointerRef.current
      pendingPointerRef.current = null
      if (!pending || suppressClickRef.current) return
      const hotel =
        candidatesRef.current.find((item) => item.id === pending.hotelId) ||
        candidates.find((item) => item.id === pending.hotelId)
      if (hotel) openHotelCard(hotel)
    }
    const onCancel = () => {
      if (settlingRef.current) {
        pendingPointerRef.current = null
        return
      }
      if (dragRef.current) {
        endDrag(false)
        return
      }
      pendingPointerRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  useEffect(() => () => stopRaf(), [])

  const dragHotelIdForLayout = drag?.hotelId ?? null
  useLayoutEffect(() => {
    if (dragHotelIdForLayout === null || dropping) return
    applyFloatPos(floatRef.current.x, floatRef.current.y)
  }, [dragHotelIdForLayout, dropping])

  const currentSlotHighlight = Boolean(drag)
  const currentSlotDropReady = Boolean(drag?.overSlot)
  const dragHotelId = drag?.hotelId ?? null
  const dragging = Boolean(drag)

  /** 这个淘汰 / 删除：从列表移除 */
  function removeHotel(card: HotelCandidate) {
    const next = candidates.filter((c) => c.id !== card.id)
    onCandidatesChange(next)

    if (popupHotelId === card.id) setPopupHotelId(null)
    if (pendingCustom?.id === card.id) setPendingCustom(null)

    if (selected.id === card.id) {
      onSelect(PENDING_HOTEL)
      setOthersCollapsed(false)
      persistHotelState(next, null, { othersCollapsed: false })
      return
    }

    persistHotelState(next, selected)
  }

  /** 淘汰当前打开的已有卡片 */
  function decideEliminate() {
    const card = popupCandidate
    if (!card || pendingCustom) return
    removeHotel(card)
  }

  const showEmpty = !candidates.length && !refreshing && !pendingCustom

  return (
    <section className={`space-y-4 ${readOnly ? '[&_button]:pointer-events-none [&_input]:pointer-events-none [&_textarea]:pointer-events-none' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[var(--ink)] sm:text-3xl">酒店</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--stone)]">
            {readOnly
              ? '当前为只读共享，无法修改酒店。'
              : '打开后会先给出几家酒店候选。点开详情并选「就住这儿了」才会定为当前住宿；日期、往返航班和酒店都选好后，下方行程才会展开。'}
          </p>
        </div>
          <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-[var(--sage)]/10 px-3 py-1 text-sm text-[var(--sage)]">
            {isHotelSelected(selected) ? `当前：${selected.name}` : '当前：尚未选择'}
          </div>
          <button
            type="button"
            disabled={refreshing || !isLlmConfigured()}
            onClick={() => {
              setError(null)
              setRefreshPanel('choose')
            }}
            aria-busy={refreshing || undefined}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)] disabled:opacity-50"
          >
            {refreshing && <ButtonSpinner mode="thinking" task="hotelRecommend" />}
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
                    按你的喜好定制，或直接再换一批。
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
                    不设条件，随机再挑一批新酒店
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
                  aria-busy={refreshing || undefined}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] disabled:opacity-50"
                >
                  {refreshing && <ButtonSpinner mode="thinking" task="hotelRecommend" />}
                  {refreshing ? '推荐中…' : '按喜好推荐'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {refreshing && (
        <LoadingIndicator
          variant="block"
          thinkingLabel={refreshHint || '正在思考酒店推荐…'}
          generatingLabel={refreshHint || '正在推荐酒店并核对地点信息…'}
          showDots
          size="sm"
          mode="thinking"
          task="hotelRecommend"
          className="py-3"
        />
      )}

      <div className="space-y-5">
        <div className="space-y-2">
          <h3 className="font-medium text-[var(--ink)]">当前选择的酒店</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectedCandidate ? (
              <div
                ref={currentSlotRef}
                className={`group relative overflow-hidden rounded-2xl border text-left shadow-[var(--shadow)] ring-2 transition-[border-color,box-shadow,background-color] duration-200 [transition-timing-function:var(--timeline-ease)] ${
                  currentSlotDropReady
                    ? 'border-[var(--sage)] ring-[var(--sage)]/40 bg-[var(--sage)]/10'
                    : currentSlotHighlight
                      ? 'border-[var(--copper)] ring-[var(--copper)]/50 bg-[var(--copper)]/5'
                      : 'border-[var(--copper)] ring-[var(--copper)]/30'
                }`}
              >
                <div className="absolute right-2 top-2 z-10 flex gap-1.5">
                  {selectedCandidate.source === 'custom' && (
                    <button
                      type="button"
                      data-hotel-no-drag
                      aria-label={`删除 ${selectedCandidate.name}`}
                      title="删除自定义酒店"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeHotel(selectedCandidate)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-red-700/90"
                    >
                      <TrashIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    data-hotel-no-drag
                    aria-label="取消当前选择"
                    title="取消当前选择"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearCurrentSelection()
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-[var(--copper)]"
                  >
                    <UnselectIcon />
                  </button>
                </div>
                {currentSlotHighlight && (
                  <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[var(--sage)]/15">
                    <span className="rounded-full bg-[var(--ink)]/80 px-3 py-1 text-sm text-[var(--paper)]">
                      {currentSlotDropReady ? '松开以更换住宿' : '拖到此处更换'}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openHotelCard(selectedCandidate)}
                  className="w-full text-left"
                >
                  <HotelCardFace
                    hotel={selectedCandidate}
                    blurb={cardBlurbStream[selectedCandidate.id]}
                    blurbLoading={
                      needsCustomCardBlurb(selectedCandidate) && isLlmConfigured()
                    }
                  />
                </button>
              </div>
            ) : (
              <div
                ref={currentSlotRef}
                className={`rounded-2xl border border-dashed p-4 transition-[border-color,box-shadow,background-color] duration-200 [transition-timing-function:var(--timeline-ease)] ${
                  currentSlotDropReady
                    ? 'border-[var(--sage)] bg-[var(--sage)]/15 ring-2 ring-[var(--sage)]/35'
                    : currentSlotHighlight
                      ? 'border-[var(--copper)] bg-[var(--copper)]/10 ring-2 ring-[var(--copper)]/30'
                      : 'border-[var(--copper)]/35 bg-[var(--card)]'
                }`}
              >
                <p className="font-medium text-[var(--ink)]">
                  {currentSlotHighlight ? '拖放到这里设为住宿' : '尚未选定住宿'}
                </p>
                <p className="mt-1 text-sm text-[var(--stone)]">
                  {currentSlotHighlight
                    ? '松开鼠标即可选择该酒店并开始行程安排。'
                    : '可从下方拖拽酒店卡片到此处，或点开详情后选择「就住这儿了」。'}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-[var(--stone)]/40 bg-[var(--card)] p-3">
              <p className="text-xs text-[var(--copper)]">自定义</p>
              <p className="font-medium">输入我自己的酒店地址</p>
              <p className="mt-1 text-xs text-[var(--stone)]">
                生成后会打开详情页，再决定是否加入候选项
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
                  disabled={loading || !customQuery.trim() || decidingCustom}
                  onClick={() => void applyCustom()}
                  aria-busy={loading || undefined}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 py-2 text-sm text-[var(--paper)] disabled:opacity-50"
                >
                  {loading && <ButtonSpinner />}
                  {loading ? '生成卡片中…' : '生成酒店卡片'}
                </button>
                {loading && (
                  <LoadingIndicator label="正在解析地址并生成酒店卡片…" showDots size="sm" />
                )}
              </div>
            </div>
          </div>
        </div>

        {(canToggleOthers || (!selectedCandidate && candidates.length > 0)) && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-[var(--ink)]">
                {selectedCandidate ? '其他候选项' : '酒店候选项'}
              </h3>
              {canToggleOthers && (
                <button
                  type="button"
                  onClick={() => setOthersCollapsedAndPersist(!othersCollapsed)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--stone)]/25 px-3 py-1.5 text-sm text-[var(--stone)] transition hover:border-[var(--sage)] hover:text-[var(--ink)]"
                >
                  <ChevronIcon up={!othersCollapsed} />
                  {othersCollapsed
                    ? `展开（${otherCandidates.length}）`
                    : '收起'}
                </button>
              )}
            </div>

            <div
              className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${
                !selectedCandidate || !othersCollapsed
                  ? 'grid-rows-[1fr]'
                  : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-[opacity,transform] duration-500 ease-in-out ${
                    selectedCandidate && othersCollapsed
                      ? 'pointer-events-none -translate-y-2 opacity-0'
                      : 'translate-y-0 opacity-100'
                  } ${dragging ? 'select-none' : ''}`}
                >
                  {(selectedCandidate ? otherCandidates : candidates).map((hotel) => (
                    <div
                      key={hotel.id}
                      onPointerDown={(e) => onCandidatePointerDown(hotel.id, e)}
                      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-[var(--card)] text-left touch-none transition-[border-color,opacity,transform] duration-200 [transition-timing-function:var(--timeline-ease)] ${
                        dragHotelId === hotel.id
                          ? 'pointer-events-none border-transparent opacity-0'
                          : 'border-white/60 hover:border-[var(--gold)]'
                      }`}
                    >
                      {hotel.source === 'custom' && (
                        <button
                          type="button"
                          data-hotel-no-drag
                          aria-label={`删除 ${hotel.name}`}
                          title="删除自定义酒店"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeHotel(hotel)
                          }}
                          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-red-700/90"
                        >
                          <TrashIcon />
                        </button>
                      )}
                      <HotelCardFace
                        hotel={hotel}
                        blurb={cardBlurbStream[hotel.id]}
                        blurbLoading={needsCustomCardBlurb(hotel) && isLlmConfigured()}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showEmpty && !error && (
        <p className="text-sm text-[var(--stone)]">暂无候选项。可点「换一批推荐」或自定义地址。</p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {drag && (
        <div
          ref={floatElRef}
          className={`timeline-drag-float pointer-events-none fixed z-[80] ${
            dropping ? 'timeline-drag-float-settle' : 'timeline-drag-float-lifted'
          }`}
          style={{
            left: dropping ? floatPos.x : undefined,
            top: dropping ? floatPos.y : undefined,
            width: drag.width,
          }}
        >
          <div className="timeline-drag-float-card overflow-hidden rounded-2xl border border-white/80 bg-[var(--card)] ring-1 ring-[var(--ink)]/5">
            <div className="timeline-drag-float-content group">
              {(() => {
                const hotel =
                  candidates.find((h) => h.id === drag.hotelId) ||
                  candidatesRef.current.find((h) => h.id === drag.hotelId)
                if (!hotel) return null
                return (
                  <HotelCardFace
                    hotel={hotel}
                    blurb={cardBlurbStream[hotel.id]}
                    blurbLoading={needsCustomCardBlurb(hotel) && isLlmConfigured()}
                  />
                )
              })()}
            </div>
          </div>
        </div>
      )}

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
        galleryVariant="booking"
        onBookingGalleryAdvance={
          popupCandidate && hasValidParisBookingIdentity(popupCandidate)
            ? handleBookingGalleryAdvance
            : undefined
        }
        bookingGalleryPhotosLoading={
          popupCandidate ? photosLoadingId === popupCandidate.id : false
        }
        bookingGalleryPhotosError={photosError}
        bookingPhotosFullyLoaded={Boolean(popupCandidate?.bookingPhotosLoaded)}
        providerOwnsSummary
        detailsOverride={bookingDetailsOverride}
        skipProviderLookup
        providerDetails={
          popupCandidate ? (
            <BookingHotelFacts
              hotel={popupCandidate}
              identityLoading={identityLoadingId === popupCandidate.id}
              identityError={identityError}
              loading={detailsLoadingId === popupCandidate.id}
              error={detailsError}
              onIdentityRetry={() => setIdentityRetryToken((token) => token + 1)}
              onRetry={() => setDetailsRetryToken((token) => token + 1)}
            />
          ) : undefined
        }
        reviewsSection={
          popupCandidate ? (
            <BookingReviewsPanel
              hotel={popupCandidate}
              loading={reviewsLoadingId === popupCandidate.id}
              error={reviewsError}
              onRetry={() => {
                setReviewsError(null)
                loadFeaturedReviews(popupCandidate)
              }}
            />
          ) : undefined
        }
        llmNarrative={
          popupCandidate
            ? {
                variant: 'single',
                reason:
                  storyLoadingId === popupCandidate.id
                    ? streamingAdvisorReason ||
                      (hotelStoryRegenToken > 0 ? undefined : popupCandidate.tripFit)
                    : popupCandidate.tripFit,
                loading: storyLoadingId === popupCandidate.id,
                labels: {
                  title: '行程顾问点评',
                  loadingText: '正在结合酒店资料与住客评论生成推荐理由…',
                },
                onRegenerate: isLlmConfigured()
                  ? () => setHotelStoryRegenToken((n) => n + 1)
                  : undefined,
                regenerating:
                  storyLoadingId === popupCandidate.id && hotelStoryRegenToken > 0,
              }
            : null
        }
        footer={
          popupCandidate &&
          (decidingCustom ||
            !isHotelSelected(selected) ||
            popupCandidate.id !== selected.id) ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--stone)]">
                {decidingCustom ? '要把这家酒店加入候选项吗？' : '如何处理这家酒店？'}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={decideStayHere}
                  className="rounded-xl bg-[var(--ink)] px-3 py-2.5 text-sm text-[var(--paper)]"
                >
                  就住这儿了
                </button>
                <button
                  type="button"
                  onClick={decideConsider}
                  className="rounded-xl border border-[var(--sage)] bg-[var(--sage)]/10 px-3 py-2.5 text-sm text-[var(--sage)]"
                >
                  考虑考虑
                </button>
                {decidingCustom ? (
                  <button
                    type="button"
                    onClick={dismissPendingCustom}
                    className="rounded-xl border border-[var(--stone)]/30 px-3 py-2.5 text-sm text-[var(--stone)]"
                  >
                    还是算了
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={decideEliminate}
                    className="rounded-xl border border-red-300/70 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  >
                    这个淘汰
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[var(--stone)]">
                {decidingCustom
                  ? '「就住这儿了」会选中并收起其他卡片；「考虑考虑」仅加入列表；「还是算了」不添加。'
                  : '「就住这儿了」设为当前住宿并收起其他卡片；「考虑考虑」保留但不改选择；「这个淘汰」从列表删除。'}
              </p>
            </div>
          ) : undefined
        }
        onClose={closeHotelPopup}
      />
    </section>
  )
}
