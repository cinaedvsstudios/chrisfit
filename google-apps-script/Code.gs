/**
 * Google Apps Script backend for ChrisFit Web.
 *
 * This script exposes a handful of endpoints compatible with the API
 * wrapper in `js/api.js`.  Each endpoint reads from or writes to a
 * worksheet whose structure mirrors the Room entities defined in the
 * Android project.  IDs are generated sequentially.  Settings always
 * occupy row 2 of the `settings` sheet.
 *
 * Before deploying, set SPREADSHEET_ID to the ID of your Google Sheets
 * document.  If TOKEN is non‑empty the script will require clients to
 * include an `Authorization: Bearer <TOKEN>` header.
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const TOKEN = ''; // optional shared secret

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    // Optional token validation
    if (TOKEN && (!e || !e.headers || e.headers.Authorization !== 'Bearer ' + TOKEN)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const action = (e.parameter.action || '').toLowerCase();
    if (method === 'GET') {
      if (action === 'settings') return getSettings();
      if (action === 'foods') return getFoods();
      if (action === 'entries') return getEntries(e.parameter.date);
      if (action === 'weights') return getWeights();
      if (action === 'export') return exportData();
      return jsonResponse({ error: 'Unknown action' }, 400);
    }
    if (method === 'POST') {
      const data = e.postData ? JSON.parse(e.postData.contents) : {};
      if (action === 'settings') return saveSettings(data);
      if (action === 'foods') return addFood(data);
      if (action === 'deletefood') return deleteFood(data.id);
      if (action === 'entries') return addEntry(data);
      if (action === 'deleteentry') return deleteEntry(data.id);
      if (action === 'weights') return addWeight(data);
      if (action === 'deleteweight') return deleteWeight(data.id);
      if (action === 'import') return importData(data);
      if (action === 'reset') return resetAll();
      return jsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(name);
}

function nextId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const id = sheet.getRange(lastRow, 1).getValue();
  return Number(id) + 1;
}

function getSettings() {
  const sheet = getSheet('settings');
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return jsonResponse({ dailyCalories: 1500, dailyDeficit: 500, bmr: 2000 });
  }
  const row = rows[1];
  return jsonResponse({ dailyCalories: row[1], dailyDeficit: row[2], bmr: row[3] });
}

function saveSettings(data) {
  const sheet = getSheet('settings');
  sheet.getRange(2, 1, 1, 4).setValues([[1, data.dailyCalories, data.dailyDeficit, data.bmr]]);
  return jsonResponse({ success: true });
}

function getFoods() {
  const sheet = getSheet('foods');
  const values = sheet.getDataRange().getValues().slice(1);
  const foods = values.filter(r => r[0] !== '').map(r => ({ id: r[0], name: r[1], calories: r[2] }));
  return jsonResponse(foods);
}

function addFood(data) {
  const sheet = getSheet('foods');
  const id = nextId(sheet);
  sheet.appendRow([id, data.name, data.calories]);
  return jsonResponse({ id });
}

function deleteFood(id) {
  const sheet = getSheet('foods');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return jsonResponse({ success: true });
}

function getEntries(date) {
  const sheet = getSheet('entries');
  let values = sheet.getDataRange().getValues().slice(1);
  if (date) {
    values = values.filter(r => r[1] === date);
  }
  values.sort((a, b) => b[0] - a[0]);
  const entries = values.map(r => ({ id: r[0], date: r[1], name: r[2], calories: r[3] }));
  return jsonResponse(entries);
}

function addEntry(data) {
  const sheet = getSheet('entries');
  const id = nextId(sheet);
  sheet.appendRow([id, data.date, data.name, data.calories]);
  return jsonResponse({ id });
}

function deleteEntry(id) {
  const sheet = getSheet('entries');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return jsonResponse({ success: true });
}

function getWeights() {
  const sheet = getSheet('weights');
  const values = sheet.getDataRange().getValues().slice(1);
  values.sort((a, b) => b[0] - a[0]);
  const weights = values.map(r => ({ id: r[0], value: r[1], date: r[2] }));
  return jsonResponse(weights);
}

function addWeight(data) {
  const sheet = getSheet('weights');
  const id = nextId(sheet);
  sheet.appendRow([id, data.value, data.date]);
  return jsonResponse({ id });
}

function deleteWeight(id) {
  const sheet = getSheet('weights');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return jsonResponse({ success: true });
}

function exportData() {
  const entries = JSON.parse(getEntries().getContent());
  const foods = JSON.parse(getFoods().getContent());
  const weights = JSON.parse(getWeights().getContent());
  const data = { entries: entries.map(({ id, ...rest }) => rest), foods: foods.map(({ id, ...rest }) => rest), weights: weights.map(({ id, ...rest }) => rest) };
  return jsonResponse(data);
}

function importData(data) {
  resetAll();
  data.entries.forEach(e => addEntry(e));
  data.foods.forEach(f => addFood(f));
  data.weights.forEach(w => addWeight(w));
  return jsonResponse({ success: true });
}

function resetAll() {
  ['entries','foods','weights'].forEach(name => {
    const sheet = getSheet(name);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  });
  return jsonResponse({ success: true });
}

function jsonResponse(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(code || 200);
}