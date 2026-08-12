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
import { generateHotelDetailCopy, isLlmConfigured } from '../../../shared/services/llm/llm'
import { memoizeLlmCall } from '../../../shared/services/llm/llmMemo'
import type { DayPlan, HotelCandidate, SelectedHotel } from '../../../types'
import { GooglePlacePage } from '../../place/components/GooglePlacePage'
import { HotelLocationDescription } from './HotelLocationDescription'
import { HotelTranslatedPolicyList } from './hotelTranslation'
import { GooglePlacePhoto } from '../../place/components/GooglePlacePhoto'
import { GoogleReviewsList } from '../../place/components/GoogleReviewsList'
import { useGoogleMapsReady } from '../../map/components/GoogleMapsProvider'
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
  categorizeFacilities,
  hotelScoreText,
  localizePaymentMethod,
  localizePropertyType,
} from '../utils/hotelDisplay'
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
}

/** Match DayTimeline float settle. */
const HOTEL_DRAG_SETTLE_MS = 200
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

function HotelCardFace({ hotel }: { hotel: HotelCandidate }) {
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
    </>
  )
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function UnselectIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  )
}

function ChevronIcon({ up }: { up?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform duration-300 ${up ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
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

function HotelFactIcon({ type }: { type: 'location' | 'clock' | 'facility' | 'info' }) {
  const paths = {
    location: <><path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    facility: <><path d="M4 12h16M6 8h12M7 16h10" /><path d="M5 5h14v14H5z" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[type]}</svg>
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
  const facts = [
    hotel.starRating != null
      ? { label: '酒店星级', value: `${hotel.starRating} 星` }
      : null,
    hotel.checkIn ? { label: '最早入住', value: hotel.checkIn } : null,
    hotel.checkOut ? { label: '最晚退房', value: hotel.checkOut } : null,
    hotel.area ? { label: '所在区域', value: hotel.area } : null,
    hotel.rating != null
      ? { label: '住客评分', value: `${hotel.rating.toFixed(1)} / 10` }
      : hotel.reviewCount
        ? { label: '住客评价', value: `${hotel.reviewCount.toLocaleString('zh-CN')} 条` }
        : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  const facilityGroups = categorizeFacilities((hotel.facilities || []).slice(0, 12))
  const visibleLanguages = (hotel.languages || []).map(localizeLanguage)
  const reviewScores = (hotel.reviewScores || []).filter((item) => item.score > 0)
  const policies = hotel.policies || []
  const visiblePolicies = policiesExpanded ? policies : policies.slice(0, 2)
  const paymentMethods = (hotel.paymentMethods || []).map(localizePaymentMethod)
  const hasLocationInfo = Boolean(
    hotel.area ||
      hotel.districtLabel ||
      hotel.distanceToCityCenterKm != null ||
      hotel.locationDescription,
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--mist)] bg-white/65 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {hotel.starRating != null && (
              <span className="text-sm tracking-[0.12em] text-[#f5a623]" aria-label={`${hotel.starRating} 星酒店`}>
                {'★'.repeat(Math.max(1, Math.min(5, Math.round(hotel.starRating))))}
              </span>
            )}
            {hotel.propertyType && (
              <span className="rounded-md bg-[#003b95]/8 px-2 py-1 text-[11px] font-medium text-[#003b95]">
                {localizePropertyType(hotel.propertyType)}
              </span>
            )}
            {hotel.sustainability && (
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                可持续住宿 · {hotel.sustainability}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-0.5 text-[#003b95]"><HotelFactIcon type="location" /></span>
            <div>
              <p>{hotel.address || `${hotel.name}, Paris`}</p>
              {hotel.area && <p className="mt-0.5 text-xs text-[var(--stone)]">{hotel.area}</p>}
            </div>
          </div>
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
        {hasValidParisBookingIdentity(hotel) && hotel.bookingUrl && (
          <a
            href={hotel.bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-[5.5rem] items-center justify-center gap-1 rounded-lg bg-[#006ce4] px-3 py-2 text-xs font-semibold transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#0057b8] active:translate-y-0"
            style={{ color: '#fff' }}
          >
            查看酒店
            <span aria-hidden>↗</span>
          </a>
        )}
      </div>

      <div className="space-y-4">
        {identityLoading && (
          <LoadingIndicator label="正在识别 Booking.com 酒店" showDots size="sm" />
        )}
        {loading && (
          <LoadingIndicator label="正在加载酒店完整资料" showDots size="sm" />
        )}
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

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-xl border border-[var(--mist)] bg-white/60 px-3 py-2.5">
                <dt className="text-[11px] text-[var(--stone)]">{fact.label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {hasLocationInfo && (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[#003b95]"><HotelFactIcon type="location" /></span>
              <h4 className="text-base font-semibold">位置与周边</h4>
            </div>
            <div className="space-y-2 text-sm leading-relaxed text-[var(--ink)]/85">
              {hotel.area && (
                <p><span className="font-medium text-[var(--ink)]">所在区域：</span>{hotel.area}</p>
              )}
              {hotel.districtLabel && hotel.districtLabel !== hotel.area && (
                <p><span className="font-medium text-[var(--ink)]">街区：</span>{hotel.districtLabel}</p>
              )}
              {hotel.distanceToCityCenterKm != null && (
                <p>
                  <span className="font-medium text-[var(--ink)]">距市中心：</span>
                  约 {hotel.distanceToCityCenterKm < 1
                    ? `${Math.round(hotel.distanceToCityCenterKm * 1000)} 米`
                    : `${hotel.distanceToCityCenterKm.toFixed(1)} 公里`}
                </p>
              )}
              {hotel.locationDescription && (
                <HotelLocationDescription text={hotel.locationDescription} />
              )}
            </div>
          </div>
        )}

        {facilityGroups.length ? (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[#003b95]"><HotelFactIcon type="facility" /></span>
              <p className="text-base font-semibold">热门设施</p>
            </div>
            <div className="space-y-4">
              {facilityGroups.map(({ category, items }) => (
                <div key={category}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--stone)]">{category}</p>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                    {items.map((facility) => (
                      <span key={`${category}-${facility}`} className="flex items-center gap-2 text-sm">
                        <span className="text-emerald-700">✓</span>{facility}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !loading && !error && hotel.bookingDetailsLoaded ? (
          <p className="text-xs text-[var(--stone)]">该酒店没有返回可展示的设施信息。</p>
        ) : null}

        {reviewScores.length > 0 && (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <h4 className="text-base font-semibold">住客评分细项</h4>
            <div
              className={`mt-3 gap-x-5 gap-y-3 ${
                reviewScores.length <= 3
                  ? 'flex flex-wrap'
                  : 'grid sm:grid-cols-2'
              }`}
            >
              {reviewScores.map((item) => (
                <div key={item.label} className={reviewScores.length <= 3 ? 'min-w-[9rem] flex-1' : ''}>
                  <div className="mb-1 flex justify-between text-xs"><span>{item.label}</span><span className="font-semibold">{item.score.toFixed(1)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#dbe7f6]"><div className="h-full rounded-full bg-[#006ce4]" style={{ width: `${Math.min(100, item.score * 10)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(hotel.checkIn || hotel.checkOut || visibleLanguages.length > 0 || policies.length > 0 || paymentMethods.length > 0) && (
          <div className="rounded-2xl border border-[var(--mist)] bg-white/60 p-4">
            <div className="mb-3 flex items-center gap-2"><span className="text-[#003b95]"><HotelFactIcon type="info" /></span><h4 className="text-base font-semibold">住宿规定与实用信息</h4></div>
            <div className="divide-y divide-[var(--mist)] text-sm">
              {(hotel.checkIn || hotel.checkOut) && <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]"><span className="font-medium">入住与退房</span><span className="text-[var(--ink)]/80">{hotel.checkIn ? `${hotel.checkIn} 后入住` : ''}{hotel.checkIn && hotel.checkOut ? ' · ' : ''}{hotel.checkOut ? `${hotel.checkOut} 前退房` : ''}</span></div>}
              {visibleLanguages.length > 0 && <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]"><span className="font-medium">服务语言</span><span className="text-[var(--ink)]/80">{visibleLanguages.join('、')}</span></div>}
              {paymentMethods.length > 0 && <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]"><span className="font-medium">付款方式</span><span className="text-[var(--ink)]/80">{paymentMethods.join('、')}</span></div>}
              {visiblePolicies.length > 0 && (
                <div className="py-3">
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <span className="font-medium">重要须知</span>
                    <HotelTranslatedPolicyList
                      policies={visiblePolicies}
                      lineClampFirst={!policiesExpanded}
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
        )}

        <p className="text-[11px] leading-relaxed text-[var(--stone)]">
          房型、实时价格、早餐与取消政策会随日期变化，请通过「查看酒店」确认当前可订状态。
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
  const reviews = (hotel.reviews || []).map((review) => ({
    text: review.negativeText
      ? `${review.text}\n\n不足：${review.negativeText}`
      : review.text,
    rating: review.rating,
    author: review.author,
    relativeTime: review.relativeTime,
  }))

  return (
    <section className="rounded-2xl border border-[var(--mist)] bg-white/45 px-4 py-3.5">
      <div className="mb-3">
        <p className="text-sm font-medium">Booking.com 住客精选评论</p>
        <p className="mt-0.5 text-xs text-[var(--stone)]">
          {hotel.reviewCount
            ? `共 ${hotel.reviewCount.toLocaleString('zh-CN')} 条评价`
            : '精选住客评论'}
        </p>
      </div>
      {loading && (
        <LoadingIndicator label="正在加载精选住客评论" showDots size="sm" />
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
      {!loading && !error && reviews.length > 0 && (
        <GoogleReviewsList reviews={reviews} sourceLabel="Booking.com 精选评论" showHeader={false} />
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
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
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
    if (card.bookingDetailsLoaded && (card.bookingDetailsVersion || 0) >= 4) {
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
                facilities: details.facilities.length
                  ? details.facilities
                  : hotel.facilities,
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
                bookingDetailsVersion: 4,
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
    onDetailChange?.(popupCandidate)
  }, [popupCandidate, onDetailChange])

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
    if (!isLoaded) return
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
  }, [isLoaded, readOnly])

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
    // Already enriched on the candidate — do not call the model again.
    if ((!bypass && card.tripFit?.trim() && card.hotelAdvisorVersion === 2) || !isLlmConfigured()) return

    let cancelled = false
    setStoryLoadingId(card.id)

    const prefs = loadHotelCache()?.lastPreferences
    const tripDays = daysRef.current.map((d) => ({
      day: d.day,
      title: d.title,
      pace: d.pace,
      theme: d.theme,
    }))
    const artifactKey = `hotel-detail:v2:${card.id}`

    const runStory = async () => {
      const latest =
        pendingCustomRef.current?.id === card.id
          ? pendingCustomRef.current
          : candidatesRef.current.find((hotel) => hotel.id === card.id) || card
      let featuredReviews = (latest.reviews || []).map((review) => ({
        text: review.text,
        negativeText: review.negativeText,
        rating: review.rating,
        author: review.author,
      }))

      if (
        !featuredReviews.length &&
        !latest.bookingReviewsLoaded &&
        latest.bookingHotelId &&
        hasValidParisBookingIdentity(latest) &&
        isBookingApiEnabled()
      ) {
        try {
          const result = await fetchBookingHotelFeaturedReviews({
            id: latest.bookingHotelId,
          })
          if (cancelled) return
          featuredReviews = result.reviews.map((review) => ({
            text: review.text,
            negativeText: review.negativeText,
            rating: review.rating,
            author: review.author,
          }))
          if (featuredReviews.length) {
            const withReviews = (hotel: HotelCandidate): HotelCandidate =>
              hotel.id !== card.id
                ? hotel
                : {
                    ...hotel,
                    bookingReviewsLoaded: true,
                    reviews: featuredReviews.map((review) => ({
                      text: review.text,
                      negativeText: review.negativeText,
                      rating: review.rating,
                      author: review.author,
                    })),
                  }
            if (pendingCustomRef.current?.id === card.id) {
              setPendingCustom((current) => (current ? withReviews(current) : current))
            } else {
              const next = candidatesRef.current.map(withReviews)
              onCandidatesChange(next)
            }
          }
        } catch {
          // Continue without featured reviews.
        }
      }

      const copy = await memoizeLlmCall(
        artifactKey,
        () =>
          generateHotelDetailCopy({
            name: card.name,
            area: card.area,
            address: card.address,
            nearestMetro: card.nearestMetro,
            rating: card.rating,
            reviewCount: card.reviewCount,
            starRating: card.starRating,
            propertyType: card.propertyType,
            facilities: card.facilities,
            reviewScores: card.reviewScores,
            locationDescription: card.locationDescription,
            districtLabel: card.districtLabel,
            distanceToCityCenterKm: card.distanceToCityCenterKm,
            featuredReviews,
            existingReason: card.reason,
            isBest: card.isBest,
            userPreferences: prefs,
            tripDays,
          }),
        { durable: true, bypass },
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
        if (!cancelled) setStoryLoadingId((id) => (id === card.id ? null : id))
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupCandidate?.id, hotelStoryRegenToken])

  useEffect(() => {
    setHotelStoryRegenToken(0)
  }, [popupCandidate?.id])

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
      setPendingCustom(card)
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

  const handleBookingGalleryAdvance = useCallback(() => {
    const card = popupCandidateRef.current
    if (card && hasValidParisBookingIdentity(card)) {
      loadHotelPhotos(card)
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
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
      pendingPointerRef.current = null
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

  useLayoutEffect(() => {
    if (!drag || dropping) return
    applyFloatPos(floatRef.current.x, floatRef.current.y)
  }, [drag?.hotelId, dropping])

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
                  <HotelCardFace hotel={selectedCandidate} />
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
                  disabled={loading || !customQuery.trim() || !isLoaded || decidingCustom}
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
                      className={`group relative cursor-grab overflow-hidden rounded-2xl border bg-[var(--card)] text-left touch-none transition-[border-color,opacity,transform] duration-200 [transition-timing-function:var(--timeline-ease)] active:cursor-grabbing ${
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
                      <button
                        type="button"
                        onClick={() => {
                          if (suppressClickRef.current || dragging) return
                          openHotelCard(hotel)
                        }}
                        className="w-full cursor-grab text-left active:cursor-grabbing"
                      >
                        <HotelCardFace hotel={hotel} />
                      </button>
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
                return <HotelCardFace hotel={hotel} />
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
                reason: popupCandidate.tripFit,
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
          popupCandidate ? (
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
