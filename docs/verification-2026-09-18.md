# Verification — chat, collaboration and PWA

Scope: verify the optimization changes before committing/deploying. Production database checks use a rollback transaction. Browser checks use isolated local production builds and deterministic mock AI responses, not live paid providers.

## Results

| Scenario | Evidence / result |
| --- | --- |
| Owner/editor/viewer/unrelated permissions | Passed against the linked database using four synthetic accounts and a synthetic trip; fixtures rolled back. Owner/editor can read/update and call the mutation RPC. Viewer can read but cannot update/call mutation RPC. Unrelated account cannot read/update. |
| Profile nicknames and avatars | Required owner/invitee fields are readable; unrelated fields and updates to other profiles are denied. `supabase/tests/collaboration_roles.sql` is repeatable. |
| Account/trip chat isolation | Hook + IndexedDB regression test restores history, quote, image draft and text only for the requested session key. |
| Idle stale tab | Reproduced data loss in the original implementation: closing a stale tab replaced the newer draft with an empty draft. Fixed by tracking actual edits and atomic revision comparison. Regression passes. |
| Both tabs edited | Stale write is rejected, stored data stays intact, local draft is retained with a conflict notice. Sending is disabled until refresh. |
| Immediate reload | Reproduced data loss in production preview when reloading immediately after input. Fixed with a synchronous per-tab recovery journal and IndexedDB revision/writer stamps. Same browser scenario now restores the final text. |
| Empty AI response | Mock server received exactly two generation requests (initial + one automatic retry). UI shows Retry after both fail. Manual retry recovers without duplicating the user turn. |
| Partial response interruption | Mock stream emits a partial reply then an error. Partial text and interruption notice remain, with manual Retry. No automatic replay after partial text. |
| Action replay protection | Code path sets `generationComplete` before any action application; generation-only retry is unavailable for action/application errors. Browser retry scenarios used empty actions, so this is a code-path check rather than an end-to-end itinerary-mutation test. |
| PWA update | Real generated service worker installed, detected a different worker version, displayed Refresh/Later and waited. Clicking Refresh immediately after typing preserved the newest draft and removed the prompt after reload. |
| Save failure during update | Regression test proves the worker activation callback is not invoked if a conflicting tab prevents saving. |
| Offline reopen | Stopped the isolated origin server completely. Reload still rendered the app, lazy hotel/chat UI and saved draft from caches/IndexedDB. This verifies app-shell/local-data availability, not offline AI or cloud sync. |
| Existing committed version → new version | Built HEAD separately, installed its old auto-update worker, replaced served files with the new build. Old tab remained old; closing it and reopening loaded the new asset hash and UI. |

## First-deployment note

The already-installed old client has no update prompt UI or chat persistence. For the first upgrade, finish/copy any unfinished old-client input, close every old app window/tab, and reopen. Subsequent versions use the new prompt + pre-update save mechanism. New code cannot recover chat state that the old client never persisted.

## Changes found necessary during verification

- Extracted IndexedDB operations to `chatSessionStore.ts`; writes compare revisions atomically, and a stale tab cannot overwrite another tab's data.
- Skip persistence for untouched tabs; serialize saves within a tab.
- Await registered draft flushes before activating a PWA update.
- Add per-tab synchronous unload recovery, including recognizing an older in-flight write from the same document.
- Preserve stale local input and display a conflict notice instead of silently merging unrelated conversations.

## Boundaries

- Collaboration checks exercised actual database policies/RPC authorization with simulated auth claims, not separate human logins in multiple browsers.
- No production frontend deployment was performed. Live deployment smoke tests remain a post-deployment step.
- Abrupt OS termination and device-storage exhaustion cannot guarantee recovery of large image drafts. Recovery falls back to text/quote if the synchronous journal is too large.
- The map/HEIC optional chunks still require a first successful online use for offline reuse.
- Tests use react-test-renderer for hook lifecycle and fake-indexeddb for deterministic storage races; its deprecation notice is informational. Browser checks above use the real production build and real browser storage.

Final checks: 551 tests passed across 80 files; production build, lint (no errors; existing warnings remain), prompt contracts and git diff whitespace check passed. The eight new session regressions include resolving a conflict via refresh after copying the draft. Temporary preview tabs and servers were closed; the original 5173 development server remains available. No commit, push or frontend deployment was performed.
