# Paris Tour

[中文文档](README.zh-CN.md)

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
- **Map & navigation**: Google Maps for the day’s route; Directions; flight lookup via TimeTable Lookup first
- **Hotels / flights**: Hotel area recommendations and selection; flight templates and live schedule lookup

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite · React 19 · TypeScript · Tailwind CSS v4 |
| Maps | Google Maps (`@react-google-maps/api`); Leaflet fallback |
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
OPENAI_API_KEY=            # Itinerary, chat, recommendations
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
VITE_GOOGLE_MAPS_API_KEY=
# VITE_OPENAI_MODEL=gpt-5.6-luna   # Default chat model (optional)
# VITE_LLM_ENABLED=true            # false hides LLM features
```

On Google Cloud, enable **Maps JavaScript API**, **Places API (New)**, and **Directions API**. Add these HTTP referrers:

- `http://127.0.0.1:5173/*`
- `http://localhost:5173/*`
- `https://paristour.vercel.app/*`

A local `RefererNotAllowedMapError` usually means one of the above is missing.

On Vercel, set the same variables; paid `/api/*` routes check Supabase JWT + allowlist. Without `RESEND_API_KEY`, sharing still works—the UI prompts you to copy the invite link manually.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development (Vite) |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | oxlint |

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
