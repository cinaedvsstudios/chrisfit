/*
  ChrisFit Google Sheets access with optimistic background sync.
  The browser immediately renders queued actions, then sends them to Apps Script
  as one batch. v3 uses a fresh queue key so old failed test operations are not
  unexpectedly submitted after upgrading the app.
*/
import { CONFIG } from './config.js';
import { state, defaultSettings, setState, setSync, showToast } from './state.js';

const QUEUE_KEY = 'chrisfit.pendingWrites.v3';
const mem = { nextId: 1, entries: [], foods: [], weights: [], settings: { ...defaultSettings } };
const remote = { entries: [], foods: [], weights: [], settings: { ...defaultSettings } };
let pending = readQueue_();
let flushing = false;
let flushTimer = null;

export function isDemoMode() { return !CONFIG.baseUrl; }
function clone_(value) { return JSON.parse(JSON.stringify(value)); }
function readQueue_() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; } }
function saveQueue_() { localStorage.setItem(QUEUE_KEY, JSON.stringify(pending)); }
function tempId_() { return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function generateId_() { return mem.nextId++; }
function toISODate_(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = date instanceof Date ? date : new Date(date);
  const pad = value => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function normaliseSettings_(settings = {}) { return { ...defaultSettings, ...(settings || {}), id: 1 }; }
function normaliseFood_(food, index = 0) {
  return { ...food, id: food.id, name: String(food.name || ''), calories: Number(food.calories), sortOrder: Number.isFinite(Number(food.sortOrder)) ? Number(food.sortOrder) : index + 1, active: food.active === false || String(food.active).toLowerCase() === 'false' ? false : true };
}
function endpoint_(action, params = {}) {
  const url = new URL(CONFIG.baseUrl);
  url.searchParams.set('action', action);
  if (CONFIG.token) url.searchParams.set('token', CONFIG.token);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value); });
  return url.toString();
}
function assertApiResponse_(data) { if (data && data.success === false) throw new Error(data.error || 'Backend request failed'); return data; }
async function get_(action, params = {}) {
  if (isDemoMode()) return undefined;
  const response = await fetch(endpoint_(action, params));
  if (!response.ok) throw new Error(`Backend HTTP error ${response.status}`);
  return assertApiResponse_(await response.json());
}
async function post_(action, body = {}) {
  if (isDemoMode()) return undefined;
  const response = await fetch(endpoint_(action), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Backend HTTP error ${response.status}`);
  return assertApiResponse_(await response.json());
}

function findOperationForPendingAdd_(type, id) { return pending.find(operation => operation.type === type && String(operation.tempId) === String(id)); }
function applyOperations_(source, addType, updateType, deleteType) {
  let result = clone_(source || []);
  pending.forEach(operation => {
    if (operation.type === addType) result.unshift({ ...operation.data, id: operation.tempId, _pending: true });
    if (operation.type === updateType) {
      const index = result.findIndex(record => String(record.id) === String(operation.data.id));
      if (index >= 0) result[index] = { ...result[index], ...operation.data, _pending: true };
    }
    if (operation.type === deleteType) result = result.filter(record => String(record.id) !== String(operation.data.id));
  });
  return result;
}
function effectiveSettings_() {
  let settings = normaliseSettings_(remote.settings || mem.settings);
  pending.filter(operation => operation.type === 'settings').forEach(operation => { settings = normaliseSettings_({ ...settings, ...operation.data }); });
  return settings;
}
function renderEffective_() {
  const entriesFull = applyOperations_(remote.entries, 'entries', 'updateEntry', 'deleteEntry')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const selected = toISODate_(state.selectedDate);
  const foods = applyOperations_(remote.foods, 'foods', 'updateFood', 'deleteFood')
    .map(normaliseFood_).sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id));
  const weights = applyOperations_(remote.weights, 'weights', 'updateWeight', 'deleteWeight')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  setState('entriesFull', entriesFull);
  setState('entries', entriesFull.filter(entry => entry.date === selected));
  setState('foods', foods);
  setState('weights', weights);
  setState('settings', effectiveSettings_());
  if (pending.length && !flushing) setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
}
function enqueue_(operation) {
  pending.push({ ...operation, queueId: tempId_() });
  saveQueue_();
  renderEffective_();
  if (!isDemoMode()) {
    setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
    showToast('Saved locally — syncing', 'info', 1400);
    scheduleFlush_();
  }
}
function scheduleFlush_(delay = 650) {
  if (isDemoMode()) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flushPending(), delay);
}
function cancelUnsentAdd_(id, addType) {
  const before = pending.length;
  pending = pending.filter(operation => !(operation.type === addType && String(operation.tempId) === String(id)));
  if (pending.length !== before) { saveQueue_(); renderEffective_(); showToast('Removed before syncing', 'info'); return true; }
  return false;
}
function updateUnsentAdd_(id, addType, data) {
  const operation = findOperationForPendingAdd_(addType, id);
  if (!operation) return false;
  operation.data = { ...operation.data, ...data };
  saveQueue_(); renderEffective_(); scheduleFlush_();
  return true;
}

async function loadRemoteData_() {
  if (isDemoMode()) {
    remote.entries = clone_(mem.entries); remote.foods = clone_(mem.foods); remote.weights = clone_(mem.weights); remote.settings = normaliseSettings_(mem.settings); return;
  }
  const [settings, foods, entries, weights] = await Promise.all([get_('settings'), get_('foods'), get_('entries'), get_('weights')]);
  remote.settings = normaliseSettings_(settings);
  remote.foods = (foods || []).map(normaliseFood_);
  remote.entries = entries || [];
  remote.weights = weights || [];
}
export async function initialise() {
  setSync('loading', pending.length, 'Loading…');
  await loadRemoteData_();
  renderEffective_();
  if (pending.length && !isDemoMode()) { setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`); scheduleFlush_(150); }
  else setSync('saved', 0, isDemoMode() ? 'Demo mode' : 'Connected');
}
export async function flushPending() {
  if (isDemoMode() || flushing || pending.length === 0) return;
  flushing = true;
  const batch = pending.slice();
  setSync('saving', batch.length, `Saving ${batch.length} change${batch.length === 1 ? '' : 's'}…`);
  try {
    await post_('batch', { operations: batch.map(({ type, data }) => ({ type, data })) });
    const complete = new Set(batch.map(operation => operation.queueId));
    pending = pending.filter(operation => !complete.has(operation.queueId));
    saveQueue_(); await loadRemoteData_(); renderEffective_();
    if (pending.length) scheduleFlush_(150);
    else { setSync('saved', 0, 'Saved'); showToast('Saved', 'success', 1600); }
  } catch (error) {
    console.error('Sync failed:', error);
    setSync('error', pending.length, 'Could not sync — changes queued');
    showToast(`Sync failed: ${error.message}`, 'error', 4200);
  } finally { flushing = false; }
}

function demoCommit_(type, data) {
  if (type === 'entries') mem.entries.unshift({ id: generateId_(), ...data });
  else if (type === 'updateEntry') mem.entries = mem.entries.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteEntry') mem.entries = mem.entries.filter(item => String(item.id) !== String(data.id));
  else if (type === 'foods') mem.foods.push({ id: generateId_(), ...data });
  else if (type === 'updateFood') mem.foods = mem.foods.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteFood') mem.foods = mem.foods.filter(item => String(item.id) !== String(data.id));
  else if (type === 'weights') mem.weights.unshift({ id: generateId_(), ...data });
  else if (type === 'updateWeight') mem.weights = mem.weights.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteWeight') mem.weights = mem.weights.filter(item => String(item.id) !== String(data.id));
  else if (type === 'settings') mem.settings = normaliseSettings_({ ...mem.settings, ...data });
  remote.entries = clone_(mem.entries); remote.foods = clone_(mem.foods); remote.weights = clone_(mem.weights); remote.settings = clone_(mem.settings); renderEffective_();
}
function mutate_(type, data, tempId) {
  if (isDemoMode()) { demoCommit_(type, data); return; }
  enqueue_({ type, data, ...(tempId ? { tempId } : {}) });
}
export function fetchEntriesByDate(date) { setState('entries', state.entriesFull.filter(entry => entry.date === toISODate_(date))); }
export function addEntry(date, name, calories) {
  const cleanName = String(name || '').trim(); if (!cleanName) throw new Error('Entries require a name.');
  mutate_('entries', { date: toISODate_(date), name: cleanName, calories: Number(calories) }, tempId_());
}
export function updateEntry(id, data) {
  const cleanName = String(data.name || '').trim(); if (!cleanName) throw new Error('Entries require a name.');
  const payload = { id, date: toISODate_(data.date), name: cleanName, calories: Number(data.calories) };
  if (updateUnsentAdd_(id, 'entries', payload)) return;
  mutate_('updateEntry', payload);
}
export function deleteEntry(id) { if (!cancelUnsentAdd_(id, 'entries')) mutate_('deleteEntry', { id }); }
export function addWeight(date, value) { mutate_('weights', { date: toISODate_(date), value: Number(value) }, tempId_()); }
export function updateWeight(id, data) {
  const payload = { id, date: toISODate_(data.date), value: Number(data.value) };
  if (updateUnsentAdd_(id, 'weights', payload)) return;
  mutate_('updateWeight', payload);
}
export function deleteWeight(id) { if (!cancelUnsentAdd_(id, 'weights')) mutate_('deleteWeight', { id }); }
export function addFood(name, calories) {
  const cleanName = String(name || '').trim(); if (!cleanName) throw new Error('Saved food buttons require a name.');
  const maxOrder = state.foods.reduce((max, food) => Math.max(max, Number(food.sortOrder) || 0), 0);
  mutate_('foods', { name: cleanName, calories: Math.abs(Number(calories)), sortOrder: maxOrder + 1, active: true }, tempId_());
}
export function updateFood(id, data) {
  const cleanName = String(data.name || '').trim(); if (!cleanName) throw new Error('Saved food buttons require a name.');
  const payload = { id, name: cleanName, calories: Math.abs(Number(data.calories)), sortOrder: Number(data.sortOrder), active: Boolean(data.active) };
  if (updateUnsentAdd_(id, 'foods', payload)) return;
  mutate_('updateFood', payload);
}
export function deleteFood(id) { if (!cancelUnsentAdd_(id, 'foods')) mutate_('deleteFood', { id }); }
export function reorderFood(id, direction) {
  const ordered = state.foods.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex(food => String(food.id) === String(id));
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
  const current = ordered[index]; const swap = ordered[swapIndex];
  updateFood(current.id, { ...current, sortOrder: swap.sortOrder });
  updateFood(swap.id, { ...swap, sortOrder: current.sortOrder });
}
export function saveSettings(settings) { mutate_('settings', normaliseSettings_(settings)); }
export function replaceBurnWithEstimate(date, total) {
  const iso = toISODate_(date);
  const sameDay = state.entriesFull.filter(entry => entry.date === iso);
  const replaceable = sameDay.filter(entry => entry.name === 'BMR' || entry.name === 'Estimated Total Burn');
  const otherBurn = sameDay.filter(entry => Number(entry.calories) < 0 && entry.name !== 'BMR' && entry.name !== 'Estimated Total Burn');
  if (otherBurn.length && !window.confirm('This date has another burn entry. Save the total-burn estimate as well? It may double-count burn.')) return false;
  replaceable.forEach(entry => deleteEntry(entry.id));
  addEntry(iso, 'Estimated Total Burn', -Math.abs(Number(total)));
  return true;
}
export async function exportData() { return isDemoMode() ? { entries: mem.entries.map(({ id, ...data }) => data), foods: mem.foods.map(({ id, sortOrder, active, ...data }) => data), weights: mem.weights.map(({ id, ...data }) => data) } : get_('export'); }
export async function importData(data) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.foods) || !Array.isArray(data.weights)) throw new Error('Backup must contain entries, foods and weights arrays.');
  pending = []; saveQueue_();
  if (isDemoMode()) {
    mem.entries = data.entries.map(item => ({ id: generateId_(), ...item }));
    mem.foods = data.foods.map((item, index) => ({ id: generateId_(), ...item, sortOrder: index + 1, active: true }));
    mem.weights = data.weights.map(item => ({ id: generateId_(), ...item }));
    await loadRemoteData_(); renderEffective_(); return;
  }
  await post_('import', data); await loadRemoteData_(); renderEffective_(); setSync('saved', 0, 'Imported');
}
export async function resetAllData() {
  pending = []; saveQueue_();
  if (isDemoMode()) { mem.entries = []; mem.foods = []; mem.weights = []; await loadRemoteData_(); renderEffective_(); return; }
  await post_('reset', {}); await loadRemoteData_(); renderEffective_();
}

export function getConnectionInfo() { return { mode: isDemoMode() ? 'demo' : 'google-apps-script', endpoint: CONFIG.baseUrl || '(not configured)', tokenConfigured: Boolean(CONFIG.token), online: navigator.onLine, pendingChanges: pending.length, syncPhase: state.sync.phase, syncMessage: state.sync.message || '(none)' }; }
export function discardPendingChanges() { const count = pending.length; pending = []; saveQueue_(); renderEffective_(); setSync('idle', 0, ''); showToast(`${count} unsynced local change${count === 1 ? '' : 's'} discarded`, 'info', 3000); return count; }
async function diagnosticRequest_(label, action, options = {}) {
  const started = performance.now(); const lines = [label, `${options.method || 'GET'} ${endpoint_(action)}`];
  try { const response = await fetch(endpoint_(action), options); lines.push(`HTTP result: ${response.status}`, `Elapsed: ${Math.round(performance.now() - started)} ms`, `Response body: ${(await response.text()).slice(0, 1200) || '(empty)'}`); }
  catch (error) { lines.push(`FAILED after ${Math.round(performance.now() - started)} ms`, `${error.name || 'Error'}: ${error.message || String(error)}`); }
  return lines.join('\n');
}
export async function runConnectionDebugTest() {
  const info = getConnectionInfo();
  const lines = ['ChrisFit Connection Debug Report', `Generated: ${new Date().toISOString()}`, `App page: ${window.location.href}`, `Mode: ${info.mode}`, `Endpoint: ${info.endpoint}`, `Pending local changes: ${info.pendingChanges}`, `Visible sync state: ${info.syncPhase} — ${info.syncMessage}`];
  if (isDemoMode()) return `${lines.join('\n')}\n\nTEST NOT RUN: demo mode.`;
  lines.push('', await diagnosticRequest_('TEST 1 — Read settings', 'settings'));
  lines.push('', await diagnosticRequest_('TEST 2 — Read entries', 'entries'));
  lines.push('', await diagnosticRequest_('TEST 3 — Empty batch sync route', 'batch', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ operations: [] }) }));
  return lines.join('\n');
}
