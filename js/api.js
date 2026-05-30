/*
  ChrisFit data access and background synchronisation.

  Android writes feel instant because Room is local. For the web version,
  button presses update the screen immediately, are queued in localStorage,
  and are synchronised to Google Sheets in one batch after a short pause.
*/
import { CONFIG } from './config.js';
import { state, setState, setSync, showToast } from './state.js';

const QUEUE_KEY = 'chrisfit.pendingWrites.v2';
const mem = {
  nextId: 1,
  entries: [],
  foods: [],
  weights: [],
  settings: { id: 1, dailyCalories: 1500, dailyDeficit: 500, bmr: 2000 }
};
const remote = { entries: [], foods: [], weights: [], settings: null };
let pending = readQueue_();
let flushing = false;
let flushTimer = null;

export function isDemoMode() {
  return !CONFIG.baseUrl;
}


/**
 * Return visible, non-secret information about the current connection state.
 * Used only by the Settings diagnostics panel.
 */
export function getConnectionInfo() {
  return {
    mode: isDemoMode() ? 'demo' : 'google-apps-script',
    endpoint: CONFIG.baseUrl || '(not configured)',
    tokenConfigured: Boolean(CONFIG.token),
    online: navigator.onLine,
    pendingChanges: pending.length,
    syncPhase: state.sync.phase,
    syncMessage: state.sync.message || '(none)'
  };
}

/**
 * Remove only unsynchronised browser-side operations. This is deliberately
 * separate from resetAllData(): it does not call the backend and does not
 * delete anything already stored in Google Sheets.
 */
export function discardPendingChanges() {
  const count = pending.length;
  if (!count) return 0;
  pending = [];
  saveQueue_();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  renderEffective_();
  setSync('idle', 0, '');
  showToast(`${count} unsynced local change${count === 1 ? '' : 's'} discarded`, 'info', 3000);
  return count;
}

function debugUrl_(action, params = {}) {
  const url = new URL(endpoint_(action, params));
  if (url.searchParams.has('token')) url.searchParams.set('token', '[configured but hidden]');
  return url.toString();
}

async function diagnosticRequest_(label, action, options = {}) {
  const method = options.method || 'GET';
  const safeUrl = debugUrl_(action);
  const started = performance.now();
  const output = [label, `${method} ${safeUrl}`];
  try {
    const response = await fetch(endpoint_(action), options);
    const elapsed = Math.round(performance.now() - started);
    const body = await response.text();
    output.push(`HTTP result: ${response.status} ${response.statusText || ''}`.trim());
    output.push(`Elapsed: ${elapsed} ms`);
    output.push(`Content-Type: ${response.headers.get('content-type') || '(not supplied)'}`);
    output.push(`Response body: ${body.slice(0, 1200) || '(empty)'}`);
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    output.push(`FAILED after ${elapsed} ms`);
    output.push(`${error && error.name ? error.name : 'Error'}: ${error && error.message ? error.message : String(error)}`);
    output.push('A browser “Failed to fetch” result commonly indicates CORS, a redirect/access restriction, or a network failure before JavaScript could read the response.');
  }
  return output.join('\n');
}

/**
 * Perform non-destructive connection diagnostics. The POST check submits an
 * empty batch, which exercises the failing sync route but creates no records.
 */
export async function runConnectionDebugTest() {
  const info = getConnectionInfo();
  const lines = [
    'ChrisFit Connection Debug Report',
    `Generated: ${new Date().toISOString()}`,
    `App page: ${window.location.href}`,
    `Mode: ${info.mode}`,
    `Endpoint: ${info.endpoint}`,
    `Token configured: ${info.tokenConfigured ? 'yes (value hidden)' : 'no'}`,
    `Browser online: ${info.online ? 'yes' : 'no'}`,
    `Pending local changes: ${info.pendingChanges}`,
    `Visible sync state: ${info.syncPhase} — ${info.syncMessage}`
  ];

  if (isDemoMode()) {
    lines.push('', 'TEST NOT RUN: the app is configured for demo mode and has no Apps Script endpoint.');
    return lines.join('\n');
  }

  lines.push('', await diagnosticRequest_('TEST 1 — Read settings', 'settings'));
  lines.push('', await diagnosticRequest_('TEST 2 — Read entries', 'entries'));
  lines.push('', await diagnosticRequest_(
    'TEST 3 — Sync route check (empty batch; must not create any rows)',
    'batch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ operations: [] })
    }
  ));
  return lines.join('\n');
}

function readQueue_() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; }
}
function saveQueue_() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(pending));
}
function tempId_() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function generateId_() {
  return mem.nextId++;
}
function toISODate_(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function endpoint_(action, params = {}) {
  const url = new URL(CONFIG.baseUrl);
  url.searchParams.set('action', action);
  if (CONFIG.token) url.searchParams.set('token', CONFIG.token);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}
function assertApiResponse_(data) {
  if (data && data.success === false) throw new Error(data.error || 'Backend request failed');
  return data;
}
async function get_(action, params = {}) {
  if (isDemoMode()) return undefined;
  const response = await fetch(endpoint_(action, params));
  if (!response.ok) throw new Error(`Backend HTTP error ${response.status}`);
  return assertApiResponse_(await response.json());
}
async function post_(action, body = {}) {
  if (isDemoMode()) return undefined;
  const response = await fetch(endpoint_(action), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Backend HTTP error ${response.status}`);
  return assertApiResponse_(await response.json());
}
function clone_(value) {
  return JSON.parse(JSON.stringify(value));
}

function withPending_(source, typeAdd, typeDelete) {
  const result = clone_(source || []);
  pending.forEach(operation => {
    if (operation.type === typeAdd) result.unshift({ ...operation.data, id: operation.tempId, _pending: true });
    if (operation.type === typeDelete) {
      const index = result.findIndex(record => String(record.id) === String(operation.data.id));
      if (index >= 0) result.splice(index, 1);
    }
  });
  return result;
}
function effectiveSettings_() {
  let settings = clone_(remote.settings || mem.settings);
  pending.filter(operation => operation.type === 'settings').forEach(operation => { settings = { id: 1, ...operation.data }; });
  return settings;
}
function renderEffective_() {
  const entriesFull = withPending_(remote.entries, 'entries', 'deleteEntry')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const selected = toISODate_(state.selectedDate);
  setState('entriesFull', entriesFull);
  setState('entries', entriesFull.filter(entry => entry.date === selected));
  setState('foods', withPending_(remote.foods, 'foods', 'deleteFood'));
  setState('weights', withPending_(remote.weights, 'weights', 'deleteWeight')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))));
  setState('settings', effectiveSettings_());
  if (pending.length > 0 && !flushing) setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
}
function enqueue_(operation) {
  pending.push({ ...operation, queueId: tempId_() });
  saveQueue_();
  renderEffective_();
  if (!isDemoMode()) {
    setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
    showToast('Added — syncing in background', 'info', 1500);
    scheduleFlush_();
  }
}
function cancelUnsentAdd_(id, addType) {
  const before = pending.length;
  pending = pending.filter(operation => !(operation.type === addType && String(operation.tempId) === String(id)));
  if (pending.length !== before) {
    saveQueue_();
    renderEffective_();
    showToast('Removed before syncing', 'info');
    return true;
  }
  return false;
}
function scheduleFlush_(delay = 1000) {
  if (isDemoMode()) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flushPending(), delay);
}

export async function flushPending() {
  if (isDemoMode() || flushing || pending.length === 0) return;
  flushing = true;
  const batch = pending.slice();
  setSync('saving', batch.length, `Saving ${batch.length} change${batch.length === 1 ? '' : 's'}…`);
  try {
    await post_('batch', { operations: batch.map(({ type, data }) => ({ type, data })) });
    const completed = new Set(batch.map(operation => operation.queueId));
    pending = pending.filter(operation => !completed.has(operation.queueId));
    saveQueue_();
    await loadRemoteData_();
    renderEffective_();
    if (pending.length) {
      setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
      scheduleFlush_(250);
    } else {
      setSync('saved', 0, 'Saved');
      showToast('Saved', 'success', 1800);
    }
  } catch (error) {
    console.error('Background sync failed:', error);
    setSync('error', pending.length, 'Could not sync — retrying automatically');
    showToast('Could not sync yet — your changes are queued', 'error', 5000);
  } finally {
    flushing = false;
  }
}

async function loadRemoteData_() {
  if (isDemoMode()) {
    remote.settings = clone_(mem.settings);
    remote.foods = clone_(mem.foods);
    remote.entries = clone_(mem.entries);
    remote.weights = clone_(mem.weights);
    return;
  }
  const [settings, foods, entries, weights] = await Promise.all([
    get_('settings'), get_('foods'), get_('entries'), get_('weights')
  ]);
  remote.settings = settings;
  remote.foods = foods;
  remote.entries = entries;
  remote.weights = weights;
}

export async function initialise() {
  setSync('loading', pending.length, 'Loading data…');
  await loadRemoteData_();
  renderEffective_();
  if (pending.length && !isDemoMode()) {
    showToast(`${pending.length} saved change${pending.length === 1 ? '' : 's'} waiting to sync`, 'info');
    scheduleFlush_(200);
  } else {
    setSync('idle', 0, '');
  }
  if (!isDemoMode()) window.setInterval(() => { if (pending.length) flushPending(); }, 60000);
}

export async function fetchSettings() { renderEffective_(); return state.settings; }
export async function fetchFoods() { renderEffective_(); return state.foods; }
export async function fetchEntriesByDate(date) {
  state.selectedDate = date instanceof Date ? date : new Date(date);
  renderEffective_();
  return state.entries;
}
export async function fetchAllEntries() { renderEffective_(); return state.entriesFull; }
export async function fetchWeights() { renderEffective_(); return state.weights; }

export async function saveSettings(settings) {
  const payload = { id: 1, ...settings };
  if (isDemoMode()) { mem.settings = payload; remote.settings = clone_(mem.settings); renderEffective_(); return; }
  pending = pending.filter(operation => operation.type !== 'settings');
  enqueue_({ type: 'settings', data: payload });
}
export async function addFood(name, calories) {
  const data = { name: String(name).trim(), calories: Number(calories) };
  if (isDemoMode()) { mem.foods.unshift({ id: generateId_(), ...data }); remote.foods = clone_(mem.foods); renderEffective_(); return; }
  enqueue_({ type: 'foods', tempId: tempId_(), data });
}
export async function deleteFood(id) {
  if (isDemoMode()) { mem.foods = mem.foods.filter(food => String(food.id) !== String(id)); remote.foods = clone_(mem.foods); renderEffective_(); return; }
  if (cancelUnsentAdd_(id, 'foods')) return;
  enqueue_({ type: 'deleteFood', data: { id } });
}
export async function addEntry(date, name, calories) {
  const data = { date: toISODate_(date), name: String(name), calories: Number(calories) };
  if (isDemoMode()) { mem.entries.unshift({ id: generateId_(), ...data }); remote.entries = clone_(mem.entries); renderEffective_(); return; }
  enqueue_({ type: 'entries', tempId: tempId_(), data });
}
export async function deleteEntry(id) {
  if (isDemoMode()) { mem.entries = mem.entries.filter(entry => String(entry.id) !== String(id)); remote.entries = clone_(mem.entries); renderEffective_(); return; }
  if (cancelUnsentAdd_(id, 'entries')) return;
  enqueue_({ type: 'deleteEntry', data: { id } });
}
export async function addWeight(date, value) {
  const data = { value: Number(value), date: toISODate_(date) };
  if (isDemoMode()) { mem.weights.unshift({ id: generateId_(), ...data }); remote.weights = clone_(mem.weights); renderEffective_(); return; }
  enqueue_({ type: 'weights', tempId: tempId_(), data });
}
export async function deleteWeight(id) {
  if (isDemoMode()) { mem.weights = mem.weights.filter(weight => String(weight.id) !== String(id)); remote.weights = clone_(mem.weights); renderEffective_(); return; }
  if (cancelUnsentAdd_(id, 'weights')) return;
  enqueue_({ type: 'deleteWeight', data: { id } });
}

export async function exportData() {
  if (!isDemoMode()) {
    await flushPending();
    return get_('export');
  }
  return {
    entries: mem.entries.map(({ id, ...entry }) => entry),
    foods: mem.foods.map(({ id, ...food }) => food),
    weights: mem.weights.map(({ id, ...weight }) => weight)
  };
}
export async function importData(json) {
  if (!json || !Array.isArray(json.entries) || !Array.isArray(json.foods) || !Array.isArray(json.weights)) {
    throw new Error('Backup must contain entries, foods and weights arrays.');
  }
  if (isDemoMode()) {
    mem.entries = json.entries.map(entry => ({ id: generateId_(), ...entry }));
    mem.foods = json.foods.map(food => ({ id: generateId_(), ...food }));
    mem.weights = json.weights.map(weight => ({ id: generateId_(), ...weight }));
    await loadRemoteData_(); renderEffective_(); return;
  }
  pending = []; saveQueue_();
  setSync('saving', 1, 'Importing backup…');
  showToast('Importing backup…', 'info', 0);
  await post_('import', json);
  await loadRemoteData_(); renderEffective_();
  setSync('saved', 0, 'Import complete');
  showToast('Backup imported', 'success', 3500);
}
export async function resetAllData() {
  if (isDemoMode()) { mem.entries = []; mem.foods = []; mem.weights = []; await loadRemoteData_(); renderEffective_(); return; }
  pending = []; saveQueue_();
  setSync('saving', 1, 'Clearing data…');
  await post_('reset');
  await loadRemoteData_(); renderEffective_();
  setSync('saved', 0, 'Cleared'); showToast('All data cleared', 'success');
}
