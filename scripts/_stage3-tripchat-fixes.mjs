// Apply all stage 3.2 fixes to TripChatPanel.tsx using node (no PowerShell).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const file = path.resolve(
  process.cwd(),
  'src/features/chat/components/TripChatPanel.tsx',
)
let s = readFileSync(file, 'utf8')

// ── 1. Replace the import block for tripChat (remove unused, keep needed) ──
const oldTripchatImport = `import {
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
} from '../services/tripChat'`

const newTripchatImport = `import {
  extractQuotedPlaceNames,
  findReplaceTargetInDay,
  inferPlaceTypeFromText,
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
} from '../services/tripChat'`

if (!s.includes(oldTripchatImport)) {
  throw new Error('Old tripcChat import block not found')
}
s = s.replace(oldTripchatImport, newTripchatImport)
console.log('1. tripChat import block trimmed')

// ── 2. Replace the llm import block (add getThinkingMode, remove resolveThinkingForTask) ──
const oldLlmImport = `import {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  getActiveLlmLabel,
  isLlmConfigured,
  resolveThinkingForTask,
  type HotelDetailCopy,
} from '../../../shared/services/llm/llm'`

const newLlmImport = `import {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  getActiveLlmLabel,
  getThinkingMode,
  isLlmConfigured,
  type HotelDetailCopy,
} from '../../../shared/services/llm/llm'`

if (!s.includes(oldLlmImport)) {
  throw new Error('Old llm import block not found')
}
s = s.replace(oldLlmImport, newLlmImport)
console.log('2. llm import block updated')

// ── 3. Insert consts and TripChatHandlers after the chatHelpers import block ──
const oldChatHelpersEnd = `  pickTravelerStopNote,
  type PendingPlaceConfirm,
} from './chatHelpers'`

const newChatHelpersEndWithExtras = `  pickTravelerStopNote,
  type PendingPlaceConfirm,
} from './chatHelpers'

const NO_ACTION_APPLIED_NOTE = '行程未改动，请再说一下你想要的调整。'
const DETAIL_CONFIRM_MISSING_NOTE = '行程未改动：请在详情页确认是否加入。'
const TRIP_CHAT_FAB_Z = 2050
const TRIP_CHAT_BACKDROP_Z = 2040
const TRIP_CHAT_PANEL_Z = 2045

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
  reorderStop: (day: number, fromIndex: number, toIndex: number) => void
  setHotel: (hotel: SelectedHotel) => void
  setHotelCandidates: (candidates: HotelCandidate[]) => void
}`

if (!s.includes(oldChatHelpersEnd)) {
  throw new Error('chatHelpers import block end not found')
}
s = s.replace(oldChatHelpersEnd, newChatHelpersEndWithExtras)
console.log('3. consts and TripChatHandlers inserted')

// ── 4. Fix the buggy resolveThinkingForTask calls ──
const oldThinkCall = "if (!resolveThinkingForTask('tripChat', message).enabled) return"
const newThinkCall = 'if (!resolveThinkingForTask(getThinkingMode(), message, "tripChat").enabled) return'
const beforeCount = s.split(oldThinkCall).length - 1
s = s.split(oldThinkCall).join(newThinkCall)
console.log(`4. resolveThinkingForTask calls fixed: ${beforeCount} replacements`)

writeFileSync(file, s, 'utf8')
console.log(`\nFinal file: ${s.length} bytes, ${s.split('\n').length} lines`)
