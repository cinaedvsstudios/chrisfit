# ChrisFit Web Release Notes

## v2.3 — Web customisation and editing update — 30 May 2026

- Added **Daily Burn Target** and corresponding weekly burn target totals (`daily burn target × 7`).
- Added entry editing from the current day and History; edits update an existing record rather than adding a duplicate.
- Added weight editing from the daily card and weight history.
- Added saved-food editing, manual order controls and hide/show controls while preserving fast one-tap logging.
- Added saved-food search suggestions in **Add Food**; selecting a suggestion fills the entry form before saving.
- Added configurable emoji choices in Settings, synchronised through Google Sheets. Food defaults to **🥦**.
- Added a direct **Open Google Sheet** link in Settings.
- Improved desktop Settings width/padding so it no longer stretches too far across the page.
- Added support for the repository-root `icon.png` logo beside the ChrisFit title and as the browser icon.
- Enlarged the selected-day heading and applied emoji arrow controls.
- Retained **Add Food**, **Add Burn**, **BMR**, and the BMR-paced **Estimate Total Burn to Midnight** feature.
- Kept Connection Debug available during early live-data testing.

### Backend/data upgrade

The Google Apps Script backend expands the existing Sheet automatically without removing Android-compatible data:

- `foods` gains `sortOrder` and `active` for ordering and visibility.
- `settings` gains `dailyBurnTarget`, emoji preferences and the Google Sheet link.
- Existing `entries` and `weights` schemas remain unchanged; update operations use their stable cloud IDs.
- Phone backup import remains compatible with the original Android JSON structure (`entries`, `foods`, `weights`).

## v2.2 — Preview repair and burn estimate update — 30 May 2026

- Fixed startup rendering failure before settings loaded.
- Restored one-tap **BMR** alongside **Add Food** and **Add Burn**.
- Added **Estimate Total Burn to Midnight** using remaining BMR-paced burn.
- Preserved the working Google Sheets connection and diagnostic panel.

## v2.1 — UI preview update — 30 May 2026

- Introduced responsive card sections, visible `DD-MM-YYYY` dates, labelled summaries, mobile swipe navigation, theme selection and Month → Week → Day History.
- Added blank-name validation for new entries and Android backup import confirmation.

## Original Android app

- Kotlin / Jetpack Compose / Room application with food and burn entries, saved quick-add items, weights, summaries, settings, JSON backup/restore and the ChrisFit logo.
