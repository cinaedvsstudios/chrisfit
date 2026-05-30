/**
 * ChrisFit Web v2.6 Google Apps Script backend.
 * Adds Quick Add food emoji and a separate searchable Food Library.
 * Sheet layouts may be manually edited: columns are matched by header name, not position.
 */
const SPREADSHEET_ID = '1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM';
const TOKEN = '';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM/edit?usp=sharing';
const SETTINGS_DEFAULTS = {
  id: 1, dailyCalories: 1500, dailyBurnTarget: 2500, dailyDeficit: 500, bmr: 2000,
  emojiFood: '🥦', emojiBurn: '🔥', emojiDeficit: '📉', emojiWeight: '⚖️', emojiBmr: '⚡',
  emojiHistory: '📜', emojiSettings: '⚙️', emojiPrevious: '⬅️', emojiNext: '➡️',
  emojiEdit: '✏️', emojiDelete: '🗑️', emojiSheet: '📊', emojiSearch: '🔎', googleSheetUrl: SHEET_URL
};
const COLUMN_ALIASES = {
  entries: { id: ['id'], date: ['date'], name: ['name'], calories: ['calories', 'kcal', 'k calories'] },
  foods: { id: ['id'], emoji: ['emoji'], name: ['name', 'food'], calories: ['calories', 'kcal', 'k calories'], sortOrder: ['sortorder', 'sort order'], active: ['active'] },
  library: { id: ['id'], emoji: ['emoji'], name: ['name', 'food'], amount: ['amount', 'serving', 'portion'], calories: ['calories', 'kcal', 'k calories'] },
  weights: { id: ['id'], value: ['value', 'kg', 'weight'], date: ['date'] },
  settings: {
    id: ['id'], dailyCalories: ['dailycalories'], dailyDeficit: ['dailydeficit'], bmr: ['bmr'],
    dailyBurnTarget: ['dailyburntarget'], emojiFood: ['emojifood'], emojiBurn: ['emojiburn'],
    emojiDeficit: ['emojideficit'], emojiWeight: ['emojiweight'], emojiBmr: ['emojibmr'],
    emojiHistory: ['emojihistory'], emojiSettings: ['emojisettings'], emojiPrevious: ['emojiprevious'],
    emojiNext: ['emojinext'], emojiEdit: ['emojiedit'], emojiDelete: ['emojidelete'],
    emojiSheet: ['emojisheet'], emojiSearch: ['emojisearch'], googleSheetUrl: ['googlesheeturl']
  }
};
const REQUIRED_HEADERS = {
  entries: ['id', 'date', 'name', 'calories'],
  foods: ['id', 'name', 'calories', 'sortOrder', 'active', 'emoji'],
  library: ['id', 'name', 'amount', 'calories', 'emoji'],
  weights: ['id', 'value', 'date'],
  settings: ['id', 'dailyCalories', 'dailyDeficit', 'bmr', 'dailyBurnTarget', 'emojiFood', 'emojiBurn', 'emojiDeficit', 'emojiWeight', 'emojiBmr', 'emojiHistory', 'emojiSettings', 'emojiPrevious', 'emojiNext', 'emojiEdit', 'emojiDelete', 'emojiSheet', 'emojiSearch', 'googleSheetUrl']
};

function doGet(e) {
  try {
    validateToken_(e); ensureSchema_();
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    if (action === 'settings') return json_(getSettings_());
    if (action === 'foods') return json_(getFoods_());
    if (action === 'library') return json_(getLibrary_());
    if (action === 'entries') return json_(getEntries_(e.parameter.date));
    if (action === 'weights') return json_(getWeights_());
    if (action === 'export') return json_(exportAndroidCompatibleData_());
    return error_('Unknown GET action: ' + action);
  } catch (error) { return error_(error.message || String(error)); }
}
function doPost(e) {
  try {
    validateToken_(e); ensureSchema_();
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (action === 'settings') return json_(saveSettings_(data));
    if (action === 'foods') return json_(addFood_(data));
    if (action === 'updatefood') return json_(updateFood_(data));
    if (action === 'deletefood') return json_(deleteRowById_('foods', data.id));
    if (action === 'library') return json_(addLibrary_(data));
    if (action === 'updatelibrary') return json_(updateLibrary_(data));
    if (action === 'deletelibrary') return json_(deleteRowById_('library', data.id));
    if (action === 'entries') return json_(addEntry_(data));
    if (action === 'updateentry') return json_(updateEntry_(data));
    if (action === 'deleteentry') return json_(deleteRowById_('entries', data.id));
    if (action === 'weights') return json_(addWeight_(data));
    if (action === 'updateweight') return json_(updateWeight_(data));
    if (action === 'deleteweight') return json_(deleteRowById_('weights', data.id));
    if (action === 'batch') return json_(batchOperations_(data.operations || []));
    if (action === 'import') return json_(importAndroidData_(data));
    if (action === 'reset') return json_(resetTrackingData_());
    return error_('Unknown POST action: ' + action);
  } catch (error) { return error_(error.message || String(error)); }
}

function validateToken_(e) {
  if (TOKEN && (!e.parameter || e.parameter.token !== TOKEN)) throw new Error('Unauthorized');
}
function workbook_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet_(name) {
  let sheet = workbook_().getSheetByName(name);
  if (!sheet && name === 'library') sheet = workbook_().insertSheet('library');
  if (!sheet) throw new Error('Missing sheet tab: ' + name);
  return sheet;
}
function cleanHeader_(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function matchingHeaderIndex_(headers, aliases) {
  const normalisedAliases = aliases.map(cleanHeader_);
  return headers.findIndex(header => normalisedAliases.includes(cleanHeader_(header)));
}
function ensureSchema_() {
  Object.keys(REQUIRED_HEADERS).forEach(name => {
    const target = sheet_(name);
    let headers = target.getRange(1, 1, 1, Math.max(target.getLastColumn(), 1)).getValues()[0];
    REQUIRED_HEADERS[name].forEach(canonical => {
      const aliases = COLUMN_ALIASES[name][canonical] || [canonical];
      if (matchingHeaderIndex_(headers, aliases) < 0) {
        headers.push(canonical);
        target.getRange(1, headers.length).setValue(canonical);
      }
    });
  });
  ensureLibraryIds_();
}
function headerMap_(name) {
  const headers = sheet_(name).getRange(1, 1, 1, sheet_(name).getLastColumn()).getValues()[0];
  const map = {};
  Object.keys(COLUMN_ALIASES[name]).forEach(key => {
    const index = matchingHeaderIndex_(headers, COLUMN_ALIASES[name][key]);
    if (index >= 0) map[key] = index;
  });
  return map;
}
function ensureLibraryIds_() {
  const target = sheet_('library');
  const map = headerMap_('library');
  if (target.getLastRow() < 2) return;
  const rows = target.getRange(2, 1, target.getLastRow() - 1, target.getLastColumn()).getValues();
  const existing = rows.map(row => Number(row[map.id])).filter(Number.isFinite);
  let next = existing.length ? Math.max.apply(null, existing) + 1 : 1;
  let changed = false;
  rows.forEach(row => {
    if (String(row[map.name] || '').trim() && String(row[map.id] || '').trim() === '') {
      row[map.id] = next++;
      changed = true;
    }
  });
  if (changed) target.getRange(2, 1, rows.length, target.getLastColumn()).setValues(rows);
}
function nextId_(name) {
  const target = sheet_(name), map = headerMap_(name);
  const rows = target.getDataRange().getValues().slice(1);
  const ids = rows.map(row => Number(row[map.id])).filter(Number.isFinite);
  return ids.length ? Math.max.apply(null, ids) + 1 : 1;
}
function rowById_(name, id) {
  const target = sheet_(name), map = headerMap_(name), rows = target.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][map.id]) === String(id)) return { target, map, row: i + 1, values: rows[i] };
  }
  throw new Error('Record not found in ' + name + ': ' + id);
}
function blankRow_(name) { return new Array(sheet_(name).getLastColumn()).fill(''); }
function setMapped_(row, map, values) {
  Object.keys(values).forEach(key => { if (map[key] !== undefined) row[map[key]] = values[key]; });
  return row;
}
function isoDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, workbook_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}
function requiredDate_(date, label) {
  const value = isoDate_(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(label + ' date is invalid.');
  return value;
}
function parseBoolean_(value, fallback) {
  if (value === '' || value === undefined || value === null) return fallback;
  return value === true || String(value).toLowerCase() === 'true';
}

function getSettings_() {
  const target = sheet_('settings'), map = headerMap_('settings'), rows = target.getDataRange().getValues();
  if (rows.length < 2 || rows[1][map.id] === '') return Object.assign({}, SETTINGS_DEFAULTS);
  const row = rows[1], result = Object.assign({}, SETTINGS_DEFAULTS);
  Object.keys(result).forEach(key => {
    if (map[key] !== undefined && row[map[key]] !== '' && row[map[key]] !== undefined) result[key] = row[map[key]];
  });
  ['id', 'dailyCalories', 'dailyBurnTarget', 'dailyDeficit', 'bmr'].forEach(key => { result[key] = Number(result[key]); });
  return result;
}
function saveSettings_(data) {
  const target = sheet_('settings'), map = headerMap_('settings');
  const values = Object.assign({}, getSettings_(), data, { id: 1 });
  const row = setMapped_(blankRow_('settings'), map, values);
  target.getRange(2, 1, 1, row.length).setValues([row]);
  return { success: true, settings: getSettings_() };
}

function getFoods_() {
  const target = sheet_('foods'), map = headerMap_('foods');
  return target.getDataRange().getValues().slice(1)
    .filter(row => row[map.id] !== '')
    .map((row, index) => ({
      id: Number(row[map.id]),
      emoji: String(row[map.emoji] || ''),
      name: String(row[map.name] || ''),
      calories: Number(row[map.calories]),
      sortOrder: row[map.sortOrder] === '' ? index + 1 : Number(row[map.sortOrder]),
      active: parseBoolean_(row[map.active], true)
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}
function addFood_(data) {
  const name = String(data.name || '').trim();
  const calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Food calories are required.');
  const target = sheet_('foods'), map = headerMap_('foods');
  const order = Number(data.sortOrder) || (getFoods_().reduce((max, food) => Math.max(max, food.sortOrder), 0) + 1);
  const row = setMapped_(blankRow_('foods'), map, {
    id: nextId_('foods'), emoji: String(data.emoji || '').trim(), name, calories, sortOrder: order,
    active: data.active === false ? false : true
  });
  target.appendRow(row);
  return { success: true };
}
function updateFood_(data) {
  const found = rowById_('foods', data.id), name = String(data.name || '').trim(), calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Food calories are required.');
  setMapped_(found.values, found.map, {
    emoji: String(data.emoji || '').trim(), name, calories,
    sortOrder: Number(data.sortOrder), active: Boolean(data.active)
  });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}

function getLibrary_() {
  const target = sheet_('library'), map = headerMap_('library');
  return target.getDataRange().getValues().slice(1)
    .filter(row => String(row[map.name] || '').trim() !== '')
    .map(row => ({
      id: Number(row[map.id]),
      emoji: String(row[map.emoji] || ''),
      name: String(row[map.name] || ''),
      amount: String(row[map.amount] || ''),
      calories: Number(row[map.calories])
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function addLibrary_(data) {
  const name = String(data.name || '').trim(), calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Library food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Library food calories are required.');
  const target = sheet_('library'), map = headerMap_('library');
  const row = setMapped_(blankRow_('library'), map, {
    id: nextId_('library'), emoji: String(data.emoji || '').trim(), name,
    amount: String(data.amount || '').trim(), calories
  });
  target.appendRow(row);
  return { success: true };
}
function updateLibrary_(data) {
  const found = rowById_('library', data.id), name = String(data.name || '').trim(), calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Library food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Library food calories are required.');
  setMapped_(found.values, found.map, {
    emoji: String(data.emoji || '').trim(), name, amount: String(data.amount || '').trim(), calories
  });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}

function getEntries_(date) {
  const target = sheet_('entries'), map = headerMap_('entries'), selected = date ? isoDate_(date) : '';
  return target.getDataRange().getValues().slice(1)
    .filter(row => row[map.id] !== '' && (!selected || isoDate_(row[map.date]) === selected))
    .map(row => ({ id: Number(row[map.id]), date: isoDate_(row[map.date]), name: String(row[map.name] || ''), calories: Number(row[map.calories]) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
function addEntry_(data) {
  const date = requiredDate_(data.date, 'Entry'), name = String(data.name || '').trim();
  if (!name) throw new Error('Entry name is required.');
  const target = sheet_('entries'), map = headerMap_('entries');
  target.appendRow(setMapped_(blankRow_('entries'), map, { id: nextId_('entries'), date, name, calories: Number(data.calories) }));
  return { success: true };
}
function updateEntry_(data) {
  const found = rowById_('entries', data.id), name = String(data.name || '').trim();
  if (!name) throw new Error('Entry name is required.');
  setMapped_(found.values, found.map, { date: requiredDate_(data.date, 'Entry'), name, calories: Number(data.calories) });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}
function getWeights_() {
  const target = sheet_('weights'), map = headerMap_('weights');
  return target.getDataRange().getValues().slice(1)
    .filter(row => row[map.id] !== '')
    .map(row => ({ id: Number(row[map.id]), value: Number(row[map.value]), date: isoDate_(row[map.date]) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
function addWeight_(data) {
  const target = sheet_('weights'), map = headerMap_('weights');
  target.appendRow(setMapped_(blankRow_('weights'), map, { id: nextId_('weights'), value: Number(data.value), date: requiredDate_(data.date, 'Weight') }));
  return { success: true };
}
function updateWeight_(data) {
  const found = rowById_('weights', data.id);
  setMapped_(found.values, found.map, { value: Number(data.value), date: requiredDate_(data.date, 'Weight') });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}
function deleteRowById_(name, id) {
  const found = rowById_(name, id);
  found.target.deleteRow(found.row);
  return { success: true };
}

function batchOperations_(operations) {
  if (!Array.isArray(operations)) throw new Error('Batch operations must be an array.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    operations.forEach(operation => {
      const type = String(operation.type || '').toLowerCase(), data = operation.data || {};
      if (type === 'entries') addEntry_(data);
      else if (type === 'updateentry') updateEntry_(data);
      else if (type === 'deleteentry') deleteRowById_('entries', data.id);
      else if (type === 'foods') addFood_(data);
      else if (type === 'updatefood') updateFood_(data);
      else if (type === 'deletefood') deleteRowById_('foods', data.id);
      else if (type === 'library') addLibrary_(data);
      else if (type === 'updatelibrary') updateLibrary_(data);
      else if (type === 'deletelibrary') deleteRowById_('library', data.id);
      else if (type === 'weights') addWeight_(data);
      else if (type === 'updateweight') updateWeight_(data);
      else if (type === 'deleteweight') deleteRowById_('weights', data.id);
      else if (type === 'settings') saveSettings_(data);
      else throw new Error('Unknown batch operation: ' + type);
    });
    SpreadsheetApp.flush();
    return { success: true, processed: operations.length };
  } finally { lock.releaseLock(); }
}

function exportAndroidCompatibleData_() {
  return {
    entries: getEntries_().map(entry => ({ date: entry.date, name: entry.name, calories: entry.calories })),
    foods: getFoods_().map(food => ({ name: food.name, calories: food.calories })),
    weights: getWeights_().map(weight => ({ date: weight.date, value: weight.value }))
  };
}
function clearDataRows_(name) {
  const target = sheet_(name);
  if (target.getLastRow() > 1) target.deleteRows(2, target.getLastRow() - 1);
}
function importAndroidData_(data) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.foods) || !Array.isArray(data.weights)) {
    throw new Error('Backup must contain entries, foods and weights arrays.');
  }
  const preserveFoods = data.preserveFoods !== false;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    clearDataRows_('entries');
    clearDataRows_('weights');
    if (!preserveFoods) clearDataRows_('foods');

    const entriesTarget = sheet_('entries'), entriesMap = headerMap_('entries');
    const entryRows = data.entries.map((entry, index) => setMapped_(blankRow_('entries'), entriesMap, {
      id: index + 1, date: requiredDate_(entry.date, 'Entry'), name: String(entry.name || ''), calories: Number(entry.calories)
    }));
    if (entryRows.length) entriesTarget.getRange(2, 1, entryRows.length, entriesTarget.getLastColumn()).setValues(entryRows);

    const weightsTarget = sheet_('weights'), weightsMap = headerMap_('weights');
    const weightRows = data.weights.map((weight, index) => setMapped_(blankRow_('weights'), weightsMap, {
      id: index + 1, value: Number(weight.value), date: requiredDate_(weight.date, 'Weight')
    }));
    if (weightRows.length) weightsTarget.getRange(2, 1, weightRows.length, weightsTarget.getLastColumn()).setValues(weightRows);

    if (!preserveFoods) {
      const foodsTarget = sheet_('foods'), foodsMap = headerMap_('foods');
      const foodRows = data.foods.map((food, index) => setMapped_(blankRow_('foods'), foodsMap, {
        id: index + 1, emoji: '', name: String(food.name || ''), calories: Number(food.calories), sortOrder: index + 1, active: true
      }));
      if (foodRows.length) foodsTarget.getRange(2, 1, foodRows.length, foodsTarget.getLastColumn()).setValues(foodRows);
    }

    SpreadsheetApp.flush();
    return {
      success: true, entries: entryRows.length, foods: preserveFoods ? getFoods_().length : data.foods.length,
      weights: weightRows.length, preserveFoods: preserveFoods, libraryPreserved: true
    };
  } finally { lock.releaseLock(); }
}
function resetTrackingData_() {
  ['entries', 'foods', 'weights'].forEach(clearDataRows_);
  return { success: true, libraryPreserved: true };
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function error_(message) { return json_({ success: false, error: message }); }
