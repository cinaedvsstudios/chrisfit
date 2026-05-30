/**
 * ChrisFit Web Google Apps Script backend.
 *
 * Derived data sheets:
 * - entries:  id | date | name | calories
 * - foods:    id | name | calories
 * - weights:  id | value | date
 * - settings: id | dailyCalories | dailyDeficit | bmr
 *
 * The Android backup format intentionally excludes generated IDs and settings:
 * { entries:[{date,name,calories}], foods:[{name,calories}], weights:[{date,value}] }
 */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const TOKEN = ''; // Optional: enter a shared token here and in js/config.js.

function doGet(e) {
  try {
    validateToken_(e);
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    if (action === 'settings') return json_(getSettings_());
    if (action === 'foods') return json_(getFoods_());
    if (action === 'entries') return json_(getEntries_(e.parameter.date));
    if (action === 'weights') return json_(getWeights_());
    if (action === 'export') return json_(exportData_());
    return error_('Unknown GET action: ' + action);
  } catch (error) {
    return error_(error.message || String(error));
  }
}

function doPost(e) {
  try {
    validateToken_(e);
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (action === 'settings') return json_(saveSettings_(data));
    if (action === 'foods') return json_(addFood_(data));
    if (action === 'deletefood') return json_(deleteRowById_('foods', data.id));
    if (action === 'entries') return json_(addEntry_(data));
    if (action === 'deleteentry') return json_(deleteRowById_('entries', data.id));
    if (action === 'weights') return json_(addWeight_(data));
    if (action === 'deleteweight') return json_(deleteRowById_('weights', data.id));
    if (action === 'import') return json_(importData_(data));
    if (action === 'reset') return json_(resetAll_());
    return error_('Unknown POST action: ' + action);
  } catch (error) {
    return error_(error.message || String(error));
  }
}

function validateToken_(e) {
  if (!TOKEN) return;
  const supplied = e && e.parameter ? e.parameter.token : '';
  if (supplied !== TOKEN) throw new Error('Unauthorized');
}

function workbook_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_(name) {
  const sheet = workbook_().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab: ' + name);
  return sheet;
}

function nextId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(Number).filter(Number.isFinite);
  return ids.length ? Math.max.apply(null, ids) + 1 : 1;
}

function getSettings_() {
  const values = sheet_('settings').getDataRange().getValues();
  if (values.length < 2 || values[1][0] === '') {
    return { id: 1, dailyCalories: 1500, dailyDeficit: 500, bmr: 2000 };
  }
  return {
    id: Number(values[1][0]) || 1,
    dailyCalories: Number(values[1][1]) || 1500,
    dailyDeficit: Number(values[1][2]) || 500,
    bmr: Number(values[1][3]) || 2000
  };
}

function saveSettings_(data) {
  const target = sheet_('settings');
  target.getRange(2, 1, 1, 4).setValues([[
    1,
    Number(data.dailyCalories) || 1500,
    Number(data.dailyDeficit) || 500,
    Number(data.bmr) || 2000
  ]]);
  return { success: true };
}

function getFoods_() {
  return sheet_('foods').getDataRange().getValues().slice(1)
    .filter(row => row[0] !== '')
    .map(row => ({ id: Number(row[0]), name: String(row[1]), calories: Number(row[2]) }))
    .sort((a, b) => b.id - a.id);
}

function addFood_(data) {
  if (!String(data.name || '').trim()) throw new Error('Food name is required.');
  const target = sheet_('foods');
  const id = nextId_(target);
  target.appendRow([id, String(data.name).trim(), Number(data.calories)]);
  return { success: true, id: id };
}

function getEntries_(date) {
  return sheet_('entries').getDataRange().getValues().slice(1)
    .filter(row => row[0] !== '' && (!date || String(row[1]) === String(date)))
    .map(row => ({ id: Number(row[0]), date: String(row[1]), name: String(row[2]), calories: Number(row[3]) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function addEntry_(data) {
  if (!String(data.date || '').match(/^\d{4}-\d{2}-\d{2}$/)) throw new Error('Entry date is invalid.');
  if (!String(data.name || '').trim()) throw new Error('Entry name is required.');
  const target = sheet_('entries');
  const id = nextId_(target);
  target.appendRow([id, String(data.date), String(data.name).trim(), Number(data.calories)]);
  return { success: true, id: id };
}

function getWeights_() {
  return sheet_('weights').getDataRange().getValues().slice(1)
    .filter(row => row[0] !== '')
    .map(row => ({ id: Number(row[0]), value: Number(row[1]), date: String(row[2]) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function addWeight_(data) {
  if (!String(data.date || '').match(/^\d{4}-\d{2}-\d{2}$/)) throw new Error('Weight date is invalid.');
  const target = sheet_('weights');
  const id = nextId_(target);
  target.appendRow([id, Number(data.value), String(data.date)]);
  return { success: true, id: id };
}

function deleteRowById_(sheetName, id) {
  const target = sheet_(sheetName);
  const values = target.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      target.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error('Record not found in ' + sheetName + ': ' + id);
}

function exportData_() {
  return {
    entries: getEntries_().map(entry => ({ date: entry.date, name: entry.name, calories: entry.calories })),
    foods: getFoods_().map(food => ({ name: food.name, calories: food.calories })),
    weights: getWeights_().map(weight => ({ date: weight.date, value: weight.value }))
  };
}

function importData_(data) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.foods) || !Array.isArray(data.weights)) {
    throw new Error('Backup must contain entries, foods and weights arrays.');
  }
  resetAll_();
  data.entries.forEach(addEntry_);
  data.foods.forEach(addFood_);
  data.weights.forEach(addWeight_);
  return { success: true };
}

function resetAll_() {
  ['entries', 'foods', 'weights'].forEach(name => {
    const target = sheet_(name);
    const lastRow = target.getLastRow();
    if (lastRow > 1) target.deleteRows(2, lastRow - 1);
  });
  return { success: true };
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function error_(message) {
  return json_({ success: false, error: message });
}
