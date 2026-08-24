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

## [0.9.1] - 2026-08-24

### Fixed

- support legacy Chinese values in localizeTravelChip


## [0.9.0] - 2026-08-24

### Added

- replace loadingGooglePhoto text with matching photo and details shimmer skeleton
- enable live streaming output for place recommendations with progressive shimmer tail
- add matching shimmer skeleton cards during recommendation refreshing
- support streaming output and shimmer loading for drafting copy
- implement 0ms instant multi-language switching with structure-keyed cache
- support real-time progressive streaming for itinerary translation
- add shimmer placeholders for day title, theme, summary, and stop notes while translating
- full English UI + locale-change auto-translate
- disable zh translation in en mode and localize hotel/place details & LLM prompts
- complete localization for place, dialogs, backup, share, and login
- introduce reactive type-safe multi-language support (zh-CN & en)

### Changed

- add release notes for v0.9.0
- keep recsIntro on a single line in AddPlaceDialog
- remove count and parenthesis from category tabs in AddPlaceDialog
- replace ActivityBars with dynamic animated dots in PlaceName translating indicator
- replace equalizer bars with dynamic animated dots for LLM thinking and strip static ellipsis
- add ExternalLink icon to Official Website capsule
- replace static ellipsis with dynamic animated dots in refresh button
- adjust recommendation shimmer skeleton to 4 cards
- disable thinking for translate and router tasks
- disable thinking for dayCopy and reduce debounce for snappy copy updates
- parallelize single-day translation streams and disable CoT thinking for zero-latency TTFT
- move itinerary translation loading to top capsule badge
- remove emojis from text and replace with standard Lucide icons
- simplify themeDark label to Midnight
- generalize English translations to be destination-agnostic
- remove hover underline on website capsule button
- polish model brand capsule colors for dark mode
- improve selected capsule and warning banner contrast in dark mode

### Fixed

- use callOpenAIMessagesStream and compact payload for real-time translation streaming
- remove duplicate trailing ellipsis from badge loading text
- fix llm-think-chip and llm-gen-chip dark mode background invert
- fix dark mode styling for glass capsule tones and loading badges
- align day header skeleton exactly with multi-line text layout
- use skeleton bar instead of text shimmer sweep in DayTabButton while pending
- optimize shimmer skeleton colors and card background in dark mode
- decouple itineraryTranslating from generation state with dedicated translation loading banner
- localize duration chips and constrain place description note length
- use locale-aware place name in delete stop confirm dialog
- enforce concise day title length in prompts, parser, and tab buttons
- localize map header status, day aria label, and drag hints in TripMap
- filter out certification labels, partner badges, and footer containers from website photos
- isolate layout animations in AddPlaceDialog, LoginPage, and ShareDialog tabs
- refine place name typography and remove blank translation row in English mode
- isolate day tab and mobile pane layout animations to prevent reflow jitter
- isolate pill layout animations with LayoutGroup and layoutDependency to prevent reflow jitter
- improve dark mode styling and error i18n in recommendation preferences dialog
- localize place recommendations, day copy generation, and loading badges
- route place source label "website" through the dictionary
- route price-tier chip descriptors through the dictionary
- stop LLM prompts from falling back to Chinese when locale=en
- shorten Directions tooltip to fit on one line
- close all residual hardcoded UI text and route every user-facing string through the dictionary
- localize error and status toast messages across all dialogs and flows
- shorten flight card titles to single line
- streamline share, backup, and preferences copy to strictly align with Chinese
- localize role badges and relative times in TripSelectorCapsule and ProfileTab
- localize logistics header banner, readiness matrix, and quick summary
- localize flight logistics, date range picker, hotel dialogs and trip dates
- localize hotel picker custom card, district badge, blurb generation, ready banner and disclaimer
- isolate hotel & place advisor memos by locale, localize spoken languages and clean reviews


## [0.8.1] - 2026-08-22

### Added

- display owner nickname instead of email handle in top capsule and menus
- add live profiles realtime updates to ShareDialog
- add cross-device nicknames, companions avatar sync, shares cache, and fix auth jwt bloat
- let users choose crop position on upload

### Changed

- polish login page dark mode with refined frosted glass and luxury accents
- display companion nickname and email inline on one line
- streamline duplicate cropper instruction text
- ensure hover text turns ink black in light mode for AvatarCropper actions
- refine cropper viewport borders, zoom controls, and action button contrast for dark mode
- remove redundant image format and privacy note card from AvatarPickerDialog

### Fixed

- use robust profile upsert for instant cross-device avatar sync
- connect cloud persistence on avatar crop/reset in AvatarPickerDialog
- enhance batch companions profile loading and update schema RLS
- stabilize session trip bootstrap
- limit pull-down dismiss to mobile
- keep remove action visually stable
- stabilize share dialog updates
- require bilingual changelog notes
- Prevent collaborator role toggles from flashing the member list or adjacent remove actions, and keep the invite button width stable while sending.
- Restrict pull-down-to-dismiss gestures to mobile bottom sheets; desktop dialogs no longer respond to dragging.
- Defer Supabase trip bootstrap work outside auth-state callbacks and verify the active user before creating a primary trip, preventing login deadlocks and false RLS failures.
- Refine hover contrast and dark mode styling for Google Maps address capsule and action buttons.


## [0.8.0] - 2026-08-21

### Added

- reveal left fades after scrolling
- sync preference to user profile
- default to system preference
- improve dark mode depth and contrast
- add spring sliding jelly animation to appearance theme selector in ProfileTab
- complete midnight paris styling across navigation, dialogs, calendar, and cards
- establish Midnight Paris dark mode infrastructure, theme store, and appearance selector
- layout Row 1 side-by-side (Identity & Trip Mgmt) and Row 2 resident AI preferences on desktop
- streamline avatar modal to photo-only and align with ParisTour design system
- implement personalized avatar customization system
- theme model status capsule with provider brand colors
- position model capsule beside assistant title in header
- transform header subtitle metadata into 3D glass capsules
- upgrade user/assistant chat bubbles and error banner with 3D obsidian/frosted glass styling
- lock background scrolling and interactions when LlmModelPicker is open
- add full-screen frosted glass backdrop blur overlay to LlmModelPicker
- upgrade PillSwitch with Framer Motion spring dynamics, jelly squash-and-stretch, and tactile feedback
- replace redundant brand subtitles with practical model capability descriptions
- upgrade ModelOption and ModelGroup with 3D frosted glass capsule rows and high-contrast typography
- make thinking container smoothly grow upwards anchored to its bottom edge
- upgrade inner containers in LlmModelPicker with 3D frosted glass relief and French alabaster cream base
- upgrade LLM Model & Thinking Popover UI to match 3D liquid frosted glass system
- apply strict semantic category tone mapping to suggestion pills
- upgrade TripChatPanel UI to match global 3D liquid frosted glass design system
- make API request meter draggable to left/right edges with local caching and adaptive expansion
- upgrade logout button to 3D frosted glass French Rosé capsule
- remove brown border outlines and replace with pure white frosted glass borders
- unify expanded state with identical 3D frosted glass stereoscopic depth and warm copper accents
- strengthen 3D frosted glass stereoscopic depth and warm copper elevation in collapsed state
- upgrade collapsed state with 3D frosted glass depth and subtle warm tint
- add discrete 1-notch mouse wheel stepping on desktop and magnetic inertia snapping on mobile
- replace 点/分 with central colon between dual 3D glass numeric capsules
- frame only numbers in dual 3D frosted glass capsules with static 点 and 分 outside
- split time selector into dual 3D frosted glass capsules and eliminate blur halo
- pin static 点 and 分 labels inside central selection lens
- make TimeWheelColumn an infinite circular looping wheel
- upgrade TimePicker to iOS Alarm-style dual scrolling wheel with 3D frosted glass anchor
- make TimePicker top bar a persistent in-place morphing anchor
- align expanded TimePicker time display with collapsed anchor on the left
- synchronize AI preferences preview card with unified tag pool system
- add silky-smooth cubic-bezier layout transition for downward extension
- add shrink-fade exit and smooth layout refill to candidate pool
- add decision modal after AI preference extraction
- simplify tag interaction to one-tap add and one-tap remove without plus/cross icons
- refactor recommendation preferences with interactive tag pool and AI NLP tag extraction
- upgrade BackupDialog with French editorial luxury styling
- upgrade ShareDialog with framer-motion sliding pill animation and luxury French editorial UI
- optimize Profile tab with French luxury editorial UI, live sync green dot, and trip metrics
- upgrade auth verification & trip loading screens to French Editorial aesthetic
- add interactive comparison switcher for DayTabButton styles
- upgrade incomplete itinerary empty state to French Editorial readiness card
- upgrade shared trip switcher to French Editorial liquid glass capsule
- implement interactive-triggered squash & stretch across all segmented sliders
- unify velocity squash & stretch physics across all segmented sliders
- add fluid velocity squash & stretch deformation to segmented sliders
- add spring layoutId sliding pill animation to login/register segment
- redesign hotel detail modal decision footer
- implement mobile long-press drag and smooth touch scrolling
- polish hotel picker and custom accommodation styling
- unify hotel booking section
- disable Supabase cloud sync on localhost to save bandwidth
- add universal ConfirmDialog, revamp logistics tab & polish date picker

### Changed

- soften mobile left edge fades
- mirror summary rail edge fade
- mirror day rail edge fade
- strengthen selector card depth
- add 3D micro-crystalline frosted glass and specular highlights to Theme Selector
- align API request meter rail and details panel with French Editorial micro-glass design
- restore popup modal dialog for AI preference settings across desktop and mobile
- layout(preferences): align time and active pool on left, candidate pool top-right, and AI extractor bottom-right
- layout(preferences): restructure panel into 5:7 dual-column flow to provide seamless TimePicker expansion runway
- layout(profile): arrange 4 trip health stats in 2x2 grid in account card
- layout(profile): adjust desktop Row 1 cards to 2:1 ratio and stack action buttons vertically
- remove plus sign prefix from candidate tag pills
- arrange cards with top full-width banner and bottom 2-column grid on desktop
- hide close button on mobile in avatar modal, retain on desktop only
- remove bottom footer bar from avatar modal and enable responsive close button
- tint assistant response bubble with soft sage porcelain
- enhance disabled send button contrast and grey pill contour
- upgrade bottom input bar and send button to 3D obsidian crystal and frosted glass
- separate active pool and candidate deck into two distinct cards
- standardize clear pool button to exact DayTimeline 32px glass capsule
- unify preference pool and candidate deck into one frosted card
- upgrade clear pool button to ParisTour French glass micro-capsule
- harmonize card containers and section header typography with global UI tokens
- clean(preferences): remove Chinese text from clear pool button to keep minimal icon button
- clean(profile): remove redundant top-right '修改偏好' button from AI Preferences card header
- remove layout extension and refill animations for instantaneous native DOM updates
- eliminate layout overshoot with zero-overshoot deceleration curves
- inject ParisTour signature liquid frosted glass and streaming light shine into tag pills
- standardize tag pills to match Image 1 rich pastel design
- convert tag pills to refined micro-capsules (text-[10.5px], h-6)
- standardize extraction decision dialog to global ParisTour UI language
- reduce tag pill height and synchronize font size with section headers
- strictly unify tag pill design system and font size across active and candidate pools
- guarantee 100% pure text tags with complete emoji sanitization
- make active and candidate capsule tags 100% pixel-identical in size
- remove emoji prefixes and output clean text-only tags
- add French editorial pastel color palette for preference tag chips
- compress all preference tags to <=5 chars and strictly enforce character limit on LLM extraction
- strictly unify font size, pill height and chip dimensions across tag pools
- align backup card styling and icon-only restore button with global UI
- unify all modal backdrops with lightweight micro-blur glass aesthetics
- remove role indicator dot from mobile avatar for a clean aesthetic
- align LoginPage with French editorial liquid glassmorphism design system
- unify top header layout to match hotel picker styling
- remove count number from expand button text
- streamline top header and reposition refresh button to candidates section
- use CircleMinus icon for unselect button
- change unselect icon to minus (-) icon
- suppress self-save realtime echo and reduce database egress bandwidth
- make release workflow idempotent and embed bilingual notes

### Fixed

- align mobile day rail inset
- respect day rail snap origin
- align day rail left fade
- limit edge fades to mobile
- balance vertical padding and capsule curvature symmetry on API meter rail
- harmonize API meter spacing
- balance API meter panel spacing
- resolve ShareDialog invite card, email input, role pills, and alerts dark styles
- resolve BackupDialog snapshot cards milky background and low contrast text
- polish AuthLoadingScreen central icon badge, smooth aura ring, and ambient glows
- resolve header TripSelectorCapsule milky chalky background with dark glass styling
- remove orange shadow glow halo from preference panel button
- polish ProfileTab stats cards, action buttons, preference tags, theme selector, and danger zone
- resolve API meter details panel milky subcards with deep obsidian dark glass grid
- invert OpenAI brand icon in dark mode for crisp visibility
- soften metadata capsule tints and unify text contrast across summary strip
- resolve hotel card murky olive background with deep obsidian dark glass base
- resolve chat Send button white-on-white text with glowing copper dark styling
- resolve LLM model picker and thinking settings popover milky background
- refine AddPlaceDialog tab switcher, category pills, and search inputs
- resolve stop card hover white flash with dark micro-glow hover styles
- resolve map header milky background and OpenStreetMap attribution badge
- resolve Add Place button and empty state milky backgrounds
- resolve Day 1 hero container milky card and low contrast summary text
- resolve itinerary day tab pills, route links, hero subcards, and summary bar contrast
- adapt footer disclaimer container and text to midnight theme
- soften harsh white border on nav segment capsule and active pill
- resolve flight subcard milky backgrounds, contrast issues on pills and booking badges
- cache useSyncExternalStore avatar snapshot to prevent infinite re-renders
- remove duplicate safe area bottom padding from floating chat panel
- reveal model picker after height collapse
- refine assistant transitions and overlay behavior
- refactor LlmModelPicker popover to true in-flow height auto layout
- prevent initial height overshoot on LlmModelPicker popover
- fix mobile Safari WebKit height measurement for LlmModelPicker popover
- refine model picker panel animations
- anchor root popover panel to bottom so model section stays stationary during height expansion
- eliminate two-stage push-down jitter when expanding thinking slider
- eliminate collapse animation hitch by moving padding and border into inner wrapper
- ensure robust reset and alignment to confirmed value upon cancel or reopen
- eliminate two-stage magnification jump by locking base font-size and using pure continuous GPU scaling
- eliminate open-time wheel spinning by removing scroll-smooth and positioning silently before paint
- unify TimePicker wheel typography with global Outfit sans font
- ensure high-contrast deep ink numbers by placing capsule background behind text
- ensure pixel-perfect vertical centering of wheel numbers in lens box
- guarantee 0px subpixel shift for TimePicker 10:00 text
- eliminate dark outline ring during TimePicker expansion
- resolve TimePicker popover z-index layering issue
- eliminate all rebound by using pure linear-easeOut slide and unscaled opacity exit
- enable mode=popLayout for instantaneous silky-smooth tag refill animations
- remove spring physics to let candidate deck naturally extend downward
- smooth preference pool container border resizing with layout=size
- stabilize dialog height to prevent vertical viewport shifts when toggling tags
- isolate tag entry animation so existing tags glide stably without springing
- optimize preference tag extraction prompt and enable clean fallback processing
- streamline snapshot cards into compact single-row layout
- eliminate hairline seam between bottom sheet and overscroll bleed skirt
- add mobile overscroll bleed skirt to prevent dark backdrop gap on pull up
- condense BackupDialog subtitle to fit neatly on a single line
- simplify email input placeholder to 'partner@example.com'
- remove header badge and redesign invite form layout for clean symmetry
- tighten spacing between danger card, version note, and footer
- unify natural page height and restore footer across all tabs
- update flight section hint from '请先选定左侧日期' to '请先选定旅行日期' for mobile responsiveness
- expand itinerary readiness card to fill full viewport height without bottom gap
- adjust mask-image fade width to 12px for crisp subtle edge transitions
- fit itinerary readiness empty state perfectly into single mobile screen
- adjust mask-image fade width to 20px for tighter horizontal scroll transitions
- apply soft linear-gradient mask fade to summary strip and day tabs scroll tracks
- eliminate mount-time layout thrashing and squash animation replay on tab switch
- synchronize initial itinerary start date resolution to eliminate 7-to-6 day jump
- adjust vertical spacing between Day Tabs and Mobile View Switcher
- implement circuit breaker and straight-line fallback to prevent repeated API calls
- resolve left shadow clipping and finalize French copper-amber gradient style
- eliminate backdrop flashing and transition jitter on mount/unmount
- eliminate semantic duplication, align baseline, and fix mobile avatar layout
- render TripSelectorCapsule popover as fixed floating overlay
- disable page scrolling and bounce on login screen
- eliminate initial in-place bounce by adopting pure layout spring physics across all sliders
- add onClick handler to candidate cards so clicking opens hotel details popup
- remove unused CircleMinus and X imports to fix tsc -b
- smooth flight card edit transitions


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

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.9.1...HEAD
- [0.9.1]: https://github.com/JackZ0526/ParisTour/compare/v0.9.0...v0.9.1
- [0.9.0]: https://github.com/JackZ0526/ParisTour/compare/v0.8.1...v0.9.0
- [0.8.1]: https://github.com/JackZ0526/ParisTour/compare/v0.8.0...v0.8.1
- [0.8.0]: https://github.com/JackZ0526/ParisTour/compare/v0.7.0...v0.8.0
- [0.7.0]: https://github.com/JackZ0526/ParisTour/compare/v0.6.0...v0.7.0
- [0.6.0]: https://github.com/JackZ0526/ParisTour/compare/v0.5.0...v0.6.0
- [0.5.0]: https://github.com/JackZ0526/ParisTour/compare/v0.4.0...v0.5.0
- [0.4.0]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...v0.4.0
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
