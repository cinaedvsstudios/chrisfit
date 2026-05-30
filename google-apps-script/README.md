# Google Apps Script

This folder contains the server‑side code required to run the
cloud backend for the ChrisFit web application.  The Apps Script
connects to a Google Sheets workbook and exposes a REST‑like API
providing CRUD operations for entries, foods, weights and settings as
well as import/export functionality.  The web frontend uses these
endpoints via simple HTTP requests (see `js/api.js`).

## Files

- **Code.gs** – the main Apps Script file.  Paste this into a new
  Apps Script project attached to your Google Sheets document.  It
  implements endpoints named `getSettings`, `saveSettings`,
  `getFoods`, `addFood`, `deleteFood`, `getEntries`, `addEntry`,
  `deleteEntry`, `getWeights`, `addWeight`, `deleteWeight`,
  `exportData` and `importData`.  Each function reads from or writes
  to the corresponding sheet.
- **README.md** (this file) – explains how to set up the script and
  configure the frontend.

## Setup Overview

1. **Prepare a Google Sheets workbook** with sheets named `entries`,
   `foods`, `weights` and `settings` and column headers as described
   in `docs/GOOGLE_SHEETS_SETUP.md`.  This workbook will store your
   data.
2. **Open the sheet** and choose **Extensions → Apps Script** to create
   a new project.  Delete any boilerplate code.
3. **Create a file** called `Code.gs` and copy the contents of
   `google-apps-script/Code.gs` from this repository into it.  Update
   the `SPREADSHEET_ID` constant to match your sheet ID.  Optionally
   set a `TOKEN` constant to secure the API.
4. **Deploy as a web app** via **Deploy → New deployment**, selecting
   *Web app* and choosing **Execute as Me** and **Allow anyone with
   the link**.  Copy the deployment URL – this becomes the `baseUrl`
   in your frontend configuration (`js/config.js`).  If you set a
   token in `Code.gs` you must also set `token: 'your‑token'` in the
   config.
5. **Configure the frontend** by creating `js/config.js` (see
   `docs/GOOGLE_SHEETS_SETUP.md` for example content).  When `baseUrl`
   is non‑empty the app will persist data to your sheet; when empty it
   runs in demo mode using in‑memory arrays.

For detailed step‑by‑step instructions, refer to
`docs/GOOGLE_SHEETS_SETUP.md` in this project.  That document
includes screenshots and a full explanation of the sheet structure,
deployment settings and how data flows between the frontend and the
backend.