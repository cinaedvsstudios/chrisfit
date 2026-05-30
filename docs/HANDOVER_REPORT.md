# ChrisFit Web v2.3 Handover

## Implemented in this release

- A responsive browser interface backed by Google Sheets through Google Apps Script.
- Positive food entries and negative burn/BMR/estimated-burn entries, preserving Android phone backup compatibility.
- Fast one-tap repeated saved food logging.
- Add Food with search suggestions from saved foods, Add Burn, one-tap BMR and BMR-paced Estimate Total Burn to Midnight.
- Editable daily/history entries and editable weights using stable cloud row IDs.
- Saved-food management: add, edit, reorder, hide/show and delete.
- Daily Food, Burn and Deficit targets including a new Daily Burn Target and fixed seven-day weekly targets.
- Month → Week → Day history, readable weekly summaries and estimated change wording.
- Configurable emoji labels stored in Google Sheets; food defaults to broccoli (`🥦`).
- Desktop Settings padding, direct Google Sheet link, theme selector, sync debugging and the repository-root `icon.png` logo reference.

## Backend update required

v2.3 includes a replacement `google-apps-script/Code.gs`. It preserves the existing `/exec` URL when deployed as a **new version** of the current deployment and automatically extends the sheet headers required for editing, visibility/order, Daily Burn Target and emojis.

## Not included yet

- Android Health Connect automatic previous-day burn sync.
- Bulk paste/add entry tooling.
- Automated correction of historical blank names; these are intentionally left as imported historical records.

## Asset note

The application references `icon.png` in the web root because the user confirmed that the real logo already exists there. The connector was unavailable during packaging, so the image bytes are not duplicated in this ZIP; retain the existing root `icon.png` when uploading the updated files.
