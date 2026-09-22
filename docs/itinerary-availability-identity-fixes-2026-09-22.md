# General itinerary availability, identity and map language fixes

## Behavior

- Google candidate searches now retain structured regular/current opening periods, business status and UTC offset in the same response. Old candidate/detail cache versions are bypassed; saved trips and preferences are not migrated or overwritten. Non-Google/legacy candidates without schedules are resolved with bounded concurrency before generation.
- The planner receives compact local-time windows for the actual itinerary date. Known closed venues are removed before planning. After generation, every sightseeing/food visit is checked again, including its full known duration. One bounded replacement attempt is allowed; a remaining conflict rejects the new route. Unknown hours or duration receive a localized confirmation note, not an assertion of availability. Hotels and transport pins retain their existing semantics.
- Regular weekday schedules support split service, overnight periods, Saturday/Sunday rollover and 24-hour opening. Dated current exceptions apply only inside the provider's actual seven-day horizon; a near-term holiday is not applied to an unrelated future date. Temporary/permanent closure is excluded. Missing/malformed data is unknown. The same final gate applies to single-day, multi-day and the Disney template; no Louvre-specific closure condition was added.
- Canonical Google IDs (including resource prefixes) and Tripadvisor IDs are checked before labels. Saved original/local aliases and existing multilingual name matching provide a conservative fallback. Conflicting provider IDs, distant namesakes and numeric branch names remain distinct. Candidate pools, recommendation queues, cached-result display, occupied stops and parallel-day conflict detection use shared identity checks. Saved records are unchanged.
- Both language dictionaries cover every UI key in the installed MapLibre version. Controls and gesture hints use the selected locale; recreating controls on a language change preserves the map camera. An automated dependency-key check catches future untranslated map controls.

## Verification

- 88 test files / 598 tests passed. Production build, lint (warnings retained), language isolation, prompt contracts and whitespace checks passed.

- Real browser test used the separate synthetic local preview on port 5187, cloud sync disabled. User preview on 5173 was not edited.
- Chinese cached recommendations immediately hid already selected venue aliases. Refresh produced a new set without re-offering the selected Louvre under its French title.
- Initial real regeneration exercised the reject path: an hours conflict was rejected and the previous route remained intact. After supplying compact date-specific windows and explicit planning instructions, the real model successfully generated a new Tuesday route with Musee des Arts et Metiers, Musee de la Chasse et de la Nature and Musee National Picasso-Paris; the closed Louvre interior visit was absent. This is one live success sample, not a provider reliability claim.
- Chinese map exposed localized fullscreen, zoom, attribution and gesture strings. Switching to English restored English map strings. No browser console errors were captured at the end.
- Regression tests cover arbitrary venue closures (not just landmarks), full visit duration, split service, overnight/week rollover, dated exceptions, malformed/absent data, closed businesses, bilingual unknown-hours notes, filtering before model calls, bounded repair/rejection without mutating the prior day, provider-ID/alias deduplication and MapLibre dictionary completeness.

## Limits

Checks use supplied provider hours; future one-off changes beyond the current-hours horizon remain unverified. No availability data means an explicit confirmation note, not invented opening hours. This does not validate ticket inventory, entry queues or all travel-time feasibility. Initial cold candidate fetching can cost more than before; photos and long details remain deferred. Jev upstream 503 stability was not changed by this work.

Provider contract references: [Google Places opening-hours schema](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places), [MapLibre locale options](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/).
