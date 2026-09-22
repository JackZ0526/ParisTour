# Repairing generated itinerary opening-window conflicts

The previous five-day benchmark sometimes rejected the route even after one model retry. Inspection found three repair weaknesses: converting a verified candidate into a built-in landmark discarded its provider identity; corrections only asked for another model draft; and retries reused the ranked shortlist instead of all eligible replacements and omitted the actual rejected visit/window evidence.

## Changes

- Preserve verified names, coordinates and provider identities when creating built-in landmark placeholders. Availability validation can match the original schedule instead of performing a new ambiguous lookup. Deferred enrichment must still match the published place identity and cannot replace its verified name, location, type or existing provider IDs.
- Before requesting another draft, solve the current ordered day's time constraints. Known full visit durations must fit one opening window. Hotels, transport and visits with unknown schedules/durations remain fixed anchors. Changed times stay within two hours of their draft time and respect the configured day start. Preserve declared travel durations, use at least 30 minutes between stops, and retain the original allocated gaps into/out of transport anchors. Compute the complete feasible schedule before applying it; no stop is removed, reordered or shortened by this solver. A conservative adjacent-gap repair is also available where the whole-day solve cannot apply.
- Keep the complete eligible candidate pool before optional Jev shortlisting. If conflicts remain, the single bounded model retry uses all remaining eligible replacements, avoids another Jev ranking round and receives structured rejected visits with their times, durations and known opening windows. The localized repair instruction calls for fewer optional visits when necessary while preserving hotel/flight constraints.
- Validate the resulting route again. No feasible replacement still means rejection, preserving the user's previous saved route. No landmark-specific closure or special-case date was introduced.

This is a window/sequence feasibility check, not a street-network travel-time or ticket-reservation solver. Minimum transfer buffers are estimates; explicitly supplied longer transfer durations and transport-anchor gaps are retained. Unknown opening hours remain labelled as unverified. The local solver does not move a visit whose duration is unknown.

## Verification

- 90 test files, 610 tests passed; production build, lint (existing warnings), locale isolation, prompt contracts and whitespace checks passed.
- Added regression coverage for built-in landmark provider identity, full-pool replacement after shortlist failure, structured repair feedback, bilingual adjustment notes, split service windows, linked museum/lunch constraints, preserving visit duration/order, and retaining flight/transport slack when a visit cannot fit.
- The benchmark's occupied-place records and parallel conflict detection now carry canonical identities and use the same identity matcher as the application.
- Final live service tests used the same public 49-candidate fixture, synthetic five-day trip and hotel as the preceding tests. They include schedule hydration and availability validation, but exclude candidate discovery. User preview/storage were not modified.

| Final live run | All five validated routes available | Optional enrichment attempts complete |
| --- | ---: | ---: |
| English | 18,138 ms | 18,927 ms |
| Chinese | 13,900 ms | 15,449 ms |

Both final runs passed day count, no repeated attraction identities, hotel returns, arrival check-in, departure airport and English-copy checks. Some initial drafts were rejected and repaired before publication. Each final language result is one live sample, not a reliability guarantee or statistically supported speedup. Intermediate English failures during development are retained in [the raw report](benchmarks/opening-window-repair-2026-09-22.json), alongside the successful runs; none were counted as fast completions. The final enrichment identity guard was additionally checked by the subsequent test/build suite.

Reproduce with `BENCH_SCENARIO=all BENCH_LOCALE=en BENCH_FIXTURE=docs/benchmarks/jev-candidates-2026-09-21.json node scripts/benchmark-generation.mjs` (use `zh-CN` for Chinese). The benchmark uses an isolated service on port 5186.

No commit or push was performed.
