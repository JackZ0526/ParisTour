# Language and live AI acceptance — 2026-09-21

## Verdict

**Partial pass. Not a complete release acceptance.** Real generation and fallback work, but the browser exposed opening-day validation and cross-language place deduplication gaps, plus untranslated map controls. No user trip or preferences were replaced: browser testing used an independent local origin (5187), cloud sync disabled, and the sample fixture. The existing preview at 5173 was left untouched.

## Automated checks

- 84 test files, **581 tests passed**.
- Production TypeScript/Vite build passed.
- Lint completed with existing/current warnings (not warning-free); icon policy and UI text isolation checks passed.
- Prompt contracts, forbidden void-type check, and whitespace diff check passed.
- The static UI text check does not cover default strings embedded in third-party map widgets. Its passing result does not prove full language isolation.

## Real API coverage and fix

Fourteen recorded scenario runs cover English and Simplified Chinese recommendations (three batches each), one-day generation, five-day generation, baseline and optimized paths, plus routing. All use real configured provider calls and 49 fixed public candidates. Records contain timings, status codes, synthetic route output and checks, not credentials or full request prompts.

Found and fixed a routing context omission in `tripChat.ts`: Jev did not receive the selected hotel's name/address. Before the fix, a Chinese request asking the current hotel's name incorrectly required web lookup. Added selected-hotel facts, and a regression test for selected/pending hotels. After the fix, all 12 cold/warm routing cases passed, including a request explicitly forbidding deletion while asking for cafe recommendations. Two Chinese cases used the existing main-model fallback, not Jev alone.

All **31 recorded Jev requests** had no CJK characters in their decision state. This checks the actual test inputs; it is not a proof about every possible future user input. Proper names remain intact. Chinese cold routing calls triggered three English-normalization requests; repeated warm inputs triggered none.

Jev chat calls: 12/12 HTTP 200. Jev ranking: **6/19 HTTP 200**, **13/19 local 502 responses caused by upstream 503**. Fallback completed generation, but English normalization did not resolve provider availability. Do not attribute all speed gains to Jev.

## Observed latency

Seconds until the route is usable; deferred photos/details may still be loading:

| Scenario | Baseline | Optimized | Reduction |
|---|---:|---:|---:|
| English one day | 8.161 | 2.675 | 67% |
| Chinese one day | 6.089 | 2.867 | 53% |
| English five days | 25.634 | 11.008 | 57% |
| Chinese five days | 23.730 | 12.771 | 46% |

Optimized full background completion: English one day 11.893s, Chinese one day 5.999s, English five days 12.331s, Chinese five days 13.908s. In particular, English one-day full completion was slower than baseline even though the route became usable sooner.

Recommendation batches (first/second/third):

- English baseline: 4.708 / 5.826 / 11.663s. Optimized: **11.313 / 0.447 / <0.001s**. First optimized batch was slower because ranking failed and invoked fallback. First usable result was 9.038s.
- Chinese baseline: 5.303 / 4.953 / 5.976s. Optimized: **1.549 / <0.001 / <0.001s**.
- Each recorded batch had four valid candidate IDs, and three batches contained no repeated IDs. This does not detect all aliases for the same physical venue.

These are single observations, not medians or controlled statistical A/B results. Candidate discovery is excluded from the fixed-fixture benchmark. Some late service runs overlapped browser background metadata calls. Browser recommendation tests separately exercised live candidate discovery. No universal percentage or production latency guarantee follows from these results.

Both optimized five-day runs passed the structural checks (day count, distinct attraction IDs, hotel return, arrival check-in and departure airport). Both baseline five-day runs repeated attraction IDs. Opening hours, geographic optimality and route feasibility are outside those structural checks.

## Browser findings

- English: live recommendations rendered four cards; Refresh produced four different cards without another Jev request. Single-day regeneration showed loading, completed with seven stops, updated the map and re-enabled controls.
- Chinese full regeneration completed all seven dated day tabs; day 1 showed hotel check-in and day 7 ended at CDG. No browser console errors were captured. This checks completion and displayed structure, not opening-hours feasibility.
- Switching the same synthetic trip to Chinese translated itinerary titles/descriptions and kept dates, stops and hotel intact. Chinese recommendation and Refresh rendered different groups of four cards.
- **P1 — Closed-day visit:** regenerated day 2, 2026-10-13 (Tuesday), scheduled an interior Louvre visit at 11:30 for 2h30. The [Louvre's official opening page](https://www.louvre.fr/en/visit/hours-admission) states it closes on Tuesdays. Generation needs date-aware availability validation; no claim of full itinerary feasibility is made.
- **P2 — Cross-language duplicate:** the route already contained “Louvre Museum”; Chinese recommendations offered “Musée du Louvre”. Exclusion by current IDs/names is insufficient to establish physical-venue identity. Needs canonical place identity/alias handling across candidate sources and locales.
- **P2 — Map localization:** Chinese UI still exposed “Enter fullscreen”, “Zoom in”, “Zoom out”, “Toggle attribution” and “Use ⌘ + scroll to zoom the map”. The map library's default locale needs explicit localization and a browser regression check.

These findings remain open. They should be fixed before describing the project as fully language-isolated or the generated itinerary as reliably executable. This test turn fixed only the routing context omission; it did not silently introduce a broad new opening-hours pipeline.

## Evidence

[Raw structured scenario results](benchmarks/jev-language-acceptance-2026-09-21.json) include the pre-fix routing failure separately. One early harness attempt failed because the structural checker attempted to resolve the reserved hotel ID as a candidate; that checker was corrected and the scenario rerun. The invalid attempt is excluded from timings.

## Follow-up

The three application findings above have since received general fixes and follow-up verification; see [availability, identity and map locale changes](itinerary-availability-identity-fixes-2026-09-22.md). The original observations and timings are retained as historical test evidence. Jev upstream availability remains outside this follow-up's scope.
