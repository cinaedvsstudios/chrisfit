/* v2.16 saved remote snapshot. Pending writes stay in their existing durable queue. */
import { CONFIG } from './config.js';

const CACHE_KEY = 'chrisfit.cache.v1';
const VERSION = 1;
const DATASETS = ['settings', 'foods', 'library', 'entries', 'weights'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function finite(value) { return Number.isFinite(Number(value)) && value !== null && value !== ''; }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function validateManifest(meta) {
  return record(meta) && meta.backendVersion === '2.16' && meta.cacheSchemaVersion === VERSION &&
    typeof meta.spreadsheetId === 'string' && record(meta.revisions) &&
    DATASETS.every(name => Number.isSafeInteger(meta.revisions[name]) && meta.revisions[name] >= 1);
}
export function validateDataset(name, value) {
  if (name === 'settings') return record(value) &&
    ['dailyCalories', 'dailyBurnTarget', 'dailyDeficit', 'bmr'].every(key => finite(value[key]));
  if (!Array.isArray(value)) return false;
  return value.every(item => record(item) && finite(item.id) &&
    (name === 'weights'
      ? finite(item.value) && datePattern.test(item.date)
      : typeof item.name === 'string' && finite(item.calories) &&
        (name !== 'entries' || datePattern.test(item.date))));
}
export function validateCache(value) {
  return record(value) && value.version === VERSION && value.endpoint === CONFIG.baseUrl &&
    validateManifest(value.meta) && record(value.data) &&
    DATASETS.every(name => validateDataset(name, value.data[name])) &&
    value.entriesComplete === true && Array.isArray(value.acknowledged) &&
    value.acknowledged.every(id => typeof id === 'string');
}
export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { status: 'empty', cache: null };
    const value = JSON.parse(raw);
    if (!validateCache(value)) return { status: 'invalid', cache: null };
    return { status: 'saved', cache: value };
  } catch (error) {
    return { status: 'unavailable', cache: null, error: String(error.message || error) };
  }
}
export function saveCache(value) {
  const snapshot = { ...value, version: VERSION, endpoint: CONFIG.baseUrl, savedAt: new Date().toISOString() };
  if (!validateCache(snapshot)) throw new Error('Cannot save an invalid local snapshot.');
  // A single setItem atomically stores data and acknowledgement receipts.
  // Queue removal happens only after this succeeds.
  localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}
export function clearCache() { localStorage.removeItem(CACHE_KEY); }
export function getCacheSize() {
  try { return new Blob([localStorage.getItem(CACHE_KEY) || '']).size; }
  catch (_) { return null; }
}
