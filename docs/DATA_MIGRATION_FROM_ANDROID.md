# Migrating Data From Android

The Android version of ChrisFit supports exporting and importing backups in
JSON format via the settings screen.  The web app uses the **exact
same structure**, which allows you to migrate your data from Android to
Google Sheets with minimal effort.

## Export from Android

1. Open ChrisFit on your Android device.
2. Go to **Settings → Backup → Export Data**.
3. Choose a destination and save the exported `backup.json` file.

## Import into the web app

1. Set up your Google Sheets and Apps Script backend as described in
   `docs/GOOGLE_SHEETS_SETUP.md`.
2. Launch the web app and navigate to **Settings → Backup → Import Data**.
3. Select the `backup.json` file exported from Android.  The web app
   uploads the file to the backend, clears existing data and recreates
   entries, foods and weights based on the JSON.
4. Verify that your daily totals, foods and weight history appear
   correctly.

## Export from the web app

Likewise you can export your data from the web app in the same format
and import it into the Android app using its import feature.  This
ensures bidirectional compatibility.

## Structure of the backup file

An exported backup is a JSON object with three arrays:

```json
{
  "entries": [
    { "date": "2026-05-30", "name": "Banana", "calories": 100 },
    ...
  ],
  "foods": [
    { "name": "Banana", "calories": 100 },
    ...
  ],
  "weights": [
    { "date": "2026-05-30", "value": 75.3 },
    ...
  ]
}
```

Notice that `id` fields are deliberately omitted.  When importing the
backend regenerates IDs sequentially to maintain ordering.  Dates must
be strings in `yyyy-MM-dd` format.  Calories are integers (negative
values indicate burns) and weights are floats.