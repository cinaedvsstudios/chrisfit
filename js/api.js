/*
  API wrapper for ChrisFit Web.

  Functions in this module abstract away the details of communicating with
  the backend.  When `CONFIG.baseUrl` is empty the functions fall back
  to in-memory storage for demo mode.  Otherwise they perform fetch
  requests against the provided Google Apps Script endpoint.  All
  requests are sent with JSON bodies and expect JSON responses.

  Backend routes should mirror the behaviours of the Room DAO used by
  the Android version.  See docs/GOOGLE_SHEETS_SETUP.md for guidelines on
  implementing these routes in Apps Script.
*/

import { CONFIG } from './config.example.js';
import { state, setState } from './state.js';

// In-memory stores for demo mode
const mem = {
  nextId: 1,
  entries: [],
  foods: [],
  weights: [],
  settings: { dailyCalories: 1500, dailyDeficit: 500, bmr: 2000 }
};

function generateId() {
  return mem.nextId++;
}

function toISODate(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function request(path, method = 'GET', body) {
  if (!CONFIG.baseUrl) {
    // Demo mode: return undefined to allow fallback
    return undefined;
  }
  const url = CONFIG.baseUrl + path;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (CONFIG.token) {
    options.headers['Authorization'] = `Bearer ${CONFIG.token}`;
  }
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return await res.json();
}

export async function fetchSettings() {
  const data = await request('/settings');
  if (data) {
    setState('settings', data);
    return data;
  }
  // demo
  setState('settings', { ...mem.settings });
  return mem.settings;
}

export async function saveSettings(settings) {
  const data = await request('/settings', 'POST', settings);
  if (!data) {
    mem.settings = { ...mem.settings, ...settings };
  }
  setState('settings', settings);
}

export async function fetchFoods() {
  const data = await request('/foods');
  if (data) {
    setState('foods', data);
    return data;
  }
  setState('foods', [...mem.foods]);
  return mem.foods;
}

export async function addFood(name, calories) {
  const payload = { name, calories };
  const data = await request('/foods', 'POST', payload);
  if (!data) {
    mem.foods.unshift({ id: generateId(), name, calories });
  }
  await fetchFoods();
}

export async function deleteFood(id) {
  const data = await request(`/foods/${id}`, 'DELETE');
  if (!data) {
    mem.foods = mem.foods.filter(f => f.id !== id);
  }
  await fetchFoods();
}

export async function fetchEntriesByDate(date) {
  const iso = toISODate(date);
  const data = await request(`/entries?date=${encodeURIComponent(iso)}`);
  if (data) {
    setState('entries', data);
    return data;
  }
  const result = mem.entries.filter(e => e.date === iso).sort((a, b) => b.id - a.id);
  setState('entries', result);
  return result;
}

export async function fetchAllEntries() {
  const data = await request('/entries');
  if (data) {
    return data;
  }
  return [...mem.entries];
}

export async function addEntry(date, name, calories) {
  const payload = { date: toISODate(date), name, calories };
  const data = await request('/entries', 'POST', payload);
  if (!data) {
    mem.entries.unshift({ id: generateId(), ...payload });
  }
  await fetchEntriesByDate(date);
}

export async function deleteEntry(id) {
  const data = await request(`/entries/${id}`, 'DELETE');
  if (!data) {
    mem.entries = mem.entries.filter(e => e.id !== id);
  }
  await fetchEntriesByDate(state.selectedDate);
}

export async function fetchWeights() {
  const data = await request('/weights');
  if (data) {
    setState('weights', data);
    return data;
  }
  const sorted = mem.weights.sort((a, b) => b.date.localeCompare(a.date));
  setState('weights', sorted);
  return sorted;
}

export async function addWeight(date, value) {
  const payload = { date: toISODate(date), value };
  const data = await request('/weights', 'POST', payload);
  if (!data) {
    mem.weights.unshift({ id: generateId(), ...payload });
  }
  await fetchWeights();
}

export async function deleteWeight(id) {
  const data = await request(`/weights/${id}`, 'DELETE');
  if (!data) {
    mem.weights = mem.weights.filter(w => w.id !== id);
  }
  await fetchWeights();
}

export async function exportData() {
  const data = await request('/export');
  if (data) return data;
  return {
    entries: mem.entries.map(({ id, ...rest }) => rest),
    foods: mem.foods.map(({ id, ...rest }) => rest),
    weights: mem.weights.map(({ id, ...rest }) => rest)
  };
}

export async function importData(json) {
  const data = await request('/import', 'POST', json);
  if (!data) {
    mem.entries = json.entries.map(e => ({ id: generateId(), ...e }));
    mem.foods = json.foods.map(f => ({ id: generateId(), ...f }));
    mem.weights = json.weights.map(w => ({ id: generateId(), ...w }));
  }
  // reload all state
  await fetchSettings();
  await fetchFoods();
  await fetchEntriesByDate(state.selectedDate);
  await fetchWeights();
}

export async function resetAllData() {
  const data = await request('/reset', 'POST');
  if (!data) {
    mem.entries = [];
    mem.foods = [];
    mem.weights = [];
  }
  await fetchSettings();
  await fetchFoods();
  await fetchEntriesByDate(state.selectedDate);
  await fetchWeights();
}