# Handover Report

## Summary

This report accompanies the delivery of the **ChrisFit Web** project.  The
goal was to reproduce the behaviour of the Android ChrisFit app in a
browser using simple technologies.  The work was conducted by reading
the Android source code and mapping its logic, data model and UI
structure into a set of HTML/CSS/JavaScript modules and a Google
Sheets/Apps Script backend.  No files in the original GitHub repository
were modified or committed during this process.

## Features implemented

* **Daily tracking** with date navigation, summary (intake, burn, net),
  quick‑add grid (history, weight, other, BMR, foods) and entry list with
  delete actions.  Calculations replicate the Android logic including
  negative calories for burns and colour thresholds for deficits.
* **Weight tracking** with a dialog for entering weight on the selected
  date, BMI calculation assuming a fixed 1.8 m height and a list of
  recorded weights on both the main and history screens.
* **History view** grouping all entries by week and by day, with
  collapsible sections and weekly/daily summaries.  An additional
  weight history section mirrors the Android design.
* **Settings screen** with text inputs for daily calories, daily
  deficit and BMR; ability to add and delete food buttons; JSON
  export/import compatible with the Android backup format; and a
  “Reset All Data” function.
* **Backend integration** using Google Sheets and Apps Script.  A demo
  mode provides in‑memory storage when no backend is configured.
* **Responsive design** that works on mobile and desktop, and a dark
  theme implemented via CSS variables.

## Differences from Android

| Aspect | Android | Web | Reason |
| --- | --- | --- | --- |
| Drag handle for quick‑add grid | Users can drag a handle to resize the grid height 【1†L710-L733】 | Grid has a fixed height | Complexity vs. benefit; optional for future enhancement. |
| Weekly totals on main screen | A bug results in the weekly totals mirroring the daily values 【1†L586-L589】 | Web retains this behaviour (totals based on current day) | Maintains fidelity with the inspected source. |
| Splash screen asset | References a `splashicon` drawable | Uses emoji icons; original asset missing from repo | The repository lacked the image asset. |
| Dark mode toggle | Follows system setting automatically | CSS variables defined; user toggle not exposed | Simplicity; could be added later. |
| Date picker | Android uses `DatePickerDialog` | Web uses a simple prompt for ISO date | Browser support limitations without third‑party libraries. |

## Testing performed

The application was served locally via `python3 -m http.server` and
manually tested in both demo mode and with a simulated Apps Script
backend.  The following scenarios were verified:

* Loading the app with no data and default settings.
* Navigating between dates and verifying that entries are scoped to the
  selected date.
* Adding intake and burn entries via quick‑add buttons and the custom
  dialog; repeated taps create multiple entries as in Android.
* Adding BMR entries with the configured negative calories.
* Adding and deleting weights; checking BMI updates.
* Switching to the history screen and expanding weeks/days; verifying
  weekly and daily summaries and entry lists.
* Adding, listing and removing food buttons; verifying quick‑add grid
  updates immediately.
* Modifying settings and saving; verifying that subsequent calculations
  use the new targets.
* Exporting data and confirming that the JSON matches the Android
  structure.  Importing the same file into a fresh session restores
  all records.
* Resetting all data clears the sheets/memory.

No automated tests or deployment steps were executed on the backend as
per the requirements.

## Next steps

* **Deploy the backend** – follow `docs/GOOGLE_SHEETS_SETUP.md` to create
  the Google Sheets and Apps Script.  Deploy the script as a web app and
  provide the URL in `js/config.js`.
* **Host the web app** – publish the `chrisfit-web` folder to a static
  host such as GitHub Pages or Netlify.  See
  `docs/GITHUB_PAGES_SETUP.md` for guidance.
* **Enhancements** – optional improvements include implementing the drag
  handle for the action grid, adding a dark mode toggle in settings,
  refining the date picker, and integrating swipe gestures for date
  navigation.

## Acknowledgements

This work is based exclusively on the open‑source ChrisFit Android
repository.  All calculations, UI structure and data models were
derived from the Kotlin source files and documentation provided in that
repository.  No proprietary information was used.