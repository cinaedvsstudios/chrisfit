[2026-09-29 21:38 Berlin time]

Yes. This is the plan I should have written before making more changes.

The goal is not “make reconnect better.” The goal is: **ChrisFit opens from local data immediately, then syncs with Google Sheets in the background. If Google Apps Script is slow, broken, or temporarily returns rubbish, the app still works.**

The current problem

The recent change that likely caused the regression is the move from “load one day” to “load a date range / more history at startup.” The older backend only had `getEntries_(e.parameter.date)`, so it was basically reading for a single selected day. :chatgpt-content-reference{index="0"}

The newer backend accepts `from` and `to`, but it still uses `getDataRange().getValues()` first, then filters afterwards. That means Apps Script still reads the whole entries sheet before returning the smaller range. :chatgpt-content-reference{index="1"}

The other big problem is that every normal GET request runs `ensureSchema_()` before it even checks whether it is loading settings, foods, library, entries, or weights. :chatgpt-content-reference{index="2"} That function checks all required sheets and then also runs `ensureLibraryIds_()`. :chatgpt-content-reference{index="3"}

So the app has become heavier in two ways: more startup requests, and each request does unnecessary sheet/schema work. That matches the errors: startup dies inside multiple parallel requests, then reconnect repeats the same pattern.

The actual v2.16 fix

First, I would change the app to be **local-first**.

On startup, the frontend will read a saved cache from localStorage before contacting Google at all. The cache will include settings, quick foods, library, weights, entries, guidance if enabled later, and the last known backend revision numbers. The app will render immediately from that cache. It should show a small status like “Using saved data · checking for updates…” instead of blocking the UI.

Then the app will call the backend once, not five times. The first background call should be a lightweight `manifest` call. This should return revision numbers only, for example settings revision, foods revision, library revision, entries revision, weights revision, plus server time and spreadsheet/app backend version. If the manifest says nothing changed, the frontend does not reload the data. If only entries changed, it reloads entries. If only weights changed, it reloads weights. It will stop blindly reloading everything on every app open.

Second, I would change the backend so it has a proper `meta` or `sync_meta` sheet.

That sheet will store revision numbers like this:

```text
dataset       revision     updatedAt
settings      12           2026-09-29T...
foods         8            2026-09-29T...
library       3            2026-09-29T...
entries       41           2026-09-29T...
weights       6            2026-09-29T...
```

Every successful write through the app will increment the correct revision. Adding food increments `entries`; editing a food button increments `foods`; changing settings increments `settings`; adding weight increments `weights`.

That avoids the stupid approach of reading the whole sheet just to ask “did anything change?”

Third, I would add a proper backend `manifest` endpoint.

The endpoint:

```text
?action=manifest
```

will return the revision summary only. It must not run full-sheet reads. It must not scan entries. It must not load the library. It should be fast even when the spreadsheet has lots of rows.

Fourth, I would add a backend `bootstrap` endpoint, but only for when it is needed.

The endpoint:

```text
?action=bootstrap
```

will return the full current app data in one response: settings, foods, library, entries, weights, meta. This is used when the app has no local cache, the cache is corrupt, or the manifest says a full refresh is needed.

Normal startup should be:

```text
localStorage cache → render app → manifest check → reload only changed datasets
```

Not:

```text
settings + foods + library + weights + entries all in parallel before the app opens
```

Fifth, I would remove `ensureSchema_()` from normal reads.

`ensureSchema_()` should not run on every GET. It should run only on setup, import, write actions where a missing column could matter, or a dedicated admin action like:

```text
?action=setup
```

Normal reads should just read. Startup should not be rewriting/checking spreadsheet structure.

Sixth, I would stop loading the searchable library on startup unless needed.

Quick Add needs the `foods` tab. The huge searchable food library only needs to load when you open Add Food/Search. It can still be cached locally, but it should not block app startup.

Seventh, I would make writes local-first and idempotent.

When you add food, burn, or weight, the app should immediately add it locally and mark it as pending. Then it sends it to Apps Script in the background.

To avoid duplicates, every local write gets a stable `clientId`, for example:

```text
local_20260929_213812_abcd1234
```

The backend stores that `clientId` in the sheet. If the app retries a save after a timeout, the backend checks whether that `clientId` already exists. If it exists, it does not create a duplicate row. This fixes the dangerous case where Apps Script saves the row, the browser times out, then reconnect tries again and duplicates it.

This means adding optional columns like `clientId` and `updatedAt` to entries and weights. Existing rows can leave them blank. New rows get them.

Eighth, I would make network failure less dramatic.

GET requests can retry once or twice with a short delay. POST/batch requests should not blindly retry unless they have `clientId` protection. Error reports should include the exact failed action, full URL including `?action=...`, HTTP status, elapsed time, retry count, and whether the app was already showing cached data.

The user-facing message should change from scary “failed to load” to something more useful:

```text
Using saved data. Google sync failed; retrying in background.
```

The app should only show a serious error if there is no cache and the backend also fails.

Files I would change

`google-apps-script/Code.gs`

This gets the biggest backend change. I would add `manifest`, `bootstrap`, dataset reload endpoints, sync meta helpers, revision increment helpers, clientId duplicate protection, and remove schema checks from normal GET reads. Existing endpoints like `settings`, `foods`, `entries`, `weights`, and `batch` should remain for compatibility until the frontend is fully switched.

`js/api.js`

This gets the biggest frontend change. I would replace the current startup/reconnect flow with cache-first startup, manifest check, background sync, changed-dataset reloads, retry handling, better request error metadata, and idempotent pending sync.

`js/state.js`

Add state fields for cache status, sync status, last successful sync, backend manifest, and pending local changes with client IDs.

New file: `js/cache.js`

This handles reading/writing localStorage cleanly instead of scattering it through `api.js`. It will have functions like load cache, save cache, validate cache, clear cache, get cache size, and maybe trim old entries if storage grows too large.

`js/ui.js`

Only update status text/version display and make sure the app renders cached data immediately. It should show `Web · v2.16`.

`js/settings.js`

Add buttons/status for cache management: “Clear local cache,” “Copy sync/cache report,” maybe “Force full refresh.” This is not the core fix, but it gives us a recovery route without deleting browser data manually.

`js/connection-reports.js`

Improve reports so they say exactly which backend action failed. The current reports are useful but still too vague because they show only the base `/exec` URL.

Files I would not touch

I would not touch the visual layout, calories math, weekly summary logic, history display, food button styling, guidance message wording, or the Google Sheet data values except for adding technical sync columns/meta sheet if needed. I would not change the Apps Script deployment URL unless the deployment itself is broken.

Implementation order

Step 1: backend compatibility first.

I would update `Code.gs` so the old frontend still works, but the new endpoints also exist. That means adding `manifest` and `bootstrap` without removing `settings`, `foods`, `library`, `entries`, `weights`, or `batch`.

Step 2: backend deployment.

You would paste the new `Code.gs` into Apps Script and update the existing deployment to a new version. The URL should stay the same. I would not push frontend v2.16 until the backend is live, because otherwise the frontend would call endpoints that do not exist yet.

Step 3: frontend local cache.

I would add `js/cache.js` and change `js/api.js` so startup reads local cache first. At this point, even if the backend fails, the app should still open with last-known data.

Step 4: manifest comparison.

I would add the manifest check. If local cache manifest equals backend manifest, no reload. If different, reload only changed datasets.

Step 5: pending writes with `clientId`.

I would update add/edit/delete flows so local changes are saved locally first, queued, and synced safely. Backend batch saves become idempotent, so timeouts cannot create duplicates.

Step 6: lazy-load library.

The searchable library loads from cache on app open, but remote library refresh happens only if the manifest says library changed, or when you actually open/search the library.

Step 7: improve error reports.

Reports should now say:

```text
Action: manifest
Full URL: .../exec?action=manifest
Attempt: 1 of 2
Cache available: yes
Using cached data: yes
```

That way, if something still fails, we can see the exact failing call instead of guessing.

Testing plan before saying it is fixed

Fresh startup with cache: open app, it should render immediately before Google replies.

Fresh startup without cache: clear cache, open app, it should make one bootstrap call and render. It should not fire five parallel requests.

Airplane-mode startup after one successful load: app should still open from cache.

Backend failure test: temporarily use a bad Apps Script URL. App should still open cached data and show a sync warning, not a broken app.

Add food/burn while backend is unavailable: entry should appear locally as pending.

Reconnect after backend returns: pending entry should sync once.

Timeout retry test: if the same pending item is retried, it must not duplicate because of `clientId`.

Manual refresh test: force full refresh should replace local cache from backend.

History test: changing weeks/months should not cause startup-style full reloads.

Settings test: changing settings increments settings revision and updates cache.

Library test: opening Add Food loads cached library first, then updates only if library revision changed.

What “working” means after this

The app opening should not depend on Google Apps Script being fast.

The app should not make several parallel startup calls.

The backend should not run schema checks on every read.

The app should not reload unchanged sheet data.

Timeouts should not duplicate entries.

Error reports should identify the exact failed backend action.

The visible version should say `Web · v2.16`, so we know we are testing the fixed architecture and not the old v2.15 behavior.

That is the plan I would follow. No more random patches before this architecture is fixed.
