# Google Sheets / Apps Script Setup — ChrisFit Web v2.3

## Existing configured spreadsheet

The configured sheet for this build is:

`https://docs.google.com/spreadsheets/d/1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM/edit?usp=sharing`

The browser app points to the existing deployed Apps Script `/exec` URL through `js/config.js`.

## Upgrade an existing v2.2 installation

1. Open the Google Sheet and choose **Extensions → Apps Script**.
2. Replace the entire contents of `Code.gs` with `google-apps-script/Code.gs` from this build.
3. Save the Apps Script project.
4. Choose **Deploy → Manage deployments**, edit the current ChrisFit API deployment, select **New version**, and deploy.
5. Do not change the URL in `js/config.js`; editing the existing deployment keeps it valid.

The updated Apps Script automatically adds the new columns required by v2.3 when the app next connects:

- `foods`: `sortOrder`, `active`
- `settings`: `dailyBurnTarget`, emoji settings, `googleSheetUrl`

No existing `entries`, `weights`, or imported Android history is deleted by this schema extension.

## New-sheet template

For a new installation, import `google-sheets-templates/ChrisFit_Google_Sheets_Template.xlsx` into Google Sheets, then paste and deploy `Code.gs`. The workbook contains the four required tabs: `entries`, `foods`, `weights`, and `settings`.
