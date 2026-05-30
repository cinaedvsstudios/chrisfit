## v2.6 — Carry-forward weight display and monthly weight history — 30 May 2026

- The main Weight card now shows the most recent recorded weight on or before the selected date when that date has no new weigh-in.
- A carried-forward weight identifies its original recorded date, and never uses a later/future weight while reviewing an earlier day.
- Rebuilt Weight History into expandable month groups, with the relevant selected-date month opened automatically where available.
- Corrected food-specific emoji display inside expanded History entries so quick-button and library emojis are reused consistently.
- Retained the v2.5 Food Library and per-food emoji backend without requiring any additional sheet schema changes beyond that release.

## v2.5 — Food Library and per-item emoji update — 30 May 2026

- Added a separate `library` Google Sheet tab for searchable foods that do not need to appear as Quick Add buttons.
- Add Food search now returns matches from both Quick Add buttons (`foods`) and Food Library (`library`), including serving amount for library results.
- Added optional per-food emoji support for both Quick Add buttons and library records; entry names remain clean data without embedded emoji.
- Added Food Library management in Settings: add, edit and delete library foods.
- Made the Apps Script backend read manually arranged columns by header name, including the user's `Name | Amount | kcal | Emoji` library layout.
- Apps Script adds missing `id` and `emoji` columns to `library` as needed; it does not require recreating the pasted library list.
- Updated phone backup import: the recommended import path keeps current web Quick Add buttons/emoji and always preserves Food Library while importing entries and weights.
- Retained the v2.4 History selected-week and daily-average improvements.

## v2.4 — History readability and weekly average update — 30 May 2026

- Removed the visible button borders/background around previous/next date emoji arrows.
- Fixed History day-row text contrast in dark mode.
- History now opens the month and week containing the date selected on the main screen whenever History is entered.
- Split expanded weekly History summaries into two cards: existing total values and a new daily-average view.
- The daily-average card uses recorded days in that week and compares average daily deficit/surplus against the configured daily deficit target.
- Negative daily-average deficit values are shown in green; surplus values are shown in red.
- No Google Sheet or Apps Script changes were required for this update.

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
