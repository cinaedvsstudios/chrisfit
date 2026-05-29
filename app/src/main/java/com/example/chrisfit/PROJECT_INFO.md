# ChrisFit App – Project Structure (DO NOT BREAK)

## CORE RULE (VERY IMPORTANT)

These files MUST always stay in sync:

* Entry.kt
* AppDao.kt
* MainActivity.kt

Entry structure:

* id: Int
* date: String
* name: String
* calories: Int

DAO returns:

* Flow<List<Entry>>

MainActivity:

* MUST use Entry(date, name, calories)
* MUST NOT use old Entry(name, calories)

---

## CURRENT FEATURES

### Daily Tracking

* Add food (positive calories)
* Add burn (negative calories)
* BMR button = -2000
* Custom entry dialog (name + calories + burn toggle)

### Food Buttons

* Stored in Room DB (Food table)
* Auto-created only if empty
* Editable later (planned)

### Entry List

* Shows:
  name (calories)
* Delete button (X)
* Deletes from DB

---

## CALCULATIONS

Daily:

* Intake = sum of positive calories
* Burn = sum of negative calories
* Difference = intake - burn

Color logic:

* Green = deficit (≤ -500)
* Red = not in deficit

---

## UI STRUCTURE (TOP → BOTTOM)

1. Day + Date
2. Summary box
3. Action buttons:

    * Add Other (purple)
    * Add BMR (green)
4. Food buttons (2-column grid)
5. Entry list (scroll)

---

## IMPORTANT RULES

❌ NEVER change Entry structure without updating DAO + UI
❌ NEVER mix old and new Entry formats
❌ NEVER return anything except Flow<List<Entry>> from DAO

---

## NEXT FEATURES (PLANNED)

* Weekly summary (Mon → today)
* Settings screen:

    * Daily calories target
    * Daily deficit target
    * BMR value
* Editable food list
* Export to CSV

---

## DEBUG CHECKLIST (IF ERRORS HAPPEN)

If you see:

* "List<Entry> but Int expected"
* "Unresolved reference name/calories"

👉 Means mismatch between:

* Entry.kt
* AppDao.kt
* MainActivity.kt

Fix = make them match again

---

END OF FILE
