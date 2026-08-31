# Guidance backend patch

The frontend Guidance card is now in the GitHub Pages app and has built-in fallback messages.

To make the app read editable messages from the `Guidance` Google Sheet tab, the deployed Apps Script backend needs a `guidance` GET action that returns rows with these fields:

```text
id | active | scope | metric | condition | priority | message
```

Add this route inside `doGet(e)` after the existing `library` route:

```javascript
if (action === 'guidance') return json_(getGuidance_());
```

Add `guidance` to `COLUMN_ALIASES`:

```javascript
guidance: {
  id: ['id'],
  active: ['active'],
  scope: ['scope'],
  metric: ['metric'],
  condition: ['condition'],
  priority: ['priority'],
  message: ['message']
},
```

Add `guidance` to `REQUIRED_HEADERS`:

```javascript
guidance: ['id', 'active', 'scope', 'metric', 'condition', 'priority', 'message'],
```

Update `sheet_(name)` so the code can find the capitalized sheet tab:

```javascript
function sheet_(name) {
  const tabName = name === 'guidance' ? 'Guidance' : name;
  let sheet = workbook_().getSheetByName(tabName);
  if (!sheet && name === 'library') sheet = workbook_().insertSheet('library');
  if (!sheet && name === 'guidance') sheet = workbook_().insertSheet('Guidance');
  if (!sheet) throw new Error('Missing sheet tab: ' + tabName);
  return sheet;
}
```

Add this read function:

```javascript
function getGuidance_() {
  const target = sheet_('guidance'), map = headerMap_('guidance');
  return target.getDataRange().getValues().slice(1)
    .filter(row => String(row[map.message] || '').trim() !== '')
    .map(row => ({
      id: Number(row[map.id]),
      active: parseBoolean_(row[map.active], true),
      scope: String(row[map.scope] || '').trim(),
      metric: String(row[map.metric] || '').trim(),
      condition: String(row[map.condition] || '').trim(),
      priority: Number(row[map.priority]),
      message: String(row[map.message] || '').trim()
    }));
}
```

After updating Apps Script, deploy a new version of the existing web app. Keep the same `/exec` URL.
