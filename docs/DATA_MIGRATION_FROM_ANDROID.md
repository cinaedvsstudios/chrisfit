# Importing the Android Phone Backup

ChrisFit Web v2.3 accepts the original Android JSON backup format containing `entries`, `foods`, and `weights` arrays.

## Safe import flow

1. Keep the original phone `backup.json` file unchanged as a safety copy.
2. Confirm one test entry saves to Google Sheets and can be deleted from the web app.
3. Open **Settings → Backup & Data → Import Phone Backup**.
4. Select the Android backup file and confirm the displayed counts before replacing current entries, foods and weights.
5. Verify known dates and weights after import.

## What v2.3 does during import

- Entries and weights are imported unchanged except that stable cloud IDs are generated.
- Saved foods receive initial order values and are set visible by default.
- Existing web-only Settings values, including Daily Burn Target and emojis, are kept.
- Historic blank entry names in the phone backup remain as historical data and display as `Unnamed entry (imported)`; new blank names are blocked.
