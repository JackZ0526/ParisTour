# Project optimization — 2026-09-18

Implemented:
- Preference flags use canonical tag identities, including old Chinese labels and English display names. Existing tag wording and order are retained. Custom text no longer accidentally toggles unrelated museum avoidance flags.
- Chat accepts CRLF and chunk-split SSE events, including an unterminated final event. An empty completion retries once with reasoning disabled; cancellation and partial output are not automatically replayed.
- Manual retry replaces the failed generation turn and preserves its quote/images/context. Retry is unavailable once action application begins.
- IndexedDB stores the latest 100 chat turns, text/image/quote draft on the current device, keyed by account and trip. Storage errors are visible. This is not cloud conversation sync. Ordinary trip sync no longer remounts a running chat.
- Model context is bounded to 24 recent turns / 24,000 text characters / two historical image turns. The current itinerary is still supplied each time. Older images are marked as omitted in model context.
- Scrolling follows output only near the bottom. Profile and hotel interfaces load as separate chunks.
- PWA uses an explicit refresh prompt. Map and HEIC chunks are cached on first use instead of installation; these features need a first online load before offline reuse.
- Backup/share text matches supported behavior. Backup load failures have retry instead of a misleading empty state. Production hides the developer API meter; the footer version comes from package.json.
- Auth validation has an 8-second total deadline; shared upstream requests inherit client cancellation and a 45-second deadline. AI functions align with the 60-second deployment setting.
- AI requests use a database-backed, per-account fixed-window limit of 120 requests per minute. Limiter failure returns 503; quota exhaustion returns 429 + Retry-After. This is burst protection, not a monetary spending cap.
- Development defaults to loopback because its paid proxies bypass login. LAN testing requires an explicit host override.
- GitHub CI runs lint, prompt checks, tests and production build.

Database changes applied to the linked ParisTour project:
- `restrict_profile_visibility`: own profile, trip owner for an invitee, and invited profiles for the owner. Explicit user predicates plus existing trip/share RLS; no new security-definer visibility function.
- `ai_request_rate_limit`: private counter table and narrow authenticated RPC. Account identity comes from auth.uid(), never caller parameters. Transaction tests roll back counters after testing.

Measured build comparison (uncompressed): entry JS 1,176.99 kB → 733.02 kB; precache 7,194.59 KiB → approximately 3,150 KiB. Entry chunk reduction does not equal total first-page transfer reduction: shared chunks and the initially selected tab still load.

Validation: production build, lint, prompt contracts, 543 unit tests (79 files); real chat request and reload persistence in the browser; mobile horizontal-overflow check. RLS checked against every existing account, a synthetic unrelated account and anon. Rate limiter checked for 120 accepts / 121st rejection and inaccessible counter writes.

Remaining work:
- Incrementally split large App/TripChatPanel/HotelPicker components. Existing hook lint warnings and large map/HEIC chunk warnings remain.
- Production-preview update/reload/offline and multi-tab conflict regressions are now covered; see verification-2026-09-18.md. Conflicting tabs retain their draft and require refresh instead of overwriting newer data.
- Supabase advisors still flag pre-existing function search_path / function execution grants and disabled leaked-password protection. Review each function's intended callers before tightening its grants. References: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Daily monetary budgets and server-side token ceilings require an agreed budget/provider policy.

The private rate-counter table intentionally has RLS enabled with no client policies and no client table grants; the advisor reports this as `rls_enabled_no_policy`. Only the scoped private RPC writes it.
