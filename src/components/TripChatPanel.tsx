import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchGooglePlaceDetails,
} from '../services/googlePlaceDetails'
import {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  getActiveLlmLabel,
  isLlmConfigured,
  resolveThinkingForTask,
  type HotelDetailCopy,
} from '../services/llm'
import {
  memoizePlaceDetailCopy,
  peekPlaceDetailCopy,
  placeDetailKeysFromPlace,
} from '../services/placeDetailMemo'
import {
  persistHotelState,
  refreshHotelCandidates,
  replaceHotelCandidates,
  replaceOneHotelCandidate,
} from '../services/hotelRecommend'
import { candidateToSelected, resolveHotelCandidate } from '../services/hotelResolve'
import {
  extractQuotedPlaceNames,
  findReplaceTargetInDay,
  inferPlaceTypeFromText,
  isLivePlaceRecommendationRequest,
  isReplacePlaceIntent,
  matchHotelCandidate,
  matchPlaceInDay,
  replyClaimsDetailConfirm,
  replyClaimsItineraryApplied,
  sendTripChatMessageStream,
  stripDetailConfirmClaim,
  type TripChatAction,
  type TripChatContext,
  type TripChatDestination,
  type TripChatTurn,
  type TripChatViewingTarget,
  type TripChatRequestPlan,
  type TripChatWorkStep,
  type TripChatWebSearchDetail,
} from '../services/tripChat'
import type {
  DayPlan,
  FlightInfo,
  HotelCandidate,
  Place,
  PlaceType,
  SelectedHotel,
} from '../types'
import { useLlmBusyMode } from '../hooks/useOpenAIModel'
import { CloseIconButton } from './CloseIconButton'
import { GooglePlacePage } from './GooglePlacePage'
import { useGoogleMapsReady } from './GoogleMapsProvider'
import { ButtonSpinner, LoadingIndicator } from './LoadingIndicator'
import { LlmModelPicker } from './LlmModelPicker'

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'

// Model-picked food should remain within the Paris metro area around the stay.
// Attractions allow common day trips such as Versailles / Disneyland Paris.
const RECOMMENDED_FOOD_MAX_DISTANCE_METERS = 20_000
const RECOMMENDED_ATTRACTION_MAX_DISTANCE_METERS = 75_000

const PENDING_PLACE_LABELS = {
  title: '行程顾问点评',
  intro: '地点简介',
  reason: '为什么推荐',
  loadingText: '正在生成地点简介与推荐理由…',
}

type PendingPlaceConfirm = {
  id: string
  kind: 'add' | 'replace'
  dayNum: number
  place: Place
  /** Chat-action note for advisor context only; never use as card note if operational. */
  note?: string
  /** add only */
  mode?: 'best' | 'end'
  /** replace only */
  replaceStopId?: string
  fromPlaceName?: string
  /** Places already rejected in this confirm chain (for re-recommend). */
  rejectedNames?: string[]
  status?: 'ready' | 'rerecommending'
}

function pendingFallbackReason(pending: PendingPlaceConfirm): string {
  if (pending.kind === 'replace') {
    return `用于替换第 ${pending.dayNum} 天的「${pending.fromPlaceName || '原地点'}」`
  }
  return `计划加入第 ${pending.dayNum} 天行程`
}

/** Chat-model action.note often describes insertion logistics, not the place. */
function isOperationalStopNote(note: string | undefined | null): boolean {
  const t = String(note || '').trim()
  if (!t) return true
  if (
    /顺路插入|按行程路线|加到.*末尾|加到当天|用于替换|计划加入第|按最顺路|按当天节奏/.test(
      t,
    )
  ) {
    return true
  }
  // e.g. 「作为第1天晚餐，…插入/加入/安排」
  if (/作为第\s*\d+\s*天/.test(t) && /插入|加入|安排|替换/.test(t)) return true
  return false
}

/** Prefer traveler-facing blurbs over operational chat-action notes. */
function pickTravelerStopNote(opts: {
  storyIntro?: string | null
  placeDescription?: string | null
  actionNote?: string | null
}): string {
  const candidates = [opts.storyIntro, opts.placeDescription, opts.actionNote]
  for (const c of candidates) {
    const t = String(c || '').trim()
    if (t.length >= 8 && !isOperationalStopNote(t)) return t
  }
  for (const c of candidates) {
    const t = String(c || '').trim()
    if (t) return t
  }
  return ''
}

function placeTypeLabel(type: PlaceType): string {
  if (type === 'cafe') return '咖啡馆'
  if (type === 'restaurant') return '餐厅'
  return '景点'
}

/** Soften false “already added” copy when confirm UI is still required. */
function clarifyReplyForPending(
  reply: string,
  pending: PendingPlaceConfirm[],
): string {
  if (!pending.length) return reply
  const names = pending.map((p) => `「${p.place.name}」`).join('、')
  const confirmHint =
    pending[0].kind === 'replace'
      ? `行程尚未改动——请在详情页确认是否用${names}替换「${pending[0].fromPlaceName || '原地点'}」。`
      : `行程尚未改动——请在详情页确认是否将${names}加入行程。`
  if (replyClaimsItineraryApplied(reply) || !/详情|确认是否/.test(reply)) {
    const cleaned = reply
      .replace(
        /已(经)?(正式)?加入[了]?|已经加[入进][了]?|已加到行程[了]?|已添加到行程[了]?|已帮你加[入了]?|已经帮你加[入了]?|已(经)?替换[了]?|已经换[成好][了]?/g,
        '已为你找到候选',
      )
      .trim()
    if (!cleaned || replyClaimsItineraryApplied(cleaned)) {
      return `已为你找到${names}。${confirmHint}`
    }
    if (/详情|确认是否|尚未改动/.test(cleaned)) return cleaned
    return `${cleaned}\n\n${confirmHint}`
  }
  return reply
}

const NO_ACTION_APPLIED_NOTE =
  '这次没有可执行的操作，行程未改动。若要加地点，请再说一次（或点名具体店名）。'

const DETAIL_CONFIRM_MISSING_NOTE =
  '未能打开地点确认页：没有可用的推荐地点。请再说一次店名，或换个说法重试。'

function notesIndicateItineraryApplied(notes: string[]): boolean {
  return notes.some(
    (n) =>
      /已将|已从第|已选中|已切换到|已添加酒店|已重新推荐|已移除/.test(n) &&
      !/请在详情页确认/.test(n),
  )
}

function notesClaimDetailConfirm(notes: string[]): boolean {
  return notes.some((n) => /请在详情页确认|详情页确认是否/.test(n))
}

/** Client-side pipeline steps shown while the assistant works (Cursor-ish). */
type ChatWorkStepId =
  | 'understand'
  | 'webSearch'
  | 'generate'
  | 'parse'
  | 'resolvePlaces'
  | 'apply'

type ChatWorkStep = TripChatWorkStep & { id: ChatWorkStepId }

const CHAT_WORK_STEP_LABELS: Record<ChatWorkStepId, string> = {
  understand: '正在判断是否需要联网与思考强度',
  webSearch: '正在搜索网络',
  generate: '正在组织回复',
  parse: '正在检查行程操作',
  resolvePlaces: '正在核对地点与坐标',
  apply: '正在应用改动',
}

function initialChatWorkSteps(userText: string): ChatWorkStep[] {
  const generateLabel = isLivePlaceRecommendationRequest(userText)
    ? '正在比较候选并生成推荐'
    : CHAT_WORK_STEP_LABELS.generate
  return (['understand', 'generate', 'parse'] as const).map((id, i) => ({
    id,
    label: id === 'generate' ? generateLabel : CHAT_WORK_STEP_LABELS[id],
    status: i === 0 ? 'active' : 'pending',
  }))
}

function searchStepLabel(detail: TripChatWebSearchDetail | undefined, userText: string) {
  const source = detail?.source === 'google_places' ? 'Google Places' : '网络'
  const raw = detail?.query?.trim() || userText.trim()
  const query = raw.length > 42 ? `${raw.slice(0, 42)}…` : raw
  return query ? `正在搜索${source}：${query}` : `正在搜索${source}`
}

function requestPlanStepLabel(plan: TripChatRequestPlan) {
  const web = plan.needsWeb ? '需要联网' : '无需联网'
  const effort = plan.thinking.enabled
    ? `思考强度${plan.thinking.effort === 'low' ? '低' : plan.thinking.effort === 'high' ? '高' : '中'}`
    : '思考已关闭'
  return `已判断：${web} · ${effort}`
}

const CHAT_WORK_STEP_ORDER: ChatWorkStepId[] = [
  'understand',
  'webSearch',
  'generate',
  'parse',
  'resolvePlaces',
  'apply',
]

function activateChatWorkStep(
  steps: ChatWorkStep[],
  activeId: ChatWorkStepId,
  extras?: {
    labels?: Partial<Record<ChatWorkStepId, string>>
    insert?: ChatWorkStep[]
  },
): ChatWorkStep[] {

  let list = steps
  if (extras?.insert?.length) {
    const existing = new Set(list.map((s) => s.id))
    const toAdd = extras.insert.filter((s) => !existing.has(s.id))
    if (toAdd.length) {
      const activeOrder = CHAT_WORK_STEP_ORDER.indexOf(activeId)
      let at = list.length
      if (activeOrder >= 0) {
        const beforeIdx = list.findIndex((s) => {
          const order = CHAT_WORK_STEP_ORDER.indexOf(s.id)
          return order >= 0 && order >= activeOrder
        })
        at = beforeIdx >= 0 ? beforeIdx : list.length
      } else {
        const parseIdx = list.findIndex((s) => s.id === 'parse')
        at = parseIdx >= 0 ? parseIdx + 1 : list.length
      }
      list = [...list.slice(0, at), ...toAdd, ...list.slice(at)]
    }
  }
  const activeIdx = list.findIndex((s) => s.id === activeId)
  return list.map((s, i) => {
    const label = extras?.labels?.[s.id] ?? s.label
    if (activeIdx < 0) return { ...s, label }
    if (i < activeIdx) {
      return {
        ...s,
        label: label.replace(/^正在/, '已'),
        status: s.status === 'skipped' ? 'skipped' : 'done',
      }
    }
    if (i === activeIdx) return { ...s, label, status: 'active' }
    return {
      ...s,
      label,
      status: s.status === 'skipped' || s.status === 'done' ? s.status : 'pending',
    }
  })
}

function finishChatWorkSteps(steps: ChatWorkStep[]): ChatWorkStep[] {
  return steps.map((s) => ({
    ...s,
    label: s.label.replace(/^正在/, '已'),
    status: s.status === 'skipped' ? 'skipped' : 'done',
  }))
}

function completedWorkSummary(steps: TripChatWorkStep[]): string {
  const ids = new Set(steps.filter((step) => step.status !== 'skipped').map((step) => step.id))
  const searched = ids.has('webSearch')
  const resolvedPlace = ids.has('resolvePlaces')
  const applied = ids.has('apply')
  if (searched && resolvedPlace) return '已搜索并核对推荐地点'
  if (searched) return '已联网查询并完成回答'
  if (resolvedPlace && applied) return '已核对地点并处理行程'
  if (applied) return '已处理行程请求'
  return '已理解并完成回答'
}

function ChatWorkStepIcon({
  id,
  status,
}: {
  id: string
  status: TripChatWorkStep['status']
}) {
  const common = `h-4 w-4 ${status === 'active' ? 'animate-pulse' : ''}`
  if (id === 'understand') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 18.5 6.5 15H18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    )
  }
  if (id === 'webSearch') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
    )
  }
  if (id === 'resolvePlaces') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    )
  }
  if (id === 'apply') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
      </svg>
    )
  }
  if (id === 'parse') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 4H5v16h3M16 4h3v16h-3M10 9h4M10 13h4" />
      </svg>
    )
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z" />
      <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </svg>
  )
}

function actionsNeedPlaceLookup(actions: TripChatAction[]): boolean {
  return actions.some(
    (a) =>
      a.type === 'add_place' ||
      a.type === 'replace_place' ||
      a.type === 'add_hotel' ||
      a.type === 'refresh_hotels' ||
      a.type === 'replace_hotel' ||
      a.type === 'replace_hotels',
  )
}

function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-3.5 w-3.5 shrink-0 text-[var(--stone)]/60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--stone)]/80 ${
        open ? 'rotate-90' : ''
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 4.5 5.5 5.5L7 15.5" />
    </svg>
  )
}

function CompletedCheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  )
}

function ChatWorkStepsPanel({
  steps,
  open,
  onToggle,
  completed = false,
}: {
  steps: TripChatWorkStep[]
  open: boolean
  onToggle: () => void
  completed?: boolean
}) {
  const visible = steps.filter((s) => s.status !== 'skipped')
  if (!visible.length) return null
  const active = visible.find((s) => s.status === 'active')
  const lastDone = [...visible].reverse().find((s) => s.status === 'done')
  const summary = completed
    ? lastDone?.label || '步骤'
    : active?.label || '处理中…'
  // While working, only show the current tool/status line. Completed turns may
  // still expose their compact history on demand.
  const expandable = completed && visible.length >= 1
  const collapsedLabel = completed ? completedWorkSummary(visible) : summary
  const summaryStep = active || lastDone || visible[0]

  return (
    <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="group flex w-full items-center gap-1.5 rounded-sm text-left text-[var(--stone)]/78 outline-none transition hover:text-[var(--stone)] focus-visible:ring-1 focus-visible:ring-[var(--sage)]/25"
          aria-expanded={open}
        >
          <span className="shrink-0" aria-hidden>
            <CompletedCheckIcon />
          </span>
          <span className="min-w-0 truncate">{collapsedLabel}</span>
          <DisclosureChevron open={open} />
        </button>
      ) : (
        <p className="flex items-center gap-1.5 truncate text-[var(--stone)]/78">
          <ChatWorkStepIcon id={summaryStep.id} status={summaryStep.status} />
          <span className={`truncate ${!completed && active ? 'chat-step-shimmer' : ''}`}>
            {summary}
          </span>
        </p>
      )}
      {expandable && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <ol className="ml-[1.375rem] mt-1 space-y-0.5 border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1">
              {visible.map((step) => {
                const done = step.status === 'done'
                const activeStep = step.status === 'active'
                return (
                  <li
                    key={step.id}
                    className={`flex items-center gap-1.5 ${
                      activeStep
                        ? 'text-[var(--stone)]/90'
                        : done
                          ? 'text-[var(--stone)]/62'
                          : 'text-[var(--stone)]/45'
                    }`}
                  >
                    <span className="w-4 shrink-0" aria-hidden>
                      <ChatWorkStepIcon id={step.id} status={step.status} />
                    </span>
                    <span className="truncate">
                      {step.status === 'pending'
                        ? step.label.replace(/^正在/, '等待')
                        : step.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

function StoredChatWorkStepsPanel({ steps }: { steps: TripChatWorkStep[] }) {
  const [open, setOpen] = useState(false)
  return (
    <ChatWorkStepsPanel
      steps={steps}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      completed
    />
  )
}

function StoredChatReasoningDisclosure({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <ChatReasoningDisclosure
      text={text}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      completed
    />
  )
}

function ChatReasoningDisclosure({
  text,
  open,
  onToggle,
  completed = false,
}: {
  text: string
  open: boolean
  onToggle: () => void
  completed?: boolean
}) {
  const trimmed = text.trim()
  if (!trimmed) return null
  return (
    <div className="mb-1.5 text-xs leading-snug" aria-live="polite">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-1.5 rounded-sm text-left text-[var(--stone)]/78 outline-none transition hover:text-[var(--stone)] focus-visible:ring-1 focus-visible:ring-[var(--sage)]/25"
        aria-expanded={open}
      >
        <span className="shrink-0" aria-hidden>
          {completed ? (
            <CompletedCheckIcon />
          ) : (
            <ChatWorkStepIcon id="generate" status="active" />
          )}
        </span>
        <span className={`min-w-0 truncate ${completed ? '' : 'chat-step-shimmer'}`}>
          {completed ? '思考完成' : '思考中'}
        </span>
        <DisclosureChevron open={open} />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-[1.375rem] mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap border-l border-[var(--stone)]/25 py-0.5 pl-2.5 pr-1 text-[var(--stone)]/68">
            {trimmed}
          </div>
        </div>
      </div>
    </div>
  )
}

function buildRerecommendMessage(rejected: PendingPlaceConfirm, excluded: string[]): string {
  const excludeText = excluded.map((n) => `「${n}」`).join('、')
  if (rejected.kind === 'replace') {
    return [
      `刚才推荐的「${rejected.place.name}」我不想用。`,
      `请再推荐另一个不同的地点，用来替换第 ${rejected.dayNum} 天的「${rejected.fromPlaceName}」。`,
      `绝对不要再推荐：${excludeText}。`,
      `请直接输出 replace_place（fromPlaceName 仍为「${rejected.fromPlaceName}」，source 必须为 "recommend"）。`,
    ].join('')
  }
  const typeLabel = placeTypeLabel(rejected.place.type)
  const modeHint = rejected.mode === 'end' ? '加到当天末尾' : '按最顺路插入'
  return [
    `刚才推荐的「${rejected.place.name}」我不喜欢。`,
    `请再推荐另一家${typeLabel}加入第 ${rejected.dayNum} 天（${modeHint}）。`,
    `绝对不要再推荐：${excludeText}。`,
    '请直接输出 add_place（source 必须为 "recommend"）。',
  ].join('')
}

export interface TripChatHandlers {
  switchDay: (day: number) => void
  selectPlace: (placeId: string) => void
  removeStop: (day: number, stopId: string) => void
  addPlace: (
    day: number,
    place: Place,
    options?: { mode?: 'best' | 'end'; insertAt?: number; select?: boolean },
  ) => void
  replaceStop: (
    day: number,
    stopId: string,
    place: Place,
    options?: { select?: boolean },
  ) => void
  reorderStop: (day: number, from: number, to: number) => void
  setHotel: (hotel: SelectedHotel) => void
  setHotelCandidates: (candidates: HotelCandidate[]) => void
}

/**
 * Chat chrome above PlacePanel/hotel detail (2000), below AddPlaceDialog (2100)
 * and pending confirm GooglePlacePage (2300+/2500).
 */
const TRIP_CHAT_FAB_Z = 2050
const TRIP_CHAT_BACKDROP_Z = 2040
const TRIP_CHAT_PANEL_Z = 2045

function ChatBubbleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 8.5h9M7.5 12h5.5" />
      <path d="M6 18.5 7.5 15H18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

interface Props {
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  days: DayPlan[]
  currentDay: number
  customPlaces: Record<string, Place>
  /** Destination from DestinationPanel / trip meta (string or structured). */
  destination?: TripChatDestination | string | null
  /** Optional free-text preferences when collected by the app. */
  preferences?: string | null
  tripStartDate?: string | null
  tripEndDate?: string | null
  itineraryStartDate?: string | null
  outbound?: FlightInfo | null
  returnFlight?: FlightInfo | null
  /** Open PlacePanel / hotel detail the user is viewing (for 「这个怎么样」). */
  viewing?: TripChatViewingTarget | null
  handlers: TripChatHandlers
}

const SUGGESTIONS = [
  '介绍一下当前选中的酒店',
  '按左岸、中档重新推荐一批酒店',
  '介绍一下今天行程里的第一个地点',
  '帮我在今天加上一家附近的咖啡馆',
  '把凯旋门从行程里删掉',
]

export function TripChatPanel({
  hotel,
  hotelCandidates,
  days,
  currentDay,
  customPlaces,
  destination = null,
  preferences = null,
  tripStartDate = null,
  tripEndDate = null,
  itineraryStartDate = null,
  outbound = null,
  returnFlight = null,
  viewing = null,
  handlers,
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamingReply, setStreamingReply] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<TripChatTurn[]>([])
  const [actionNotes, setActionNotes] = useState<string[]>([])
  const [panelMounted, setPanelMounted] = useState(false)
  const [panelEntered, setPanelEntered] = useState(false)
  const [pendingPlaces, setPendingPlaces] = useState<PendingPlaceConfirm[]>([])
  /** Bumps GooglePlacePage remount when confirm overlay must be forced visible. */
  const [confirmEpoch, setConfirmEpoch] = useState(0)
  const [pendingStory, setPendingStory] = useState<HotelDetailCopy | null>(null)
  const [pendingStoryLoading, setPendingStoryLoading] = useState(false)
  const [pendingStoryRegenToken, setPendingStoryRegenToken] = useState(0)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [busyUserText, setBusyUserText] = useState('')
  const [workSteps, setWorkSteps] = useState<ChatWorkStep[]>([])
  const [workStepsOpen, setWorkStepsOpen] = useState(false)
  const [reasoningText, setReasoningText] = useState('')
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [showReasoningUi, setShowReasoningUi] = useState(false)
  const [requestThinkingEnabled, setRequestThinkingEnabled] = useState<boolean | undefined>(
    undefined,
  )
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const wasOpenRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const workStepsRef = useRef<ChatWorkStep[]>([])
  const reasoningTextRef = useRef('')
  const chatBusy = useLlmBusyMode({
    task: 'tripChat',
    userText: busyUserText || input,
    thinkingEnabled: requestThinkingEnabled,
  })
  // Snapshot day/hotel context so itinerary edits don't re-fire LLM mid-confirm.
  const pendingCtxRef = useRef({ hotel, days })
  pendingCtxRef.current = { hotel, days }
  workStepsRef.current = workSteps
  reasoningTextRef.current = reasoningText

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function beginChatRequest(): AbortController {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    return ac
  }

  function buildChatContext(): TripChatContext {
    return {
      hotel,
      hotelCandidates,
      days,
      currentDay,
      customPlaces,
      destination,
      preferences,
      tripStartDate,
      tripEndDate,
      itineraryStartDate,
      outbound,
      returnFlight,
      viewing,
    }
  }

  function isAbortError(err: unknown): boolean {
    return (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    )
  }

  function updateLastAssistantContent(content: string) {
    setHistory((prev) => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      if (last.content === content) return prev
      return [...prev.slice(0, -1), { ...last, content }]
    })
  }

  const activePending = pendingPlaces[0] ?? null

  // If pending exists but the portaled detail page never painted, force remount.
  useEffect(() => {
    if (!pendingPlaces.length) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const visible = document.querySelector('[data-pending-place-confirm="1"]')
      if (!visible) {
        setOpen(false)
        setConfirmEpoch((e) => e + 1)
      }
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [pendingPlaces, confirmEpoch])

  // Generate intro + 推荐理由 when pending confirm opens (same memo as PlacePanel).
  useEffect(() => {
    if (!activePending) {
      setPendingStory(null)
      setPendingStoryLoading(false)
      return
    }

    const pending = activePending
    const place = pending.place
    const fallbackReason = pendingFallbackReason(pending)
    const stopNote =
      pending.note ||
      (pending.kind === 'replace'
        ? `用于替换「${pending.fromPlaceName || '原地点'}」`
        : '')
    const detailKeys = placeDetailKeysFromPlace(place)
    const bypass = pendingStoryRegenToken > 0
    if (!bypass) {
      const memoHit = peekPlaceDetailCopy(...detailKeys)
      if (memoHit) {
        setPendingStory({ ...memoHit, tripFit: '' })
        setPendingStoryLoading(false)
        return
      }
    }

    if (!isLlmConfigured()) {
      setPendingStory({
        intro: place.description,
        reason: fallbackReason,
        tripFit: '',
      })
      setPendingStoryLoading(false)
      return
    }

    let cancelled = false
    setPendingStory({ intro: '', reason: '', tripFit: '' })
    setPendingStoryLoading(true)

    const ctx = pendingCtxRef.current
    const day = ctx.days.find((d) => d.day === pending.dayNum)

    void memoizePlaceDetailCopy(
      detailKeys,
      () =>
        generatePlaceDetailCopy({
          name: place.name,
          nameLocal: place.nameLocal,
          type: place.type,
          existingDescription: place.description,
          stopNote,
          day: pending.dayNum,
          dayTitle: day?.title,
          dayTheme: day?.theme,
          dayPace: day?.pace,
          hotelArea: ctx.hotel.areaKey,
          tripDays: ctx.days.map((d) => ({
            day: d.day,
            title: d.title,
            pace: d.pace,
            theme: d.theme,
          })),
          onPartial: (partial) => {
            if (cancelled) return
            setPendingStory((prev) => ({
              intro: partial.intro ?? prev?.intro ?? '',
              reason: partial.reason ?? prev?.reason ?? '',
              tripFit: '',
            }))
          },
        }).then((copy) => {
          if (!copy) {
            return {
              intro: place.description,
              reason: fallbackReason,
              tripFit: '',
            }
          }
          return { ...copy, tripFit: '' }
        }),
      { bypass },
    )
      .then((copy) => {
        if (cancelled || !copy) return
        setPendingStory(copy)
      })
      .finally(() => {
        if (!cancelled) setPendingStoryLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Only re-run when the pending confirm target changes or user regenerates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePending?.id, pendingStoryRegenToken])

  useEffect(() => {
    setPendingStoryRegenToken(0)
  }, [activePending?.id])

  // Keep the panel mounted through the close animation so exit can play.
  useEffect(() => {
    if (open) {
      setPanelMounted(true)
      return
    }
    setPanelEntered(false)
  }, [open])

  useEffect(() => {
    if (!panelMounted || !open) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [panelMounted, open])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    // Jump instantly when opening so we don't animate through the whole history.
    const behavior: ScrollBehavior = wasOpenRef.current ? 'smooth' : 'auto'
    wasOpenRef.current = true
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [history, actionNotes, busy, streamingReply, workSteps, reasoningText, open])

  function beginWorkPipeline(userText: string) {
    setWorkSteps(initialChatWorkSteps(userText))
    setWorkStepsOpen(false)
    setReasoningText('')
    setReasoningOpen(false)
    // The preflight classifier itself runs without thinking. Its result will
    // update this before the answer model starts.
    setRequestThinkingEnabled(false)
    setShowReasoningUi(false)
  }

  function clearWorkPipeline() {
    setWorkSteps([])
    setWorkStepsOpen(false)
    setReasoningText('')
    setShowReasoningUi(false)
    setReasoningOpen(false)
    setRequestThinkingEnabled(undefined)
  }

  function persistWorkOnLastAssistant(
    steps: ChatWorkStep[],
    reasoning: string,
    content?: string,
  ) {
    const finished = finishChatWorkSteps(steps)
    const reasoningTrimmed = reasoning.trim()
    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          ...(content !== undefined ? { content } : {}),
          steps: finished,
          ...(reasoningTrimmed ? { reasoning: reasoningTrimmed } : {}),
        },
      ]
    })
    clearWorkPipeline()
  }

  async function buildPlaceFromQuery(input: {
    placeName: string
    placeType?: PlaceType
    source?: 'explicit' | 'recommend'
    /** Optional chat-action note — only used when traveler-facing, never operational. */
    note?: string
    dayNum: number
  }): Promise<Place> {
    if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试添加地点。')

    const placeType: PlaceType = input.placeType || 'attraction'
    const hotelLocation =
      Number.isFinite(hotel.lat) &&
      Number.isFinite(hotel.lng) &&
      Math.abs(hotel.lat) <= 90 &&
      Math.abs(hotel.lng) <= 180 &&
      (hotel.lat !== 0 || hotel.lng !== 0)
        ? { lat: hotel.lat, lng: hotel.lng }
        : undefined
    const maxDistanceMeters =
      input.source === 'recommend' && hotelLocation
        ? placeType === 'restaurant' || placeType === 'cafe'
          ? RECOMMENDED_FOOD_MAX_DISTANCE_METERS
          : RECOMMENDED_ATTRACTION_MAX_DISTANCE_METERS
        : undefined
    const details = await fetchGooglePlaceDetails(
      `${input.placeName} Paris`,
      hotelLocation,
      { maxDistanceMeters },
    )
    if (!details?.location) {
      if (maxDistanceMeters) {
        throw new Error(
          `没有在当前住宿附近验证到「${input.placeName}」，已取消操作，避免误选外地同名地点。`,
        )
      }
      throw new Error(`找不到地点「${input.placeName}」，请换个更完整的名称。`)
    }

    // Never seed place.description from operational action.note
    // (e.g. 「作为第1天晚餐，按行程路线顺路插入。」) — that becomes the DayTimeline card.
    const travelerNote = !isOperationalStopNote(input.note) ? input.note?.trim() : undefined
    const hasUsefulNote = Boolean(travelerNote && travelerNote.length >= 12)
    let description =
      (hasUsefulNote ? travelerNote : undefined) ||
      details.summary ||
      `${details.name}，适合安排进第 ${input.dayNum} 天行程。`

    if (isLlmConfigured() && !hasUsefulNote) {
      const blurb = await generatePlaceDescription({
        name: details.name,
        type: placeType,
        address: details.address,
        googleSummary: details.summary,
      })
      if (blurb) description = blurb
    }

    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: details.name,
      type: placeType,
      description,
      ratingHint: details.rating ? `Google ${details.rating}` : 'Google 地点',
      image: details.photos[0] || FALLBACK_IMAGE,
      location: details.location,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.name + ' Paris')}`,
      durationHint: placeType === 'cafe' ? '45 分钟' : '90 分钟',
    }
  }

  async function resolveAddHotel(
    action: Extract<TripChatAction, { type: 'add_hotel' }>,
    workingCandidates: HotelCandidate[],
    workingHotel: SelectedHotel,
  ): Promise<{ note: string; candidates: HotelCandidate[]; hotel: SelectedHotel }> {
    if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试添加酒店。')

    const existing = matchHotelCandidate(workingCandidates, action.hotelName)
    if (existing) {
      const selectedHotel = candidateToSelected(existing)
      if (action.select !== false) {
        handlers.setHotel(selectedHotel)
        persistHotelState(workingCandidates, selectedHotel)
        return {
          note: `候选项里已有「${existing.name}」，已设为当前酒店`,
          candidates: workingCandidates,
          hotel: selectedHotel,
        }
      }
      return {
        note: `候选项里已有「${existing.name}」`,
        candidates: workingCandidates,
        hotel: workingHotel,
      }
    }

    const card = await resolveHotelCandidate({
      name: action.hotelName,
      source: 'custom',
    })
    const next = [card, ...workingCandidates]
    handlers.setHotelCandidates(next)
    const selectedHotel = candidateToSelected(card)
    if (action.select !== false) {
      handlers.setHotel(selectedHotel)
      persistHotelState(next, selectedHotel)
      return {
        note: `已添加酒店「${card.name}」并设为当前住宿`,
        candidates: next,
        hotel: selectedHotel,
      }
    }
    persistHotelState(next, workingHotel)
    return {
      note: `已添加酒店候选项「${card.name}」`,
      candidates: next,
      hotel: workingHotel,
    }
  }

  async function resolveAddPlace(
    action: Extract<TripChatAction, { type: 'add_place' }>,
    rejectedNames?: string[],
  ): Promise<{
    note: string
    pending?: PendingPlaceConfirm
    /** Set when applied immediately (explicit). */
    appliedPlace?: Place
  }> {
    const dayNum = action.day || currentDay
    const place = await buildPlaceFromQuery({
      placeName: action.placeName,
      placeType: action.placeType,
      source: action.source,
      note: action.note,
      dayNum,
    })
    const mode = action.mode === 'end' ? 'end' : 'best'
    // Re-recommend chains always confirm; otherwise only model picks need confirm.
    const needsConfirm = action.source !== 'explicit' || Boolean(rejectedNames?.length)

    // User named the place → apply now; model recommendation → confirm UI.
    if (!needsConfirm) {
      handlers.addPlace(dayNum, place, { mode, select: false })
      return {
        note:
          mode === 'end'
            ? `已将「${place.name}」加到第 ${dayNum} 天末尾`
            : `已将「${place.name}」按最顺路插入第 ${dayNum} 天`,
        appliedPlace: place,
      }
    }

    return {
      note: `已找到「${place.name}」，请在详情页确认是否加入第 ${dayNum} 天`,
      pending: {
        id: `add-${place.id}`,
        kind: 'add',
        dayNum,
        place,
        note: action.note,
        mode,
        rejectedNames,
        status: 'ready',
      },
    }
  }

  async function resolveReplacePlace(
    action: Extract<TripChatAction, { type: 'replace_place' }>,
    workingDays: DayPlan[],
    activeDay: number,
    rejectedNames?: string[],
    userMessage?: string,
  ): Promise<{
    note: string
    pending?: PendingPlaceConfirm
    /** Updated local day snapshot when applied immediately. */
    nextDays?: DayPlan[]
  }> {
    const dayNum = action.day || activeDay
    const day = workingDays.find((d) => d.day === dayNum)
    if (!day) throw new Error(`没有第 ${dayNum} 天`)

    const hit =
      (action.fromPlaceName
        ? matchPlaceInDay(day, customPlaces, action.fromPlaceName)
        : null) ||
      findReplaceTargetInDay(day, customPlaces, {
        fromPlaceName: action.fromPlaceName,
        placeType: action.placeType,
        userMessage,
        excludePlaceName: action.toPlaceName,
      })
    if (!hit) {
      const label = action.fromPlaceName?.trim() || action.placeType || '地点'
      throw new Error(`第 ${dayNum} 天没有可替换的「${label}」`)
    }

    const place = await buildPlaceFromQuery({
      placeName: action.toPlaceName,
      placeType: action.placeType || hit.place.type,
      source: action.source,
      note: action.note,
      dayNum,
    })

    if (action.source === 'explicit' && !rejectedNames?.length) {
      handlers.replaceStop(dayNum, hit.stopId, place, { select: false })
      const nextDays = workingDays.map((d) => {
        if (d.day !== dayNum) return d
        const stops = [...d.stops]
        stops[hit.stopIndex] = {
          ...stops[hit.stopIndex],
          id: `d${dayNum}-${place.id}-${hit.stopIndex}`,
          placeId: place.id,
          note: place.description,
          duration: place.durationHint || stops[hit.stopIndex].duration,
        }
        return { ...d, stops }
      })
      return {
        note: `已将第 ${dayNum} 天的「${hit.place.name}」替换为「${place.name}」`,
        nextDays,
      }
    }

    return {
      note: `已找到「${place.name}」，请在详情页确认是否替换「${hit.place.name}」`,
      pending: {
        id: `replace-${hit.stopId}-${place.id}`,
        kind: 'replace',
        dayNum,
        place,
        note: action.note,
        replaceStopId: hit.stopId,
        fromPlaceName: hit.place.name,
        rejectedNames,
        status: 'ready',
      },
    }
  }

  /**
   * Enqueue recommend confirms. Detail uses createPortal(document.body) + inline
   * z-index; still close the chat sheet on mobile so it cannot trap focus.
   */
  function enqueuePendingPlaces(next: PendingPlaceConfirm[]) {
    if (!next.length) return
    setOpen(false)
    setPendingPlaces((prev) => [...prev, ...next])
    setConfirmEpoch((e) => e + 1)
  }

  /** When the model claims a detail confirm but apply produced none, rebuild pending. */
  async function recoverPendingConfirm(input: {
    reply: string
    actions: TripChatAction[]
    userMessage: string
    rejectedNames?: string[]
  }): Promise<PendingPlaceConfirm | null> {
    const { reply, actions, userMessage, rejectedNames } = input
    const workingDays = days.map((d) => ({ ...d, stops: [...d.stops] }))
    const placeActions = actions.filter(
      (a): a is Extract<TripChatAction, { type: 'add_place' | 'replace_place' }> =>
        a.type === 'add_place' || a.type === 'replace_place',
    )

    for (const action of placeActions) {
      try {
        if (action.type === 'replace_place') {
          const result = await resolveReplacePlace(
            { ...action, source: 'recommend' },
            workingDays,
            currentDay,
            rejectedNames,
            userMessage,
          )
          if (result.pending) return result.pending
        } else {
          const result = await resolveAddPlace(
            { ...action, source: 'recommend' },
            rejectedNames,
          )
          if (result.pending) return result.pending
        }
      } catch {
        /* try next candidate */
      }
    }

    const names = extractQuotedPlaceNames(reply)
    const replaceIntent = isReplacePlaceIntent(userMessage)
    const placeType =
      inferPlaceTypeFromText(userMessage) || inferPlaceTypeFromText(reply) || undefined

    for (const name of names) {
      try {
        if (replaceIntent) {
          const result = await resolveReplacePlace(
            {
              type: 'replace_place',
              toPlaceName: name,
              placeType,
              source: 'recommend',
            },
            workingDays,
            currentDay,
            rejectedNames,
            userMessage,
          )
          if (result.pending) return result.pending
        } else {
          const result = await resolveAddPlace(
            {
              type: 'add_place',
              placeName: name,
              placeType,
              mode: 'best',
              source: 'recommend',
            },
            rejectedNames,
          )
          if (result.pending) return result.pending
        }
      } catch {
        /* try next quoted name */
      }
    }
    return null
  }

  /**
   * Guarantee: if reply/notes say「请在详情页确认」, either pending opens or we
   * surface a hard error (never a dangling confirm promise).
   */
  async function ensurePendingFromTurn(input: {
    reply: string
    actions: TripChatAction[]
    userMessage: string
    notes: string[]
    pending: PendingPlaceConfirm[]
    rejectedNames?: string[]
  }): Promise<{ reply: string; notes: string[]; pending: PendingPlaceConfirm[] }> {
    let { reply, notes, pending } = input
    if (pending.length) {
      return {
        reply: clarifyReplyForPending(reply, pending),
        notes,
        pending,
      }
    }

    const wantsConfirm =
      replyClaimsDetailConfirm(reply) || notesClaimDetailConfirm(notes)
    if (!wantsConfirm) {
      return { reply, notes, pending }
    }

    // Model said confirm but apply already mutated — strip the false confirm claim.
    if (notesIndicateItineraryApplied(notes)) {
      return {
        reply: stripDetailConfirmClaim(reply) || reply,
        notes,
        pending: [],
      }
    }

    const recovered = await recoverPendingConfirm({
      reply,
      actions: input.actions,
      userMessage: input.userMessage,
      rejectedNames: input.rejectedNames,
    })
    if (recovered) {
      const confirmNote =
        recovered.kind === 'replace'
          ? `已找到「${recovered.place.name}」，请在详情页确认是否替换「${recovered.fromPlaceName || '原地点'}」`
          : `已找到「${recovered.place.name}」，请在详情页确认是否加入第 ${recovered.dayNum} 天`
      return {
        reply: clarifyReplyForPending(reply, [recovered]),
        notes: [...notes.filter((n) => !/请在详情页确认/.test(n)), confirmNote],
        pending: [recovered],
      }
    }

    const cleaned = stripDetailConfirmClaim(reply)
    const keepNotes = notes.filter((n) => !/请在详情页确认/.test(n))
    return {
      reply: cleaned
        ? `${cleaned}\n\n（${DETAIL_CONFIRM_MISSING_NOTE}）`
        : DETAIL_CONFIRM_MISSING_NOTE,
      notes: [...keepNotes, DETAIL_CONFIRM_MISSING_NOTE],
      pending: [],
    }
  }

  /** Backdrop / Esc: cancel without asking the model again. */
  function cancelPending(rejected: PendingPlaceConfirm) {
    if (rejected.status === 'rerecommending') return
    setPendingPlaces((prev) => prev.filter((p) => p.id !== rejected.id))
    setActionNotes((prev) => [...prev, `已取消「${rejected.place.name}」。`])
  }

  function confirmPending(pending: PendingPlaceConfirm) {
    if (confirmBusy || pending.status === 'rerecommending') return
    setConfirmBusy(true)
    // Close detail immediately before applying the itinerary mutation.
    setPendingPlaces((prev) => prev.filter((p) => p.id !== pending.id))
    try {
      // Prefer advisor intro / place blurb; never persist operational action.note on the card.
      const description =
        pickTravelerStopNote({
          storyIntro: pendingStory?.intro,
          placeDescription: pending.place.description,
          actionNote: pending.note,
        }) || pending.place.description
      const place =
        description !== pending.place.description
          ? { ...pending.place, description }
          : pending.place

      if (pending.kind === 'replace') {
        if (!pending.replaceStopId) {
          setActionNotes((prev) => [
            ...prev,
            `无法替换「${pending.fromPlaceName || '原地点'}」：缺少行程停点信息，请再说一次。`,
          ])
          return
        }
        handlers.replaceStop(pending.dayNum, pending.replaceStopId, place, {
          select: false,
        })
        setActionNotes((prev) => [
          ...prev,
          `已将第 ${pending.dayNum} 天的「${pending.fromPlaceName || '原地点'}」替换为「${place.name}」`,
        ])
        return
      }

      const mode = pending.mode === 'end' ? 'end' : 'best'
      // select: false — same as AddPlaceDialog; avoid reopening PlacePanel overlay.
      handlers.addPlace(pending.dayNum, place, { mode, select: false })
      setActionNotes((prev) => [
        ...prev,
        mode === 'end'
          ? `已将「${place.name}」加到第 ${pending.dayNum} 天末尾`
          : `已将「${place.name}」按最顺路插入第 ${pending.dayNum} 天`,
      ])
    } finally {
      setConfirmBusy(false)
    }
  }

  async function rerecommendPending(rejected: PendingPlaceConfirm) {
    if (busy || confirmBusy || rejected.status === 'rerecommending') return
    if (!isLlmConfigured()) {
      setError('对话助手暂不可用，请稍后再试。')
      return
    }

    const excluded = [...(rejected.rejectedNames || []), rejected.place.name]
    const message = buildRerecommendMessage(rejected, excluded)

    setConfirmBusy(true)
    setPendingPlaces((prev) =>
      prev.map((p) => (p.id === rejected.id ? { ...p, status: 'rerecommending' } : p)),
    )
    setError(null)
    // Keep exclusion prompt in API history only — never as a visible user bubble.
    setBusyUserText(message)
    beginWorkPipeline(message)
    setHistory((prev) => [
      ...prev,
      { role: 'user', content: message, hidden: true },
      { role: 'assistant', content: '' },
    ])
    setActionNotes(['正在重新推荐…'])
    setBusy(true)
    setStreamingReply(false)
    const ac = beginChatRequest()

    try {
      const result = await sendTripChatMessageStream({
        ctx: buildChatContext(),
        history,
        userMessage: message,
        signal: ac.signal,
        onRequestPlan: (phase, plan) => {
          if (abortRef.current !== ac || phase !== 'done' || !plan) return
          setRequestThinkingEnabled(plan.thinking.enabled)
          setShowReasoningUi(plan.thinking.enabled)
          setWorkSteps((prev) =>
            prev.map((step) =>
              step.id === 'understand'
                ? { ...step, label: requestPlanStepLabel(plan) }
                : step,
            ),
          )
        },
        onWebSearch: (phase, detail) => {
          if (abortRef.current !== ac) return
          if (phase === 'start') {
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'webSearch', {
                labels: {
                  webSearch: searchStepLabel(detail, message),
                },
                insert: [
                  {
                    id: 'webSearch',
                    label: searchStepLabel(detail, message),
                    status: 'pending',
                  },
                ],
              }),
            )
            return
          }
          if (phase === 'done') {
            setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
            return
          }
          if (phase === 'skip') {
            setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
          }
        },
        onReplyDelta: (reply) => {
          setStreamingReply(true)
          setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
          updateLastAssistantContent(reply)
        },
        onReasoningDelta: (_delta, full) => {
          if (!resolveThinkingForTask('tripChat', message).enabled) return
          setShowReasoningUi(true)
          setReasoningText(full)
        },
      })
      if (abortRef.current !== ac) return
      setStreamingReply(false)
      setWorkSteps((prev) => activateChatWorkStep(prev, 'parse'))

      let notes: string[] = []
      let pending: PendingPlaceConfirm[] = []
      if (result.actions.length) {
        const applied = await applyActions(result.actions, {
          rejectedNames: excluded,
          userMessage: message,
          onProgress: (phase, detail) => {
            if (phase === 'resolvePlaces') {
              setWorkSteps((prev) =>
                activateChatWorkStep(prev, 'resolvePlaces', {
                  labels: {
                    resolvePlaces: detail?.label || CHAT_WORK_STEP_LABELS.resolvePlaces,
                  },
                  insert: [
                    {
                      id: 'resolvePlaces',
                      label: detail?.label || CHAT_WORK_STEP_LABELS.resolvePlaces,
                      status: 'pending',
                    },
                    {
                      id: 'apply',
                      label: '打开确认页…',
                      status: 'pending',
                    },
                  ],
                }),
              )
              return
            }
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'apply', {
                insert: [
                  {
                    id: 'apply',
                    label: detail?.pending ? '打开确认页…' : '应用改动…',
                    status: 'pending',
                  },
                ],
                labels: {
                  apply: detail?.pending ? '打开确认页…' : '应用改动…',
                },
              }),
            )
          },
        })
        notes = applied.notes
        pending = applied.pending
      }

      if (abortRef.current !== ac) return

      const ensured = await ensurePendingFromTurn({
        reply: result.reply,
        actions: result.actions,
        userMessage: message,
        notes,
        pending,
        rejectedNames: excluded,
      })
      if (abortRef.current !== ac) return

      notes = ensured.notes
      pending = ensured.pending
      const displayReply = ensured.reply
      setActionNotes(
        notes.length
          ? notes
          : pending.length
            ? []
            : ['没有拿到新的地点推荐，请再说一下你想要的风格或区域。'],
      )
      setPendingPlaces((prev) => {
        const rest = prev.filter((p) => p.id !== rejected.id)
        return pending.length ? [...rest, ...pending] : rest
      })
      if (pending.length) {
        setConfirmEpoch((e) => e + 1)
        setOpen(false)
      } else {
        setOpen(true)
      }
      persistWorkOnLastAssistant(
        workStepsRef.current,
        reasoningTextRef.current,
        displayReply,
      )
    } catch (err) {
      if (isAbortError(err) || abortRef.current !== ac) return
      setPendingPlaces((prev) =>
        prev.map((p) => (p.id === rejected.id ? { ...p, status: 'ready' } : p)),
      )
      setHistory((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content.trim()) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `${last.content.trim()}\n\n（重新推荐中断：${
                err instanceof Error ? err.message : '请稍后再试'
              }）`,
            },
          ]
        }
        return prev.filter((t, i) => !(i === prev.length - 1 && t.role === 'assistant' && !t.content))
      })
      setError(err instanceof Error ? err.message : '重新推荐失败，请稍后再试。')
      setOpen(true)
      clearWorkPipeline()
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null
        setBusy(false)
        setStreamingReply(false)
        setBusyUserText('')
        setConfirmBusy(false)
      }
    }
  }

  async function applyActions(
    actions: TripChatAction[],
    options?: {
      rejectedNames?: string[]
      userMessage?: string
      onProgress?: (
        phase: 'resolvePlaces' | 'apply',
        detail?: { pending?: boolean; label?: string },
      ) => void
    },
  ): Promise<{ notes: string[]; pending: PendingPlaceConfirm[] }> {
    const notes: string[] = []
    const pendingBatch: PendingPlaceConfirm[] = []
    const rejectedNames = options?.rejectedNames
    const userMessage = options?.userMessage || ''
    const replaceIntent = Boolean(userMessage) && isReplacePlaceIntent(userMessage)
    let workingDays = days.map((d) => ({ ...d, stops: [...d.stops] }))
    let workingCandidates = [...hotelCandidates]
    let workingHotel = hotel
    let activeDay = currentDay
    const needLookup = actionsNeedPlaceLookup(actions)
    if (needLookup) {
      const names = actions
        .flatMap((action) => {
          if (action.type === 'add_place') return [action.placeName]
          if (action.type === 'replace_place') return [action.toPlaceName]
          if (action.type === 'add_hotel') return [action.hotelName]
          if (action.type === 'replace_hotel') return action.toHotelName ? [action.toHotelName] : []
          return []
        })
        .filter(Boolean)
      const compactNames = [...new Set(names)].slice(0, 2).join('、')
      options?.onProgress?.('resolvePlaces', {
        label: compactNames
          ? `正在核对地点：${compactNames}`
          : CHAT_WORK_STEP_LABELS.resolvePlaces,
      })
    } else {
      options?.onProgress?.('apply', { pending: false })
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      try {
        if (action.type === 'switch_day') {
          activeDay = action.day
          handlers.switchDay(action.day)
          notes.push(`已切换到第 ${action.day} 天`)
          continue
        }

        if (action.type === 'select_place') {
          const day = workingDays.find((d) => d.day === activeDay) || workingDays[0]
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(
              `当前第 ${activeDay} 天没有「${action.placeName}」。若要改其它天，请明确说「第N天」。`,
            )
            continue
          }
          handlers.selectPlace(hit.placeId)
          notes.push(`已选中「${hit.place.name}」`)
          continue
        }

        if (action.type === 'remove_place') {
          const dayNum = action.day || activeDay
          const next = actions[i + 1]
          // Coalesce remove+add into replace. Explicit add → apply now; recommend → confirm.
          if (
            next?.type === 'add_place' &&
            (next.day || activeDay) === dayNum
          ) {
            const result = await resolveReplacePlace(
              {
                type: 'replace_place',
                day: dayNum,
                fromPlaceName: action.placeName,
                toPlaceName: next.placeName,
                placeType: next.placeType,
                note: next.note,
                source: next.source === 'explicit' ? 'explicit' : 'recommend',
              },
              workingDays,
              activeDay,
              rejectedNames,
              userMessage,
            )
            if (result.nextDays) workingDays = result.nextDays
            if (result.pending) pendingBatch.push(result.pending)
            notes.push(result.note)
            i += 1
            continue
          }

          const day = workingDays.find((d) => d.day === dayNum)
          if (!day) {
            notes.push(`没有第 ${dayNum} 天`)
            continue
          }
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(`第 ${dayNum} 天没有「${action.placeName}」`)
            continue
          }
          handlers.removeStop(dayNum, hit.stopId)
          workingDays = workingDays.map((d) =>
            d.day === dayNum
              ? { ...d, stops: d.stops.filter((_, stopIdx) => stopIdx !== hit.stopIndex) }
              : d,
          )
          notes.push(`已从第 ${dayNum} 天移除「${hit.place.name}」`)
          continue
        }

        if (action.type === 'replace_place') {
          const result = await resolveReplacePlace(
            action,
            workingDays,
            activeDay,
            rejectedNames,
            userMessage,
          )
          if (result.nextDays) workingDays = result.nextDays
          if (result.pending) pendingBatch.push(result.pending)
          notes.push(result.note)
          continue
        }

        if (action.type === 'reorder_place') {
          const dayNum = action.day || activeDay
          const day = workingDays.find((d) => d.day === dayNum)
          if (!day) {
            notes.push(`没有第 ${dayNum} 天`)
            continue
          }
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(`第 ${dayNum} 天没有「${action.placeName}」`)
            continue
          }
          const to = Math.min(action.toIndex, Math.max(0, day.stops.length - 1))
          handlers.reorderStop(dayNum, hit.stopIndex, to)
          notes.push(`已将「${hit.place.name}」调整到第 ${dayNum} 天第 ${to + 1} 位`)
          continue
        }

        if (action.type === 'add_place') {
          const dayNum = action.day || activeDay
          // 「换一家」often arrives as add_place — coerce to in-place replace.
          if (replaceIntent) {
            const day = workingDays.find((d) => d.day === dayNum)
            const target = day
              ? findReplaceTargetInDay(day, customPlaces, {
                  placeType: action.placeType,
                  userMessage,
                  excludePlaceName: action.placeName,
                })
              : null
            if (target) {
              const result = await resolveReplacePlace(
                {
                  type: 'replace_place',
                  day: dayNum,
                  fromPlaceName: target.place.name,
                  toPlaceName: action.placeName,
                  placeType: action.placeType || target.place.type,
                  note: action.note,
                  source: action.source === 'explicit' ? 'explicit' : 'recommend',
                },
                workingDays,
                activeDay,
                rejectedNames,
                userMessage,
              )
              if (result.nextDays) workingDays = result.nextDays
              if (result.pending) pendingBatch.push(result.pending)
              notes.push(result.note)
              continue
            }
          }

          const result = await resolveAddPlace(
            {
              ...action,
              day: dayNum,
            },
            rejectedNames,
          )
          if (result.appliedPlace) {
            // Keep a rough local snapshot so later actions in this batch can match.
            workingDays = workingDays.map((d) =>
              d.day === dayNum
                ? {
                    ...d,
                    stops: [
                      ...d.stops,
                      {
                        id: `d${dayNum}-${result.appliedPlace!.id}-${d.stops.length}`,
                        time: '12:00',
                        placeId: result.appliedPlace!.id,
                        note: result.appliedPlace!.description,
                        walkLevel: '短步行',
                        duration: result.appliedPlace!.durationHint || '60 分钟',
                      },
                    ],
                  }
                : d,
            )
          }
          if (result.pending) pendingBatch.push(result.pending)
          notes.push(result.note)
          continue
        }

        if (action.type === 'select_hotel') {
          const hit = matchHotelCandidate(workingCandidates, action.hotelName)
          if (!hit) {
            notes.push(`候选项里没有「${action.hotelName}」，可让我用 add_hotel 添加`)
            continue
          }
          const selectedHotel = candidateToSelected(hit)
          handlers.setHotel(selectedHotel)
          persistHotelState(workingCandidates, selectedHotel)
          workingHotel = selectedHotel
          notes.push(`已将住宿切换为「${hit.name}」`)
          continue
        }

        if (action.type === 'add_hotel') {
          const result = await resolveAddHotel(action, workingCandidates, workingHotel)
          workingCandidates = result.candidates
          workingHotel = result.hotel
          notes.push(result.note)
          continue
        }

        if (action.type === 'remove_hotel') {
          const hit = matchHotelCandidate(workingCandidates, action.hotelName)
          if (!hit) {
            notes.push(`候选项里没有「${action.hotelName}」`)
            continue
          }
          if (workingCandidates.length <= 1) {
            notes.push('至少保留一家酒店候选项')
            continue
          }
          const next = workingCandidates.filter((h) => h.id !== hit.id)
          handlers.setHotelCandidates(next)
          workingCandidates = next
          if (workingHotel.id === hit.id) {
            const fallback = next.find((h) => h.isBest) || next[0]
            const selectedHotel = candidateToSelected(fallback)
            handlers.setHotel(selectedHotel)
            persistHotelState(next, selectedHotel)
            workingHotel = selectedHotel
            notes.push(`已移除「${hit.name}」，并改选「${fallback.name}」`)
          } else {
            persistHotelState(next, workingHotel)
            notes.push(`已从候选项移除「${hit.name}」`)
          }
          continue
        }

        if (action.type === 'refresh_hotels') {
          if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试推荐酒店。')
          const result = await refreshHotelCandidates({
            current: workingCandidates,
            preferences: action.preferences,
            keepCustom: action.keepCustom,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(
            action.preferences?.trim()
              ? `已按「${action.preferences.trim()}」重新推荐 ${result.candidates.filter((c) => c.source === 'llm').length} 家酒店，并选中「${result.selected.name}」`
              : `已重新推荐一批酒店，并选中「${result.selected.name}」`,
          )
          continue
        }

        if (action.type === 'replace_hotel') {
          if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试替换酒店。')
          const from = matchHotelCandidate(workingCandidates, action.fromHotelName)
          if (!from) {
            notes.push(`候选项里没有「${action.fromHotelName}」`)
            continue
          }
          const result = await replaceOneHotelCandidate({
            current: workingCandidates,
            selected: workingHotel,
            from,
            toHotelName: action.toHotelName,
            preferences: action.preferences,
            select: action.select,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(result.note)
          continue
        }

        if (action.type === 'replace_hotels') {
          if (!isLoaded) throw new Error('地图尚未就绪，请稍后再试替换酒店。')
          const fromHotels: HotelCandidate[] = []
          for (const name of action.fromHotelNames) {
            const hit = matchHotelCandidate(workingCandidates, name)
            if (!hit) {
              notes.push(`候选项里没有「${name}」`)
              continue
            }
            if (!fromHotels.some((h) => h.id === hit.id)) fromHotels.push(hit)
          }
          if (!fromHotels.length) continue
          const result = await replaceHotelCandidates({
            current: workingCandidates,
            selected: workingHotel,
            fromHotels,
            preferences: action.preferences,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(result.note)
        }
      } catch (err) {
        notes.push(err instanceof Error ? err.message : '操作失败')
      }
    }

    if (needLookup || pendingBatch.length || notes.length) {
      options?.onProgress?.('apply', { pending: pendingBatch.length > 0 })
    }

    return { notes, pending: pendingBatch }
  }

  async function submit(text: string) {
    const message = text.trim()
    if (!message || busy) return
    if (!isLlmConfigured()) {
      setError('对话助手暂不可用，请稍后再试。')
      return
    }

    setBusy(true)
    setStreamingReply(false)
    setError(null)
    setActionNotes([])
    // New user turn supersedes any lingering recommend-confirm sheet.
    setPendingPlaces([])
    setBusyUserText(message)
    beginWorkPipeline(message)
    setInput('')
    setHistory((prev) => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '' },
    ])
    const ac = beginChatRequest()
    try {
      const result = await sendTripChatMessageStream({
        ctx: buildChatContext(),
        history,
        userMessage: message,
        signal: ac.signal,
        onRequestPlan: (phase, plan) => {
          if (abortRef.current !== ac || phase !== 'done' || !plan) return
          setRequestThinkingEnabled(plan.thinking.enabled)
          setShowReasoningUi(plan.thinking.enabled)
          setWorkSteps((prev) =>
            prev.map((step) =>
              step.id === 'understand'
                ? { ...step, label: requestPlanStepLabel(plan) }
                : step,
            ),
          )
        },
        onWebSearch: (phase, detail) => {
          if (abortRef.current !== ac) return
          if (phase === 'start') {
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'webSearch', {
                labels: {
                  webSearch: searchStepLabel(detail, message),
                },
                insert: [
                  {
                    id: 'webSearch',
                    label: searchStepLabel(detail, message),
                    status: 'pending',
                  },
                ],
              }),
            )
            return
          }
          if (phase === 'done') {
            setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
            return
          }
          if (phase === 'skip') {
            setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
          }
        },
        onReplyDelta: (reply) => {
          setStreamingReply(true)
          setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
          updateLastAssistantContent(reply)
        },
        onReasoningDelta: (_delta, full) => {
          if (!resolveThinkingForTask('tripChat', message).enabled) return
          setShowReasoningUi(true)
          setReasoningText(full)
        },
      })
      if (abortRef.current !== ac) return
      setStreamingReply(false)
      setWorkSteps((prev) => activateChatWorkStep(prev, 'parse'))

      let notes: string[] = []
      let pending: PendingPlaceConfirm[] = []
      if (result.actions.length) {
        const applied = await applyActions(result.actions, {
          userMessage: message,
          onProgress: (phase, detail) => {
            if (phase === 'resolvePlaces') {
              setWorkSteps((prev) =>
                activateChatWorkStep(prev, 'resolvePlaces', {
                  labels: {
                    resolvePlaces: detail?.label || CHAT_WORK_STEP_LABELS.resolvePlaces,
                  },
                  insert: [
                    {
                      id: 'resolvePlaces',
                      label: detail?.label || CHAT_WORK_STEP_LABELS.resolvePlaces,
                      status: 'pending',
                    },
                    {
                      id: 'apply',
                      label: '打开确认页…',
                      status: 'pending',
                    },
                  ],
                }),
              )
              return
            }
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'apply', {
                insert: [
                  {
                    id: 'apply',
                    label: detail?.pending ? '打开确认页…' : '应用改动…',
                    status: 'pending',
                  },
                ],
                labels: {
                  apply: detail?.pending ? '打开确认页…' : '应用改动…',
                },
              }),
            )
          },
        })
        notes = applied.notes
        pending = applied.pending
      } else if (replyClaimsItineraryApplied(result.reply)) {
        notes = [NO_ACTION_APPLIED_NOTE]
      }

      // Guard again after long applyActions (Google Places) in case a newer turn started.
      if (abortRef.current !== ac) return

      const ensured = await ensurePendingFromTurn({
        reply: result.reply,
        actions: result.actions,
        userMessage: message,
        notes,
        pending,
      })
      if (abortRef.current !== ac) return

      setActionNotes(ensured.notes)
      enqueuePendingPlaces(ensured.pending)
      persistWorkOnLastAssistant(
        workStepsRef.current,
        reasoningTextRef.current,
        ensured.reply,
      )
    } catch (err) {
      if (isAbortError(err) || abortRef.current !== ac) return
      setHistory((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content.trim()) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `${last.content.trim()}\n\n（回答中断：${
                err instanceof Error ? err.message : '请稍后再试'
              }）`,
            },
          ]
        }
        // Drop empty assistant placeholder when nothing streamed.
        return prev.filter((t, i) => !(i === prev.length - 1 && t.role === 'assistant' && !t.content))
      })
      setError(err instanceof Error ? err.message : '对话失败，请稍后再试。')
      clearWorkPipeline()
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null
        setBusy(false)
        setStreamingReply(false)
        setBusyUserText('')
      }
    }
  }

  const chatChrome = (
    <>
      <div
        data-trip-chat-fab="1"
        className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] flex flex-col-reverse items-end gap-2 sm:bottom-5 sm:right-5 sm:flex-row sm:items-center sm:gap-2.5 ${
          open ? 'max-sm:pointer-events-none max-sm:invisible' : ''
        }`}
        style={{ zIndex: TRIP_CHAT_FAB_Z }}
      >
        <LlmModelPicker />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '关闭行程助手' : '打开行程助手'}
          title={open ? '关闭行程助手' : '行程助手'}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] shadow-[var(--shadow)] transition hover:bg-[var(--sage)] sm:h-auto sm:w-auto sm:px-4 sm:py-3 sm:text-sm sm:font-medium"
        >
          <ChatBubbleIcon className="h-5 w-5 sm:hidden" />
          <span className="hidden sm:inline">{open ? '关闭助手' : '行程助手'}</span>
        </button>
      </div>

      {panelMounted && (
        <button
          type="button"
          aria-label="关闭行程助手"
          className={`fixed inset-0 bg-black/45 transition-opacity duration-300 sm:hidden ${
            panelEntered ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ zIndex: TRIP_CHAT_BACKDROP_Z }}
          onClick={() => setOpen(false)}
        />
      )}

      {panelMounted && (
        <div
          data-trip-chat-panel="1"
          role="dialog"
          aria-label="行程助手"
          aria-hidden={!open}
          inert={!open || undefined}
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return
            if (!open) setPanelMounted(false)
          }}
          className={`fixed flex flex-col overflow-hidden border border-white/70 bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] inset-x-0 bottom-0 h-[min(85dvh,640px)] w-full rounded-t-3xl sm:inset-x-auto sm:bottom-20 sm:right-5 sm:h-[min(70vh,560px)] sm:w-[min(92vw,380px)] sm:rounded-2xl ${
            panelEntered
              ? 'translate-x-0 translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-6 opacity-0 sm:translate-x-2 sm:translate-y-3'
          }`}
          style={{ zIndex: TRIP_CHAT_PANEL_Z }}
        >
          <div className="border-b border-[var(--mist)] px-4 py-3">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--mist)] sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-xl leading-tight">行程助手</h3>
                <p className="mt-0.5 text-xs text-[var(--stone)]">
                  当前第 {currentDay} 天
                  {viewing
                    ? ` · 正在看「${viewing.name}」`
                    : ''}{' '}
                  · {getActiveLlmLabel()}
                </p>
              </div>
              <CloseIconButton
                onClick={() => setOpen(false)}
                aria-label="关闭助手"
                className="sm:hidden"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
            {!history.some((t) => !t.hidden) && (
              <div className="space-y-2">
                <p className="text-sm text-[var(--stone)]">
                  试试问我：介绍酒店、换一批住宿、介绍今天地点、加咖啡馆，或删改行程。
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => void submit(s)}
                      className="rounded-full bg-[var(--mist)] px-2.5 py-1 text-left text-xs text-[var(--ink)] hover:bg-[var(--sage)]/20 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history
              .filter((t) => !t.hidden)
              .map((turn, i, visible) => {
                const isLastVisible = i === visible.length - 1
                const isStreamingAssistant =
                  busy &&
                  turn.role === 'assistant' &&
                  isLastVisible
                const showLiveSteps =
                  isStreamingAssistant && workSteps.length > 0
                const showStoredSteps =
                  turn.role === 'assistant' &&
                  !showLiveSteps &&
                  Boolean(turn.steps?.length)
                const showLiveReasoning =
                  isStreamingAssistant &&
                  showReasoningUi &&
                  Boolean(reasoningText.trim())
                const showStoredReasoning =
                  turn.role === 'assistant' &&
                  !showLiveReasoning &&
                  Boolean(turn.reasoning?.trim())
                const showThinking =
                  isStreamingAssistant &&
                  !turn.content &&
                  !streamingReply &&
                  !showLiveSteps
                const showAnswerBubble =
                  turn.role === 'user' ||
                  Boolean(turn.content) ||
                  streamingReply ||
                  showThinking
                return (
                  <div
                    key={`${turn.role}-${i}`}
                    className={`max-w-[92%] ${turn.role === 'user' ? 'ml-auto' : ''}`}
                  >
                    {showLiveSteps ? (
                      <div className="px-1">
                        <ChatWorkStepsPanel
                          steps={workSteps}
                          open={workStepsOpen}
                          onToggle={() => setWorkStepsOpen((v) => !v)}
                        />
                      </div>
                    ) : showStoredSteps ? (
                      <div className="px-1">
                        <StoredChatWorkStepsPanel steps={turn.steps!} />
                      </div>
                    ) : null}
                    {showLiveReasoning ? (
                      <div className="px-1">
                        <ChatReasoningDisclosure
                          text={reasoningText}
                          open={reasoningOpen}
                          onToggle={() => setReasoningOpen((v) => !v)}
                        />
                      </div>
                    ) : showStoredReasoning ? (
                      <div className="px-1">
                        <StoredChatReasoningDisclosure text={turn.reasoning!} />
                      </div>
                    ) : null}
                    {showAnswerBubble ? (
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          turn.role === 'user'
                            ? 'bg-[var(--ink)] text-[var(--paper)]'
                            : 'bg-white/80 text-[var(--ink)]'
                        }`}
                      >
                        {showThinking ? (
                          <LoadingIndicator
                            thinkingLabel="助手思考中…"
                            generatingLabel="助手回答中…"
                            showDots
                            size="sm"
                            mode="thinking"
                            task="tripChat"
                            userText={busyUserText}
                          />
                        ) : (
                          <>
                            {turn.content}
                            {isStreamingAssistant && streamingReply ? (
                              <span
                                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                                aria-hidden
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}

            {!!actionNotes.length && (
              <ul className="space-y-1 rounded-xl bg-[var(--sage)]/10 px-3 py-2 text-xs text-[var(--sage)]">
                {actionNotes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            )}

            {error && <p className="text-xs text-red-700">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-[var(--mist)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault()
              void submit(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="跟我说你想怎么改行程…"
              disabled={busy || !open}
              tabIndex={open ? undefined : -1}
              aria-busy={busy || undefined}
              className="min-w-0 flex-1 rounded-full border border-[var(--ink)]/10 bg-white/80 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim() || !open}
              tabIndex={open ? undefined : -1}
              aria-busy={busy || undefined}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--sage)] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? (
                <>
                  <ButtonSpinner
                    mode="thinking"
                    task="tripChat"
                    userText={busyUserText || input}
                    thinkingEnabled={requestThinkingEnabled}
                  />
                  {chatBusy.label({ thinking: '思考中', generating: '回答中' })}
                </>
              ) : (
                '发送'
              )}
            </button>
          </form>
        </div>
      )}
    </>
  )

  return (
    <>
      {createPortal(chatChrome, document.body)}
      <GooglePlacePage
        key={`${activePending?.id || 'pending-place'}-${confirmEpoch}`}
        open={Boolean(activePending)}
        name={activePending?.place.name || ''}
        nameLocal={activePending?.place.nameLocal}
        location={activePending?.place.location}
        fallbackImage={activePending?.place.image}
        showMap={false}
        overlayClassName="z-[2300]"
        overlayZIndex={2500}
        closeOnBackdrop={activePending?.status !== 'rerecommending'}
        llmNarrative={
          activePending
            ? {
                intro:
                  pendingStory?.intro ||
                  (!pendingStoryLoading
                    ? activePending.place.description || undefined
                    : undefined),
                reason:
                  pendingStory?.reason ||
                  (!pendingStoryLoading
                    ? pendingFallbackReason(activePending)
                    : undefined),
                loading: pendingStoryLoading,
                labels: PENDING_PLACE_LABELS,
                onRegenerate: isLlmConfigured()
                  ? () => setPendingStoryRegenToken((n) => n + 1)
                  : undefined,
                regenerating: pendingStoryLoading && pendingStoryRegenToken > 0,
              }
            : null
        }
        footer={
          activePending ? (
            <div className="space-y-2">
              {activePending.status === 'rerecommending' ? (
                <div className="rounded-xl bg-white/80 px-3 py-2">
                  <LoadingIndicator
                    thinkingLabel="正在重新思考推荐…"
                    generatingLabel="正在重新推荐…"
                    showDots
                    size="sm"
                    mode="thinking"
                    task="placeRecommend"
                  />
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--stone)]">
                    {activePending.kind === 'replace'
                      ? `确认用「${activePending.place.name}」替换「${activePending.fromPlaceName}」吗？`
                      : `确认将「${activePending.place.name}」加入第 ${activePending.dayNum} 天吗？`}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={confirmBusy}
                      onClick={() => confirmPending(activePending)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--sage)] px-3 py-2.5 text-sm text-white disabled:opacity-50"
                    >
                      {confirmBusy && <ButtonSpinner />}
                      {activePending.kind === 'replace' ? '确认替换' : '加入行程'}
                    </button>
                    <button
                      type="button"
                      disabled={confirmBusy || busy}
                      onClick={() => void rerecommendPending(activePending)}
                      className="rounded-xl border border-[var(--stone)]/30 px-3 py-2.5 text-sm text-[var(--stone)] disabled:opacity-50"
                    >
                      返回重新推荐
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null
        }
        onClose={() => {
          if (activePending) cancelPending(activePending)
        }}
      />
    </>
  )
}
