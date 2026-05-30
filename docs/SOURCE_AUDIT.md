# Source Audit

This document captures the investigation of the **ChrisFit** Android
repository in preparation for building a faithful web clone.  All
implementation decisions in the web version trace back to specific lines
within the Android source.  References use citations from the GitHub
connector.

## Core files examined

| File | Purpose |
| --- | --- |
| `MainActivity.kt` | Contains the main screen UI, summary logic, quick‑add button behaviour, history screen and weight dialogs.  Defines the daily and weekly calculations and uses a drag handle to adjust the grid height 【1†L145-L177】. |
| `SettingsScreen.kt` | Implements the settings UI allowing editing of daily targets, BMR, adding/deleting food buttons and exporting/importing data 【2†L100-L140】.  Also defines the JSON backup format used by the Android app 【2†L276-L315】. |
| `AppDao.kt` | Declares Room queries for entries, foods, settings and weights, including helper methods for export/import 【3†L18-L73】. |
| `AppDatabase.kt` | Defines the Room database with entities `Entry`, `Food`, `Settings` and `Weight` and sets the database name/version 【4†L10-L36】. |
| `Entry.kt`, `Food.kt`, `Weight.kt`, `Settings.kt` | Define the Room entity structures used throughout the app 【5†L8-L13】【6†L8-L12】【7†L8-L12】【8†L8-L13】. |
| `SettingsScreen.kt` (export/import functions) | Shows that the Android backup JSON contains three arrays: `entries`, `foods` and `weights` with fields exactly matching the entity classes 【2†L276-L371】. |
| `PROJECT_INFO.md` | Provides high‑level project rules, calculation descriptions and UI structure guidelines 【9†L31-L80】. |
| `AndroidManifest.xml` | Confirms the main activity and theme definitions 【10†L7-L17】. |
| Theme files (`themes.xml`, `Color.kt`, `Type.kt`) | Define a minimal Material theme and colour palette used for the UI 【12†L6-L7】【35†L7-L13】. |

## UI workflow

### Main screen

The `AppScreen` composable in `MainActivity.kt` builds the primary interface.  Key
behaviours observed and replicated in the web version:

* **Date navigation:** Two buttons increment or decrement the `selectedDate`, and a tap on the date opens a date picker 【1†L168-L206】【1†L544-L556】.
* **Summary box:** Displays daily intake, burn and net calories.  Colours switch to green when the net is below the daily deficit target 【1†L213-L233】【1†L221-L223】.
* **Weekly summary:** In the current Android build the weekly totals are calculated incorrectly on the main screen (they mirror the daily totals).  The history screen contains a proper weekly grouping which the web version replicates.
* **Quick‑add buttons:** Includes History, Add Weight, Add Other, Add BMR and a variable list of saved foods.  Tapping a saved food instantly inserts an `Entry` with the food’s calories 【1†L687-L705】.  Tapping Add BMR inserts an entry named “BMR” with negative `bmrValue` calories 【1†L671-L684】.  There is no confirmation dialog for food or BMR entries.
* **Add Other dialog:** Presents name and calories fields plus a burn toggle.  Calories are negated when the burn checkbox is selected 【1†L789-L826】.
* **Add Weight dialog:** Accepts a float value and inserts a `Weight` record for the selected date 【1†L830-L870】.
* **Entry list:** Shows all entries for the selected date in reverse chronological order, with a delete button that removes the entry from the database 【1†L742-L763】.
* **Settings button:** Opens the settings screen via a flag variable 【1†L769-L776】.

### History screen

When `showHistory` is true the UI switches to a history view inside the same composable.  The screen groups all entries by week start (Monday) and then by day.  Each week and day can be expanded/collapsed via +/- toggles 【1†L410-L497】.  Weekly and daily summaries show intake, burn and net values.  A separate weight history section lists all weights with BMI values calculated using a fixed 1.8 m height 【1†L342-L366】.  An edit toggle enables deletion of weight entries 【1†L287-L381】.

### Settings screen

The settings composable holds text fields for daily calories, daily deficit and BMR, and persists changes via `dao.insertSettings` 【2†L129-L140】.  Food buttons can be added by specifying a name and calories; they appear on the main screen automatically 【2†L173-L197】.  Food buttons can also be deleted individually 【2†L199-L220】.  The backup section provides export and import actions using the Android Storage Access Framework.  Export serialises entries, foods and weights into JSON arrays 【2†L276-L315】.  Import clears the existing database before recreating all entities from the JSON 【2†L324-L371】.  There is also a “Reset All Data” button that deletes all entries, foods and weights 【2†L253-L266】.

## Data model

From the entity definitions the following schemas are derived:

| Table | Fields | Notes |
| --- | --- | --- |
| `Entry` | `id` (autoincrement), `date` (String, `yyyy-MM-dd`), `name` (String), `calories` (Int) | Positive calories represent intake; negative calories represent burn. |
| `Food` | `id` (autoincrement), `name` (String), `calories` (Int) | Used to populate quick‑add buttons. |
| `Weight` | `id` (autoincrement), `value` (Float), `date` (String) | Only one weight per date is displayed in the main screen; the history shows all weights. |
| `Settings` | `id` (always 1), `dailyCalories` (Int), `dailyDeficit` (Int), `bmr` (Int) | Defaults appear when no settings exist: 1500/500/2000 【1†L90-L94】【2†L65-L70】. |

The web version maps these tables directly into separate worksheets in Google Sheets and maintains the same field names and types.  IDs are generated sequentially in the Apps Script backend to preserve ordering.

## Backup format

`SettingsScreen.kt` writes a JSON object with three arrays – `entries`, `foods`, `weights` – where each element contains only the corresponding entity fields 【2†L276-L314】.  IDs are omitted on export.  Import wipes existing data and recreates records from the arrays 【2†L324-L371】.  The web clone uses the same format for export/import, ensuring compatibility with Android backups.

## Visual identity

The Android app uses Material colours but also defines custom colours for the divider (`#89E0D4`), green (`#2E7D32`), blue (`#1976D2`) and purple (`#6A1B9A`) buttons.  These values were extracted from `MainActivity.kt` and `Color.kt` and mapped to CSS variables in `css/variables.css`.  The splash screen references `R.drawable.splashicon` but no such asset exists in the repository; accordingly the web version falls back to emoji icons and clearly notes that the original asset could not be retrieved.

## Unimplemented or ambiguous features

* **Drag handle:** The Android UI allows the quick‑add grid height to be adjusted via a drag gesture 【1†L710-L733】.  For simplicity the web version uses a fixed grid height.
* **Weekly summary on main screen:** A bug in the Android code sets the weekly totals equal to the daily totals on the main screen 【1†L586-L589】.  The web version displays totals calculated from the current day only to remain faithful but documents this behaviour in the handover report.
* **System dark mode toggle:** Android automatically adapts to system dark mode through Compose.  The web clone implements a CSS dark theme but does not yet expose a toggle in the UI.
* **Splash icon:** The `splashicon` referenced in the code is absent from the repository.  Without the asset the web version cannot reproduce the exact splash screen.