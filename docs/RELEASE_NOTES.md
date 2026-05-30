# Release Notes

## v1.0.0 (2026‑05‑30)

Initial web release of **ChrisFit**, a faithful clone of the original
Android app.  Key features include:

* Daily tracking of food intake and burns with quick‑add buttons.
* Custom entry dialog with burn toggle and support for negative calories.
* BMR quick‑add button using the configured BMR value.
* Weight tracking per date with BMI calculation.
* Summary box showing daily and weekly totals and deficits.
* History view grouped by week and day with expandable sections and
  weight history.
* Settings screen with editable daily calories, daily deficit and BMR.
* Dynamic food button management: add or delete food items from the
  quick‑add grid.
* JSON backup export and import compatible with the Android format.
* Google Sheets + Apps Script backend with demo mode fallback.
* Responsive layout and dark mode CSS variables.

### Architectural Changes

The v1.0.0 release splits the monolithic JavaScript bundle into
modular files to improve maintainability.  Navigation, dialogs,
history and settings rendering are now contained in their own
modules (`navigation.js`, `dialogs.js`, `history.js`, `settings.js`)
and the top‑level `app.js` coordinates state changes and initial
data loading only.  The new `ui.js` module centralises all DOM
creation for the main screen.  This refactoring makes it easier to
extend individual screens without touching unrelated logic.

Refer to `docs/HANDOVER_REPORT.md` for known limitations and possible
future enhancements.
### Connection Diagnostic Patch — 30 May 2026

- Added a non-destructive **Connection Debug** panel inside Settings.
- Added read tests for settings and entries plus an empty-batch POST test of the sync route; the batch contains no record changes and creates no rows.
- Added **Copy Debug Report** so connection failures can be pasted into support/chat without relying on hidden browser console logs.
- Added **Discard Unsynced Local Changes** so failed test entries held in browser storage can be removed without altering Google Sheets data.


## v2.1 Preview UI Update — 30 May 2026

- Replaced the raw Android-like web layout with card-based responsive sections.
- Changed main entry actions to **Add Food** and **Add Burn**.
- New entries can no longer be saved without a name; historical blank Android-import entries remain visible as imported unnamed items.
- Visible and typed dates use `DD-MM-YYYY`; internal data storage remains `yyyy-MM-dd`.
- Daily and weekly summary values are labeled as Food, Burn and Deficit.
- Weekly food and deficit targets are calculated as fixed daily target × 7.
- Rebuilt History into a Month → Week → Day hierarchy with readable totals and weight-change estimate text.
- Added mobile swipe navigation between days.
- Added System / Light / Dark appearance setting stored locally in the browser.
- Added an import confirmation showing entry/food/weight counts before replacing sheet data.
- Moved sync/toast messages above the bottom controls so they no longer cover Settings.
- Kept Connection Debug available while live Google Sheets migration is being verified.

Deferred deliberately: Daily Burn Target (requires a data schema/backend update), editing entries, automatic BMR, default Daily Burn and bulk add.
