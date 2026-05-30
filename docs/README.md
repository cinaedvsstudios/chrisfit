# ChrisFit Web v2.4

ChrisFit Web is the shared-data browser interface for ChrisFit. It keeps the Android app's fast repeated saved-item workflow while presenting a cleaner responsive card layout and storing data in Google Sheets through Google Apps Script.

## Key workflow

- Food entries are positive calories; burn, BMR and total-burn estimates are negative calories.
- Dates are stored internally as `yyyy-MM-dd` and displayed/typed as `DD-MM-YYYY`.
- Tap a saved food button repeatedly to record repeated units quickly.
- Use **Add Burn → Estimate Total Burn to Midnight** to estimate the final day total by adding only the remaining hours at BMR pace.

## Deployment update for v2.3

This version requires both:

1. Uploading the complete web files to the GitHub Pages repository root. Preserve the existing root `icon.png`, which the app displays beside the title.
2. Replacing Apps Script `Code.gs` with the bundled v2.3 backend and redeploying the existing deployment as a **New version**. Keep the same `/exec` URL.

The backend automatically extends the existing Google Sheet with Daily Burn Target, emoji preferences and food-order/visibility columns; you do not need to recreate your spreadsheet.

## Real phone backup import

The original Android JSON backup format is still supported. Import replaces entries, saved food rows and weight rows but leaves web-only settings and emoji choices intact. Always retain the original phone backup as your safety copy.
