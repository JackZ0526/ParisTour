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

- [Unreleased]: https://github.com/JackZ0526/ParisTour/compare/v0.3.1...HEAD
- [0.3.1]: https://github.com/JackZ0526/ParisTour/compare/v0.3.0...v0.3.1
- [0.3.0]: https://github.com/JackZ0526/ParisTour/releases/tag/v0.3.0
- [0.2.0]: https://github.com/JackZ0526/ParisTour/compare/e48cfb8...620c6a8
- [0.1.0]: https://github.com/JackZ0526/ParisTour/compare/36ed361...e48cfb8
