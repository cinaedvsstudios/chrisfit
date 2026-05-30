# ChrisFit Web v2.6

ChrisFit Web is the shared-data browser interface for ChrisFit. It keeps the Android app's fast repeated saved-item workflow while presenting a cleaner responsive card layout and storing data in Google Sheets through Google Apps Script.

## Key workflow

- Food entries are positive calories; burn, BMR and total-burn estimates are negative calories.
- Dates are stored internally as `yyyy-MM-dd` and displayed/typed as `DD-MM-YYYY`.
- Tap a saved food button repeatedly to record repeated units quickly.
- Use **Add Burn → Estimate Total Burn to Midnight** to estimate the final day total by adding only the remaining hours at BMR pace.

## Deployment update for v2.6

This full build requires:

1. Uploading the complete web files to the GitHub Pages repository root. Preserve the existing root `icon.png`, which the app displays beside the title.
2. If you have not already deployed v2.5: replace Apps Script `Code.gs` with the bundled v2.6 backend and redeploy the existing deployment as a **New version**. Keep the same `/exec` URL.
3. If v2.5 Apps Script is already deployed successfully: no further Apps Script change is needed for the v2.6 weight display update.

The backend reads the new `library` tab and per-food emoji column by header name, while retaining Android-compatible entry/weight import support.

## Real phone backup import

The original Android JSON backup format is still supported. Import replaces entries, saved food rows and weight rows but leaves web-only settings and emoji choices intact. Always retain the original phone backup as your safety copy.


## Food Library and food-specific emoji

Version 2.5 separates `foods` (the visible Quick Add button list) from `library` (the searchable catalogue shown inside Add Food).

- `foods` supports: `id`, `emoji`, `name`, `calories`, `sortOrder`, `active`. Column order does not matter.
- `library` supports the manually created columns `Name`, `Amount`, `kcal`, `Emoji`; Apps Script adds an `id` column when needed for edits.
- An Android phone backup does not contain the web-only `library` tab. The recommended import option imports historical entries and weights while leaving the newer Quick Add buttons and library unchanged.


## Weight display behaviour

The Weight card shows the last recorded weight on or before the date being viewed. This allows weight to carry forward between weigh-ins without incorrectly showing a later weight when reviewing an earlier day. Weight History is grouped by month.
