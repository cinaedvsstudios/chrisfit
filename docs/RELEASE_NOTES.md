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