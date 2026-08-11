// Extract helpers from App.tsx into appHelpers.ts.
// Surgically remove the lines that have been moved and add an import.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const file = path.resolve(process.cwd(), 'src/App.tsx')
let s = readFileSync(file, 'utf8')

// 1. Remove the constants/helpers block from line 111 to line 390
//    (just before `export default function App()`).
const exportDefaultMarker = 'export default function App() {'
const markerIdx = s.indexOf(exportDefaultMarker)
if (markerIdx < 0) {
  throw new Error('Could not find export default function App() line')
}

// Find the start of the constants block (line 111 in 1-indexed = the ITINERARY_LOADING_LINES const).
const lines = s.split('\n')
let blockStart = -1
for (let i = 0; i < lines.length; i++) {
  if (/^const ITINERARY_LOADING_LINES = \[/.test(lines[i])) {
    blockStart = i
    break
  }
}
if (blockStart < 0) {
  throw new Error('Could not find ITINERARY_LOADING_LINES const')
}
console.log(`ITINERARY_LOADING_LINES at line ${blockStart + 1}`)

// Find the line just before `export default function App()`
let blockEnd = -1
for (let i = blockStart; i < lines.length; i++) {
  if (lines[i] === exportDefaultMarker || lines[i].trim() === exportDefaultMarker) {
    blockEnd = i
    break
  }
}
if (blockEnd < 0) {
  // fall back: search for the marker itself
  for (let i = blockStart; i < lines.length; i++) {
    if (lines[i].includes(exportDefaultMarker)) {
      blockEnd = i
      break
    }
  }
}
if (blockEnd < 0) {
  throw new Error('Could not find blockEnd before App()')
}
console.log(`App() at line ${blockEnd + 1}`)
console.log(`Removing lines ${blockStart + 1}..${blockEnd} (${blockEnd - blockStart} lines)`)

// Remove the block (don't keep the blank line before App)
const newLines = [...lines.slice(0, blockStart), ...lines.slice(blockEnd)]
s = newLines.join('\n')

// 2. Add the import for appHelpers
//    The imports end with the `recommendationPreferences` block. Insert after that.
const importAnchor = `} from './features/place/services/recommendationPreferences'`
if (!s.includes(importAnchor)) {
  throw new Error('Could not find recommendationPreferences import anchor')
}
const importAddition = `${importAnchor}\nimport {\n  AREA_KEY_CN,\n  EMPTY_DAY_FALLBACK,\n  ITINERARY_LOADING_LINES,\n  ITINERARY_LOADING_ROTATE_MS,\n  areaAliasEntries,\n  buildHeroCopy,\n  chineseDayCount,\n  destinationLabel,\n  ensureStopId,\n  hasTripDates,\n  hotelAreaShort,\n  initialFlightsState,\n  initialHotelState,\n  isHotelSelected as _unusedIsHotelSelected,\n  itineraryMissingLabels,\n  itineraryThemeTags,\n  replaceWrongAreaLabels,\n  rewriteHotelBaseAreaMentions,\n  seasonEyebrow,\n  syncDaysCopyToHotelArea,\n} from './appHelpers'`

s = s.replace(importAnchor, importAddition)

writeFileSync(file, s, 'utf8')
console.log(`Final file: ${s.length} bytes, ${s.split('\n').length} lines`)
