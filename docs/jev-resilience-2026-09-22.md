# Jev failures, fast fallback and repeat measurements

## Diagnosis and official contract

The integration uses AI SDK 7.0.105, `experimental_evaluate`, model `typesafe-ai/jev`, shared English state, typed questions, a five-level ordered score rubric, an AbortSignal, and `maxRetries: 0`. These match the [Gateway evaluation contract](https://vercel.com/docs/ai-gateway/modalities/evaluation). The SDK's `/v4/ai/evaluation-model` transport is its implementation detail, not an accidental chat/completions call. The [TypeSafe score guide](https://docs.typesafe.ai/primitives/score) describes ordered criteria and recommends focused scoring dimensions; the current overall preference-fit rubric still warrants independent quality evaluation.

The actual upstream response is HTTP 503, `service_unavailable_error`, with “Service temporarily unavailable. Please try again shortly.” The SDK classifies it as `GatewayInternalServerError`. It is not a locally generated input rejection, observed authentication error, or evidence of a documented question-count limit. Six controlled small/medium requests (1, 4, 16, 32, 1, 16 questions) all succeeded in 255–573 ms. With the production rubric, 16-question probes succeeded 3/3; identical 49-question requests produced one 503 followed by two successes (527 and 544 ms). The same recommendation context also alternated between 503 and success. This establishes intermittent failure at the upstream evaluation boundary; provider-side internal causes require provider logs and cannot be inferred from that generic message.

A separate local defect was confirmed: hydrated opening schedules expanded itinerary ranking state to 105,932 bytes, exceeding our 32,000-character request-body guard and yielding 413 before contacting Jev. Rank payloads now project only candidate facts. The matched single-day state fell to 10,126 bytes and successfully reached Jev. Complete schedules remain on original candidates for planning and final availability validation; no stored trip data is changed.

## Implemented behavior

- Server evaluation budget: 1,500 ms instead of 4,000 ms. Client budget: 2,000 ms instead of 5,000 ms, including English normalization, network and body parsing. Cancellation races enforce the deadline even if a dependency is slow to honor its AbortSignal.
- Independent chat/preflight/rank circuits: a service failure opens a 30-second cooldown; the next eligible request makes one recovery probe. A late success cannot undo a newer failure. Caller cancellation and translation errors do not mark Jev down. The client skips normalization as well as the network during cooldown. Circuits are per browser/server runtime, not a distributed global provider-health guarantee.
- Server diagnostics preserve the upstream status category, timeout and elapsed time without logging state, headers, credentials or raw exception objects. Responses are not cached and service fallbacks include Retry-After.
- If recommendation ranking fails, the already verified, excluded and deduplicated candidate pool is queued in provider search order. Existing factual card labels are used; no additional generative call is made merely to produce card prose. This temporarily sacrifices AI preference ranking, not candidate provenance or exclusion checks. A depleted/failed discovery pool still retains the existing empty/fallback behavior.
- Itinerary generation still uses the main planner and final opening-hours guard. Only optional Jev ranking is skipped on failure.

## Measurement results

Raw reports, including intermediate failures: [JSON](benchmarks/jev-resilience-2026-09-22.json). All fixtures contain public provider candidates and synthetic trip context. English comparisons use the same 49-candidate fixture, hotel, preferences and October 12 start date. Candidate discovery is excluded; itinerary timers include missing-hours hydration and validation. This is a small sequential service-level comparison, not a randomized A/B test or a browser end-to-end latency guarantee.

| Case | Before | Final | Interpretation |
| --- | ---: | ---: | --- |
| English first recommendation, real Jev 503 | 4,351 ms | 394 ms | One observed failure sample per behavior; prior behavior invoked the main model, final uses verified search order |
| Following two batches in that same session | 16,426 / 18,026 ms | 4 / 3 ms | Final reuses the candidate queue |
| English first recommendation, healthy Jev | 374 ms | 455 / 414 ms | No demonstrated healthy-path speedup; normal network/model variation |
| Synthetic immediate upstream 503 | — | 52 ms first batch; 3 / 3 ms refresh | Fault injection, not a live provider response |
| Synthetic upstream never responds | — | 1,567 ms first batch; 7 / 4 ms refresh | Server timeout exercised; client deadline separately tested |
| English single day, validated route ready | 5,088 ms | 5,225 ms | Essentially unchanged in one sample each |
| English single day, background enrichment complete | 8,714 ms | 7,809 ms | One sample each; not enough to attribute a stable improvement |
| Chinese first recommendation | — | 1,588 ms | Includes English normalization; subsequent batches 7 / 4 ms |
| Chinese single day | — | 5,181 ms route; 7,693 ms fully enriched | Real Jev 503 handled; route passed checks |

The initial pre-change five-day run completed in 20,536 ms (21,534 ms with enrichment). Subsequent five-day runs, including the final run, were rejected after the bounded opening-hours repair still produced conflicts. They are retained as failures, not removed or presented as fast completions. There is **no valid five-day speedup result**. This exposes a separate remaining planner reliability issue: enforce supplied visit windows more reliably and preserve constraints during repair. The guard continues to reject invalid results rather than publishing them. Reproduce with `BENCH_SCENARIO=all BENCH_LOCALE=en BENCH_FIXTURE=docs/benchmarks/jev-candidates-2026-09-21.json node scripts/benchmark-generation.mjs`.

All successful recommendation runs returned four known candidates per batch without repeated names; English output checks passed. All Jev states recorded in these runs were CJK-free. User preview and saved trip/preferences were not modified.

## Verification and reproduction

- 90 test files / 605 tests passed; production build, lint (existing warnings), UI language isolation, prompt contracts and whitespace checks passed.
- Regression coverage includes cooldown isolation/recovery, stale completions, single recovery probes, hard deadlines, caller cancellation, translation/input failures, safe server diagnostics, compact rank payloads preserving original schedules, and verified queued recommendation fallback.
- `node scripts/diagnose-jev.mjs`; use `JEV_DIAGNOSTIC_STYLE=production` for repeated production-rubric probes. Credentials come from the existing local environment and are never printed.
- `BENCH_SCENARIO=recommend BENCH_LOCALE=en BENCH_FIXTURE=docs/benchmarks/jev-candidates-2026-09-21.json node scripts/benchmark-generation.mjs` for live recommendations. Add `BENCH_JEV_FAULT=503` or `BENCH_JEV_FAULT=stall` for explicitly synthetic ranking failures. The benchmark uses isolated local state and port 5186; stop another benchmark on that port before running it.

Changes remain on the current working branch; no commit or push was performed in this task.
