# ChrisFit v2.16 continuation checkpoint

The backend is deployed and initialized. The frontend implementation is complete.
Published frontend commit: 1d60463e9c629398e04220dc2efa658fae40809e.
GitHub Pages build and deployment 36626193884 completed successfully.
The public js/ui.js response contains Web · v2.16.
The user authorized the original plan only; that plan is preserved in
docs/V2_16_LOCAL_FIRST_PLAN.md. Do not request implementation authorization again.

## Completed

- Backend compatible v2.16 committed in 81f1ef5bd97a3a2783f1798db0a3acf071bef50c.
- User saved/deployed Code.gs. Live manifest initially required setup; action=setup
  was then run successfully on the existing deployment. No further Apps Script
  redeployment is needed for the frontend commit.
- Live setup returned backendVersion 2.16, cacheSchemaVersion 1, five revisions.
- Live bootstrap returned valid settings, 22 foods, 22 library items, 450 entries
  and 17 weights. Data validation passed against the new frontend validator.
- Frontend reads a validated saved snapshot and renders before Google responds.
- Cached startup checks manifest once; unchanged datasets are not fetched.
- Fresh/corrupt cache uses one bootstrap. Complete history stays locally available.
- Changed datasets load sequentially via dataset envelopes; only the loaded
  dataset's revision is advanced. Changed library is deferred until Add Food or
  Settings needs it, with cached results visible immediately.
- The existing pendingWrites.v3 queue is preserved/migrated with stable client IDs.
  Adds become immutable once sent; later edits/deletes are separate queued writes.
  recordClientId and returned numeric IDs reconcile pending record identity.
- The remote snapshot and acknowledgement receipts are saved atomically before
  queued operations are removed. A crash/storage failure cannot silently erase
  unacknowledged changes or replay acknowledged settings.
- GETs retry once; POSTs are not blindly retried. Duplicate-protected queued
  writes can be retried by reconnect/background sync with the same client IDs.
- Network failures retain saved data and show a nonblocking sync warning.
- Settings has Clear local cache (preserves pending changes), Force full refresh
  and Copy sync/cache report. Request reports include full action URL (token
  omitted), HTTP status, elapsed time, attempt/retry count and cache availability/use.
- Version is Web · v2.16.
- guidance.js has one additional guard: unsupported remote guidance is not
  requested during initial rendering. All guidance messages and calculations stay
  unchanged. This is necessary to avoid an extra request outside the startup plan.

## Tests

Run from the repository root:

    node tests/backend-sync.test.cjs
    node --experimental-vm-modules tests/frontend-sync.test.cjs

8 backend + 15 frontend tests passed. Frontend tests execute the actual ES modules
against the actual Code.gs through instrumented Apps Script mocks. They cover:
single bootstrap; cached render before delayed network; unchanged manifest;
offline restart and food/burn/weight queue; reconnect once; GET retry/report metadata;
corrupt cache with existing queue; selective/lazy library reload; lost POST response;
edit/delete during a save; crash before queue removal; cache quota failure;
manual refresh; safe cache clearing; storage-disabled saves; invalid dataset response;
partial batch retry; stale deleted record reconciliation. All module imports resolve.

Live bootstrap data was also validated. No fake food or weight records were inserted
in the user's live spreadsheet for tests.

A local Chromium install was attempted for UI QA, but its downloaded ZIP was
invalid. The cloud browser was then opened at the live ChrisFit site. It continued
loading v2.15 modules even after reload, whereas an independent request to the
public js/ui.js returned v2.16 and the Pages deployment reported success.
Therefore actual v2.16 browser UI verification remains incomplete. Do not claim
it passed. User should force-refresh and verify Web · v2.16; first successful
bootstrap creates the cache, and subsequent opens use it immediately.

## Files changed in the frontend phase

js/api.js, js/cache.js (new), js/state.js, js/ui.js, js/settings.js,
js/connection-reports.js, js/guidance.js (startup request guard only),
tests/frontend-sync.test.cjs (new), tests/backend-mock.cjs (new), this handoff.

No HTML, CSS, calorie calculations, weekly summary calculations, history display,
food button styling, guidance wording, deployment URL or spreadsheet user data was
changed by the frontend implementation.

## Practical boundaries

- The first successful bootstrap establishes the data cache on each device/browser.
  Cache is stored locally and validated against the configured backend URL.
- The pending queue is stored separately so corrupting/clearing the data snapshot
  does not erase unsynced changes. Invalid pending queue JSON is preserved and
  reported; it is not silently replaced.
- Tests simulate offline Google sync after loading the frontend assets. This scoped
  plan does not add a service worker to guarantee loading the website shell without
  any network/browser HTTP cache.
- Manual sheet edits do not increment app-write revisions. Use Force full refresh
  after directly editing the spreadsheet.
- Library is included in a first bootstrap (as required by the plan) and cached;
  subsequent changed-library retrieval is lazy.
- Legacy already-saved rows without clientId cannot retroactively identify an old
  v2.15 write whose reply was lost. All newly queued v2.16 adds send clientId.
- Import/reset never automatically retry destructive POSTs and require pending
  writes to be saved/discarded first.

## If continuing in a new chat

Continue work in https://github.com/cinaedvsstudios/chrisfit.
Read docs/V2_16_HANDOFF.md and docs/V2_16_LOCAL_FIRST_PLAN.md first.
The backend is already deployed and initialized at v2.16. The frontend phase is
implemented and has 15 passing tests, plus 8 backend tests. Fetch current main and
check whether the frontend commit is published and the app displays Web · v2.16.
Finish outstanding browser UI verification if needed. Follow only the approved
plan. Do not redeploy Apps Script again unless Code.gs changes. Preserve pending
local writes, user sheet values, layout, calculations, history and guidance wording.
