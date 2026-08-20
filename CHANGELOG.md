# Changelog

[中文](CHANGELOG.zh-CN.md)

All notable changes to Paris Tour are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Dates follow git commit calendar days. In-progress working-tree work is under **Unreleased**.

To cut a release: `npm run release:patch` (or `:minor` / `:major`), then push the commit and `v*` tag. See the README **Releases** section.

## [Unreleased]

### Added

### Changed

### Fixed

## [0.7.0] - 2026-08-20

### Added

- align global UI with unified liquid frosted glass design and polish navigation flow
- lift chat bubble and model picker above bottom nav, and widen navigation bar
- implement liquid flowing gradient border with realistic refractive light decay
- refine border to ultra-fine hairline precision while preserving specular reflection
- add realistic specular reflection highlights and prism sheen to navigation bar
- enhance navigation bar white border and luminous glass rim highlight
- open hotel details overlay in-place without navigating away from itinerary tab
- unify global design system with light frosted glass cards, soft diffused shadows, and cohesive pill shapes
- balance desktop header layout with quick tools and interactive user capsule
- implement Profile Tab consolidating account, trip management, preferences, and reset actions
- sync bottom nav and top segments slider animation with timeline/map dynamic stretch-and-squish spring physics
- refine bottom nav to high-transparency semi-transparent frosted glass
- update bottom nav and top segments to clean bright light frosted glass style
- clean minimalist frosted glass for bottom nav and top segments
- match iOS Liquid Glass reference with translucent tinted pill and quick action capsule
- upgrade bottom nav to iOS 26 floating liquid glass style
- implement Proposal 1 with native bottom navigation bar and multi-tab architecture
- unify PlacePhotoGallery across AddPlaceDialog and GooglePlacePage with identical photo priority, drag gestures, and animations
- upgrade PlaceGallery with iOS native drag gestures, slide transitions, and thumbnail auto-centering
- fine-tune ApiRequestMeter expanded height to 438px for tight bottom padding
- eliminate scrollbar in ApiRequestMeter and expand full details cleanly
- complete comprehensive animation enhancements across timeline, map, hotel, flight, and system widgets
- upgrade top-right mobile menu to two-stage morphing animation
- synchronize status bar theme-color dynamically with modal backdrop
- enable black-translucent status bar to sync backdrop seamlessly in safe-area
- display X close button on desktop while retaining pull-down handle on mobile
- add top pull-down handle indicator, remove X buttons, and match status bar backdrop color
- synchronize modal backdrop opacity dynamically with sheet drag & dismissal animation
- implement velocity-inherited spring physics for inertia-driven bottom sheet dismissal
- add full-surface pull-down-to-dismiss drag gesture to all bottom sheets
- iOS-style sliding pill via shared layoutId
- same staged two-stage morph as chat panel
- staged two-stage morph (width first, then height)
- container transform FAB↔panel with iOS-style spring + tap squish
- morph from button to popover via shared layoutId
- add enter/exit animation to model picker popover
- add enter/exit animation + outside-click close
- lock to portrait + disable pinch zoom in standalone mode
- Lock the app to portrait orientation and disable pinch-zoom in PWA standalone mode (iOS / Android installed app). On Android, the OS refuses to rotate. On iOS, where the OS does not honour `manifest.webmanifest: orientation`, a soft overlay prompts the user to rotate the device back while the rest of the app blurs and freezes.

### Changed

- upgrade FAB and model picker to luminous frosted glass with specular highlight
- clean(ui): remove redundant logistics and preferences buttons from itinerary summary strip
- remove deprecated VITE_GOOGLE_MAPS_API_KEY from env and documentation
- extract unified BottomSheet shell component to standardize modals
- standardize backdrop fade animation and pointer-events layering across all bottom sheets
- add fluid ink blob animation with stretch physics to day tab switcher
- add velocity stretch and squash deformation to mobile sliding pill
- unfold date range picker popover from trigger box
- hide mobile timeline/map toggle tabs on desktop side-by-side view
- fade in chip text after closing animation settles
- center model picker chip content on desktop
- drop debug data attributes
- debug(llm-picker): expose model/label via data-debug attributes
- drop the modal, make it a popover anchored to the trigger
- share Checkbox component, apply to preferences dialog
- switch TripChatPanel enter/exit to AnimatePresence (sheet-bottom)
- phase-2 — switch CloudSave toast + ApiRequest details panel to AnimatePresence
- phase-1 — switch 7 sheet/dialog to AnimatePresence
- phase-0 foundation
- exp(animations): pilot Framer Motion on place sheet + LLM slider
- polish(place-detail): mirror exit duration with entrance (420ms) so open/close read as one motion
- polish(place-detail): use same easeOutQuint for open and close so exit reads as a visible retraction
- polish(place-detail): keep exit mirror shape but clamp y-handles to [0,1] (no overshoot on exit)
- polish(place-detail): make exit curve the mathematical time-reverse of the entrance curve
- polish(place-detail): use clean ease-in curve so exit velocity keeps accelerating to end
- polish(place-detail): mirror sheet exit easing (slow start, accelerating away) to oppose entrance
- record PWA portrait lock + zoom fix in Unreleased
- note iOS form reset layer fix in Unreleased
- Move the iOS form-element reset into `@layer base` so Tailwind utilities like `rounded-xl` keep priority on `<input>` / `<textarea>` / `<select>`. Form fields now inherit the app's rounded design language instead of being forced to hard rectangles.

### Fixed

- remove radial gradient artifact from share dialog header to fix color seam
- polish tab state and trip metadata UI
- silence flight card mount expand animation on initial load and keep luminous frosted glass fab
- eliminate unwanted mount bounce on day tabs and timeline/map switcher when switching pages
- eliminate hotel animation replay on tab switch, fix button overlap, and anchor chat morph to button
- enable clicking hotel stop on timeline and summary strip to view hotel details
- unify RecommendationPreferencesButton style with matching frosted white circle
- eliminate thumbnail gray flicker and unmount underlying shimmer after image load
- ensure place detail preview modal layers above AddPlaceDialog with overlayZIndex 2200
- remove erroneous safe area padding from GooglePlacePage bottom sheet header
- adjust top safe area padding to balanced 78px clearance
- increase top padding to 95px to fully clear iOS 90px status bar blur scrim
- adjust top safe area padding and make itinerary day tabs flow statically
- align webmanifest theme and background colors with app light theme
- ensure dragY resets to 0 whenever bottom sheet opens
- use layered motion architecture to eliminate overscroll bounce while preserving 420ms slide-up animation
- restore bottom sheet slide-up entrance animation by decoupling Framer Motion drag from style overrides
- eliminate backdrop exit delay, restore synchronous AnimatePresence coordination, and clean status bar styling
- remove abrupt meta theme-color flip to ensure smooth hardware-accelerated status bar blend
- reset sheet y on open, extend backdrop to status bar area, and sync theme-color
- dynamically transform backdrop backgroundColor to avoid Framer Motion opacity property collision
- use non-passive native touch listener to reliably prevent browser rubberband overscroll
- implement directional touch arbiter to eliminate content overscroll rubberband on sheet pull
- eliminate page jumping and repeated fade-up animations on dialog close
- fix TypeScript easing tuple type in DateRangePicker
- initialize useMediaQuery synchronously to eliminate initial expansion flash
- replace grid-rows 0fr with AnimatePresence to fix mobile layout bug
- fix mobile popover initial height and prevent animation scrollbars
- claim clients on new SW so cache fixes reach installed PWAs
- separate backdrop fade from sheet slide
- remove paper tint, anchor pill stacking
- reset panelEntered via timer to prevent stuck overflow:hidden
- hold overflow:hidden through every height retarget; clamp panel width to viewport
- suppress scrollbar during opening morph
- stack above chat button on mobile
- align FAB and panel position, dial back spring
- move AnimatePresence inside the portal so the enter animation actually runs
- restore native checkbox visibility
- revert fill bar to CSS for frame-perfect drag tracking
- replace fake-portrait rotation with 'rotate back' overlay
- drive portrait lock via JS class toggle (Tailwind v4 Lightning CSS rejects display-mode media queries)
- move iOS form reset into @layer base so Tailwind rounded utilities win


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

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.7.0...HEAD
- [0.7.0]: https://github.com/JackZ0526/ParisTour/compare/v0.6.0...v0.7.0
- [0.6.0]: https://github.com/JackZ0526/ParisTour/compare/v0.5.0...v0.6.0
- [0.5.0]: https://github.com/JackZ0526/ParisTour/compare/v0.4.0...v0.5.0
- [0.4.0]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...v0.4.0
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
