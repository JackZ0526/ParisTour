import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
  glassGoldCardSurfaceClass,
} from '../../../shared/styles/glassCapsule'
import { useTranslation, getLocale, type Locale } from '../../../shared/i18n'
import {
  fetchBookingHotelFeaturedReviews,
  fetchBookingHotelDetails,
  fetchBookingHotelPhotos,
  isBookingApiEnabled,
  bookingPhotoUrl,
  resolveBookingHotelIdentity,
} from '../services/bookingHotels'
import {
  formatHotelArea,
  hotelScoreText,
  localizeFacility,
  localizePaymentMethod,
  localizePropertyType,
  localizeReviewScoreLabel,
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
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'

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
/** Long-press duration for mobile touch drag to avoid conflict with scrolling and tapping. */
const HOTEL_LONG_PRESS_MS = 280
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

function needsCustomCardBlurb(hotel: HotelCandidate, locale: Locale = getLocale()): boolean {
  if (hotel.source !== 'custom') return false
  const reason = hotel.reason?.trim() || ''
  if (!reason) return true
  if (locale === 'en' && looksChinese(reason)) return true
  if (locale === 'zh-CN' && !looksChinese(reason)) return true
  return /^替换[「『"]/.test(reason)
}

function HotelCardFace({
  hotel,
  blurb,
  blurbLoading,
  variant = 'candidate',
}: {
  hotel: HotelCandidate
  blurb?: string
  blurbLoading?: boolean
  variant?: 'candidate' | 'selected'
}) {
  const { t, locale } = useTranslation()
  const customText = (blurb || hotel.reason || '').trim()
  const isCustom = hotel.source === 'custom'
  const isCustomChineseInEn = isCustom && locale === 'en' && looksChinese(customText)
  const showCustomShimmer =
    isCustom &&
    ((blurbLoading && !customText) ||
      (isCustomChineseInEn && blurbLoading))
  const displayCustomText =
    isCustomChineseInEn
      ? (hotel.description && !looksChinese(hotel.description) ? hotel.description : '')
      : customText

  return (
    <div
      className={
        variant === 'selected'
          ? 'relative h-full sm:grid sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:items-stretch'
          : 'relative'
      }
    >
      <div className="relative overflow-hidden">
        <GooglePlacePhoto
          name={hotel.name}
          location={{ lat: hotel.lat, lng: hotel.lng }}
          fallback={bookingPhotoUrl(hotel.image)}
          alt={hotel.name}
          asBackground
          className={`h-28 bg-cover bg-center transition duration-500 group-hover:scale-[1.03] ${
            variant === 'selected'
              ? 'sm:h-full sm:min-h-44 sm:self-stretch'
              : '-mx-px w-[calc(100%+2px)]'
          }`}
        />
        {/* Soft top-down vignette so top-right action buttons always have crisp contrast */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/35 via-black/10 to-transparent z-[2]" />
      </div>
      <div
        className={`flex flex-col p-3 ${
          variant === 'selected' ? 'min-h-[7.75rem] sm:min-h-44 sm:p-4 sm:justify-between' : 'min-h-[7.75rem]'
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {hotel.area && (
              <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.copper} inline-flex items-center gap-1 px-2.5 py-0.5 text-[10.5px] font-medium text-[var(--copper)]`}>
                <MapPin size={10} strokeWidth={2} className="shrink-0" />
                {formatHotelArea(hotel.area, locale)}
              </span>
            )}
            {hotel.isBest && (
              <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.gold} inline-flex items-center gap-1 px-2.5 py-0.5 text-[10.5px] font-medium text-amber-900 dark:text-amber-200`}>
                <Sparkles size={10} strokeWidth={2} className="shrink-0 text-amber-700 dark:text-amber-300" />
                {t('hotel.bestPick')}
              </span>
            )}
            {hotel.source === 'custom' && (
              <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center px-2 py-0.5 text-[10px] text-[var(--stone)]`}>
                {t('hotel.custom')}
              </span>
            )}
          </div>
          <p className={`${variant === 'selected' ? 'font-display text-base font-semibold text-[var(--ink)] sm:text-lg' : 'font-medium text-sm text-[var(--ink)]'} leading-snug`}>
            {hotel.name}
          </p>
          {showCustomShimmer ? (
            <ShimmerLines lines={2} />
          ) : hotel.source === 'custom' ? (
            displayCustomText ? (
              <p className="m-0 line-clamp-2 text-xs leading-relaxed text-[var(--stone)]">{displayCustomText}</p>
            ) : null
          ) : (
            <HotelTranslatedText
              text={hotel.reason || hotel.description}
              loadingLabel="正在翻译酒店简介…"
              className="line-clamp-2 text-xs leading-relaxed text-[var(--stone)]"
            />
          )}
        </div>
        {hotel.rating != null && (
          <div className="mt-3 flex items-center justify-between border-t border-black/[0.04] dark:border-white/10 pt-2">
            <span className="text-[11px] font-medium">
              <span className="text-[#003580] dark:text-[#5fa2f8]">Booking</span>
              <span className="text-[#006ce4] dark:text-[#7bb5ff]">.com</span>
            </span>
            <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-[var(--ink)] tabular-nums shadow-[0_1px_4px_rgba(0,0,0,0.03)]`}>
              <span className="font-semibold text-[#003580] dark:text-[#7bb5ff]">{hotel.rating.toFixed(1)}</span>
              <span className="text-[10px] text-[var(--stone)]">/10</span>
              {hotel.reviewCount != null && (
                <span className="text-[10px] text-[var(--stone)]">（{hotel.reviewCount}）</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
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

const LANGUAGE_EN_LABELS: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', de: 'German',
  'en-gb': 'English', 'en-us': 'English', it: 'Italian', zh: 'Chinese', ja: 'Japanese', ar: 'Arabic', ru: 'Russian',
  'pt-pt': 'Portuguese',
}

function localizeLanguage(value: string, locale?: Locale): string {
  const current = locale || getLocale()
  const key = value.trim().toLowerCase()
  if (current === 'en') {
    return LANGUAGE_EN_LABELS[key] || value.charAt(0).toUpperCase() + value.slice(1)
  }
  return LANGUAGE_LABELS[key] || value
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

  const { locale } = useTranslation()

  return (
    <div ref={containerRef} className={layoutClassName}>
      {items.map((item, index) => (
        <ReviewScoreBarItem
          key={item.label}
          label={localizeReviewScoreLabel(item.label, locale)}
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
  const { t, locale } = useTranslation()
  const [policiesExpanded, setPoliciesExpanded] = useState(false)
  const [locationRevealed, setLocationRevealed] = useState(false)
  const [policiesRevealed, setPoliciesRevealed] = useState(false)
  const popularFacilities = hotel.facilities || []
  const visibleLanguages = (hotel.languages || []).map((l) => localizeLanguage(l, locale))
  const reviewScores = (hotel.reviewScores || []).filter((item) => item.score > 0)
  const policies = hotel.policies || []
  const paymentMethods = (hotel.paymentMethods || []).map((m) => localizePaymentMethod(m, locale))
  const hasLocationDetails = Boolean(hotel.locationDescription)
  const factsPending = identityLoading || loading
  const locationNeedsTranslate = Boolean(
    locale === 'zh-CN' &&
      hotel.locationDescription &&
      !looksChinese(hotel.locationDescription) &&
      isLlmConfigured(),
  )
  const policiesNeedTranslate = Boolean(
    locale === 'zh-CN' &&
      policies.some((policy) => !looksChinese(policy)) &&
      isLlmConfigured(),
  )
  const showLocationShimmer =
    (factsPending && !hasLocationDetails) || (locationNeedsTranslate && !locationRevealed)
  const showPolicySkeleton =
    (factsPending && policies.length === 0) || (policiesNeedTranslate && !policiesRevealed)
  const policiesKey = policies.join('\n---\n')

  const listSeparator = locale === 'en' ? ', ' : '、'

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
        <div className="rounded-2xl border border-[var(--mist)] bg-white/65 dark:bg-[#18201c]/75 p-4">
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
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#003b95]/8 dark:bg-[#5fa2f8]/15 px-2 py-1 text-[11px] font-medium text-[#003b95] dark:text-[#7bb5ff]">
                    {starCount > 0 && (
                      <span
                        className="text-[12px] leading-none tracking-[0.08em] text-[#f5a623]"
                        aria-label={`${starCount} 星酒店`}
                      >
                        {'★'.repeat(starCount)}
                      </span>
                    )}
                    {hotel.propertyType ? localizePropertyType(hotel.propertyType, locale) : (locale === 'en' ? 'Hotel' : '酒店')}
                  </span>
                )}
                {factsPending && !hotel.propertyType && starCount === 0 && (
                  <span className="h-6 w-24 rounded-md day-tab-shimmer" aria-hidden />
                )}
              </div>
              {hotel.address && (
                <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-1 text-sm leading-relaxed">
                  <span className="mt-0.5 text-[#003b95] dark:text-[#5fa2f8]">
                    <HotelFactIcon type="location" />
                  </span>
                  <p className="min-w-0">{hotel.address}</p>
                </div>
              )}
            </div>
            {hotel.rating != null && (
              <div className="flex shrink-0 items-center gap-2 text-right">
                <div>
                  <p className="text-sm font-semibold">{hotelScoreText(hotel.rating, locale)}</p>
                  {hotel.reviewCount != null && (
                    <p className="text-[11px] text-[var(--stone)]">
                      {t('hotel.reviewsCount', { count: hotel.reviewCount.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN') })}
                    </p>
                  )}
                </div>
                <span className="flex h-10 min-w-10 items-center justify-center rounded-[10px_10px_10px_2px] bg-[#003b95] dark:bg-[#0051ba] px-2 text-sm font-semibold text-white">
                  {hotel.rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {hotel.sustainability && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                {t('hotel.sustainableStay')} · {hotel.sustainability}
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
                className="inline-flex items-center gap-1 rounded-md border border-[var(--mist)] bg-white/70 dark:bg-white/10 px-2.5 py-1.5 text-xs font-medium text-[#003b95]/85 dark:text-[#7bb5ff] transition hover:border-[#003b95]/20 hover:bg-[#003b95]/5 dark:hover:bg-white/15 hover:text-[#003b95] dark:hover:text-[#5fa2f8]"
              >
                {locale === 'en' ? 'Book on ' : '前往 '}
                <span>
                  <span className="text-[#003580] dark:text-[#5fa2f8]">Booking</span>
                  <span className="text-[#006ce4] dark:text-[#7bb5ff]">.com</span>
                </span>
                <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
              </a>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {identityError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <span>{identityError}</span>
            <button
              type="button"
              onClick={onIdentityRetry}
              className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
            >
              {locale === 'en' ? 'Retry Matching' : '重试匹配'}
            </button>
          </div>
        )}
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
            >
              {locale === 'en' ? 'Retry' : '重试'}
            </button>
          </div>
        )}

        {factsPending && (
          <>
            <div className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4" aria-busy>
              <ShimmerLines lines={1} className="mb-3 max-w-[8rem]" />
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index} className="h-5 w-24 rounded-full day-tab-shimmer" />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4" aria-busy>
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
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4" aria-busy>
            <ShimmerLines lines={1} className="mb-3 max-w-[10rem]" />
            <ShimmerLines lines={4} />
          </div>
        )}

        {popularFacilities.length ? (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4">
            <BookingSectionHeader icon={Building2} title={t('hotel.popularFacilities')} />
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {popularFacilities.map((facility) => (
                <span key={facility} className="inline-flex items-center gap-2 text-sm">
                  <FacilityItemIcon facility={facility} />
                  {localizeFacility(facility, locale)}
                </span>
              ))}
            </div>
          </div>
        ) : !factsPending && !error && hotel.bookingDetailsLoaded ? (
          <p className="text-xs text-[var(--stone)]">{t('hotel.noFacilities')}</p>
        ) : null}

        {reviewScores.length > 0 && (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4">
            <BookingSectionHeader icon={BarChart3} title={t('hotel.reviewScores')} />
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
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4">
            <BookingSectionHeader icon={Info} title={t('hotel.policiesAndInfo')} />
            <div className="divide-y divide-[var(--mist)] text-sm">
              {(hotel.checkIn || hotel.checkOut) && (
                <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
                  <span className="font-medium">{t('hotel.checkInOut')}</span>
                  <span className="text-[var(--ink)]/80">
                    {hotel.checkIn ? t('hotel.checkInAfter', { time: hotel.checkIn }) : ''}
                    {hotel.checkIn && hotel.checkOut ? ' · ' : ''}
                    {hotel.checkOut ? t('hotel.checkOutBefore', { time: hotel.checkOut }) : ''}
                  </span>
                </div>
              )}
              {visibleLanguages.length > 0 && (
                <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
                  <span className="font-medium">{t('hotel.languagesSpoken')}</span>
                  <span className="text-[var(--ink)]/80">{visibleLanguages.join(listSeparator)}</span>
                </div>
              )}
              {paymentMethods.length > 0 && (
                <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
                  <span className="font-medium">{t('hotel.paymentMethods')}</span>
                  <span className="text-[var(--ink)]/80">{paymentMethods.join(listSeparator)}</span>
                </div>
              )}
              {policies.length > 0 && (
                <div className={showPolicySkeleton ? 'hidden' : 'py-3'}>
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <span className="font-medium">{t('hotel.importantInfo')}</span>
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
                      {policiesExpanded ? t('hotel.collapseInfo') : t('hotel.expandAllInfo', { count: policies.length })}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--stone)]">
          {t('hotel.bookingDisclaimer')}
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
  const { t, locale } = useTranslation()
  const [reviewsRevealed, setReviewsRevealed] = useState(false)
  const reviews = (hotel.reviews || []).map((review) => ({
    text: review.negativeText
      ? `${review.text}\n\n${locale === 'en' ? 'Cons: ' : '不足：'}${review.negativeText}`
      : review.text,
    rating: review.rating,
    author: review.author,
    relativeTime: review.relativeTime,
  }))
  const reviewsNeedTranslate = Boolean(
    locale === 'zh-CN' &&
      reviews.some((review) => !looksChinese(review.text)) &&
      isLlmConfigured(),
  )
  const showReviewShimmer = loading || (reviewsNeedTranslate && !reviewsRevealed)
  const reviewsKey = reviews.map((review) => review.text).join('\n---\n')

  useLayoutEffect(() => {
    setReviewsRevealed(!reviewsNeedTranslate)
  }, [hotel.id, reviewsKey, reviewsNeedTranslate])

  return (
    <section className="rounded-2xl border border-[var(--mist)] bg-white/60 dark:bg-[#18201c]/70 p-4">
      <BookingSectionHeader
        icon={MessageSquareQuote}
        title={t('hotel.bookingReviews')}
      />
      {showReviewShimmer && (
        <div className="space-y-3" aria-busy>
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2">
              <ShimmerLines lines={1} className="mb-2 max-w-[10rem]" />
              <ShimmerLines lines={3} />
            </div>
          ))}
        </div>
      )}
      {error && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
          >
            {locale === 'en' ? 'Retry' : '重试'}
          </button>
        </div>
      )}
      {reviews.length > 0 && (
        <div className={showReviewShimmer ? 'hidden' : undefined}>
          <GoogleReviewsList
            reviews={reviews}
            sourceLabel={locale === 'en' ? 'Booking.com Featured Reviews' : 'Booking.com 精选评论'}
            showHeader={false}
            showShimmer={false}
            onPendingChange={(pending) => setReviewsRevealed(!pending)}
          />
        </div>
      )}
      {!loading && !error && hotel.bookingReviewsLoaded && !reviews.length && (
        <p className="text-sm text-[var(--stone)]">{locale === 'en' ? 'No featured guest reviews available to display.' : '暂无可展示的精选住客评论。'}</p>
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
  const { t, locale } = useTranslation()
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
  const [othersCollapsed, setOthersCollapsed] = useState(() => {
    if (isHotelSelected(selected)) return true
    const cached = loadHotelCache()
    if (cached && isHotelSelected(cached.selected)) return true
    return Boolean(cached?.othersCollapsed)
  })
  const [drag, setDrag] = useState<HotelDragSession | null>(null)
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 })
  const [dropping, setDropping] = useState(false)
  const bootstrappedRef = useRef(false)
  const lastOpenSelectedDetailTokenRef = useRef(0)
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
  const longPressTimerRef = useRef<number | null>(null)
  const pendingPointerRef = useRef<{
    hotelId: string
    startX: number
    startY: number
    cardEl: HTMLElement
    pointerId: number
    pointerType: string
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
    const targetId = selected.id || selectedRef.current.id
    const card =
      candidates.find((h) => h.id === targetId) ||
      candidatesRef.current.find((h) => h.id === targetId)
    if (!card) return
    setPendingCustom(null)
    setPopupHotelId(card.id)
  }, [openSelectedDetailToken, candidates, selected.id])

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
      setOthersCollapsed(
        isHotelSelected(cached.selected) ? true : Boolean(cached.othersCollapsed),
      )
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

    const isValidForLocale = (text?: string) => {
      if (!text?.trim()) return false
      if (locale === 'en' && looksChinese(text)) return false
      if (locale === 'zh-CN' && !looksChinese(text)) return false
      return true
    }

    if (!bypass && card.tripFit?.trim() && isValidForLocale(card.tripFit) && card.hotelAdvisorVersion === 2) {
      rememberHotelAdvisorCopy(card, card.tripFit, locale)
      return
    }

    if (!bypass) {
      const hydrated = hydrateHotelAdvisorFromCache(card, locale)
      if (hydrated.tripFit?.trim() && isValidForLocale(hydrated.tripFit) && hydrated.hotelAdvisorVersion === 2) {
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
      if (!needsCustomCardBlurb(hotel, locale)) continue
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
      const artifactKey = `hotel-card-blurb:v2:${locale}:${hotel.bookingHotelId || hotel.name}`
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
            locale,
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
      setError(locale === 'en' ? 'Unable to generate hotel recommendations. Please enter a custom address below.' : '暂时无法生成酒店推荐，请使用下方自定义地址。')
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
      setError(e instanceof Error ? e.message : (locale === 'en' ? 'Failed to recommend hotels' : '推荐酒店失败'))
    } finally {
      setRefreshing(false)
    }
  }

  async function runFreshRecommendations(preferences?: string) {
    if (!isLlmConfigured()) {
      setError(locale === 'en' ? 'Unable to generate hotel recommendations. Please enter a custom address below.' : '暂时无法生成酒店推荐，请使用下方自定义地址。')
      return
    }

    const prefs = preferences?.trim() || undefined
    setRefreshPanel(null)
    setRefreshing(true)
    setRefreshHint(
      prefs
        ? (locale === 'en' ? 'Finding new hotels tailored to your preferences…' : '正在按你的喜好重新推荐酒店…')
        : (locale === 'en' ? 'Surprise me: Finding a fresh batch of hotels…' : '交给命运：正在挑选一批新酒店…')
    )
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
      setError(e instanceof Error ? e.message : (locale === 'en' ? 'Failed to recommend hotels' : '推荐酒店失败'))
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
      setError(e instanceof Error ? e.message : (locale === 'en' ? 'Failed to resolve location' : '解析失败'))
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
      }, 150)
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

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen'
    const pointerInfo = {
      hotelId,
      startX: e.clientX,
      startY: e.clientY,
      cardEl: e.currentTarget,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    }

    if (isTouch) {
      // Long press required on touch devices to prevent conflict with scrolling & clicking
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null
        if (pendingPointerRef.current && !dragRef.current && !settlingRef.current) {
          const p = pendingPointerRef.current
          pendingPointerRef.current = null
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
            try {
              navigator.vibrate(35)
            } catch {
              /* ignore */
            }
          }
          beginDrag(p.hotelId, { clientX: p.startX, clientY: p.startY, pointerId: p.pointerId }, p.cardEl)
        }
      }, HOTEL_LONG_PRESS_MS)
    }

    pendingPointerRef.current = pointerInfo
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
        const dist = Math.hypot(dx, dy)

        if (pending.pointerType === 'touch' || pending.pointerType === 'pen') {
          // If finger moves more than 10px before long-press fires, user is scrolling: cancel long press
          if (dist > 10 && longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
            pendingPointerRef.current = null
          }
        } else {
          // Mouse: instant threshold drag
          if (dist >= HOTEL_DRAG_THRESHOLD_PX) {
            const { hotelId, cardEl, pointerId } = pending
            pendingPointerRef.current = null
            beginDrag(hotelId, { clientX: e.clientX, clientY: e.clientY, pointerId }, cardEl)
          }
        }
      }
    }
    const onUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      if (settlingRef.current) {
        pendingPointerRef.current = null
        return
      }
      if (dragRef.current) {
        endDrag(true)
        return
      }
      pendingPointerRef.current = null
    }
    const onCancel = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
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
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
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

  const [pendingDeleteHotel, setPendingDeleteHotel] = useState<HotelCandidate | null>(null)
  const [pendingEliminateHotel, setPendingEliminateHotel] = useState<HotelCandidate | null>(null)

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
    setPendingEliminateHotel(card)
  }

  const showEmpty = !candidates.length && !refreshing && !pendingCustom

  return (
    <section className={`space-y-4 ${readOnly ? '[&_button]:pointer-events-none [&_input]:pointer-events-none [&_textarea]:pointer-events-none' : ''}`}>
      <article className={`relative rounded-3xl ${glassCardSurfaceClass} !overflow-visible p-5 shadow-[0_8px_32px_rgba(0,0,0,0.03)] sm:p-7`}>
        <div className="flex items-center justify-between border-b border-black/5 pb-3.5 sm:pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--gold)]/20 to-[var(--copper)]/10 text-[var(--copper)] shadow-inner">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl leading-tight text-[var(--ink)] sm:text-2xl">
                  {t('hotel.title')}
                </h2>
                <span
                  className={`${glassCapsuleSurfaceClass} ${
                    isHotelSelected(selected)
                      ? glassCapsuleToneClass.gold
                      : glassCapsuleToneClass.neutral
                  } px-2.5 py-0.5 text-[11px] font-medium ${
                    isHotelSelected(selected)
                      ? 'text-amber-900 dark:text-amber-200'
                      : 'text-[var(--stone)] dark:text-zinc-300'
                  }`}
                >
                  {isHotelSelected(selected) ? t('hotel.selected') : t('hotel.unselected')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">

      <div>
        <div className="flex items-center gap-1.5">
          <Bed size={14} className="text-[var(--copper)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--copper)]">
            {t('hotel.currentHotel')}
          </p>
        </div>
        <div className="mt-2.5 space-y-4">
          <div className="grid items-stretch gap-3.5 lg:grid-cols-12">
            <div className="flex flex-col lg:col-span-8">
              <AnimatePresence mode="wait">
                {selectedCandidate ? (
                  <motion.div
                    key={`selected-hotel-${selectedCandidate.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    ref={currentSlotRef}
                    className={`group flex-1 text-left ring-1 transition-[border-color,box-shadow,background-color] duration-200 [transition-timing-function:var(--timeline-ease)] ${glassGoldCardSurfaceClass} ${
                      currentSlotDropReady
                        ? '!border-[var(--sage)] ring-[var(--sage)]/40 !bg-[var(--sage)]/10'
                        : currentSlotHighlight
                          ? '!border-[var(--copper)] ring-[var(--copper)]/45 !bg-[var(--copper)]/5'
                          : 'ring-[#d4bd91]/25 dark:ring-white/10'
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
                            setPendingDeleteHotel(selectedCandidate)
                          }}
                          className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} flex h-8 w-8 items-center justify-center text-[var(--stone)] dark:text-zinc-300 transition-colors hover:text-red-700 dark:hover:text-red-400 active:scale-95`}
                        >
                          <TrashIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        data-hotel-no-drag
                        aria-label={t('hotel.cancelCurrentSelection')}
                        title={t('hotel.cancelCurrentSelection')}
                        onClick={(e) => {
                          e.stopPropagation()
                          clearCurrentSelection()
                        }}
                        className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} flex h-8 w-8 items-center justify-center text-[var(--stone)] dark:text-zinc-300 transition-colors hover:text-[var(--copper)] dark:hover:text-[var(--copper)] active:scale-95`}
                      >
                        <UnselectIcon />
                      </button>
                    </div>
                    {currentSlotHighlight && (
                      <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[var(--sage)]/15">
                        <span className="rounded-full bg-[var(--ink)]/80 px-3 py-1 text-sm text-[var(--paper)]">
                          {t('hotel.releaseToSelect')}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openHotelCard(selectedCandidate)}
                      className="h-full w-full text-left"
                    >
                      <HotelCardFace
                        hotel={selectedCandidate}
                        blurb={cardBlurbStream[selectedCandidate.id]}
                        blurbLoading={
                          needsCustomCardBlurb(selectedCandidate, locale) && isLlmConfigured()
                        }
                        variant="selected"
                      />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty-hotel-slot"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    ref={currentSlotRef}
                    className={`flex flex-1 flex-col justify-center rounded-2xl border border-dashed p-6 shadow-sm backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-200 [transition-timing-function:var(--timeline-ease)] sm:p-8 ${
                      currentSlotDropReady
                        ? 'border-[var(--sage)] bg-[var(--sage)]/15 ring-2 ring-[var(--sage)]/35'
                        : currentSlotHighlight
                          ? 'border-[var(--copper)] bg-[var(--copper)]/10 ring-2 ring-[var(--copper)]/30'
                          : 'border-[var(--copper)]/35 bg-white/60'
                    }`}
                  >
                    <p className="font-medium text-base text-[var(--ink)]">
                      {currentSlotHighlight ? t('hotel.dropToSelectTitle') : t('hotel.emptySlotTitle')}
                    </p>
                    <p className="mt-1.5 text-sm text-[var(--stone)] leading-relaxed">
                      {currentSlotHighlight
                        ? t('hotel.dropToSelectDesc')
                        : t('hotel.emptySlotDesc')}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className={`flex flex-col justify-between p-4 sm:p-5 lg:col-span-4 ${glassCardSurfaceClass}`}>
              <div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[var(--copper)]">
                    <MapPin size={14} strokeWidth={1.8} />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                      {t('hotel.customHotel')}
                    </p>
                  </div>
                  <p className="mt-2 text-base font-medium text-[var(--ink)]">
                    {t('hotel.alreadyBooked')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--stone)]">
                    {t('hotel.customHotelPrompt')}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                <input
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder={t('hotel.customHotelPlaceholder')}
                  aria-label={t('hotel.customHotelPrompt')}
                  className="w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/70 dark:bg-black/35 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.03),0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-all placeholder:text-[var(--stone)]/55 focus:border-[var(--copper)]/60 focus:bg-white dark:focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(181,106,60,0.08)]"
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
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                    !customQuery.trim() || loading || decidingCustom
                      ? 'border border-black/[0.06] dark:border-white/10 bg-white/45 dark:bg-white/5 text-[var(--stone)]/45 dark:text-zinc-500 cursor-not-allowed shadow-none'
                      : 'border border-[var(--ink)]/90 bg-[var(--ink)] text-[var(--paper)] dark:bg-[var(--copper)] dark:text-white shadow-[0_4px_14px_rgba(35,42,38,0.18),inset_0_1px_1.5px_rgba(255,255,255,0.22)] hover:bg-[var(--ink)]/95 dark:hover:bg-[var(--copper)]/90 hover:shadow-[0_6px_20px_rgba(35,42,38,0.25)]'
                  }`}
                >
                  {loading && <ButtonSpinner />}
                  {loading ? t('hotel.generatingCard') : t('hotel.generateCard')}
                </button>
                {loading && (
                  <LoadingIndicator label={t('hotel.parsingAddressGenerating')} showDots size="sm" />
                )}
              </div>
            </div>
          </div>
        </div>

        {(canToggleOthers || (!selectedCandidate && candidates.length > 0)) && (
          <div className="space-y-3 border-t border-black/5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[var(--gold)]" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--stone)]">
                  {selectedCandidate ? t('hotel.otherCandidates') : t('hotel.hotelCandidates')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {!readOnly && isLlmConfigured() && (
                  <button
                    type="button"
                    disabled={refreshing}
                    onClick={() => {
                      setError(null)
                      setRefreshPanel('choose')
                      if (othersCollapsed) {
                        setOthersCollapsedAndPersist(false)
                      }
                    }}
                    aria-busy={refreshing || undefined}
                    aria-label={refreshing ? t('hotel.refreshingSelection') : t('hotel.refreshSelectionPrompt')}
                    className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--copper)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--copper)]/25 disabled:opacity-50`}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {refreshing ? (
                        <ButtonSpinner mode="thinking" task="hotelRecommend" />
                      ) : (
                        <Sparkles size={12} strokeWidth={1.8} />
                      )}
                    </span>
                    <span>{refreshing ? t('hotel.recommending') : t('hotel.refreshSelection')}</span>
                  </button>
                )}
                {canToggleOthers && (
                  <button
                    type="button"
                    onClick={() => setOthersCollapsedAndPersist(!othersCollapsed)}
                    className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--ink)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/30`}
                  >
                    <ChevronIcon up={!othersCollapsed} />
                    {othersCollapsed ? t('hotel.expand') : t('hotel.collapse')}
                  </button>
                )}
              </div>
            </div>

            {refreshPanel && (
              <div className={`rounded-2xl ${glassCardSurfaceClass} p-4 transition-all sm:p-5`}>
                {refreshPanel === 'choose' ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-base text-[var(--ink)]">{t('hotel.refreshSelection')}</p>
                        <p className="mt-1 text-sm text-[var(--stone)]">
                          {t('hotel.tellPreferencesDesc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => setRefreshPanel(null)}
                        className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} px-3 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--ink)] active:scale-95`}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => setRefreshPanel('prefer')}
                        className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-[#18201c]/80 p-4 text-left shadow-sm backdrop-blur-md transition hover:bg-white/90 dark:hover:bg-[#1f2824] hover:border-white dark:hover:border-white/20 disabled:opacity-50"
                      >
                        <p className="font-medium text-[var(--ink)]">{t('hotel.tellPreferences')}</p>
                        <p className="mt-1 text-xs text-[var(--stone)] leading-relaxed">
                          {t('hotel.tellPreferencesDesc')}
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => void runFreshRecommendations()}
                        className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-[#18201c]/80 p-4 text-left shadow-sm backdrop-blur-md transition hover:bg-white/90 dark:hover:bg-[#1f2824] hover:border-white dark:hover:border-white/20 disabled:opacity-50"
                      >
                        <p className="font-medium text-[var(--ink)]">{t('hotel.refreshDirectly')}</p>
                        <p className="mt-1 text-xs text-[var(--stone)] leading-relaxed">
                          {t('hotel.refreshDirectlyDesc')}
                        </p>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-base text-[var(--ink)]">{t('hotel.preferencesPrompt')}</p>
                        <p className="mt-1 text-sm text-[var(--stone)]">
                          {t('hotel.preferencesHint')}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => setRefreshPanel('choose')}
                        className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} px-3 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--ink)] active:scale-95`}
                      >
                        {t('hotel.back')}
                      </button>
                    </div>
                    <textarea
                      value={preferText}
                      onChange={(e) => setPreferText(e.target.value)}
                      rows={3}
                      placeholder={t('hotel.preferencesPlaceholder')}
                      className="mt-3 w-full resize-none rounded-2xl border border-white/90 dark:border-white/10 bg-white/70 dark:bg-black/35 p-3.5 text-sm text-[var(--ink)] outline-none shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.03),0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-all placeholder:text-[var(--stone)]/55 focus:border-[var(--copper)]/60 focus:bg-white dark:focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(181,106,60,0.08)]"
                    />
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => setRefreshPanel(null)}
                        className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} px-4 py-2 text-xs text-[var(--stone)] transition-colors active:scale-95 disabled:opacity-50`}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={refreshing || !preferText.trim()}
                        onClick={() => void runFreshRecommendations(preferText)}
                        aria-busy={refreshing || undefined}
                        className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                          !preferText.trim() || refreshing
                            ? 'border border-black/[0.06] dark:border-white/10 bg-white/45 dark:bg-white/5 text-[var(--stone)]/45 cursor-not-allowed shadow-none'
                            : 'border border-[var(--ink)]/90 bg-[var(--ink)] text-[var(--paper)] dark:bg-[var(--copper)] dark:text-white shadow-[0_4px_14px_rgba(35,42,38,0.18),inset_0_1px_1.5px_rgba(255,255,255,0.22)] hover:bg-[var(--ink)]/95 dark:hover:bg-[var(--copper)]/90'
                        }`}
                      >
                        {refreshing && <ButtonSpinner mode="thinking" task="hotelRecommend" />}
                        {refreshing ? t('hotel.recommending') : t('hotel.recommendByPrefs')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {refreshing && (
              <LoadingIndicator
                variant="block"
                thinkingLabel={refreshHint || t('hotel.thinkingRecommendation')}
                generatingLabel={refreshHint || t('hotel.verifyingRecommendation')}
                showDots
                size="sm"
                mode="thinking"
                task="hotelRecommend"
                className="py-3"
              />
            )}

            <div
              className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${
                !selectedCandidate || !othersCollapsed
                  ? 'grid-rows-[1fr]'
                  : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-opacity duration-300 ease-out ${
                    selectedCandidate && othersCollapsed
                      ? 'pointer-events-none opacity-0'
                      : 'opacity-100'
                  } ${dragging ? 'select-none' : ''}`}
                >
                  {(selectedCandidate ? otherCandidates : candidates).map((hotel) => (
                    <motion.div
                      layout="position"
                      key={hotel.id}
                      transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
                      onPointerDown={(e) => onCandidatePointerDown(hotel.id, e)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('[data-hotel-no-drag]')) return
                        if (dragRef.current || suppressClickRef.current) return
                        openHotelCard(hotel)
                      }}
                      className={`group relative cursor-pointer text-left ${
                        drag ? 'touch-none' : 'touch-pan-y'
                      } select-none transition-[border-color,opacity,box-shadow] duration-200 [transition-timing-function:var(--timeline-ease)] ${glassCardSurfaceClass} ${
                        dragHotelId === hotel.id
                          ? 'pointer-events-none !border-transparent opacity-0'
                          : 'hover:!border-[var(--gold)]/70 hover:shadow-[0_8px_28px_rgba(109,82,39,0.08)]'
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
                            setPendingDeleteHotel(hotel)
                          }}
                          className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} !absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center text-[var(--stone)] dark:text-zinc-300 transition-colors hover:text-red-700 dark:hover:text-red-400 active:scale-95`}
                        >
                          <TrashIcon />
                        </button>
                      )}
                      <HotelCardFace
                        hotel={hotel}
                        blurb={cardBlurbStream[hotel.id]}
                        blurbLoading={needsCustomCardBlurb(hotel) && isLlmConfigured()}
                      />
                    </motion.div>
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
        </div>
      </article>

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
          <div className="timeline-drag-float-card relative overflow-hidden rounded-3xl border border-white/90 dark:border-white/10 bg-white/85 dark:bg-[#161d19]/90 shadow-[0_16px_48px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.08)] ring-1 ring-[var(--ink)]/5 backdrop-blur-2xl">
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
                      (hotelStoryRegenToken > 0
                        ? undefined
                        : (locale === 'en' && looksChinese(popupCandidate.tripFit || '')
                            ? undefined
                            : popupCandidate.tripFit))
                    : (locale === 'en' && looksChinese(popupCandidate.tripFit || '')
                        ? undefined
                        : popupCandidate.tripFit),
                loading: storyLoadingId === popupCandidate.id,
                labels: {
                  title: t('hotel.advisorReview'),
                  loadingText: t('hotel.advisorReviewLoading'),
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
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1">
              <div className="flex items-center gap-2">
                {decidingCustom ? (
                  <button
                    type="button"
                    onClick={dismissPendingCustom}
                    className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--ink)] active:scale-95 flex-1 sm:flex-none`}
                  >
                    {t('hotel.dismiss')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={decideEliminate}
                    className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-[var(--stone)] transition-colors hover:text-red-700 hover:bg-red-50/70 active:scale-95 flex-1 sm:flex-none`}
                  >
                    <Trash2 size={13} strokeWidth={1.8} className="shrink-0" />
                    {t('hotel.removeFromCandidate')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={decideConsider}
                  className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-[var(--stone)] transition-colors hover:text-[var(--ink)] active:scale-95 flex-1 sm:flex-none`}
                >
                  {decidingCustom ? (locale === 'en' ? 'Add as Candidate' : '仅加入候选') : (locale === 'en' ? 'Keep in Candidates' : '保留备选')}
                </button>
              </div>

              <button
                type="button"
                onClick={decideStayHere}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--ink)]/90 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-[var(--paper)] shadow-[0_4px_14px_rgba(35,42,38,0.18),inset_0_1px_1.5px_rgba(255,255,255,0.22)] transition-all hover:bg-[var(--ink)]/95 active:scale-95 w-full sm:w-auto"
              >
                <Bed size={15} strokeWidth={2} className="shrink-0 text-[var(--gold)]" />
                {t('hotel.chooseThisHotel')}
              </button>
            </div>
          ) : undefined
        }
        onClose={closeHotelPopup}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteHotel)}
        onClose={() => setPendingDeleteHotel(null)}
        onConfirm={() => {
          if (pendingDeleteHotel) {
            removeHotel(pendingDeleteHotel)
            setPendingDeleteHotel(null)
          }
        }}
        title={t('hotel.deleteCustomHotelTitle')}
        description={
          <span>
            {locale === 'en' ? (
              <>
                Are you sure you want to delete custom hotel{' '}
                <strong className="font-semibold text-[var(--ink)]">
                  "{pendingDeleteHotel?.name || 'this hotel'}"
                </strong>?
              </>
            ) : (
              <>
                确定删除自定义酒店{' '}
                <strong className="font-semibold text-[var(--ink)]">
                  「{pendingDeleteHotel?.name || '此酒店'}」
                </strong>{' '}
                吗？
              </>
            )}
          </span>
        }
        confirmText={t('common.delete')}
        tone="danger"
        icon="trash"
      />

      <ConfirmDialog
        open={Boolean(pendingEliminateHotel)}
        onClose={() => setPendingEliminateHotel(null)}
        onConfirm={() => {
          if (pendingEliminateHotel) {
            removeHotel(pendingEliminateHotel)
            setPendingEliminateHotel(null)
          }
        }}
        title={t('hotel.eliminateCandidateTitle')}
        description={
          <span>
            {locale === 'en' ? (
              <>
                Are you sure you want to remove{' '}
                <strong className="font-semibold text-[var(--ink)]">
                  "{pendingEliminateHotel?.name || 'this hotel'}"
                </strong>{' '}
                from candidate list?
              </>
            ) : (
              <>
                确定将{' '}
                <strong className="font-semibold text-[var(--ink)]">
                  「{pendingEliminateHotel?.name || '此酒店'}」
                </strong>{' '}
                从候选列表中淘汰移除吗？
              </>
            )}
          </span>
        }
        confirmText={t('hotel.removeFromCandidate')}
        tone="warning"
        icon="alert"
      />
    </section>
  )
}
