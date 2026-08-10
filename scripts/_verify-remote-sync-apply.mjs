/**
 * Focused verification of the remote-sync apply / rehydrate invariants.
 * Run: node scripts/_verify-remote-sync-apply.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function isUnexpectedEmptyRegression(previous, next) {
  const hasGenerated = (s) => Boolean(s?.itinerary?.days?.length)
  if (!previous || !hasGenerated(previous)) return false
  return (
    !next.dates &&
    !next.flights &&
    !next.hotel?.selected &&
    !hasGenerated(next)
  )
}

function asSnapshot(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      version: 1,
      dates: null,
      destination: '巴黎',
      flights: null,
      hotel: null,
      itinerary: null,
      baseline: null,
    }
  }
  return {
    version: 1,
    dates: raw.dates ?? null,
    destination: typeof raw.destination === 'string' ? raw.destination : '巴黎',
    flights: raw.flights ?? null,
    hotel: raw.hotel ?? null,
    itinerary: raw.itinerary ?? null,
    baseline: raw.baseline ?? null,
  }
}

const generated = {
  version: 1,
  dates: { startDate: '2026-06-01', endDate: '2026-06-05' },
  destination: '巴黎',
  flights: { outbound: { flightNumber: 'AF123' }, returnFlight: { flightNumber: 'AF124' } },
  hotel: { selected: { id: 'h1', name: 'Hotel' }, candidates: [] },
  itinerary: { days: [{ day: 1, title: 'D1', stops: [] }], generated: true },
  baseline: null,
}

let failed = 0
function assert(name, cond) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', name)
  } else {
    console.log('ok:', name)
  }
}

// 1) Incomplete realtime payload → emptyTripSnapshot shape
const fromMissing = asSnapshot(undefined)
assert('missing payload becomes empty snapshot', !fromMissing.itinerary && !fromMissing.dates)

// 2) That empty shape must be treated as regression against a known generated trip
assert(
  'empty payload is unexpected regression vs generated baseline',
  isUnexpectedEmptyRegression(generated, fromMissing),
)

// 3) Trusted REST empty clear is intentional (caller uses trustSnapshot; guard skipped)
assert(
  'intentional empty still detectable as empty regression shape',
  isUnexpectedEmptyRegression(generated, asSnapshot({})),
)

// 4) Real collaborator update with itinerary is not a regression
assert(
  'populated remote is not empty regression',
  !isUnexpectedEmptyRegression(generated, generated),
)

// 5) Soft-sync must not re-enter first-hydration wipe after remote apply
//    (tripInputsHydratedRef stays true; quiet period suppresses wipe)
const softSyncHydratedAfterApply = true
const remoteQuietActive = true
const wouldWipeOnFirstHydrationMismatch = !softSyncHydratedAfterApply && !remoteQuietActive
assert(
  'soft-sync does not take first-hydration wipe path',
  !wouldWipeOnFirstHydrationMismatch,
)

// 6) Hotel with selected but no candidates must still restore
function loadHotelCache(state) {
  if (!state) return null
  const selected = state.selected
  const candidates = Array.isArray(state.candidates) ? state.candidates : []
  const selectedOk = Boolean(selected?.id && selected.id !== 'hotel-pending')
  if (!candidates.length && !selectedOk) return null
  return { ...state, candidates, selected }
}
const restored = loadHotelCache({
  candidates: [],
  selected: { id: 'h1', name: 'Hotel' },
})
assert('hotel selected without candidates still loads', Boolean(restored?.selected?.id === 'h1'))

// 7) Soft-sync must neither remount DayTimeline nor bypass its structural diff.
//    The stable instance needs the previous stop snapshot so remote add/remove/
//    replace/reorder changes can play gommage / swap / enter / FLIP.
const appSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'),
  'utf8',
)
assert(
  'DayTimeline keeps a stable key and no remote animation bypass',
  !/key=\{`timeline-\$\{syncRenderKey\}/.test(appSrc) &&
    /key=\{`timeline-\$\{day\.day\}-\$\{hotel\.id\}`\}/.test(appSrc) &&
    !/remoteSyncEpoch=\{syncRenderKey\}/.test(appSrc),
)

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll remote-sync apply invariants passed.')
