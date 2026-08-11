/**
 * Constants, types, and small helpers used by TripChatPanel + its sub-components.
 *
 * Lives in its own file so the chat panel component can stay focused on
 * state + orchestration, and so the small helpers are easy to unit-test.
 */
import type { Place, PlaceType } from '../../../types'
import { replyClaimsDetailConfirm, stripDetailConfirmClaim } from '../services/tripChat'

export const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'

// Model-picked food should remain within the Paris metro area around the stay.
// Attractions allow common day trips such as Versailles / Disneyland Paris.
export const RECOMMENDED_FOOD_MAX_DISTANCE_METERS = 20_000
export const RECOMMENDED_ATTRACTION_MAX_DISTANCE_METERS = 75_000

export const PENDING_PLACE_LABELS = {
  title: '行程顾问点评',
  intro: '地点简介',
  reason: '为什么推荐',
  loadingText: '正在生成地点简介与推荐理由…',
}

export type PendingPlaceConfirm = {
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

export const NO_ACTION_APPLIED_NOTE = '行程未改动，请再说一下你想要的调整。'
export const DETAIL_CONFIRM_MISSING_NOTE = '行程未改动：请在详情页确认是否加入。'

export const SUGGESTIONS = [
  '介绍一下当前选中的酒店',
  '按左岸、中档重新推荐一批酒店',
  '介绍一下今天行程里的第一个地点',
  '帮我在今天加上一家附近的咖啡馆',
  '把凯旋门从行程里删掉',
]

export function pendingFallbackReason(pending: PendingPlaceConfirm): string {
  if (pending.kind === 'replace') {
    return `用于替换第 ${pending.dayNum} 天的「${pending.fromPlaceName || '原地点'}」`
  }
  return `计划加入第 ${pending.dayNum} 天行程`
}

/** Chat-model action.note often describes insertion logistics, not the place. */
export function isOperationalStopNote(note: string | undefined | null): boolean {
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
export function pickTravelerStopNote(opts: {
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

export function placeTypeLabel(type: PlaceType): string {
  if (type === 'cafe') return '咖啡馆'
  if (type === 'restaurant') return '餐厅'
  return '景点'
}

/** Soften false "already added" copy when confirm UI is still required. */
export function clarifyReplyForPending(
  reply: string,
  pending: PendingPlaceConfirm[],
): string {
  if (!pending.length) return reply
  const names = pending.map((p) => `「${p.place.name}」`).join('、')
  const confirmHint =
    pending[0].kind === 'replace'
      ? `行程尚未改动——请在详情页确认是否用${names}替换「${pending[0].fromPlaceName || '原地点'}」。`
      : `行程尚未改动——请在详情页确认是否将${names}加入行程。`
  if (replyClaimsDetailConfirm(reply) || !/详情|确认是否/.test(reply)) {
    const cleaned = reply
      ? `${stripDetailConfirmClaim(reply)}\n\n${confirmHint}`.trim()
      : confirmHint
    return cleaned
  }
  return reply
}

export function notesIndicateItineraryApplied(notes: string[]): boolean {
  return notes.some((n) => /(已切换到第|已选中|已加入第|已从第|已添加到|已替换为|已设为|已移除|已刷新|已重新推荐|已按|已按|已将|已删除)/.test(n))
}

export function notesClaimDetailConfirm(notes: string[]): boolean {
  return notes.some((n) => /请在详情页确认/.test(n))
}

/** Build the user message that re-asks the model for a different recommendation. */
export function buildRerecommendMessage(rejected: PendingPlaceConfirm, excluded: string[]): string {
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

export function friendlyChatError(err: unknown): string {
  if (err instanceof Error) {
    // Already a user-facing message in most cases; trim instead of rewrapping.
    return err.message || '对话助手出错了，请稍后再试。'
  }
  return '对话助手出错了，请稍后再试。'
}
