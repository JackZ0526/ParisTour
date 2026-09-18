# Paris Tour

[Case study and screenshots](https://www.jackzhang.ca/paris-tour) · [中文文档](README.zh-CN.md) · [Changelog](CHANGELOG.md)

A personal travel-planning app that brings a shared itinerary, map and trip assistant into one workspace. It started from a practical need: organizing a Paris trip with other people while keeping daily plans easy to understand and change.

The hosted app uses invite-only accounts. The [public case study](https://www.jackzhang.ca/paris-tour) can be viewed without an account.

![Paris Tour daily itinerary beside its route map](https://raw.githubusercontent.com/JackZ0526/jackzhang-portfolio/main/public/assets/paris-tour/itinerary.webp)

## My contribution

I independently lead product direction, interaction and visual design, testing and iteration. Cursor and Codex produce the implementation code. My work includes defining the intended experience, reviewing results in the browser, identifying issues and directing revisions.

- Reworked desktop and mobile layouts, navigation and the relationship between the itinerary, map and chat.
- Refined motion, panel transitions and light/dark presentation through repeated visual review.
- Tested shared editing and directed fixes for missing updates, stale data and inconsistent interface behaviour.
- Guided improvements to loading feedback, chat persistence and update handling.

## Selected iterations

The project has progressed beyond its initial layout. Recent work includes preserving chat drafts across reloads, handling stale-tab conflicts, making app updates explicit and splitting optional interfaces into separate loading chunks.

The [optimization notes](docs/optimization-2026-09-18.md) and [verification record](docs/verification-2026-09-18.md) describe the changes and their test boundaries. Recorded build-size changes are not claims of an equivalent improvement in real-world page-load time.

<details>
<summary>Trip assistant screenshot</summary>

![Trip assistant alongside the current itinerary](https://raw.githubusercontent.com/JackZ0526/jackzhang-portfolio/main/public/assets/paris-tour/assistant.webp)

</details>

Screenshots are captured interface snapshots from the portfolio case study; the current app may have changed since capture.

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
| API proxy | Vercel Serverless (`/api/*`): model providers, places, flights, route geometry and sharing |
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
# VITE_DEEPSEEK_MODEL=deepseek-flash  # DeepSeek V4.1 Flash (native vision)
# VITE_OPENAI_MODEL=gpt-5.6-luna     # Override default to an OpenAI model
# VITE_LLM_ENABLED=true              # false hides LLM features
```

The map uses MapLibre GL and OpenStreetMap; road geometry uses the server-side `OPENROUTESERVICE_API_KEY`. Places queries use `/api/google-places`: `.env.example` documents RapidAPI as the default provider and the optional official Google Places provider (`GOOGLE_PLACES_PROVIDER=official`, `GOOGLE_PLACES_API_KEY`). Configure the provider you intend to use; a Places error and a route-geometry error involve different services.

On Vercel, set the same variables; paid `/api/*` routes check Supabase JWT + allowlist. Without `RESEND_API_KEY`, sharing still works—the UI prompts you to copy the invite link manually.

Jev handles chat intent routing and model-call preflight through the server-only `/api/jev` endpoint using Vercel AI Gateway (`typesafe-ai/jev`, AI SDK 7 evaluation API). Vercel deployments use OIDC; no TypeSafe key is needed. For local development, refresh `VERCEL_OIDC_TOKEN` with `vercel env pull`, preserving any local overrides, or set `AI_GATEWAY_API_KEY` without a `VITE_` prefix. Both routers fall back to the existing LLM and then heuristics when Jev is unavailable or uncertain about intent/web research. The model picker offers only DeepSeek V4.1 Flash and GPT-5.6 luna; both receive images natively.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development (Vite) |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Oxlint and icon-policy checks |
| `npm test` | Vitest regression suite |
| `npm run check:prompts` | Prompt-contract checks |
| `npm run release:patch` | Bump patch, update changelogs, commit + tag `v*` (no push) |
| `npm run release:minor` | Same for a minor bump |
| `npm run release:major` | Same for a major bump |

## Releases

See the [release workflow](docs/releases.md) and [changelog](CHANGELOG.md).

## Project structure

```text
src/
  features/    Itinerary, map, chat, hotels, flights, places and cloud sync
  shared/      Shared UI, utilities and provider services
  hooks/       Application-level hooks
  config/      Shared configuration
  __tests__/   Regression tests
api/           Server-side provider and sharing endpoints
supabase/      Database schema, migrations and database checks
docs/          Optimization and verification records
```

Itinerary edits use the V2 mutation log, local outbox and revision catch-up in `src/features/cloud-sync/v2/`. Other trip data retains the snapshot path. Chat history and drafts are stored on the current device, scoped to the account and trip; this is separate from cloud itinerary sharing.

## Notes

- No real flight or hotel booking
- Flight and opening hours change—verify for your travel dates
- On driving days, check Crit’Air and rental insurance
- Inviting users: shared emails are allowlisted automatically; or `insert into allowlist_emails` manually
