import { state } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate, getActiveScreen } from './navigation.js';
import { showEntryDialog, showWeightDialog } from './dialogs.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';

function e() { return state.settings; }
function button(text, className, handler, title = '') {
  const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = text; el.title = title; el.addEventListener('click', handler); return el;
}
function changeDay(offset) { const date = new Date(state.selectedDate); date.setDate(date.getDate() + offset); state.selectedDate = date; api.fetchEntriesByDate(date); }
function chooseDate() {
  const input = prompt('Select date (DD-MM-YYYY)', dateUtils.formatDisplay(state.selectedDate));
  if (!input) return;
  const date = dateUtils.parseDisplayDate(input);
  if (!date) { alert('Use date format DD-MM-YYYY, for example 30-05-2026.'); return; }
  state.selectedDate = date; api.fetchEntriesByDate(date);
}
function metric(icon, label, current, target, achieved = false) {
  const row = document.createElement('div'); row.className = `summary-metric ${achieved ? 'on-target' : ''}`;
  row.innerHTML = `<span>${icon} ${label}</span><strong>${current}${target === undefined ? '' : ` / ${target}`}</strong>`; return row;
}
function addSwipe(container) {
  let start = null;
  container.addEventListener('touchstart', event => { if (!event.target.closest('button,input,select,textarea,a')) { const t = event.changedTouches[0]; start = { x:t.clientX, y:t.clientY }; } }, { passive:true });
  container.addEventListener('touchend', event => { if (!start) return; const t = event.changedTouches[0]; const dx = t.clientX - start.x, dy = t.clientY - start.y; start = null; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) changeDay(dx < 0 ? 1 : -1); }, { passive:true });
}
function logo() {
  const wrap = document.createElement('div'); wrap.className = 'logo-wrap';
  const image = document.createElement('img'); image.className = 'brand-logo'; image.src = 'icon.png'; image.alt = 'ChrisFit logo';
  image.addEventListener('error', () => { image.remove(); const fallback = document.createElement('span'); fallback.className = 'logo-fallback'; fallback.textContent = '🥦'; wrap.appendChild(fallback); });
  wrap.appendChild(image); return wrap;
}
export function render() {
  const app = document.getElementById('app'); if (!app) return; app.innerHTML = '';
  const active = getActiveScreen();
  app.appendChild(active === 'settings' ? renderSettings() : active === 'history' ? renderHistory() : renderMain());
  if (state.sync.message && !['idle','saved'].includes(state.sync.phase)) { const status = document.createElement('div'); status.className = `sync-status sync-${state.sync.phase}`; status.textContent = state.sync.message; app.appendChild(status); }
  if (state.toast) { const toast = document.createElement('div'); toast.className = `toast toast-${state.toast.type}`; toast.textContent = state.toast.message; app.appendChild(toast); }
}
export function renderMain() {
  const container = document.createElement('main'); container.className = 'screen main active page'; addSwipe(container);
  if (api.isDemoMode()) { const demo = document.createElement('div'); demo.className = 'demo-banner'; demo.textContent = 'DEMO MODE — changes are not saved to Google Sheets'; container.appendChild(demo); }
  const hero = document.createElement('section'); hero.className = 'card hero-card';
  const brand = document.createElement('div'); brand.className = 'brand-row';
  const title = document.createElement('div'); title.className = 'brand-title'; title.appendChild(logo()); title.insertAdjacentHTML('beforeend', '<div><h1>ChrisFit</h1><div class="version-label">Web · v2.3</div></div>');
  brand.append(title, button(`${e().emojiSettings} Settings`, 'btn-outline compact-button', () => navigate('settings')));
  const nav = document.createElement('div'); nav.className = 'date-navigation';
  nav.append(button(e().emojiPrevious, 'date-button', () => changeDay(-1), 'Previous day'));
  const selected = button('', 'selected-date', chooseDate); selected.innerHTML = `<strong>${dateUtils.getDayName(state.selectedDate)}</strong><span>${dateUtils.formatDisplay(state.selectedDate)}</span>`; nav.append(selected);
  nav.append(button(e().emojiNext, 'date-button', () => changeDay(1), 'Next day'));
  const hint = document.createElement('p'); hint.className = 'subtle-label centered'; hint.textContent = 'Swipe left or right to change day on mobile.';
  hero.append(brand, nav, hint); container.appendChild(hero);

  const selectedIso = dateUtils.toIso(state.selectedDate);
  const day = calc.calculateDay(state.entries, e());
  const weekEntries = state.entriesFull.filter(entry => dateUtils.getWeekStart(entry.date) === dateUtils.getWeekStart(selectedIso));
  const week = calc.calculateWeek(weekEntries, e());
  const daily = document.createElement('article'); daily.className = 'card summary-card'; daily.innerHTML = '<h2>Daily Summary</h2>';
  daily.append(metric(e().emojiFood, 'Food', day.intake, e().dailyCalories), metric(e().emojiBurn, 'Burn', day.burn, e().dailyBurnTarget), metric(e().emojiDeficit, 'Deficit', day.net, `-${e().dailyDeficit}`, day.achieved));
  const weekly = document.createElement('article'); weekly.className = 'card summary-card'; weekly.innerHTML = '<h2>Weekly Summary</h2>';
  weekly.append(metric(e().emojiFood, 'Food', week.intake, week.weeklyFoodTarget), metric(e().emojiBurn, 'Burn', week.burn, week.weeklyBurnTarget), metric(e().emojiDeficit, 'Deficit', week.net, `-${week.weeklyDeficitTarget}`, week.achieved));
  const selectedWeight = state.weights.find(weight => weight.date === selectedIso);
  const weight = document.createElement('article'); weight.className = 'card summary-card weight-summary';
  weight.innerHTML = `<h2>${e().emojiWeight} Weight</h2><div class="weight-value">${selectedWeight ? `${selectedWeight.value} kg` : '— kg'}</div><p class="subtle-label">${selectedWeight ? `${calc.calculateBMI(selectedWeight.value).toFixed(1)} BMI` : `No weight for ${dateUtils.formatDisplay(state.selectedDate)}`}</p>`;
  const weightActions = document.createElement('div'); weightActions.className = 'inline-actions'; weightActions.append(button(`${e().emojiWeight} Add`, 'btn-green', () => showWeightDialog()));
  if (selectedWeight) weightActions.append(button(`${e().emojiEdit} Edit`, 'btn-outline', () => showWeightDialog(selectedWeight)));
  weight.appendChild(weightActions);
  const overview = document.createElement('section'); overview.className = 'overview-grid'; overview.append(daily, weekly, weight); container.appendChild(overview);

  const quick = document.createElement('section'); quick.className = 'card';
  quick.innerHTML = `<div class="card-heading"><div><h2>Quick Add</h2><p>Tap saved items repeatedly to log multiple units.</p></div></div>`;
  const actions = document.createElement('div'); actions.className = 'primary-actions';
  actions.append(button(`${e().emojiFood} Add Food`, 'btn-blue', () => showEntryDialog('food')), button(`${e().emojiBurn} Add Burn`, 'btn-red', () => showEntryDialog('burn')), button(`${e().emojiBmr} BMR`, 'btn-green', () => api.addEntry(state.selectedDate, 'BMR', -Math.abs(e().bmr))), button(`${e().emojiHistory} History`, 'btn-outline', () => navigate('history')));
  const foods = document.createElement('div'); foods.className = 'food-grid';
  const activeFoods = state.foods.filter(food => food.active);
  if (!activeFoods.length) foods.innerHTML = '<p class="empty-state">No visible saved food buttons. Manage them in Settings.</p>';
  activeFoods.forEach(food => foods.append(button(`${e().emojiFood} ${food.name} · ${food.calories}`, 'saved-food-button', () => api.addEntry(state.selectedDate, food.name, food.calories))));
  quick.append(actions, foods); container.appendChild(quick);

  const entries = document.createElement('section'); entries.className = 'card entries-card'; entries.innerHTML = `<div class="card-heading"><div><h2>Entries</h2><p>${dateUtils.formatDisplay(state.selectedDate)}</p></div></div>`;
  const list = document.createElement('div'); list.className = 'entries-list';
  if (!state.entries.length) list.innerHTML = '<p class="empty-state">No entries for this day.</p>';
  state.entries.forEach(entry => {
    const row = document.createElement('div'); row.className = 'entry-row';
    const entryIcon = Number(entry.calories) < 0 ? e().emojiBurn : e().emojiFood;
    const identity = document.createElement('div'); identity.className = 'entry-identity'; identity.innerHTML = `<strong>${entryIcon} ${entry.name || 'Unnamed entry (imported)'}</strong><span class="${Number(entry.calories) < 0 ? 'entry-burn' : 'entry-food'}">${Number(entry.calories) < 0 ? 'Burn' : 'Food'}${entry._pending ? ' · syncing' : ''}</span>`;
    const amount = document.createElement('span'); amount.className = 'entry-amount'; amount.textContent = `${Number(entry.calories) > 0 ? '+' : ''}${entry.calories}`;
    const rowActions = document.createElement('div'); rowActions.className = 'entry-actions';
    rowActions.append(button(e().emojiEdit, 'icon-button', () => showEntryDialog(Number(entry.calories) < 0 ? 'burn' : 'food', entry), 'Edit entry'), button(e().emojiDelete, 'icon-button danger', () => api.deleteEntry(entry.id), 'Delete entry'));
    row.append(identity, amount, rowActions); list.appendChild(row);
  });
  entries.appendChild(list); container.appendChild(entries);
  return container;
}
