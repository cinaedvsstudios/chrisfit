/*
  ChrisFit Google Sheets access with optimistic background sync.
  v2.15 adds local connection error reports in Settings.
  v2.14 added:
  - range-based entry loading so startup only pulls the recent active window;
  - Save Now and smarter reconnect actions;
  - stale update/delete recovery when Google reports a missing record.
*/
import { CONFIG } from './config.js';
import { state, defaultSettings, setState, setSync, showToast } from './state.js';
import { recordConnectionReport } from './connection-reports.js';

const QUEUE_KEY = 'chrisfit.pendingWrites.v3';
const FETCH_TIMEOUT_MS = 15000;
const INITIAL_ENTRY_WINDOW_DAYS = 30;
const ENTRY_RANGE_BEFORE_DAYS = 45;
const ENTRY_RANGE_AFTER_DAYS = 45;
const mem = { nextId: 1, entries: [], foods: [], library: [], weights: [], settings: { ...defaultSettings } };
const remote = { entries: [], foods: [], library: [], weights: [], settings: { ...defaultSettings } };
let pending = readQueue_();
let flushing = false;
let flushTimer = null;
let reconnecting = false;
let savingNow = false;
let entriesLoading = null;
let loadedEntryRanges = [];

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
function dateFromIso_(iso) {
  const [year, month, day] = toISODate_(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
}
function addDaysIso_(iso, days) {
  const date = dateFromIso_(iso);
  date.setDate(date.getDate() + days);
  return toISODate_(date);
}
function initialEntryRange_() {
  const today = toISODate_(new Date());
  return { from: addDaysIso_(today, -INITIAL_ENTRY_WINDOW_DAYS), to: today };
}
function rangeForDate_(date) {
  const iso = toISODate_(date);
  return { from: addDaysIso_(iso, -ENTRY_RANGE_BEFORE_DAYS), to: addDaysIso_(iso, ENTRY_RANGE_AFTER_DAYS) };
}
function normaliseRange_(from, to) {
  let start = toISODate_(from);
  let end = toISODate_(to);
  if (start > end) [start, end] = [end, start];
  return { from: start, to: end };
}
function rangeCovers_(date) {
  const iso = toISODate_(date);
  return loadedEntryRanges.some(range => range.from <= iso && iso <= range.to);
}
function activeEntryRange_() {
  const selected = toISODate_(state.selectedDate);
  return loadedEntryRanges.find(range => range.from <= selected && selected <= range.to) || rangeForDate_(selected);
}
function addLoadedRange_(from, to) {
  const next = normaliseRange_(from, to);
  loadedEntryRanges.push(next);
  loadedEntryRanges = loadedEntryRanges
    .sort((a, b) => a.from.localeCompare(b.from))
    .reduce((merged, range) => {
      const last = merged[merged.length - 1];
      if (!last || addDaysIso_(last.to, 1) < range.from) {
        merged.push({ ...range });
      } else if (range.to > last.to) {
        last.to = range.to;
      }
      return merged;
    }, []);
}
function normaliseSettings_(settings = {}) { return { ...defaultSettings, ...(settings || {}), id: 1 }; }
function normaliseFood_(food, index = 0) {
  return {
    ...food,
    id: food.id,
    name: String(food.name || '').trim(),
    calories: Number(food.calories),
    sortOrder: Number.isFinite(Number(food.sortOrder)) ? Number(food.sortOrder) : index + 1,
    active: food.active === false || String(food.active).toLowerCase() === 'false' ? false : true,
    emoji: String(food.emoji || '').trim()
  };
}
function normaliseLibrary_(item, index = 0) {
  return {
    ...item,
    id: item.id ?? index + 1,
    name: String(item.name || '').trim(),
    amount: String(item.amount || '').trim(),
    calories: Number(item.calories),
    emoji: String(item.emoji || '').trim()
  };
}
function normaliseEntry_(entry) {
  return {
    ...entry,
    id: entry.id,
    date: toISODate_(entry.date),
    name: String(entry.name || '').trim(),
    calories: Number(entry.calories)
  };
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
async function fetchWithTimeout_(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Backend timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function get_(action, params = {}) {
  if (isDemoMode()) return undefined;
  const response = await fetchWithTimeout_(endpoint_(action, params));
  if (!response.ok) throw new Error(`Backend HTTP error ${response.status}`);
  return assertApiResponse_(await response.json());
}
async function post_(action, body = {}) {
  if (isDemoMode()) return undefined;
  const response = await fetchWithTimeout_(endpoint_(action), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Backend HTTP error ${response.status}`);
  return assertApiResponse_(await response.json());
}
function isEntryOnlyOperation_(operation) {
  return ['entries', 'updateEntry', 'deleteEntry'].includes(operation.type);
}
function isStaleRecordOperation_(operation) {
  return /^update/i.test(operation.type) || /^delete/i.test(operation.type);
}
function isRecordNotFoundError_(error) {
  return /record not found/i.test(String(error?.message || error || ''));
}
function recordError_(source, label, action, error, extra = {}) {
  try {
    recordConnectionReport({ source, label, action, error, info: getConnectionInfo(), ...extra });
  } catch (reportError) {
    console.warn('Could not save connection error report:', reportError);
  }
}

function findOperationForPendingAdd_(type, id) {
  return pending.find(operation => operation.type === type && String(operation.tempId) === String(id));
}
function applyOperations_(source, addType, updateType, deleteType) {
  let result = clone_(source || []);
  pending.forEach(operation => {
    if (operation.type === addType) result.unshift({ ...operation.data, id: operation.tempId, _pending: true });
    if (operation.type === updateType) {
      const index = result.findIndex(record => String(record.id) === String(operation.data.id));
      if (index >= 0) result[index] = { ...result[index], ...operation.data, _pending: true };
    }
    if (operation.type === deleteType) {
      result = result.filter(record => String(record.id) !== String(operation.data.id));
    }
  });
  return result;
}
function effectiveSettings_() {
  let settings = normaliseSettings_(remote.settings || mem.settings);
  pending.filter(operation => operation.type === 'settings')
    .forEach(operation => { settings = normaliseSettings_({ ...settings, ...operation.data }); });
  return settings;
}
function renderEffective_() {
  const entriesFull = applyOperations_(remote.entries, 'entries', 'updateEntry', 'deleteEntry')
    .map(normaliseEntry_)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const selected = toISODate_(state.selectedDate);
  const foods = applyOperations_(remote.foods, 'foods', 'updateFood', 'deleteFood')
    .map(normaliseFood_)
    .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id));
  const library = applyOperations_(remote.library, 'library', 'updateLibrary', 'deleteLibrary')
    .map(normaliseLibrary_)
    .sort((a, b) => a.name.localeCompare(b.name));
  const weights = applyOperations_(remote.weights, 'weights', 'updateWeight', 'deleteWeight')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));

  setState('entriesFull', entriesFull);
  setState('entries', entriesFull.filter(entry => entry.date === selected));
  setState('foods', foods);
  setState('library', library);
  setState('weights', weights);
  setState('settings', effectiveSettings_());
  if (pending.length && !flushing && !reconnecting && !savingNow) {
    setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
  }
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
  if (pending.length !== before) {
    saveQueue_();
    renderEffective_();
    showToast('Removed before syncing', 'info');
    return true;
  }
  return false;
}
function updateUnsentAdd_(id, addType, data) {
  const operation = findOperationForPendingAdd_(addType, id);
  if (!operation) return false;
  operation.data = { ...operation.data, ...data };
  saveQueue_();
  renderEffective_();
  scheduleFlush_();
  return true;
}

async function loadBaseData_() {
  if (isDemoMode()) {
    remote.foods = clone_(mem.foods);
    remote.library = clone_(mem.library);
    remote.weights = clone_(mem.weights);
    remote.settings = normaliseSettings_(mem.settings);
    return;
  }
  const [settings, foods, library, weights] = await Promise.all([
    get_('settings'), get_('foods'), get_('library'), get_('weights')
  ]);
  remote.settings = normaliseSettings_(settings);
  remote.foods = (foods || []).map(normaliseFood_);
  remote.library = (library || []).map(normaliseLibrary_);
  remote.weights = weights || [];
}
async function loadEntriesRange_(from, to) {
  const range = normaliseRange_(from, to);
  if (isDemoMode()) {
    remote.entries = clone_(mem.entries);
    loadedEntryRanges = [range];
    return range;
  }
  const entries = await get_('entries', range);
  remote.entries = remote.entries
    .filter(entry => {
      const date = toISODate_(entry.date);
      return date < range.from || date > range.to;
    })
    .concat((entries || []).map(normaliseEntry_));
  addLoadedRange_(range.from, range.to);
  return range;
}
async function loadRemoteData_(range = initialEntryRange_()) {
  if (isDemoMode()) {
    remote.entries = clone_(mem.entries);
    await loadBaseData_();
    loadedEntryRanges = [range];
    return;
  }
  await loadBaseData_();
  await loadEntriesRange_(range.from, range.to);
}
async function refreshActiveEntryRange_() {
  const range = activeEntryRange_();
  return loadEntriesRange_(range.from, range.to);
}
async function recoverMissingRecordQueue_() {
  const before = pending.length;
  pending = pending.filter(operation => !isStaleRecordOperation_(operation));
  const removed = before - pending.length;
  saveQueue_();
  try { await refreshActiveEntryRange_(); } catch (error) { console.warn('Could not refresh after stale queue cleanup:', error); }
  renderEffective_();
  if (removed) showToast(`Removed ${removed} stale queued edit/delete ${removed === 1 ? 'action' : 'actions'}`, 'info', 3800);
  if (pending.length) setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} still queued`);
  else setSync('saved', 0, 'Saved');
}
export async function initialise() {
  const range = initialEntryRange_();
  setSync('loading', pending.length, 'Loading recent data…');
  try {
    await loadRemoteData_(range);
    renderEffective_();
    if (pending.length && !isDemoMode()) {
      setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
      scheduleFlush_(150);
    } else {
      setSync('saved', 0, isDemoMode() ? 'Demo mode' : 'Connected');
    }
    return true;
  } catch (error) {
    console.error('Initial load failed:', error);
    recordError_('startup', 'Initial load', 'initialise', error, { extra: { range } });
    renderEffective_();
    setSync('error', pending.length, 'Initial load failed — report saved');
    showToast('Connection failed — report saved in Settings', 'error', 5000);
    return false;
  }
}
export async function ensureEntriesForDate(date) {
  const iso = toISODate_(date);
  if (isDemoMode() || rangeCovers_(iso)) {
    fetchEntriesByDate(iso, false);
    return true;
  }
  if (entriesLoading) {
    await entriesLoading;
    fetchEntriesByDate(iso, false);
    if (rangeCovers_(iso)) return true;
  }
  const range = rangeForDate_(iso);
  setSync('loading', pending.length, `Loading entries around ${iso}…`);
  entriesLoading = loadEntriesRange_(range.from, range.to);
  try {
    await entriesLoading;
    renderEffective_();
    if (pending.length) setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} waiting to sync`);
    else setSync('saved', 0, 'Connected');
    return true;
  } catch (error) {
    console.error('Could not load entries for date:', error);
    recordError_('date-load', `Load ${iso}`, 'entries', error, { url: endpoint_('entries', range), extra: { range } });
    setSync('error', pending.length, 'Could not load that date — report saved');
    showToast(`Could not load date: ${error.message}`, 'error', 4200);
    return false;
  } finally {
    entriesLoading = null;
  }
}
export async function reconnect() {
  if (reconnecting) {
    showToast('Reconnect already running', 'info', 1600);
    return false;
  }
  reconnecting = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const queued = pending.length;
  setSync('loading', queued, queued ? `Reconnecting — saving ${queued} queued change${queued === 1 ? '' : 's'}…` : 'Reconnecting…');
  try {
    if (pending.length && !isDemoMode()) await flushPending({ reload: false, suppressSavedToast: true });
    await loadBaseData_();
    await refreshActiveEntryRange_();
    renderEffective_();
    if (pending.length && !isDemoMode()) {
      setSync('pending', pending.length, `${pending.length} change${pending.length === 1 ? '' : 's'} still queued`);
      showToast('Reconnected — changes still queued', 'info', 3000);
    } else {
      setSync('saved', 0, isDemoMode() ? 'Demo mode refreshed' : 'Reconnected');
      showToast('Reconnected', 'success', 1800);
    }
    return true;
  } catch (error) {
    console.error('Reconnect failed:', error);
    recordError_('reconnect', 'Manual reconnect', 'reconnect', error);
    if (isRecordNotFoundError_(error)) {
      await recoverMissingRecordQueue_();
      return false;
    }
    renderEffective_();
    setSync('error', pending.length, 'Reconnect failed — report saved');
    showToast(`Reconnect failed: ${error.message}. Report saved in Settings.`, 'error', 5200);
    return false;
  } finally {
    reconnecting = false;
  }
}
export async function saveNow() {
  if (savingNow || flushing) {
    showToast('Save already running', 'info', 1600);
    return false;
  }
  if (isDemoMode()) {
    showToast('Demo mode — nothing to save', 'info', 1800);
    return true;
  }
  if (!pending.length) {
    setSync('saved', 0, 'Saved');
    showToast('No changes to save', 'info', 1600);
    return true;
  }
  savingNow = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  setSync('saving', pending.length, `Saving ${pending.length} queued change${pending.length === 1 ? '' : 's'} now…`);
  try {
    return await flushPending();
  } finally {
    savingNow = false;
  }
}
export async function flushPending(options = {}) {
  if (isDemoMode()) return true;
  if (flushing) return false;
  if (pending.length === 0) return true;
  flushing = true;
  const batch = pending.slice();
  setSync('saving', batch.length, `Saving ${batch.length} change${batch.length === 1 ? '' : 's'}…`);
  try {
    await post_('batch', { operations: batch.map(({ type, data }) => ({ type, data })) });
    const complete = new Set(batch.map(operation => operation.queueId));
    pending = pending.filter(operation => !complete.has(operation.queueId));
    saveQueue_();
    if (options.reload !== false) {
      if (batch.some(operation => !isEntryOnlyOperation_(operation))) await loadBaseData_();
      await refreshActiveEntryRange_();
    }
    renderEffective_();
    if (pending.length) scheduleFlush_(150);
    else {
      setSync('saved', 0, 'Saved');
      if (!options.suppressSavedToast) showToast('Saved', 'success', 1600);
    }
    return true;
  } catch (error) {
    console.error('Sync failed:', error);
    recordError_('sync', 'Save queued changes', 'batch', error, { method: 'POST', url: endpoint_('batch'), extra: { queued: batch.length, reload: options.reload !== false } });
    if (isRecordNotFoundError_(error)) {
      await recoverMissingRecordQueue_();
      return false;
    }
    setSync('error', pending.length, 'Could not sync — report saved');
    showToast(`Sync failed: ${error.message}. Report saved in Settings.`, 'error', 5200);
    return false;
  } finally {
    flushing = false;
  }
}

function demoCommit_(type, data) {
  if (type === 'entries') mem.entries.unshift({ id: generateId_(), ...data });
  else if (type === 'updateEntry') mem.entries = mem.entries.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteEntry') mem.entries = mem.entries.filter(item => String(item.id) !== String(data.id));
  else if (type === 'foods') mem.foods.push({ id: generateId_(), ...data });
  else if (type === 'updateFood') mem.foods = mem.foods.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteFood') mem.foods = mem.foods.filter(item => String(item.id) !== String(data.id));
  else if (type === 'library') mem.library.push({ id: generateId_(), ...data });
  else if (type === 'updateLibrary') mem.library = mem.library.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteLibrary') mem.library = mem.library.filter(item => String(item.id) !== String(data.id));
  else if (type === 'weights') mem.weights.unshift({ id: generateId_(), ...data });
  else if (type === 'updateWeight') mem.weights = mem.weights.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
  else if (type === 'deleteWeight') mem.weights = mem.weights.filter(item => String(item.id) !== String(data.id));
  else if (type === 'settings') mem.settings = normaliseSettings_({ ...mem.settings, ...data });
  remote.entries = clone_(mem.entries);
  remote.foods = clone_(mem.foods);
  remote.library = clone_(mem.library);
  remote.weights = clone_(mem.weights);
  remote.settings = clone_(mem.settings);
  renderEffective_();
}
function mutate_(type, data, tempId) {
  if (isDemoMode()) {
    demoCommit_(type, data);
    return;
  }
  enqueue_({ type, data, ...(tempId ? { tempId } : {}) });
}

export function fetchEntriesByDate(date, loadIfMissing = true) {
  const iso = toISODate_(date);
  setState('entries', state.entriesFull.filter(entry => entry.date === iso));
  if (loadIfMissing && !rangeCovers_(iso)) ensureEntriesForDate(iso);
}
export function addEntry(date, name, calories) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Entries require a name.');
  mutate_('entries', { date: toISODate_(date), name: cleanName, calories: Number(calories) }, tempId_());
}
export function updateEntry(id, data) {
  const cleanName = String(data.name || '').trim();
  if (!cleanName) throw new Error('Entries require a name.');
  const payload = { id, date: toISODate_(data.date), name: cleanName, calories: Number(data.calories) };
  if (updateUnsentAdd_(id, 'entries', payload)) return;
  mutate_('updateEntry', payload);
}
export function deleteEntry(id) {
  if (!cancelUnsentAdd_(id, 'entries')) mutate_('deleteEntry', { id });
}
export function addWeight(date, value) {
  mutate_('weights', { date: toISODate_(date), value: Number(value) }, tempId_());
}
export function updateWeight(id, data) {
  const payload = { id, date: toISODate_(data.date), value: Number(data.value) };
  if (updateUnsentAdd_(id, 'weights', payload)) return;
  mutate_('updateWeight', payload);
}
export function deleteWeight(id) {
  if (!cancelUnsentAdd_(id, 'weights')) mutate_('deleteWeight', { id });
}
export function addFood(name, calories, emoji = '') {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Saved food buttons require a name.');
  if (!Number.isFinite(Number(calories)) || Number(calories) <= 0) throw new Error('Saved food buttons require calories.');
  const maxOrder = state.foods.reduce((max, food) => Math.max(max, Number(food.sortOrder) || 0), 0);
  mutate_('foods', { name: cleanName, calories: Math.abs(Number(calories)), sortOrder: maxOrder + 1, active: true, emoji: String(emoji || '').trim() }, tempId_());
}
export function updateFood(id, data) {
  const cleanName = String(data.name || '').trim();
  if (!cleanName) throw new Error('Saved food buttons require a name.');
  if (!Number.isFinite(Number(data.calories)) || Number(data.calories) <= 0) throw new Error('Saved food buttons require calories.');
  const payload = {
    id,
    name: cleanName,
    calories: Math.abs(Number(data.calories)),
    sortOrder: Number(data.sortOrder),
    active: Boolean(data.active),
    emoji: String(data.emoji || '').trim()
  };
  if (updateUnsentAdd_(id, 'foods', payload)) return;
  mutate_('updateFood', payload);
}
export function deleteFood(id) {
  if (!cancelUnsentAdd_(id, 'foods')) mutate_('deleteFood', { id });
}
export function reorderFood(id, direction) {
  const ordered = state.foods.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex(food => String(food.id) === String(id));
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
  const current = ordered[index];
  const swap = ordered[swapIndex];
  updateFood(current.id, { ...current, sortOrder: swap.sortOrder });
  updateFood(swap.id, { ...swap, sortOrder: current.sortOrder });
}

export function addLibraryItem(name, amount, calories, emoji = '') {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Library food requires a name.');
  if (!Number.isFinite(Number(calories)) || Number(calories) <= 0) throw new Error('Library food requires calories.');
  mutate_('library', { name: cleanName, amount: String(amount || '').trim(), calories: Math.abs(Number(calories)), emoji: String(emoji || '').trim() }, tempId_());
}
export function updateLibraryItem(id, data) {
  const cleanName = String(data.name || '').trim();
  if (!cleanName) throw new Error('Library food requires a name.');
  if (!Number.isFinite(Number(data.calories)) || Number(data.calories) <= 0) throw new Error('Library food requires calories.');
  const payload = {
    id,
    name: cleanName,
    amount: String(data.amount || '').trim(),
    calories: Math.abs(Number(data.calories)),
    emoji: String(data.emoji || '').trim()
  };
  if (updateUnsentAdd_(id, 'library', payload)) return;
  mutate_('updateLibrary', payload);
}
export function deleteLibraryItem(id) {
  if (!cancelUnsentAdd_(id, 'library')) mutate_('deleteLibrary', { id });
}

export function saveSettings(settings) {
  mutate_('settings', normaliseSettings_(settings));
}
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

export async function exportData() {
  return isDemoMode()
    ? {
        entries: mem.entries.map(({ id, ...data }) => data),
        foods: mem.foods.map(({ id, sortOrder, active, emoji, ...data }) => data),
        weights: mem.weights.map(({ id, ...data }) => data)
      }
    : get_('export');
}
export async function importData(data, options = {}) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.foods) || !Array.isArray(data.weights)) {
    throw new Error('Backup must contain entries, foods and weights arrays.');
  }
  const preserveFoods = options.preserveFoods !== false;
  pending = [];
  saveQueue_();
  loadedEntryRanges = [];
  if (isDemoMode()) {
    mem.entries = data.entries.map(item => ({ id: generateId_(), ...item }));
    if (!preserveFoods) mem.foods = data.foods.map((item, index) => ({ id: generateId_(), ...item, sortOrder: index + 1, active: true, emoji: '' }));
    mem.weights = data.weights.map(item => ({ id: generateId_(), ...item }));
    await loadRemoteData_(initialEntryRange_());
    renderEffective_();
    return;
  }
  await post_('import', { ...data, preserveFoods });
  await loadRemoteData_(initialEntryRange_());
  renderEffective_();
  setSync('saved', 0, 'Imported');
}
export async function resetAllData() {
  pending = [];
  saveQueue_();
  loadedEntryRanges = [];
  if (isDemoMode()) {
    mem.entries = [];
    mem.foods = [];
    mem.weights = [];
    await loadRemoteData_(initialEntryRange_());
    renderEffective_();
    return;
  }
  await post_('reset', {});
  await loadRemoteData_(initialEntryRange_());
  renderEffective_();
}

export function getConnectionInfo() {
  return {
    appVersion: 'Web · v2.15',
    mode: isDemoMode() ? 'demo' : 'google-apps-script',
    endpoint: CONFIG.baseUrl || '(not configured)',
    tokenConfigured: Boolean(CONFIG.token),
    online: navigator.onLine,
    timeoutMs: FETCH_TIMEOUT_MS,
    pendingChanges: pending.length,
    syncPhase: state.sync.phase,
    syncMessage: state.sync.message || '(none)',
    loadedEntryRanges: loadedEntryRanges.map(range => `${range.from} to ${range.to}`).join(', ') || '(none)'
  };
}
export function discardPendingChanges() {
  const count = pending.length;
  pending = [];
  saveQueue_();
  renderEffective_();
  setSync('idle', 0, '');
  showToast(`${count} unsynced local change${count === 1 ? '' : 's'} discarded`, 'info', 3000);
  return count;
}
async function diagnosticRequest_(label, action, options = {}) {
  const started = performance.now();
  const params = options.params || {};
  const fetchOptions = { ...options };
  delete fetchOptions.params;
  const url = endpoint_(action, params);
  const method = fetchOptions.method || 'GET';
  const lines = [label, `${method} ${url}`];
  try {
    const response = await fetchWithTimeout_(url, fetchOptions);
    lines.push(
      `HTTP result: ${response.status}`,
      `Elapsed: ${Math.round(performance.now() - started)} ms`,
      `Response body: ${(await response.text()).slice(0, 1200) || '(empty)'}`
    );
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - started);
    recordError_('connection-test', label, action, error, { method, url, elapsedMs, extra: { params } });
    lines.push(`FAILED after ${elapsedMs} ms`, `${error.name || 'Error'}: ${error.message || String(error)}`);
  }
  return lines.join('\n');
}
export async function runConnectionDebugTest() {
  const info = getConnectionInfo();
  const range = initialEntryRange_();
  const lines = [
    'ChrisFit Connection Debug Report',
    `Generated: ${new Date().toISOString()}`,
    `App version: ${info.appVersion}`,
    `App page: ${window.location.href}`,
    `Mode: ${info.mode}`,
    `Endpoint: ${info.endpoint}`,
    `Timeout per request: ${Math.round(info.timeoutMs / 1000)}s`,
    `Pending local changes: ${info.pendingChanges}`,
    `Loaded entry ranges: ${info.loadedEntryRanges}`,
    `Visible sync state: ${info.syncPhase} — ${info.syncMessage}`
  ];
  if (isDemoMode()) return `${lines.join('\n')}\n\nTEST NOT RUN: demo mode.`;
  const results = await Promise.all([
    diagnosticRequest_('TEST 1 — Read settings', 'settings'),
    diagnosticRequest_('TEST 2 — Read recent entries', 'entries', { params: range }),
    diagnosticRequest_('TEST 3 — Read food library', 'library'),
    diagnosticRequest_('TEST 4 — Empty batch sync route', 'batch', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ operations: [] })
    })
  ]);
  results.forEach(result => lines.push('', result));
  return lines.join('\n');
}
