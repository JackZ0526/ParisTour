# Paris Tour

[中文文档](README.zh-CN.md) · [Changelog](CHANGELOG.md)

Invite-only Paris trip planner with per-account cloud save and realtime sync. Share by email as read-only or editable. Map, timeline, and LLM recommendations in one place—turn flights, hotels, and daily stops into a walkable itinerary.

## Features

- **Invite-only accounts**: Only allowlisted emails can register/sign in; the main UI and paid APIs require login
- **Cloud save**: Dates, flights, hotels, itinerary, and baseline persist per account; bottom-left HUD shows save status
- **Realtime sync**: Multi-device / collaborator edits sync via Supabase Realtime
- **Sharing**: Owners share by email (read-only or editable); invite emails include login/signup deep links
- **Editable timeline (DayTimeline)**: Drag to reorder, delete, restore baseline; browse by day
- **AI itinerary generation**: Multi-day plans from flights, hotels, and preferences; single-day reshuffle supported
- **TripChat**: Natural-language itinerary edits (add/swap places, change hotels, switch days, etc.)
- **Place add**: LLM recommendations or Google search; place details, photos, and reviews
- **Map & navigation**: MapLibre + OpenStreetMap for the day map; openrouteservice road geometry; key-free Google Maps navigation links
- **Hotels / flights**: Hotel area recommendations and selection; flight templates and live schedule lookup

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite · React 19 · TypeScript · Tailwind CSS v4 |
| Maps | MapLibre GL JS + OpenStreetMap; openrouteservice road geometry |
| Backend / data | Supabase (Auth · Postgres · Realtime · RLS) |
| API proxy | Vercel Serverless (`/api/*`): OpenAI, Gemini, RapidAPI, share email |
| Email | Resend (optional; without it you can copy invite links) |

## Local setup

1. Create a project on [Supabase](https://supabase.com)
2. In the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql)
3. Allowlist your email:

```sql
insert into public.allowlist_emails (email) values ('you@example.com');
```

4. Authentication → Providers → Email: enable email/password (for local use you can turn off “Confirm email” for instant login)
5. Copy the Project URL and anon key, set env vars, then start:

```bash
npm install
cp .env.example .env
# fill in the variables below
npm run dev
```

Open `http://127.0.0.1:5173/` in the browser.

### Environment variables (`.env`, gitignored)

See [`.env.example`](.env.example). **Never commit secrets.**

```env
# --- Server (no VITE_ prefix) ---
RAPIDAPI_KEY=              # Flights: TimeTable Lookup / AeroDataBox
DEEPSEEK_API_KEY=          # Preferred default LLM (itinerary, chat, recommendations)
OPENROUTESERVICE_API_KEY=  # Road geometry for the itinerary map (server-only)
# DEEPSEEK_BASE_URL=       # Optional; default https://api.deepseek.com/v1
OPENAI_API_KEY=            # Optional OpenAI models in the picker
# OPENAI_BASE_URL=         # Optional; default https://api.openai.com/v1
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # Auth invite emails when Resend is unset (optional)
RESEND_API_KEY=            # Share invite email (optional)
RESEND_FROM_EMAIL=Paris Tour <invites@yourdomain.com>
PUBLIC_APP_URL=https://paristour.vercel.app

# --- Browser (VITE_) ---
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# VITE_DEEPSEEK_MODEL=deepseek-v4-flash  # Default DeepSeek model (or deepseek-v4-pro)
# VITE_OPENAI_MODEL=gpt-5.6-luna     # Override default to an OpenAI model
# VITE_LLM_ENABLED=true              # false hides LLM features
```

The itinerary map uses MapLibre GL and OpenStreetMap, and road geometry is powered by openrouteservice (`OPENROUTESERVICE_API_KEY`). Google Places queries and photos are securely routed through server-side `/api/google-places` (`GOOGLE_PLACES_API_KEY`).

A local Google Places referrer error usually means one of the above is missing. Create an openrouteservice key at [HeiGIT](https://account.heigit.org/) and store it only as the server-side `OPENROUTESERVICE_API_KEY`.

On Vercel, set the same variables; paid `/api/*` routes check Supabase JWT + allowlist. Without `RESEND_API_KEY`, sharing still works—the UI prompts you to copy the invite link manually.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development (Vite) |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | oxlint |
| `npm run release:patch` | Bump patch, update changelogs, commit + tag `v*` (no push) |
| `npm run release:minor` | Same for a minor bump |
| `npm run release:major` | Same for a major bump |

## Releases

Version history lives in [CHANGELOG.md](CHANGELOG.md) / [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md).

1. Land your feature commits on `main` (Conventional Commits help: `feat:`, `fix:`, …). Before releasing, add a curated Chinese summary under `## [Unreleased]` in `CHANGELOG.zh-CN.md`; the release command stops if it is missing.
2. One-time baseline (if no `v*` tags exist yet):

```bash
git tag -a v0.2.0 -m v0.2.0 620c6a8
git push origin v0.2.0
```

3. Cut the next release locally (writes changelogs + `package.json`, commits, annotated tag — **does not push**):

```bash
npm run release:patch   # or release:minor / release:major
# preview only: npm run release -- patch --dry-run
# files only:   npm run release -- patch --no-git
git push origin HEAD && git push origin vX.Y.Z
```

4. Pushing `v*` runs [`.github/workflows/release.yml`](.github/workflows/release.yml), which opens a bilingual GitHub Release from the matching sections in both changelogs.

**What gets auto-generated**

| Artifact | Source |
|----------|--------|
| `CHANGELOG.md` section | Commit subjects since previous `v*` tag (`feat`→Added, `fix`→Fixed, else Changed) **plus** any `Unreleased` bullets |
| `CHANGELOG.zh-CN.md` section | Curated Chinese bullets promoted from its required `Unreleased` section; never falls back to English |
| `package.json` `version` | Semver bump |
| git tag `vX.Y.Z` | Annotated tag on the release commit |
| GitHub Release | Workflow combines that version’s English and Chinese changelog sections |

## Project structure (overview)

```
src/
  components/   # DayTimeline, TripMap, TripChat, CloudSave, hotels/flights, etc.
  services/     # Cloud save, LLM, Google, flight lookup
  data/         # Itinerary templates, places, hotel areas, flight templates
  auth/         # Supabase auth state
api/            # Vercel proxies (OpenAI / RapidAPI / share invites)
supabase/       # schema.sql (accounts, saves, sharing & RLS)
```

| File | Contents |
|------|----------|
| `src/data/itinerary.ts` | Daily timeline & metro tips |
| `src/data/places.ts` | Place blurbs, coordinates, images |
| `src/data/hotels.ts` | Hotel area mapping |
| `src/data/flights.ts` | Suggested flight templates |
| `supabase/schema.sql` | Accounts, trip saves, sharing & RLS |

Itineraries cache in `localStorage` and debounce-sync to Supabase `trips.snapshot`; collaborators pick up updates via Realtime.

## Screenshots

<!-- Add UI screenshots here, e.g.: -->
<!-- ![Main UI](docs/screenshot-main.png) -->

## Notes

- No real flight or hotel booking
- Flight and opening hours change—verify for your travel dates
- On driving days, check Crit’Air and rental insurance
- Inviting users: shared emails are allowlisted automatically; or `insert into allowlist_emails` manually
