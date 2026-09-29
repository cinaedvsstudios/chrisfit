# ChrisFit v2.16 continuation checkpoint

Status: backend compatibility phase implemented and tested. Apps Script deployment
is the next step in the approved plan. Frontend remains v2.15; no frontend files
have been changed or released. The complete user-supplied plan is in
`docs/V2_16_LOCAL_FIRST_PLAN.md`.

## Deploy the backend first

1. Open the Apps Script project used by the current ChrisFit deployment.
2. Replace its Code.gs with the complete `google-apps-script/Code.gs` in this repository.
   Keep the existing spreadsheet ID, token configuration and deployment URL.
3. Save. Select `setupSync` in the function menu and run it once.
   It appends technical columns, creates `sync_meta`, and assigns missing library IDs
   using the same existing setup behavior. Existing user data is preserved.
4. Deploy > Manage deployments > select the existing web app > Edit.
   Choose New version, then Deploy. Keep its current access/execution settings.
   Editing the existing deployment preserves its URL.
5. Open the existing /exec URL with `?action=manifest`.
   It must return `backendVersion: "2.16"` and five numeric revisions.
   Also check `?action=bootstrap` and the existing app before releasing the frontend.
   If the deployment URL already has parameters, use & instead of ?.

Official deployment instructions:
https://developers.google.com/apps-script/concepts/deployments

## Backend changes and API contract

- Normal GETs never call ensureSchema or assign library IDs.
- `manifest` reads only the fixed five dataset rows in sync_meta.
- `bootstrap` returns settings, foods, library, entries (all history), weights, meta.
  It is read-only and holds the script lock while pairing a snapshot with revisions.
- `dataset&dataset=entries` (or settings/foods/library/weights) returns
  `{ dataset, data, meta }`. It also holds the lock for a coherent snapshot.
  Update only the revision for the dataset whose data was actually loaded.
- Manifest fields: backendVersion, cacheSchemaVersion (1), spreadsheetId, serverTime,
  revisions and updatedAt (objects keyed by settings/foods/library/entries/weights).
- Existing settings/foods/library/entries/weights/export response shapes remain.
  Records in the four collection datasets add clientId and updatedAt fields.
- Adds accept optional `data.clientId` and return success, numeric id and clientId.
  A repeated clientId returns the existing id with duplicate:true, without another row.
  These technical columns apply to foods/library too, since their queued adds must
  also be safe after a lost acknowledgement. Old clients may omit clientId.
- All HTTP writes share one script lock. Batch avoids nested locks and checks schema
  only for the datasets it touches. Entry saves do not scan the library.
- Batch still accepts `{ operations: [{ type, data }] }`, case-insensitive types.
  It returns success, processed, skippedMissing and an ordered results array.
- An edit/delete may specify `data.recordClientId` to resolve a locally created
  record whose numeric ID was lost with the add response. This is the original
  record's clientId; the edit operation's own clientId is a different identifier.
- Revisions are invalidated just before a mutation. A failure may advance a revision
  without changing data; this intentionally causes a harmless refresh and prevents
  partially applied batches from appearing unchanged.
- Retried batch deletes of missing records keep the existing skippedMissing behavior.
- Import/reset invalidate affected datasets; library is preserved.
- No deployment URL, calorie math, visuals, history logic or guidance text changed.

## Validation completed

Run `node tests/backend-sync.test.cjs` from the repository root.
Eight tests passed against the actual Code.gs in an instrumented Apps Script mock:
legacy read compatibility, setup preservation, five-row manifest reads, read-only
bootstrap/dataset snapshots, duplicate-safe retries for all four add datasets,
partial batch retry, edit/delete via recordClientId, revision invalidation,
library isolation on entry writes, import/reset and lock release on failure.

These are simulated tests, not proof of a live Apps Script deployment or browser
offline behavior. Deployment and all frontend acceptance tests remain outstanding.
Legacy clients still do not send clientId, so duplicate protection becomes effective
for their queued writes only after the new frontend is installed.
Direct manual edits to Google Sheets do not increment app-write revisions; the
planned Force full refresh must fetch bootstrap regardless of the manifest.

## Continue after the deployed manifest reports 2.16

The user authorized implementation of the supplied plan only. Do not ask for that
authorization again. Do not release a frontend that calls new endpoints before the
backend is deployed. Fetch current repository files and the current main commit
before making further changes.

Remaining files: js/api.js, js/state.js, new js/cache.js, js/ui.js, js/settings.js,
js/connection-reports.js. Check js/app.js as a read-only dependency: it currently
awaits initialise, so initialise must render cached data and return without waiting
for network when cache is available.

Implement the remaining steps in the approved order:

1. Validate/save a localStorage snapshot scoped to the configured backend.
   Preserve pending queue `chrisfit.pendingWrites.v3`; corrupt/absent cache must not
   discard pending writes. Render saved remote data with queue overlays immediately.
2. One manifest call on cached startup; no parallel settings/foods/library/weights/
   entries startup burst. Unchanged revisions produce no dataset requests.
   Empty/corrupt cache uses one bootstrap. Changed datasets use envelope reads.
3. Preserve loaded history/cache coverage and avoid marking unseen history loaded.
   Bootstrap currently returns all entries. Manual full refresh uses bootstrap.
4. Pending operations need stable client IDs and frozen in-flight payloads.
   Persist server acknowledgements and merged data before removing queued operations.
   A lost response must not duplicate an add or lose an edit made while saving.
   Use returned ids/clientIds to reconcile local record identity, without reloading
   every dataset after each save. Keep edits made during sync queued separately.
5. Lazy remote library refresh: render cached library at once; defer its changed
   revision fetch until Add Food/Search actually needs it. Do not mark an unfetched
   library revision as cached. Preserve existing dialog behavior.
6. Bounded GET retry; do not blindly retry unprotected POSTs. Keep usable cache and
   pending writes on network/storage failures; make sync warnings informative.
7. Show Web · v2.16 and add Clear local cache, Copy sync/cache report and Force full
   refresh to Settings. Cache clearing must not silently delete unsynced changes.
8. Reports identify actual action, full request URL, HTTP status, elapsed time,
   attempt/retry count and cache presence/use.

Acceptance tests from the plan still required: immediate cached startup; single
bootstrap without cache; offline restart; bad backend URL with usable cache;
offline food/burn/weight additions; reconnect sends each item once; lost-response
retry; full refresh; history navigation; settings revision/cache update; lazy library
refresh. Also verify in-flight add/edit/delete and partial-save/reload races.

Do not change layout, calculations, weekly summaries, history display, food styles,
guidance wording, user sheet values or deployment URL beyond the planned technical
sync columns/meta sheet.

## Paste into a new chat

Continue the approved ChrisFit v2.16 local-first plan in
https://github.com/cinaedvsstudios/chrisfit.
Read docs/V2_16_HANDOFF.md and docs/V2_16_LOCAL_FIRST_PLAN.md first.
The backend phase is committed; the frontend is still v2.15 and has not been changed.
Verify whether I have deployed the new Code.gs and whether action=manifest returns
backendVersion 2.16 before releasing frontend changes. Follow the plan only.
I already authorized implementation. If a quota limit approaches, commit a clean
checkpoint and update the handoff so another chat can continue without guessing.
