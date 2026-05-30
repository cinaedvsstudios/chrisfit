import { state, setState } from './state.js';
import * as api from './api.js';
import { isDemoMode } from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { getActiveScreen, navigate } from './navigation.js';
import { showFoodDialog, showBurnDialog, showWeightDialog } from './dialogs.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';

function button(text, className, handler) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = text;
  item.className = className;
  item.addEventListener('click', handler);
  return item;
}

function changeDay(offset) {
  const date = new Date(state.selectedDate);
  date.setDate(date.getDate() + offset);
  setState('selectedDate', date);
  api.fetchEntriesByDate(date);
}

function chooseDate() {
  const entered = prompt('Select date (DD-MM-YYYY)', dateUtils.formatDisplay(state.selectedDate));
  if (!entered) return;
  const date = dateUtils.parseDisplayDate(entered);
  if (!date) {
    window.alert('Use date format DD-MM-YYYY, for example 30-05-2026.');
    return;
  }
  setState('selectedDate', date);
  api.fetchEntriesByDate(date);
}

function metric(label, value, target, className = '') {
  const row = document.createElement('div');
  row.className = `summary-metric ${className}`.trim();
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = target === undefined ? String(value) : `${value} / ${target}`;
  row.append(left, right);
  return row;
}

function addSwipeNavigation(container) {
  let start = null;
  container.addEventListener('touchstart', event => {
    if (event.target.closest('button, input, textarea, select')) return;
    const touch = event.changedTouches[0];
    start = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  container.addEventListener('touchend', event => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    start = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    changeDay(dx < 0 ? 1 : -1);
  }, { passive: true });
}

export function render() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const screen = getActiveScreen();
  app.appendChild(screen === 'history' ? renderHistory() : screen === 'settings' ? renderSettings() : renderMain());

  if (state.sync.message && !['idle', 'saved'].includes(state.sync.phase)) {
    const status = document.createElement('div');
    status.className = `sync-status sync-${state.sync.phase}`;
    status.textContent = state.sync.message;
    app.appendChild(status);
  }
  if (state.toast) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${state.toast.type}`;
    toast.textContent = state.toast.message;
    app.appendChild(toast);
  }
}

export function renderMain() {
  const selectedIso = dateUtils.toIso(state.selectedDate);
  const container = document.createElement('main');
  container.className = 'screen main active page';
  addSwipeNavigation(container);

  if (isDemoMode()) {
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.textContent = 'DEMO MODE — changes are not saved to Google Sheets';
    container.appendChild(banner);
  }

  const header = document.createElement('section');
  header.className = 'card hero-card';
  const brand = document.createElement('div');
  brand.className = 'brand-row';
  brand.innerHTML = '<div><h1>ChrisFit</h1><div class="version-label">Web preview · v2.2</div></div>';
  brand.appendChild(button('⚙ Settings', 'btn-outline compact-button', () => navigate('settings')));
  const dateNav = document.createElement('div');
  dateNav.className = 'date-navigation';
  dateNav.append(
    button('←', 'date-button', () => changeDay(-1)),
    Object.assign(document.createElement('button'), {
      className: 'selected-date',
      type: 'button',
      innerHTML: `<strong>${dateUtils.getDayName(state.selectedDate)}</strong><span>${dateUtils.formatDisplay(state.selectedDate)}</span>`
    }),
    button('→', 'date-button', () => changeDay(1))
  );
  dateNav.children[1].addEventListener('click', chooseDate);
  const swipeHint = document.createElement('p');
  swipeHint.className = 'subtle-label';
  swipeHint.textContent = 'Swipe left or right to change day on mobile.';
  header.append(brand, dateNav, swipeHint);
  container.appendChild(header);

  const dayStats = calc.calculateDay(state.entries, state.settings);
  const weekStart = dateUtils.getWeekStart(selectedIso);
  const weekEntries = (state.entriesFull || []).filter(entry => dateUtils.getWeekStart(entry.date) === weekStart);
  const weekStats = calc.calculateWeek(weekEntries, state.settings);
  const weightForDay = state.weights.find(weight => weight.date === selectedIso);

  const overview = document.createElement('section');
  overview.className = 'overview-grid';
  const daily = document.createElement('article');
  daily.className = 'card summary-card';
  daily.innerHTML = '<h2>Daily Summary</h2>';
  daily.append(
    metric('Food', dayStats.intake, state.settings?.dailyCalories ?? 1500),
    metric('Burn', dayStats.burn),
    metric('Deficit', dayStats.net, `-${state.settings?.dailyDeficit ?? 500}`, dayStats.achieved ? 'on-target' : '')
  );
  const weekly = document.createElement('article');
  weekly.className = 'card summary-card';
  weekly.innerHTML = '<h2>Weekly Summary</h2>';
  weekly.append(
    metric('Food', weekStats.intake, weekStats.weeklyFoodTarget),
    metric('Burn', weekStats.burn),
    metric('Deficit', weekStats.net, `-${weekStats.weeklyDeficitTarget}`, weekStats.achieved ? 'on-target' : '')
  );
  const weight = document.createElement('article');
  weight.className = 'card summary-card weight-summary';
  weight.innerHTML = `<h2>Weight</h2><div class="weight-value">${weightForDay ? `${weightForDay.value} kg` : '— kg'}</div><div class="subtle-label">${weightForDay ? `${calc.calculateBMI(weightForDay.value).toFixed(1)} BMI` : `No weight for ${dateUtils.formatDisplay(state.selectedDate)}`}</div>`;
  weight.appendChild(button('Add Weight', 'btn-green full-button', showWeightDialog));
  overview.append(daily, weekly, weight);
  container.appendChild(overview);

  const quick = document.createElement('section');
  quick.className = 'card';
  quick.innerHTML = '<div class="card-heading"><div><h2>Quick Add</h2><p>Tap saved items repeatedly to log multiple units.</p></div></div>';
  const primaryActions = document.createElement('div');
  primaryActions.className = 'primary-actions';
  const addBmr = () => {
    const hasTotalBurn = state.entries.some(entry => ['Health Connect Burn', 'Estimated Total Burn'].includes(entry.name));
    if (hasTotalBurn && !confirm('This day already has a total-burn entry. Adding BMR as well may double-count burn. Continue?')) return;
    api.addEntry(state.selectedDate, 'BMR', -Math.abs(Number(state.settings?.bmr ?? 2000)));
  };
  primaryActions.append(
    button('＋ Add Food', 'btn-blue', showFoodDialog),
    button('− Add Burn', 'btn-red', showBurnDialog),
    button('BMR', 'btn-purple', addBmr),
    button('History', 'btn-green', () => navigate('history'))
  );
  const foods = document.createElement('div');
  foods.className = 'food-grid';
  if (!state.foods.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No saved food buttons yet. Add them in Settings.';
    foods.appendChild(empty);
  }
  state.foods.forEach(food => {
    foods.appendChild(button(`${food.name}  ·  ${food.calories}`, 'saved-food-button', () => api.addEntry(state.selectedDate, food.name, food.calories)));
  });
  quick.append(primaryActions, foods);
  container.appendChild(quick);

  const entries = document.createElement('section');
  entries.className = 'card entries-card';
  entries.innerHTML = `<div class="card-heading"><div><h2>Entries</h2><p>${dateUtils.formatDisplay(state.selectedDate)}</p></div></div>`;
  const list = document.createElement('div');
  list.className = 'entries-list';
  if (!state.entries.length) {
    list.innerHTML = '<p class="empty-state">No entries for this day.</p>';
  }
  state.entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'entry-row';
    const identity = document.createElement('div');
    identity.className = 'entry-identity';
    const label = document.createElement('strong');
    label.textContent = entry.name || 'Unnamed entry (imported)';
    const type = document.createElement('span');
    type.className = entry.calories < 0 ? 'entry-burn' : 'entry-food';
    type.textContent = entry.calories < 0 ? 'Burn' : 'Food';
    identity.append(label, type);
    const amount = document.createElement('span');
    amount.className = 'entry-amount';
    amount.textContent = `${entry.calories > 0 ? '+' : ''}${entry.calories}`;
    if (entry._pending) amount.textContent += '  ⟳';
    row.append(identity, amount, button('Delete', 'btn-text-danger', () => api.deleteEntry(entry.id)));
    list.appendChild(row);
  });
  entries.appendChild(list);
  container.appendChild(entries);
  return container;
}
