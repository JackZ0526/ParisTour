# Changelog

[中文](CHANGELOG.zh-CN.md)

All notable changes to Paris Tour are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Dates follow git commit calendar days. In-progress working-tree work is under **Unreleased**.

To cut a release: `npm run release:patch` (or `:minor` / `:major`), then push the commit and `v*` tag. See the README **Releases** section.

## [Unreleased]

### Added

- Lock the app to portrait orientation and disable pinch-zoom in PWA standalone mode (iOS / Android installed app). On Android, the OS refuses to rotate. On iOS, where the OS does not honour `manifest.webmanifest: orientation`, a soft overlay prompts the user to rotate the device back while the rest of the app blurs and freezes.

### Changed

### Fixed

- Move the iOS form-element reset into `@layer base` so Tailwind utilities like `rounded-xl` keep priority on `<input>` / `<textarea>` / `<select>`. Form fields now inherit the app's rounded design language instead of being forced to hard rectangles.

## [0.6.0] - 2026-08-17

### Added

- iOS-style sheet open/close animation for place detail
- full PWA with service worker + iOS polish + overscroll fix
- Add place gallery photo picker and expand Tripadvisor photo tests
- show attraction Tripadvisor reviews and restack place details
- switch Tripadvisor to tripadvisor34 listing details
- add photo providers, Places switch, and API meter
- stream hotel LLM copy and patch cloud artifacts by key
- polish hotel detail UX with animated scores and streaming advisor copy
- enrich hotel detail popup with Booking APIs and UX polish
- replace costly map flows and enrich Booking hotels
- improve AI responses and realtime trip sync

### Changed

- splash: use full-bleed ParisTour illustration
- update icon
- Drop right-swipe dismiss, harden body scroll lock on iOS, unblock gallery nav clicks
- Polish mobile UX, add PWA, swipe-to-dismiss sheet, and gallery swipe
- Cache routes per segment and preserve map viewport on edits
- Migrate itinerary maps and harden cached place data
- Refine place details fallbacks and itinerary UI
- Optimize Google Places billing fields
- Speed up itinerary generation with Responses API, caching, and parallel days.
- improve TripChat step UI + incremental itinerary shimmer
- add stage3 maintenance scripts
- tune LLM transport/provider budget
- wire no-void-type pre-commit check
- add vitest setup and itinerary key tests
- extract hooks and wire App
- extract useItineraryGeneration hook from App.tsx
- extract useTripCore hook from App.tsx
- extract App.tsx helpers + constants to appHelpers.ts
- split TripChatPanel.tsx 87KB -> 4 helper files + 69KB main
- split 137KB llm.ts into 9 focused modules + business/ subfolder
- add scripts/_check-imports.mjs sanity check helper
- remove obsolete layer-based directories
- move cross-feature shared modules
- move chat + LLM to features/chat/ and shared/services/llm/
- move map to features/map/
- move place to features/place/
- move itinerary to features/itinerary/
- move hotel to features/hotel/
- move flight to features/flight/
- move destination to features/destination/
- move cloud-sync to features/cloud-sync/
- move auth to features/auth/
- centralize LLM config under src/config/

### Fixed

- tighten PWA safe-area on home-screen install
- correct clampIsoDate import path in useItineraryGeneration
- remove duplicate handler/state declarations in App.tsx
- remove runtime ReferenceError from transport.ts:564
- align ItineraryStartResult shape with business/itinerary.ts
- re-export DestinationSuggestion + fix business/itinerary types path
- align time picker and stabilize hook dependencies


## [0.5.0] - 2026-08-10

AI recommendation reliability and control: verified Google candidates, editable preferences, progressive place loading, and hardened cloud/deployment behavior.

### Added

- Ground place, hotel, and itinerary recommendations in verified Google candidates, with structured prompt contracts and repair validation.
- Add editable, cloud-synced recommendation preferences that remain soft defaults instead of forced itinerary rules.
- Load the selected recommendation tab first, then fill other categories in the background; refresh only the active tab.

### Fixed

- Preserve Google Place IDs through recommendation, itinerary, detail, and hotel flows so exact entities survive refreshes.
- Keep live trip synchronization from temporarily blanking the app.
- Align manual and automatic DeepSeek thinking-effort mappings.
- Fill incomplete recommendation tabs without duplicating already returned places.
- Prevent empty DeepSeek responses behind the Vercel proxy.
- Resolve itinerary start dates from structured flight timestamps instead of model inference.
## [0.4.0] - 2026-08-10

Large feature release (~3900 LOC): server-side backups, bilingual place naming, and place-detail / gallery UX.

### Added

- Server-side trip backups (`trip_backups`): keep last 5 snapshots after each full save, with restore UI (`BackupDialog`)
- Bilingual place naming with Google ZH priority, LLM translate + badge, and streaming name updates
- Witty Google price-level labels and richer landmark review details
- Gallery UX: swipe navigation, thumbnail sync, and hidden scrollbar
- Shared `CloseIconButton` and header icon-action polish

### Changed

- Harden trip cloud persistence, Google place details fetching, and trip-assistant workflows

### Migration

- Apply the `trip_backups` section from `supabase/schema.sql` (table + RLS). Already applied on production project `zyfcpitiyrpfzvmyyxxu`.

## [0.3.1] - 2026-08-10

### Changed

- Use icons for close and regenerate chrome buttons.
- Persist LLM-generated content in the trip cloud snapshot.
- Simplify mobile trip-assistant and model FABs to icon-only circles.
- Make trip chat answer live facts and contextual detail views, and stop place recommendations from surfacing raw JSON parse errors.
- Avoid remounting the app when Supabase re-emits SIGNED_IN on tab focus.

### Fixed

- Persist LLM-generated place/hotel narratives, day recommends, review translations, and destination chips in the trip cloud snapshot so they are reused across devices until the user regenerates


## [0.3.0] - 2026-08-09

### Added

- DeepSeek as a first-class LLM backend (`/api/deepseek`) with V4 Flash / Pro models and thinking / reasoning-effort controls
- Global LLM model picker (DeepSeek + OpenAI GPT-5.6 variants) wired into TripChat and related flows
- Brand assets for DeepSeek / OpenAI in the model picker UI
- Env and docs for `DEEPSEEK_API_KEY`, optional `DEEPSEEK_BASE_URL`, and model overrides

### Changed

- Default LLM preference shifted toward DeepSeek when no explicit model env is set
- Expanded TripChat / itinerary LLM tooling and loading HUD polish around multi-provider calls
- Vite / Vercel proxy routes updated for the DeepSeek path alongside OpenAI


## [0.2.0] - 2026-07-30

Invite-only cloud product: accounts, sync, sharing, mobile layout, and UX polish on top of the 0.1.0 planner core.

### Added

- Invite-only auth (allowlisted emails), per-account cloud trip archive, and email sharing (read-only or editable)
- Cloud save status UI; later moved to a game-style bottom-left HUD that skips unchanged snapshots
- Live trip sync via Supabase Realtime with quiet sync and echo-write hardening
- Confirm step before applying recommended add/replace places from the assistant
- Allowlisted local/staging test login (`test` / `test`) plus `npm run seed:test-user`
- Bilingual EN / ZH README with cross-links
- Phone-friendly layout adaptations

### Changed

- Google add-place flow: shared place narratives; unified LLM “thinking” as a game-style HUD
- Timeline enter/delete animations, chat transitions, leg / hotel drag polish
- Tightened itinerary LLM café rules
- README rewritten for current features, stack, and setup

### Fixed

- Vercel build failure from unsupported Vite `resolve.extensionAlias`
- Live sync for restored snapshots; stopped sync echo writes
- Hotel → first-stop routing when the first stop is nearby
- Removed unused AviationStack Vite proxy
- Hardened Google Maps local setup (referrer / key guidance)

## [0.1.0] - 2026-07-27

First full trip-planner shape after the initial autumn itinerary scaffold (2026-07-24).

### Added

- Interactive planner: flights, hotels, day timeline, map, and LLM-assisted itineraries
- Live flight schedule lookup and smarter map / timeline UX
- Vercel production deploy config with serverless `/api/*` proxies
- Server-side API secrets so keys are not shipped to the browser

### Changed

- Evolved from a static 7-day autumn itinerary demo into an editable Paris trip planner

## Links

Compare ranges use commit SHAs until git tags are published.

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.6.0...HEAD
- [0.6.0]: https://github.com/JackZ0526/ParisTour/compare/v0.5.0...v0.6.0
- [0.5.0]: https://github.com/JackZ0526/ParisTour/compare/v0.4.0...v0.5.0
- [0.4.0]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...v0.4.0
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
