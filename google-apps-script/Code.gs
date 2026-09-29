/**
 * ChrisFit Web v2.16 compatible Google Apps Script backend.
 * Read-only manifest/bootstrap, dataset revisions and clientId-protected adds.
 * Sheet layouts may be manually edited: columns are matched by header name, not position.
 */
const SPREADSHEET_ID = '1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM';
const TOKEN = '';
const BACKEND_VERSION = '2.16';
const SYNC_DATASETS = ['settings', 'foods', 'library', 'entries', 'weights'];
const SYNC_META_SHEET = 'sync_meta';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM/edit?usp=sharing';
const SETTINGS_DEFAULTS = {
  id: 1, dailyCalories: 1500, dailyBurnTarget: 2500, dailyDeficit: 500, bmr: 2000,
  emojiFood: '🥦', emojiBurn: '🔥', emojiDeficit: '📉', emojiWeight: '⚖️', emojiBmr: '⚡',
  emojiHistory: '📜', emojiSettings: '⚙️', emojiPrevious: '⬅️', emojiNext: '➡️',
  emojiEdit: '✏️', emojiDelete: '🗑️', emojiSheet: '📊', emojiSearch: '🔎', googleSheetUrl: SHEET_URL
};
const COLUMN_ALIASES = {
  entries: { id: ['id'], date: ['date'], name: ['name'], calories: ['calories', 'kcal', 'k calories'], clientId: ['clientId'], updatedAt: ['updatedAt'] },
  foods: { id: ['id'], emoji: ['emoji'], name: ['name', 'food'], calories: ['calories', 'kcal', 'k calories'], sortOrder: ['sortorder', 'sort order'], active: ['active'], clientId: ['clientId'], updatedAt: ['updatedAt'] },
  library: { id: ['id'], emoji: ['emoji'], name: ['name', 'food'], amount: ['amount', 'serving', 'portion'], calories: ['calories', 'kcal', 'k calories'], clientId: ['clientId'], updatedAt: ['updatedAt'] },
  weights: { id: ['id'], value: ['value', 'kg', 'weight'], date: ['date'], clientId: ['clientId'], updatedAt: ['updatedAt'] },
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
  entries: ['id', 'date', 'name', 'calories', 'clientId', 'updatedAt'],
  foods: ['id', 'name', 'calories', 'sortOrder', 'active', 'emoji', 'clientId', 'updatedAt'],
  library: ['id', 'name', 'amount', 'calories', 'emoji', 'clientId', 'updatedAt'],
  weights: ['id', 'value', 'date', 'clientId', 'updatedAt'],
  settings: ['id', 'dailyCalories', 'dailyDeficit', 'bmr', 'dailyBurnTarget', 'emojiFood', 'emojiBurn', 'emojiDeficit', 'emojiWeight', 'emojiBmr', 'emojiHistory', 'emojiSettings', 'emojiPrevious', 'emojiNext', 'emojiEdit', 'emojiDelete', 'emojiSheet', 'emojiSearch', 'googleSheetUrl']
};

function doGet(e) {
  try {
    validateToken_(e);
    const params = e.parameter || {};
    const action = String(params.action || '').toLowerCase();
    if (action === 'setup') return json_(withWriteLock_(setupSync_));
    if (action === 'manifest') return json_(getManifest_());
    if (action === 'bootstrap') return json_(withWriteLock_(getBootstrap_));
    // Envelope endpoints pair data with its revision under the write lock.
    // Existing endpoints below keep their original response shapes.
    if (action === 'dataset') return json_(withWriteLock_(function() {
      const name = String(params.dataset || '').toLowerCase();
      if (SYNC_DATASETS.indexOf(name) < 0) throw new Error('Unknown dataset: ' + name);
      const data = readDataset_(name);
      return { dataset: name, data: data, meta: getManifest_() };
    }));
    if (action === 'settings') return json_(getSettings_());
    if (action === 'foods') return json_(getFoods_());
    if (action === 'library') return json_(getLibrary_());
    if (action === 'entries') return json_(getEntries_(params.date, params.from, params.to));
    if (action === 'weights') return json_(getWeights_());
    if (action === 'export') return json_(exportAndroidCompatibleData_());
    return error_('Unknown GET action: ' + action);
  } catch (error) { return error_(error.message || String(error)); }
}
function doPost(e) {
  try {
    validateToken_(e);
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    return json_(withWriteLock_(function() {
      if (action === 'setup') return setupSync_();
      if (action === 'batch') return batchOperations_(data.operations || []);
      if (action === 'import') {
        ensureSchema_(); ensureSyncMeta_();
        return importAndroidData_(data);
      }
      if (action === 'reset') {
        ensureSchema_(['entries', 'foods', 'weights']); ensureSyncMeta_();
        return resetTrackingData_();
      }
      return writeOperation_(action, data);
    }));
  } catch (error) { return error_(error.message || String(error)); }
}

function withWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return callback(); }
  finally {
    try { SpreadsheetApp.flush(); }
    finally { lock.releaseLock(); }
  }
}
function setupSync_() {
  ensureSchema_();
  ensureSyncMeta_();
  if (ensureLibraryIds_()) bumpRevision_('library');
  return { success: true, meta: getManifest_() };
}
function ensureSyncMeta_() {
  let target = workbook_().getSheetByName(SYNC_META_SHEET);
  if (!target) {
    target = workbook_().insertSheet(SYNC_META_SHEET);
    target.getRange(1, 1, 1, 3).setValues([['dataset', 'revision', 'updatedAt']]);
    const now = new Date().toISOString();
    target.getRange(2, 1, SYNC_DATASETS.length, 3).setValues(
      SYNC_DATASETS.map(name => [name, 1, now])
    );
  }
  // Validate, rather than silently reset revision numbers used by saved caches.
  readSyncMeta_();
}
function readSyncMeta_() {
  const target = workbook_().getSheetByName(SYNC_META_SHEET);
  if (!target) throw new Error('Sync setup required: run setupSync in Apps Script or action=setup.');
  const rows = target.getRange(2, 1, SYNC_DATASETS.length, 3).getValues();
  const revisions = {}, updatedAt = {};
  rows.forEach((row, index) => {
    const name = SYNC_DATASETS[index], revision = Number(row[1]);
    if (row[0] !== name || !Number.isSafeInteger(revision) || revision < 1) {
      throw new Error('Invalid sync_meta row for ' + name + '.');
    }
    revisions[name] = revision;
    updatedAt[name] = String(row[2] || '');
  });
  return { revisions: revisions, updatedAt: updatedAt };
}
function getManifest_() {
  const meta = readSyncMeta_();
  return {
    backendVersion: BACKEND_VERSION, cacheSchemaVersion: 1,
    spreadsheetId: SPREADSHEET_ID, serverTime: new Date().toISOString(),
    revisions: meta.revisions, updatedAt: meta.updatedAt
  };
}
function bumpRevision_(name) {
  const meta = readSyncMeta_();
  const target = workbook_().getSheetByName(SYNC_META_SHEET);
  target.getRange(SYNC_DATASETS.indexOf(name) + 2, 2, 1, 2)
    .setValues([[meta.revisions[name] + 1, new Date().toISOString()]]);
}
function readDataset_(name) {
  if (name === 'settings') return getSettings_();
  if (name === 'foods') return getFoods_();
  if (name === 'library') return getLibrary_();
  if (name === 'entries') return getEntries_();
  if (name === 'weights') return getWeights_();
  throw new Error('Unknown dataset: ' + name);
}
function getBootstrap_() {
  // No schema mutation or library ID scan on reads, even on first bootstrap.
  readSyncMeta_();
  const result = {};
  SYNC_DATASETS.forEach(name => { result[name] = readDataset_(name); });
  result.meta = getManifest_();
  return result;
}
// Select this function in the Apps Script editor once after installing v2.16.
function setupSync() { return withWriteLock_(setupSync_); }

function operationDataset_(type) {
  const datasets = {
    settings: 'settings', foods: 'foods', updatefood: 'foods', deletefood: 'foods',
    library: 'library', updatelibrary: 'library', deletelibrary: 'library',
    entries: 'entries', updateentry: 'entries', deleteentry: 'entries',
    weights: 'weights', updateweight: 'weights', deleteweight: 'weights'
  };
  const name = datasets[type];
  if (!name) throw new Error('Unknown write action: ' + type);
  return name;
}
function writeOperation_(type, data, skipMissing, schemaReady) {
  type = String(type || '').toLowerCase();
  const name = operationDataset_(type);
  if (!schemaReady) { ensureSchema_([name]); ensureSyncMeta_(); }
  const clientId = String(data.clientId || '').trim();
  const isAdd = type === name && name !== 'settings';
  if (isAdd && clientId) {
    const existing = rowByClientId_(name, clientId);
    if (existing) return { success: true, duplicate: true, id: Number(existing.values[existing.map.id]), clientId: clientId };
  }
  // Resolve a locally-created record after its add was saved but the reply was lost.
  if (!isAdd && name !== 'settings' && data.recordClientId) {
    const existing = rowByClientId_(name, String(data.recordClientId));
    if (existing) data = Object.assign({}, data, { id: existing.values[existing.map.id] });
  }
  if (type.indexOf('update') === 0 || type.indexOf('delete') === 0) {
    try { rowById_(name, data.id); }
    catch (error) {
      if (skipMissing && isRecordNotFound_(error)) return { success: true, skippedMissing: true };
      throw error;
    }
  }
  // Invalidate BEFORE mutating: a partially applied batch must never appear unchanged.
  // A failed validation may advance the revision harmlessly; a retry then re-reads it.
  bumpRevision_(name);
  let result;
  if (type === 'settings') result = saveSettings_(data);
  else if (type === 'foods') result = addFood_(data);
  else if (type === 'updatefood') result = updateFood_(data);
  else if (type === 'library') result = addLibrary_(data);
  else if (type === 'updatelibrary') result = updateLibrary_(data);
  else if (type === 'entries') result = addEntry_(data);
  else if (type === 'updateentry') result = updateEntry_(data);
  else if (type === 'weights') result = addWeight_(data);
  else if (type === 'updateweight') result = updateWeight_(data);
  else result = deleteRowById_(name, data.id);
  if (clientId) result.clientId = clientId;
  return result;
}
function rowByClientId_(name, clientId) {
  const target = sheet_(name), map = headerMap_(name);
  if (map.clientId === undefined || target.getLastRow() < 2) return null;
  // Read only the clientId column for duplicate detection, then the matching row.
  const ids = target.getRange(2, map.clientId + 1, target.getLastRow() - 1, 1).getValues();
  const index = ids.findIndex(row => String(row[0]) === clientId);
  if (index < 0) return null;
  const row = index + 2;
  return { target: target, map: map, row: row,
    values: target.getRange(row, 1, 1, target.getLastColumn()).getValues()[0] };
}
function syncFields_(data) {
  return { clientId: String(data.clientId || '').trim(), updatedAt: new Date().toISOString() };
}
function rowSyncFields_(row, map) {
  return { clientId: String(row[map.clientId] || ''), updatedAt: String(row[map.updatedAt] || '') };
}

function validateToken_(e) {
  if (TOKEN && (!e.parameter || e.parameter.token !== TOKEN)) throw new Error('Unauthorized');
}
function workbook_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet_(name) {
  let sheet = workbook_().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab: ' + name);
  return sheet;
}
function cleanHeader_(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function matchingHeaderIndex_(headers, aliases) {
  const normalisedAliases = aliases.map(cleanHeader_);
  return headers.findIndex(header => normalisedAliases.includes(cleanHeader_(header)));
}
function ensureSchema_(names) {
  (names || Object.keys(REQUIRED_HEADERS)).forEach(name => {
    let target = workbook_().getSheetByName(name);
    if (!target && name === 'library') target = workbook_().insertSheet(name);
    if (!target) throw new Error('Missing sheet tab: ' + name);
    let headers = target.getRange(1, 1, 1, Math.max(target.getLastColumn(), 1)).getValues()[0];
    REQUIRED_HEADERS[name].forEach(canonical => {
      const aliases = COLUMN_ALIASES[name][canonical] || [canonical];
      if (matchingHeaderIndex_(headers, aliases) < 0) {
        headers.push(canonical);
        target.getRange(1, headers.length).setValue(canonical);
      }
    });
  });
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
  if (target.getLastRow() < 2) return false;
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
  return changed;
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
function isRecordNotFound_(error) {
  return /record not found/i.test(String(error && error.message || error || ''));
}
function callSkippingMissing_(callback) {
  try {
    callback();
    return false;
  } catch (error) {
    if (isRecordNotFound_(error)) return true;
    throw error;
  }
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
      active: parseBoolean_(row[map.active], true),
      ...rowSyncFields_(row, map)
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
    id: nextId_('foods'), ...syncFields_(data), emoji: String(data.emoji || '').trim(), name, calories, sortOrder: order,
    active: data.active === false ? false : true
  });
  target.appendRow(row);
  return { success: true, id: Number(row[map.id]) };
}
function updateFood_(data) {
  const found = rowById_('foods', data.id), name = String(data.name || '').trim(), calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Food calories are required.');
  setMapped_(found.values, found.map, { updatedAt: new Date().toISOString(),
    emoji: String(data.emoji || '').trim(), name, calories,
    sortOrder: Number(data.sortOrder), active: Boolean(data.active)
  });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}

function getLibrary_() {
  if (!workbook_().getSheetByName('library')) return [];
  const target = sheet_('library'), map = headerMap_('library');
  return target.getDataRange().getValues().slice(1)
    .filter(row => String(row[map.name] || '').trim() !== '')
    .map(row => ({
      id: Number(row[map.id]),
      emoji: String(row[map.emoji] || ''),
      name: String(row[map.name] || ''),
      amount: String(row[map.amount] || ''),
      calories: Number(row[map.calories]),
      ...rowSyncFields_(row, map)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function addLibrary_(data) {
  const name = String(data.name || '').trim(), calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Library food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Library food calories are required.');
  const target = sheet_('library'), map = headerMap_('library');
  const row = setMapped_(blankRow_('library'), map, {
    id: nextId_('library'), ...syncFields_(data), emoji: String(data.emoji || '').trim(), name,
    amount: String(data.amount || '').trim(), calories
  });
  target.appendRow(row);
  return { success: true, id: Number(row[map.id]) };
}
function updateLibrary_(data) {
  const found = rowById_('library', data.id), name = String(data.name || '').trim(), calories = Math.abs(Number(data.calories));
  if (!name) throw new Error('Library food name is required.');
  if (!Number.isFinite(calories) || calories <= 0) throw new Error('Library food calories are required.');
  setMapped_(found.values, found.map, { updatedAt: new Date().toISOString(),
    emoji: String(data.emoji || '').trim(), name, amount: String(data.amount || '').trim(), calories
  });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}

function getEntries_(date, from, to) {
  const target = sheet_('entries'), map = headerMap_('entries');
  const selected = date ? isoDate_(date) : '';
  const fromDate = from ? requiredDate_(from, 'From') : '';
  const toDate = to ? requiredDate_(to, 'To') : '';
  return target.getDataRange().getValues().slice(1)
    .filter(row => {
      if (row[map.id] === '') return false;
      const rowDate = isoDate_(row[map.date]);
      if (selected && rowDate !== selected) return false;
      if (fromDate && rowDate < fromDate) return false;
      if (toDate && rowDate > toDate) return false;
      return true;
    })
    .map(row => ({ id: Number(row[map.id]), date: isoDate_(row[map.date]), name: String(row[map.name] || ''), calories: Number(row[map.calories]), ...rowSyncFields_(row, map) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
function addEntry_(data) {
  const date = requiredDate_(data.date, 'Entry'), name = String(data.name || '').trim();
  if (!name) throw new Error('Entry name is required.');
  const target = sheet_('entries'), map = headerMap_('entries');
  const id = nextId_('entries');
  target.appendRow(setMapped_(blankRow_('entries'), map, { id: id, ...syncFields_(data), date, name, calories: Number(data.calories) }));
  return { success: true, id: id };
}
function updateEntry_(data) {
  const found = rowById_('entries', data.id), name = String(data.name || '').trim();
  if (!name) throw new Error('Entry name is required.');
  setMapped_(found.values, found.map, { updatedAt: new Date().toISOString(), date: requiredDate_(data.date, 'Entry'), name, calories: Number(data.calories) });
  found.target.getRange(found.row, 1, 1, found.values.length).setValues([found.values]);
  return { success: true };
}
function getWeights_() {
  const target = sheet_('weights'), map = headerMap_('weights');
  return target.getDataRange().getValues().slice(1)
    .filter(row => row[map.id] !== '')
    .map(row => ({ id: Number(row[map.id]), value: Number(row[map.value]), date: isoDate_(row[map.date]), ...rowSyncFields_(row, map) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
function addWeight_(data) {
  const target = sheet_('weights'), map = headerMap_('weights');
  const id = nextId_('weights');
  target.appendRow(setMapped_(blankRow_('weights'), map, { id: id, ...syncFields_(data), value: Number(data.value), date: requiredDate_(data.date, 'Weight') }));
  return { success: true, id: id };
}
function updateWeight_(data) {
  const found = rowById_('weights', data.id);
  setMapped_(found.values, found.map, { updatedAt: new Date().toISOString(), value: Number(data.value), date: requiredDate_(data.date, 'Weight') });
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
  const names = [];
  operations.forEach(operation => {
    const name = operationDataset_(String(operation.type || '').toLowerCase());
    if (names.indexOf(name) < 0) names.push(name);
  });
  ensureSchema_(names); ensureSyncMeta_();
  const results = operations.map(operation => writeOperation_(operation.type, operation.data || {}, true, true));
  return { success: true, processed: operations.length,
    skippedMissing: results.filter(result => result.skippedMissing).length, results: results };
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
  ['entries', 'weights'].concat(preserveFoods ? [] : ['foods']).forEach(bumpRevision_);
  {
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
  }
}
function resetTrackingData_() {
  ['entries', 'foods', 'weights'].forEach(bumpRevision_);
  ['entries', 'foods', 'weights'].forEach(clearDataRows_);
  return { success: true, libraryPreserved: true };
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function error_(message) { return json_({ success: false, error: message }); }
