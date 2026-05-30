/*
  ChrisFit data access layer.

  The Android app stores Entry, Food, Weight and Settings in Room. This web
  clone uses identical data fields through Google Apps Script, or an in-memory
  demo store until CONFIG.baseUrl is configured.
*/
import { CONFIG } from './config.js';
import { state, setState } from './state.js';

const mem = {
  nextId: 1,
  entries: [],
  foods: [],
  weights: [],
  settings: { id: 1, dailyCalories: 1500, dailyDeficit: 500, bmr: 2000 }
};

export function isDemoMode() {
  return !CONFIG.baseUrl;
}

function generateId() {
  return mem.nextId++;
}

function toISODate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function endpoint(action, params = {}) {
  const url = new URL(CONFIG.baseUrl);
  url.searchParams.set('action', action);
  if (CONFIG.token) url.searchParams.set('token', CONFIG.token);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}

function assertApiResponse(data) {
  if (data && data.success === false) throw new Error(data.error || 'Backend request failed');
  return data;
}

async function get(action, params = {}) {
  if (isDemoMode()) return undefined;
  const res = await fetch(endpoint(action, params));
  if (!res.ok) throw new Error(`Backend HTTP error ${res.status}`);
  return assertApiResponse(await res.json());
}

async function post(action, body = {}) {
  if (isDemoMode()) return undefined;
  const res = await fetch(endpoint(action), {
    method: 'POST',
    // text/plain avoids a browser CORS preflight that Apps Script web apps
    // cannot answer while still allowing the server to parse JSON contents.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Backend HTTP error ${res.status}`);
  return assertApiResponse(await res.json());
}

export async function fetchSettings() {
  const data = await get('settings');
  const settings = data || { ...mem.settings };
  setState('settings', settings);
  return settings;
}

export async function saveSettings(settings) {
  const payload = { id: 1, ...settings };
  const data = await post('settings', payload);
  if (!data) mem.settings = payload;
  setState('settings', payload);
}

export async function fetchFoods() {
  const data = await get('foods');
  const foods = data || [...mem.foods].sort((a, b) => b.id - a.id);
  setState('foods', foods);
  return foods;
}

export async function addFood(name, calories) {
  const payload = { name, calories: Number(calories) };
  const data = await post('foods', payload);
  if (!data) mem.foods.push({ id: generateId(), ...payload });
  return fetchFoods();
}

export async function deleteFood(id) {
  const data = await post('deleteFood', { id });
  if (!data) mem.foods = mem.foods.filter(food => food.id !== id);
  return fetchFoods();
}

export async function fetchEntriesByDate(date) {
  const iso = toISODate(date);
  const data = await get('entries', { date: iso });
  const entries = data || mem.entries
    .filter(entry => entry.date === iso)
    .sort((a, b) => b.id - a.id);
  setState('entries', entries);
  return entries;
}

export async function fetchAllEntries() {
  const data = await get('entries');
  const entries = data || [...mem.entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  setState('entriesFull', entries);
  return entries;
}

export async function addEntry(date, name, calories) {
  const payload = { date: toISODate(date), name, calories: Number(calories) };
  const data = await post('entries', payload);
  if (!data) mem.entries.push({ id: generateId(), ...payload });
  await fetchEntriesByDate(date);
  await fetchAllEntries();
}

export async function deleteEntry(id) {
  const data = await post('deleteEntry', { id });
  if (!data) mem.entries = mem.entries.filter(entry => entry.id !== id);
  await fetchEntriesByDate(state.selectedDate);
  await fetchAllEntries();
}

export async function fetchWeights() {
  const data = await get('weights');
  const weights = data || [...mem.weights].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  setState('weights', weights);
  return weights;
}

export async function addWeight(date, value) {
  const payload = { value: Number(value), date: toISODate(date) };
  const data = await post('weights', payload);
  if (!data) mem.weights.push({ id: generateId(), ...payload });
  await fetchWeights();
}

export async function deleteWeight(id) {
  const data = await post('deleteWeight', { id });
  if (!data) mem.weights = mem.weights.filter(weight => weight.id !== id);
  await fetchWeights();
}

export async function exportData() {
  const data = await get('export');
  if (data) return data;
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
  const data = await post('import', json);
  if (!data) {
    mem.entries = json.entries.map(entry => ({ id: generateId(), ...entry }));
    mem.foods = json.foods.map(food => ({ id: generateId(), ...food }));
    mem.weights = json.weights.map(weight => ({ id: generateId(), ...weight }));
  }
  await fetchFoods();
  await fetchEntriesByDate(state.selectedDate);
  await fetchAllEntries();
  await fetchWeights();
}

export async function resetAllData() {
  const data = await post('reset');
  if (!data) {
    mem.entries = [];
    mem.foods = [];
    mem.weights = [];
  }
  await fetchFoods();
  await fetchEntriesByDate(state.selectedDate);
  await fetchAllEntries();
  await fetchWeights();
}
