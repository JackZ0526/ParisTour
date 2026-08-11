// Surgical rewrite of TripChatPanel.tsx to remove extracted code
// (helpers, sub-components, work-step UI, reasoning disclosure, bubble icon).
// The extracted code now lives in:
//   - chatHelpers.ts
//   - ChatWorkStepList.tsx
//   - ChatReasoningDisclosure.tsx
//   - ChatBubbleIcon.tsx
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const file = path.resolve(
  process.cwd(),
  'src/features/chat/components/TripChatPanel.tsx',
)
const src = readFileSync(file, 'utf8')
const lines = src.split(/\r?\n/)

// New imports (to be prepended to the existing imports block).
const newImportBlock = `import {
  FALLBACK_IMAGE,
  PENDING_PLACE_LABELS,
  RECOMMENDED_ATTRACTION_MAX_DISTANCE_METERS,
  RECOMMENDED_FOOD_MAX_DISTANCE_METERS,
  buildRerecommendMessage,
  clarifyReplyForPending,
  friendlyChatError,
  isOperationalStopNote,
  notesClaimDetailConfirm,
  notesIndicateItineraryApplied,
  pendingFallbackReason,
  pickTravelerStopNote,
  type PendingPlaceConfirm,
} from './chatHelpers'
import { ChatBubbleIcon } from './ChatBubbleIcon'
import {
  CHAT_WORK_STEP_LABELS,
  ChatWorkStepsPanel,
  StoredChatWorkStepsPanel,
  actionsNeedPlaceLookup,
  activateChatWorkStep,
  finishChatWorkSteps,
  initialChatWorkSteps,
  requestPlanStepLabel,
  searchStepLabel,
  type ChatWorkStep,
} from './ChatWorkStepList'
import {
  ChatReasoningDisclosure,
  StoredChatReasoningDisclosure,
} from './ChatReasoningDisclosure'

`

// Line ranges (1-indexed, inclusive) of the code we want to REMOVE.
// Identified by reading the file: helpers + sub-components are at the top,
// then `interface Props` + `TRIP_CHAT_*_Z` + `SUGGESTIONS` + `ChatBubbleIcon`
// right before the main `export function TripChatPanel`.
//
// We need to keep: the main TripChatPanel component.
// We need to remove:
//   - FALLBACK_IMAGE / RECOMMENDED_* / PENDING_PLACE_LABELS consts
//   - PendingPlaceConfirm type
//   - pendingFallbackReason, isOperationalStopNote, pickTravelerStopNote,
//     placeTypeLabel, clarifyReplyForPending,
//     notesIndicateItineraryApplied, notesClaimDetailConfirm helpers
//   - NO_ACTION_APPLIED_NOTE / DETAIL_CONFIRM_MISSING_NOTE consts (moved to chatHelpers.ts)
//   - ChatWorkStepId, ChatWorkStep types (moved to ChatWorkStepList.tsx)
//   - CHAT_WORK_STEP_LABELS, initialChatWorkSteps, searchStepLabel,
//     friendlyChatError, requestPlanStepLabel,
//     activateChatWorkStep, finishChatWorkSteps, completedWorkSummary helpers
//   - ChatWorkStepIcon (private sub-component)
//   - actionsNeedPlaceLookup
//   - DisclosureChevron, CompletedCheckIcon (private sub-components)
//   - ChatWorkStepsPanel, StoredChatWorkStepsPanel (private components)
//   - StoredChatReasoningDisclosure, ChatReasoningDisclosure (private components)
//   - buildRerecommendMessage
//   - ChatBubbleIcon
//   - SUGGESTIONS (moved to chatHelpers.ts)
//   - TripChatHandlers interface (kept — used externally)
//
// Keep in TripChatPanel.tsx:
//   - imports + LlmModelPicker import + new import block
//   - All other consts (TRIP_CHAT_FAB_Z, etc.)
//   - interface Props
//   - The TripChatPanel function

// Find the line where `interface Props` starts (the one with `hotel: SelectedHotel`).
let propsStartLine = -1
for (let i = 0; i < lines.length; i++) {
  if (/^interface Props \{/.test(lines[i])) {
    propsStartLine = i
    break
  }
}
if (propsStartLine < 0) {
  throw new Error('Could not find `interface Props {` line.')
}
console.log('Found interface Props at line', propsStartLine + 1)

// Find the line of `import { LlmModelPicker } from './LlmModelPicker'`
let llmPickerLine = -1
for (let i = 0; i < lines.length; i++) {
  if (/^import \{ LlmModelPicker \}/.test(lines[i])) {
    llmPickerLine = i
    break
  }
}
if (llmPickerLine < 0) {
  throw new Error('Could not find LlmModelPicker import line.')
}
console.log('Found LlmModelPicker import at line', llmPickerLine + 1)

// Reconstruct the file:
// - Lines 0 .. llmPickerLine  (imports up to and including LlmModelPicker)
// - newImportBlock
// - Lines propsStartLine .. end  (interface Props + everything else)
const head = lines.slice(0, llmPickerLine + 1).join('\n')
const tail = lines.slice(propsStartLine).join('\n')

const newSrc = `${head}\n${newImportBlock}${tail}\n`

writeFileSync(file, newSrc, 'utf8')
console.log('Wrote', newSrc.length, 'bytes (was', src.length, 'bytes)')
console.log('New line count:', newSrc.split('\n').length)
