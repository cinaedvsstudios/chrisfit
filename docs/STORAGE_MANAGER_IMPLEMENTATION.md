# ChrisFit Storage & Cleanup — integration audit and test checklist

Current web release configuration: `Web · v2.18`. This work is intentionally staged in a draft PR until browser interaction and safety testing has been completed.

## Changed files

- `js/storage-manager.js` — new registry-driven inspector, cleanup UI, detailed browser, backup/restore and content-based Google verification UI.
- `css/storage-manager.css` — new responsive modal styling using existing CSS tokens.
- `js/settings.js` — only the `💾 Storage & Cleanup` Settings card and import.
- `index.html` — includes the new stylesheet.
- `js/api.js` — adds `verifyStoredSnapshot()`, a read-only complete-dataset comparison; existing sync and write paths unchanged.
- `tests/frontend-sync.test.cjs` — adds three protection/verification regression tests.
- `.github/workflows/chrisfit-regression.yml` — syntax, backend, and frontend regression testing.

No change to `google-apps-script/Code.gs`, calorie calculations, spreadsheet values, sync endpoint or current Android backup format. **No Apps Script redeployment is needed** for this frontend-only change.

## Audited browser storage ownership

All five known ChrisFit `localStorage` keys are confirmed in existing writers:

| Key | Writer | Category | Ordinary cleanup |
| --- | --- | --- | --- |
| `chrisfit.cache.v1` | `js/cache.js` | User Data / offline snapshot | PROTECTED, even when server verified |
| `chrisfit.pendingWrites.v3` | `js/api.js` | Drafts / unsynced changes | PROTECTED |
| `chrisfit.connectionReports.v1` | `js/connection-reports.js` | History & Logs | Manually reviewable, not Quick Clean |
| `chrisfit.theme.preference` | `js/theme.js` | Settings | PROTECTED |
| `chrisfit.history.customPeriod.v1` | `js/history.js` | Preferences | PROTECTED |

No ChrisFit-owned `sessionStorage`, IndexedDB database, Cache Storage cache, OPFS file or JavaScript cookie was found in source. The interface reports availability where possible, but does not assume origin-wide resources are owned by ChrisFit.

Legacy, unknown or other-app entries are not selected or deleted. No broad `localStorage.clear()` operation is used.

## Important safety decision

The cached Google snapshot is essential to ChrisFit's **local-first** startup. It is not a disposable duplicate, even if all five Google datasets match the server. Therefore:
- the Google comparison uses actual normalised data content (not just IDs, filenames, timestamps, or revisions);
- a successful match is informative, never permission for deleting the offline snapshot;
- Quick Clean currently has **zero** proven-safe candidates, so it intentionally performs no deletion;
- optional auto-cleanup is not enabled;
- connection reports can be removed only after explicit selection and confirmation;
- pending changes are not removed through standard cleanup;
- Clear Everything requires a typed phrase and final confirmation, and calls the existing safe pending-discard guard when necessary;
- Clear Everything is a **local device reset**, not the existing Google Sheet `Reset Entries` action.

## Backup and validation

The manager's browser-storage backup is separate from the existing Android-compatible fitness export. Backups carry a ChrisFit app identifier and version and are validated against the known key structures before import. Restore defaults to missing keys only, prevents overwriting pending changes, asks for explicit confirmation to replace existing values, and reloads to avoid stale in-memory data.

Diagnostic-report URL credentials are redacted from storage backups. Unknown keys and browser secrets are not exported.

## Tests

CI commands:
```bash
for f in js/*.js; do node --check "$f"; done
node tests/backend-sync.test.cjs
node --experimental-vm-modules tests/frontend-sync.test.cjs
```

Existing 8 backend tests and 15 frontend sync tests remain, plus 3 new frontend verification tests.

**Manual browser tests required before marking the PR ready to merge:**
- Desktop and mobile: open Settings → Storage & Cleanup, close and reopen without affecting normal navigation.
- Verify storage category labels, sizes, unknown-key protection and browser API warnings.
- Browse large snapshot data without accidental deletion; protected entry edit controls absent.
- Test Quick Clean with real browser data; it must not clear the offline snapshot or pending queue.
- Create an unsynced burn entry offline and attempt destructive actions: ordinary cleanup must protect it, and uncertain/in-flight saves must block the stronger reset.
- Confirm Check Google Server with matching data, changed server data and failed/unavailable server.
- Export a browser backup; verify JSON format, credential masking, invalid imports, missing-only imports and conflict prompts.
- Review/delete connection reports, then refresh and confirm the correct count.
- Clear Everything only in an isolated test profile, never a browser containing real unsynchronised entries.
- Confirm normal calorie/burn totals, history, settings persistence and Google sync after modal use.

Do not claim browser acceptance tests have passed until they are performed.
