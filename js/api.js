/* ChrisFit v2.16: cache-first startup and serialized, duplicate-safe sync. */
import { CONFIG } from './config.js';
import { state, defaultSettings, notify, setState, setSync, showToast } from './state.js';
import { recordConnectionReport, formatConnectionReport } from './connection-reports.js';
import * as cache from './cache.js';

const QUEUE_KEY = 'chrisfit.pendingWrites.v3';
const FETCH_TIMEOUT_MS = 15000;
const DATASETS = ['settings', 'foods', 'library', 'entries', 'weights'];
const TYPES = {
  entries: 'entries', updateEntry: 'entries', deleteEntry: 'entries',
  foods: 'foods', updateFood: 'foods', deleteFood: 'foods',
  library: 'library', updateLibrary: 'library', deleteLibrary: 'library',
  weights: 'weights', updateWeight: 'weights', deleteWeight: 'weights', settings: 'settings'
};
const mem = { nextId: 1, entries: [], foods: [], library: [], weights: [], settings: { ...defaultSettings } };
const remote = { entries: [], foods: [], library: [], weights: [], settings: { ...defaultSettings } };
let pending = [], acknowledged = new Set(), manifest = null;
let entriesComplete = false, cacheAvailable = false, usingCachedData = false, libraryNeeded = false;
let lastSuccessfulSync = null, storageError = '', queueError = '';
let flushing = false, savingNow = false, destructiveBusy = false;
let flushTimer = null, retryTimer = null, retryDelay = 15000;
let backgroundTask = null, libraryTask = null, networkTail = Promise.resolve();

export function isDemoMode() { return !CONFIG.baseUrl; }
function clone_(value) { return JSON.parse(JSON.stringify(value)); }
function tempId_() { return 'local_' + Date.now() + '_' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)); }
function generateId_() { return mem.nextId++; }
function toISODate_(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = date instanceof Date ? date : new Date(date);
  const pad = value => String(value).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function normaliseSettings_(settings = {}) { return { ...defaultSettings, ...(settings || {}), id: 1 }; }
function normaliseFood_(food, index = 0) {
  return { ...food, id: food.id, name: String(food.name || '').trim(), calories: Number(food.calories),
    sortOrder: Number.isFinite(Number(food.sortOrder)) ? Number(food.sortOrder) : index + 1,
    active: food.active === false || String(food.active).toLowerCase() === 'false' ? false : true,
    emoji: String(food.emoji || '').trim() };
}
function normaliseLibrary_(item, index = 0) {
  return { ...item, id: item.id ?? index + 1, name: String(item.name || '').trim(),
    amount: String(item.amount || '').trim(), calories: Number(item.calories), emoji: String(item.emoji || '').trim() };
}
function normaliseEntry_(entry) {
  return { ...entry, id: entry.id, date: toISODate_(entry.date), name: String(entry.name || '').trim(), calories: Number(entry.calories) };
}
function normaliseDataset_(name, data) {
  if (name === 'settings') return normaliseSettings_(data);
  if (name === 'foods') return data.map(normaliseFood_);
  if (name === 'library') return data.map(normaliseLibrary_);
  if (name === 'entries') return data.map(normaliseEntry_);
  return clone_(data);
}
function serial_(work) {
  const task = networkTail.then(work);
  networkTail = task.catch(() => {});
  return task;
}
function readQueue_() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!Array.isArray(value) || !value.every(op => op && TYPES[op.type] && op.data && typeof op.data === 'object')) {
      throw new Error('Pending queue is invalid; it has been preserved for recovery.');
    }
    return value.map(op => {
      const queueId = String(op.queueId || tempId_());
      return { ...op, queueId, data: { ...op.data, clientId: String(op.data.clientId || queueId) }, sent: Boolean(op.sent) };
    });
  } catch (error) { queueError = String(error.message || error); return []; }
}
function saveQueue_(value = pending) {
  if (queueError) throw new Error(queueError);
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(value)); }
  catch (error) { throw new Error('Local changes could not be saved on this device: ' + (error.message || error)); }
}
function effectivePending_() { return pending.filter(op => !acknowledged.has(op.queueId)); }
function persistSnapshot_(strict = false) {
  if (!entriesComplete || !manifest) return false;
  try {
    cache.saveCache({
      data: clone_(remote), meta: clone_(manifest), entriesComplete: true,
      guidance: clone_(state.guidance || []), lastSuccessfulSync,
      // Retain receipts only while a stale queue may still contain these operations.
      acknowledged: [...acknowledged]
    });
    cacheAvailable = true; storageError = ''; state.cacheStatus = 'saved';
    return true;
  } catch (error) {
    storageError = String(error.message || error); state.cacheStatus = 'unavailable';
    if (strict) throw error;
    return false;
  }
}
function hydrate_() {
  pending = readQueue_();
  const loaded = cache.loadCache();
  state.cacheStatus = loaded.status;
  if (loaded.cache) {
    const saved = loaded.cache;
    DATASETS.forEach(name => { remote[name] = normaliseDataset_(name, saved.data[name]); });
    manifest = saved.meta; entriesComplete = true; cacheAvailable = true; usingCachedData = true;
    lastSuccessfulSync = saved.lastSuccessfulSync || null;
    state.guidance = Array.isArray(saved.guidance) ? saved.guidance : [];
    acknowledged = new Set(saved.acknowledged);
    pending = effectivePending_();
  }
  if (loaded.error) storageError = loaded.error;
  try { saveQueue_(); acknowledged.clear(); } catch (error) { storageError = String(error.message || error); }
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
function recordError_(source, label, action, error, extra = {}) {
  try {
    recordConnectionReport({ source, label, action, error, info: getConnectionInfo(), ...extra, ...error?.request });
  } catch (_) { /* Storage failures must not prevent rendering. */ }
}
async function request_(action, params = {}, body) {
  const method = body === undefined ? 'GET' : 'POST', maxAttempts = method === 'GET' ? 2 : 1;
  const url = endpoint_(action, params);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = performance.now(), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let httpStatus = null;
    try {
      if (navigator.onLine === false) throw new Error('Device is offline');
      const response = await fetch(url, {
        method, signal: controller.signal, cache: 'no-store',
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      });
      httpStatus = response.status;
      if (!response.ok) throw new Error('Backend HTTP error ' + httpStatus);
      const data = await response.json();
      if (!data || data.success === false) throw new Error(data?.error || 'Backend returned an empty response');
      if (method === 'GET') {
        if (action === 'manifest' && !cache.validateManifest(data)) throw new Error('Invalid v2.16 manifest response');
        if (action === 'bootstrap' && (!cache.validateManifest(data.meta) ||
          !DATASETS.every(name => cache.validateDataset(name, data[name])))) throw new Error('Invalid bootstrap response');
        if (action === 'dataset' && (data.dataset !== params.dataset || !cache.validateManifest(data.meta) ||
          !cache.validateDataset(params.dataset, data.data))) throw new Error('Invalid dataset response');
      }
      return data;
    } catch (cause) {
      const error = new Error(cause?.name === 'AbortError' ? 'Backend timed out after 15s' : String(cause?.message || cause));
      error.request = { action, method, url, httpStatus, elapsedMs: Math.round(performance.now() - started),
        attempt, maxAttempts, retryCount: attempt - 1, cacheAvailable, usingCachedData };
      if (attempt === maxAttempts || navigator.onLine === false) {
        recordError_('request', 'Request ' + action, action, error);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 600));
    } finally { clearTimeout(timer); }
  }
}
async function get_(action, params = {}) { return request_(action, params); }
async function post_(action, body = {}) { return request_(action, {}, body); }
function identityMatches_(item, data) {
  return String(item.id) === String(data.id) || Boolean(data.recordClientId && item.clientId === data.recordClientId);
}
function applyOperations_(source, addType, updateType, deleteType) {
  let result = clone_(source || []);
  effectivePending_().forEach(op => {
    if (op.type === addType) {
      const existing = result.find(item => item.clientId && item.clientId === op.data.clientId);
      if (existing) existing._pending = true;
      else result.unshift({ ...op.data, id: op.tempId, _pending: true });
    }
    if (op.type === updateType) {
      const index = result.findIndex(item => identityMatches_(item, op.data));
      if (index >= 0) result[index] = { ...result[index], ...op.data, id: result[index].id, clientId: result[index].clientId, _pending: true };
    }
    if (op.type === deleteType) result = result.filter(item => !identityMatches_(item, op.data));
  });
  return result;
}
function effectiveSettings_() {
  let settings = normaliseSettings_(remote.settings);
  effectivePending_().filter(op => op.type === 'settings').forEach(op => { settings = normaliseSettings_({ ...settings, ...op.data }); });
  return settings;
}
function renderEffective_() {
  const entriesFull = applyOperations_(remote.entries, 'entries', 'updateEntry', 'deleteEntry').map(normaliseEntry_)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  Object.assign(state, {
    entriesFull, entries: entriesFull.filter(entry => entry.date === toISODate_(state.selectedDate)),
    foods: applyOperations_(remote.foods, 'foods', 'updateFood', 'deleteFood').map(normaliseFood_)
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id)),
    library: applyOperations_(remote.library, 'library', 'updateLibrary', 'deleteLibrary').map(normaliseLibrary_)
      .sort((a, b) => a.name.localeCompare(b.name)),
    weights: applyOperations_(remote.weights, 'weights', 'updateWeight', 'deleteWeight')
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))),
    settings: effectiveSettings_(), backendManifest: manifest, lastSuccessfulSync, pendingChanges: clone_(effectivePending_())
  });
  notify();
}
function setStatus_(phase, message) { state.syncStatus = phase; setSync(phase, effectivePending_().length, message); }
function savedStatus_() {
  if (storageError || queueError) return setStatus_('pending', 'Data is available here, but local saving failed. Copy a sync/cache report in Settings.');
  const count = effectivePending_().length;
  setStatus_(count ? 'pending' : 'saved', count ? count + ' changes waiting to sync' : 'Connected');
}
function failedStatus_() {
  renderEffective_();
  setStatus_(cacheAvailable || effectivePending_().length ? 'pending' : 'error',
    cacheAvailable ? 'Using saved data. Google sync failed; retrying in background.'
      : effectivePending_().length ? 'Local changes kept. Google sync failed; retrying in background.'
      : 'No saved data available. Google could not load; retrying in background.');
  scheduleBackgroundRetry_();
}
function scheduleBackgroundRetry_() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = null; backgroundSync(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}
function scheduleFlush_(delay = 650) {
  if (isDemoMode()) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; flushPending(); }, delay);
}
function enqueue_(operation) {
  if (destructiveBusy) throw new Error('Wait until the import/reset has finished before adding changes.');
  const queueId = tempId_(), data = { ...operation.data, clientId: queueId };
  if (/^(update|delete)/.test(operation.type)) {
    const name = TYPES[operation.type];
    const item = state[name === 'entries' ? 'entriesFull' : name]?.find(item => String(item.id) === String(data.id));
    const add = pending.find(op => op.type === name && String(op.tempId) === String(data.id));
    const recordClientId = item?.clientId || add?.data.clientId;
    if (recordClientId) data.recordClientId = recordClientId;
  }
  const next = [...pending, { ...operation, data, queueId, sent: false }];
  saveQueue_(next);
  pending = next; renderEffective_();
  setStatus_('pending', effectivePending_().length + ' changes waiting to sync');
  showToast('Saved locally — syncing', 'info', 1400); scheduleFlush_();
}
function findOperationForPendingAdd_(type, id) {
  return pending.find(op => !acknowledged.has(op.queueId) && op.type === type && String(op.tempId) === String(id));
}
function cancelUnsentAdd_(id, addType) {
  const add = findOperationForPendingAdd_(addType, id);
  if (!add || add.sent) return false;
  const next = pending.filter(op => op.queueId !== add.queueId);
  saveQueue_(next); pending = next; renderEffective_(); savedStatus_();
  return true;
}
function updateUnsentAdd_(id, addType, data) {
  const add = findOperationForPendingAdd_(addType, id);
  if (!add || add.sent) return false;
  const next = pending.map(op => op.queueId === add.queueId
    ? { ...op, data: { ...op.data, ...data, clientId: op.data.clientId } } : op);
  saveQueue_(next); pending = next; renderEffective_(); scheduleFlush_();
  return true;
}
function acceptManifest_(value) {
  if (!cache.validateManifest(value)) throw new Error('Backend sync response is invalid or is not v2.16.');
  if (manifest && value.spreadsheetId !== manifest.spreadsheetId) throw new Error('Backend spreadsheet changed; sync stopped to preserve local changes.');
  return value;
}
async function bootstrap_() {
  const snapshot = await get_('bootstrap'), meta = acceptManifest_(snapshot.meta);
  if (!DATASETS.every(name => cache.validateDataset(name, snapshot[name]))) throw new Error('Backend bootstrap data is invalid. Saved data has been kept.');
  DATASETS.forEach(name => { remote[name] = normaliseDataset_(name, snapshot[name]); });
  manifest = clone_(meta); entriesComplete = true; usingCachedData = false;
  lastSuccessfulSync = new Date().toISOString(); persistSnapshot_(); renderEffective_();
}
async function loadDataset_(name) {
  const response = await get_('dataset', { dataset: name }), meta = acceptManifest_(response.meta);
  if (response.dataset !== name || !cache.validateDataset(name, response.data)) throw new Error('Backend ' + name + ' data is invalid. Saved data has been kept.');
  remote[name] = normaliseDataset_(name, response.data);
  // Update only the revision belonging to data actually received.
  manifest.revisions[name] = meta.revisions[name];
  manifest.updatedAt = { ...manifest.updatedAt, [name]: meta.updatedAt?.[name] || '' };
  manifest.serverTime = meta.serverTime; lastSuccessfulSync = new Date().toISOString(); usingCachedData = false;
  persistSnapshot_(); renderEffective_();
}
async function checkChanges_() {
  if (!entriesComplete || !manifest) return bootstrap_();
  const latest = acceptManifest_(await get_('manifest'));
  for (const name of DATASETS) {
    if (name === 'library' && !libraryNeeded) continue;
    if (manifest.revisions[name] !== latest.revisions[name]) await loadDataset_(name);
  }
  lastSuccessfulSync = new Date().toISOString(); persistSnapshot_(); renderEffective_();
}
function reconcileAcknowledged_(batch, results) {
  const nextRemote = clone_(remote), mapping = new Map();
  batch.forEach((op, index) => {
    const result = results[index], name = TYPES[op.type];
    if (result.skippedMissing) {
      nextRemote[name] = nextRemote[name].filter(item => !identityMatches_(item, op.data));
      return;
    }
    if (op.type === 'settings') nextRemote.settings = normaliseSettings_({ ...nextRemote.settings, ...op.data });
    else if (op.type === name) {
      const id = result.id;
      mapping.set(String(op.tempId), { id, clientId: op.data.clientId });
      const existing = nextRemote[name].find(item => item.clientId === op.data.clientId || String(item.id) === String(id));
      if (!existing) nextRemote[name].unshift({ ...op.data, id });
    } else {
      const resolved = mapping.get(String(op.data.id));
      const data = { ...op.data, ...(resolved ? { id: resolved.id, recordClientId: resolved.clientId } : {}) };
      if (op.type.startsWith('delete')) nextRemote[name] = nextRemote[name].filter(item => !identityMatches_(item, data));
      else nextRemote[name] = nextRemote[name].map(item => identityMatches_(item, data)
        ? { ...item, ...data, id: item.id, clientId: item.clientId } : item);
    }
  });
  DATASETS.forEach(name => { remote[name] = normaliseDataset_(name, nextRemote[name]); });
  const nextQueue = pending.map(op => {
    const resolved = mapping.get(String(op.data.id));
    return resolved ? { ...op, data: { ...op.data, id: resolved.id, recordClientId: resolved.clientId } } : op;
  });
  // Atomically save the merged snapshot AND receipts before removing the queue.
  batch.forEach(op => acknowledged.add(op.queueId));
  lastSuccessfulSync = new Date().toISOString();
  try { persistSnapshot_(true); }
  catch (error) { batch.forEach(op => acknowledged.delete(op.queueId)); throw error; }
  pending = nextQueue.filter(op => !acknowledged.has(op.queueId));
  try { saveQueue_(); acknowledged.clear(); }
  catch (error) { storageError = String(error.message || error); }
  renderEffective_();
}
async function flushCore_(options = {}) {
  if (!effectivePending_().length) return true;
  if (!entriesComplete || !manifest) await bootstrap_();
  if (queueError) throw new Error(queueError);
  const batch = clone_(effectivePending_()), ids = new Set(batch.map(op => op.queueId));
  const frozen = pending.map(op => ids.has(op.queueId) ? { ...op, sent: true } : op);
  saveQueue_(frozen); pending = frozen;
  flushing = true; setStatus_('saving', 'Saving ' + batch.length + ' changes…');
  try {
    const response = await post_('batch', { operations: batch.map(({ type, data }) => ({ type, data })) });
    if (!Array.isArray(response.results) || response.results.length !== batch.length ||
      !response.results.every((result, index) => result?.success === true &&
        (batch[index].type !== TYPES[batch[index].type] || batch[index].type === 'settings' || Number.isSafeInteger(result.id)))) {
      throw new Error('Backend did not acknowledge all queued changes. They have been kept for a safe retry.');
    }
    reconcileAcknowledged_(batch, response.results);
    retryDelay = 15000; savedStatus_();
    if (!options.suppressSavedToast) showToast('Saved', 'success', 1600);
    if (effectivePending_().length) scheduleFlush_(150);
    return true;
  } finally { flushing = false; }
}
function backgroundSync() {
  if (isDemoMode()) return Promise.resolve(true);
  if (backgroundTask) return backgroundTask;
  backgroundTask = serial_(async () => {
    try {
      await checkChanges_(); await flushCore_({ suppressSavedToast: true });
      retryDelay = 15000;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      savedStatus_(); return true;
    } catch (error) {
      if (!error.request) recordError_('sync', 'Background sync', 'sync', error);
      failedStatus_(); return false;
    }
  }).finally(() => { backgroundTask = null; });
  return backgroundTask;
}
export async function initialise() {
  if (isDemoMode()) { entriesComplete = true; renderEffective_(); setStatus_('saved', 'Demo mode'); return true; }
  hydrate_(); renderEffective_();
  setStatus_('loading', cacheAvailable ? 'Using saved data · checking for updates…' : 'Loading Google data…');
  if (cacheAvailable) { backgroundSync(); return true; }
  return backgroundSync();
}
export async function ensureEntriesForDate(date) {
  if (!entriesComplete && !isDemoMode()) await backgroundSync();
  fetchEntriesByDate(date, false); return entriesComplete;
}
export async function ensureLibrary() {
  libraryNeeded = true;
  if (isDemoMode()) return true;
  if (libraryTask) return libraryTask;
  libraryTask = serial_(async () => {
    try {
      if (!manifest || !entriesComplete) await bootstrap_();
      else {
        const latest = acceptManifest_(await get_('manifest'));
        if (latest.revisions.library !== manifest.revisions.library) await loadDataset_('library');
      }
      return true;
    } catch (error) { failedStatus_(); return false; }
  }).finally(() => { libraryTask = null; });
  return libraryTask;
}
export async function reconnect() {
  setStatus_('loading', cacheAvailable ? 'Using saved data · checking for updates…' : 'Reconnecting…');
  return backgroundSync();
}
export async function saveNow() {
  if (savingNow) return false;
  savingNow = true;
  try { return await flushPending(); } finally { savingNow = false; }
}
export async function flushPending(options = {}) {
  if (isDemoMode()) return true;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  return serial_(async () => {
    try { return await flushCore_(options); }
    catch (error) {
      if (!error.request) recordError_('sync', 'Save queued changes', 'batch', error);
      failedStatus_(); return false;
    }
  });
}
export async function forceFullRefresh() {
  if (isDemoMode()) return true;
  return serial_(async () => {
    setStatus_('loading', cacheAvailable ? 'Using saved data · refreshing Google data…' : 'Refreshing Google data…');
    try { await bootstrap_(); savedStatus_(); return true; }
    catch (error) { failedStatus_(); return false; }
  });
}
export function clearLocalCache() {
  if (flushing || backgroundTask || destructiveBusy) throw new Error('Wait until the current sync has finished before clearing the cache.');
  saveQueue_(effectivePending_()); cache.clearCache();
  cacheAvailable = false; state.cacheStatus = 'empty'; notify();
  showToast('Local data cache cleared; unsynced changes kept', 'info', 2800);
}
export function getConnectionInfo() {
  return {
    appVersion: 'Web · v2.16', mode: isDemoMode() ? 'demo' : 'google-apps-script',
    endpoint: CONFIG.baseUrl || '(not configured)', tokenConfigured: Boolean(CONFIG.token),
    online: navigator.onLine, timeoutMs: FETCH_TIMEOUT_MS, pendingChanges: effectivePending_().length,
    syncPhase: state.sync.phase, syncMessage: state.sync.message || '(none)',
    loadedEntryRanges: entriesComplete ? 'All history' : '(none)',
    cacheAvailable, usingCachedData, cacheStatus: state.cacheStatus, cacheBytes: cache.getCacheSize(),
    lastSuccessfulSync, backendVersion: manifest?.backendVersion || '(unknown)',
    revisions: manifest?.revisions || null, storageError: storageError || queueError || null
  };
}
export function getSyncCacheReport() {
  return ['ChrisFit Sync/Cache Report', 'Generated: ' + new Date().toISOString(),
    ...Object.entries(getConnectionInfo()).map(([key, value]) => key + ': ' + (typeof value === 'object' ? JSON.stringify(value) : value))
  ].join('\n');
}
export function discardPendingChanges() {
  if (flushing || backgroundTask || destructiveBusy || pending.some(op => op.sent && !acknowledged.has(op.queueId))) {
    throw new Error('Some changes may already have reached Google. Reconnect before discarding them.');
  }
  const count = effectivePending_().length;
  saveQueue_([]); pending = []; renderEffective_(); savedStatus_();
  showToast(count + ' unsynced local changes discarded', 'info', 3000); return count;
}
export async function runConnectionDebugTest() {
  const lines = [getSyncCacheReport()];
  if (isDemoMode()) return lines[0] + '\nTEST NOT RUN: demo mode.';
  try {
    const started = performance.now(), meta = await get_('manifest');
    lines.push('GET ' + endpoint_('manifest'), 'Elapsed: ' + Math.round(performance.now() - started) + ' ms', 'Response: ' + JSON.stringify(meta));
  } catch (error) { lines.push(formatConnectionReport({ ...error.request, message: error.message })); }
  return lines.join('\n\n');
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
  if (loadIfMissing && !entriesComplete) ensureEntriesForDate(iso);
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
  if (isDemoMode()) return {
    entries: mem.entries.map(({ id, ...data }) => data),
    foods: mem.foods.map(({ id, sortOrder, active, emoji, ...data }) => data),
    weights: mem.weights.map(({ id, ...data }) => data)
  };
  if (!entriesComplete) await forceFullRefresh();
  if (!entriesComplete) throw new Error('No complete saved history is available to export.');
  return {
    entries: state.entriesFull.map(({ date, name, calories }) => ({ date, name, calories })),
    foods: state.foods.map(({ name, calories }) => ({ name, calories })),
    weights: state.weights.map(({ date, value }) => ({ date, value }))
  };
}
async function destructiveWrite_(action, data) {
  if (destructiveBusy) throw new Error('An import/reset is already running.');
  if (effectivePending_().length || flushing) throw new Error('Save or discard unsynced changes before importing/resetting.');
  destructiveBusy = true;
  try {
    return await serial_(async () => {
      await post_(action, data);
      manifest = null; entriesComplete = false;
      await bootstrap_();
      savedStatus_();
    });
  } finally { destructiveBusy = false; }
}
export async function importData(data, options = {}) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.foods) || !Array.isArray(data.weights)) {
    throw new Error('Backup must contain entries, foods and weights arrays.');
  }
  const preserveFoods = options.preserveFoods !== false;
  if (!isDemoMode()) return destructiveWrite_('import', { ...data, preserveFoods });
  mem.entries = data.entries.map(item => ({ id: generateId_(), ...item }));
  if (!preserveFoods) mem.foods = data.foods.map((item, index) => ({ id: generateId_(), ...item, sortOrder: index + 1, active: true, emoji: '' }));
  mem.weights = data.weights.map(item => ({ id: generateId_(), ...item }));
  demoCommit_('', {});
}
export async function resetAllData() {
  if (!isDemoMode()) return destructiveWrite_('reset', {});
  mem.entries = []; mem.foods = []; mem.weights = [];
  demoCommit_('', {});
}
