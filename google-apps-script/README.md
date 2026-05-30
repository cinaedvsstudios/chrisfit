# ChrisFit Google Apps Script Backend — v2.3

This backend connects the ChrisFit browser app to the Google Sheet already created for the app.

## Upgrade from the working v2.2 deployment

This release requires a new Apps Script deployment version because it adds Daily Burn Target, cloud-synchronised emoji choices, entry/weight editing and saved-food editing/order/visibility.

1. In the Google Sheet, open **Extensions → Apps Script**.
2. Replace `Code.gs` with the complete `Code.gs` file in this folder.
3. Click **Save**.
4. Open **Deploy → Manage deployments**, edit the existing web app deployment, set **Version** to **New version**, and deploy.
5. Keep the existing `/exec` URL. The web app configuration already points to it.

On its first request, the updated backend expands the existing `foods` and `settings` headers automatically. Your existing entries and imported Android backup structure are retained.

## Tabs and fields

- `entries`: `id`, `date`, `name`, `calories`
- `weights`: `id`, `value`, `date`
- `foods`: `id`, `name`, `calories`, `sortOrder`, `active`
- `settings`: existing Android-compatible target fields plus `dailyBurnTarget`, emoji preferences and `googleSheetUrl`

Android backup import still expects the phone backup's original three arrays: `entries`, `foods`, and `weights`. Importing replaces those three data sets, but does not reset the web-only settings row.
