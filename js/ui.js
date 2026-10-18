import { state, showToast } from './state.js';
import { APP_VERSION } from './config.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate, getActiveScreen } from './navigation.js';
import { showEntryDialog, showWeightDialog } from './dialogs.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { renderGuidanceCard } from './guidance.js';

function e() { return state.settings; }
function button(text, className, handler, title = '') {
  const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = text; el.title = title; el.addEventListener('click', handler); return el;
}
function changeDay(offset) { const date = new Date(state.selectedDate); date.setDate(date.getDate() + offset); state.selectedDate = date; api.fetchEntriesByDate(date); }
function chooseDate(input) {
  if (!input) return;
  input.value = dateUtils.toIso(state.selectedDate);
  if (typeof input.showPicker === 'function') {
    try { input.showPicker(); return; } catch (_) {}
  }
  input.focus();
  input.click();
}
function applyPickedDate(value) {
  if (!value) return;
  const date = dateUtils.parseIso(value);
  if (!date) return;
  state.selectedDate = date;
  api.fetchEntriesByDate(date);
}
function formatSigned(value) {
  const number = Math.round(Number(value) || 0);
  return `${number > 0 ? '+' : ''}${number}`;
}
function foodDelta(intake, target) { return Number(target || 0) - Number(intake || 0); }
function burnDelta(burn, target) { return Number(burn || 0) - Number(target || 0); }
function deficitDelta(net, targetDeficit) { return -Math.abs(Number(targetDeficit || 0)) - Number(net || 0); }
function compactSummaryMetric(icon, label, actual, target, difference) {
  const col = document.createElement('div');
  col.className = 'summary-matrix-metric';
  col.setAttribute('role', 'group');
  col.setAttribute('aria-label', label);
  const heading = document.createElement('span');
  heading.className = 'summary-matrix-metric-label';
  heading.textContent = icon;
  heading.title = label;
  const actualValue = document.createElement('span');
  actualValue.className = 'summary-matrix-number summary-matrix-actual';
  actualValue.textContent = String(actual);
  actualValue.title = `${label} actual: ${actual}`;
  const targetValue = document.createElement('span');
  targetValue.className = 'summary-matrix-number summary-matrix-target';
  targetValue.textContent = String(target);
  targetValue.title = `${label} target: ${target}`;
  const differenceValue = document.createElement('span');
  differenceValue.className = `summary-matrix-number summary-matrix-difference ${Number(difference) >= 0 ? 'summary-delta-good' : 'summary-delta-bad'}`;
  differenceValue.textContent = formatSigned(difference);
  differenceValue.title = `${label} difference: ${formatSigned(difference)}`;
  col.append(heading, actualValue, targetValue, differenceValue);
  return col;
}
function compactSummaryGroup(title, metrics, isWeekly = false) {
  const group = document.createElement('div');
  group.className = `summary-matrix-group ${isWeekly ? 'summary-matrix-weekly' : 'summary-matrix-daily'}`;
  const heading = document.createElement('h2');
  heading.textContent = title;
  const cols = document.createElement('div');
  cols.className = 'summary-matrix-columns';
  metrics.forEach(metricValues => cols.append(compactSummaryMetric(...metricValues)));
  group.append(heading, cols);
  return group;
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
function trendText(netCalories) {
  const net = Number(netCalories) || 0;
  if (net === 0) return '0.00 kg approx neutral';
  const kg = Math.abs(net) / 7700;
  return `${kg.toFixed(2)} kg approx ${net < 0 ? 'loss' : 'gain'}`;
}
function entryLine(entry) {
  const value = Number(entry.calories) || 0;
  return `- ${entry.name || 'Unnamed entry (imported)'}: ${value}`;
}
function buildCopyTodayText(day, week) {
  const foodEntries = state.entries.filter(entry => Number(entry.calories) > 0);
  const burnEntries = state.entries.filter(entry => Number(entry.calories) < 0);
  const settings = e();
  const dayFoodDelta = foodDelta(day.intake, settings.dailyCalories);
  const dayBurnDelta = burnDelta(day.burn, settings.dailyBurnTarget);
  const dayDeficitDelta = deficitDelta(day.net, settings.dailyDeficit);
  const weekFoodDelta = foodDelta(week.intake, week.weeklyFoodTarget);
  const weekBurnDelta = burnDelta(week.burn, week.weeklyBurnTarget);
  const weekDeficitDelta = deficitDelta(week.net, week.weeklyDeficitTarget);
  const lines = [
    `ChrisFit — ${dateUtils.getDayName(state.selectedDate)} ${dateUtils.formatDisplay(state.selectedDate)}`,
    '',
    'DAILY SUMMARY',
    `Food: ${day.intake} / ${settings.dailyCalories} / ${formatSigned(dayFoodDelta)}`,
    `Burn: ${day.burn} / ${settings.dailyBurnTarget} / ${formatSigned(dayBurnDelta)}`,
    `Deficit: ${day.net} / -${settings.dailyDeficit} / ${formatSigned(dayDeficitDelta)}`,
    `Day · ${trendText(day.net)}`,
    '',
    'WEEKLY SUMMARY',
    `Food: ${week.intake} / ${week.weeklyFoodTarget} / ${formatSigned(weekFoodDelta)}`,
    `Burn: ${week.burn} / ${week.weeklyBurnTarget} / ${formatSigned(weekBurnDelta)}`,
    `Deficit: ${week.net} / -${week.weeklyDeficitTarget} / ${formatSigned(weekDeficitDelta)}`,
    `Week · ${trendText(week.net)}`,
    '',
    'FOOD ENTRIES',
    ...(foodEntries.length ? foodEntries.map(entryLine) : ['- None logged']),
    '',
    'BURN ENTRIES',
    ...(burnEntries.length ? burnEntries.map(entryLine) : ['- None logged'])
  ];
  return lines.join('\n');
}
// Shared by Quick Add and the compact header: both must open the same food dialog.
function openAddFoodDialog() {
  showEntryDialog('food');
  api.ensureLibrary().then(() => {
    const search = document.querySelector('.modal input[type="search"]');
    if (search) search.dispatchEvent(new Event('input'));
  });
}
function showManualCopyBox(text) {
  const overlay = document.createElement('div');
  overlay.className = 'copy-fallback-overlay';
  const card = document.createElement('section');
  card.className = 'copy-fallback-card';
  const heading = document.createElement('div');
  heading.className = 'card-heading';
  heading.innerHTML = '<div><h2>Copy Today</h2><p>Clipboard access was blocked. Copy this manually.</p></div>';
  const close = button('Close', 'btn-outline small-button', () => overlay.remove());
  heading.appendChild(close);
  const textarea = document.createElement('textarea');
  textarea.className = 'copy-fallback-textarea';
  textarea.value = text;
  card.append(heading, textarea);
  overlay.appendChild(card);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  textarea.focus();
  textarea.select();
}
async function copyToday(day, week) {
  const text = buildCopyTodayText(day, week);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      if (!ok) throw new Error('Copy command failed');
    }
    showToast('Copied today to clipboard', 'success');
  } catch (error) {
    showManualCopyBox(text);
    showToast('Clipboard blocked — copy manually', 'error', 4000);
  }
}
let lastRenderedScreen = null;

export function render() {
  const app = document.getElementById('app'); if (!app) return; app.innerHTML = '';
  const active = getActiveScreen();
  const enteringHistory = active === 'history' && lastRenderedScreen !== 'history';
  const enteringSettings = active === 'settings' && lastRenderedScreen !== 'settings';
  app.appendChild(active === 'settings' ? renderSettings() : active === 'history' ? renderHistory(enteringHistory) : renderMain());
  lastRenderedScreen = active;
  if (enteringSettings) queueMicrotask(() => api.ensureLibrary());
  if (state.sync.message && !['idle','saved'].includes(state.sync.phase)) { const status = document.createElement('div'); status.className = `sync-status sync-${state.sync.phase}`; status.textContent = state.sync.message; app.appendChild(status); }
  if (state.toast) { const toast = document.createElement('div'); toast.className = `toast toast-${state.toast.type}`; toast.textContent = state.toast.message; app.appendChild(toast); }
}
export function renderMain() {
  const container = document.createElement('main'); container.className = 'screen main active page'; addSwipe(container);
  if (api.isDemoMode()) { const demo = document.createElement('div'); demo.className = 'demo-banner'; demo.textContent = 'DEMO MODE — changes are not saved to Google Sheets'; container.appendChild(demo); }

  const selectedIso = dateUtils.toIso(state.selectedDate);
  const day = calc.calculateDay(state.entries, e());
  const weekEntries = state.entriesFull.filter(entry => dateUtils.getWeekStart(entry.date) === dateUtils.getWeekStart(selectedIso));
  const week = calc.calculateWeek(weekEntries, e());
  const dailyFoodDelta = foodDelta(day.intake, e().dailyCalories);
  const dailyBurnDelta = burnDelta(day.burn, e().dailyBurnTarget);
  const dailyDeficitDelta = deficitDelta(day.net, e().dailyDeficit);
  const weeklyFoodDelta = foodDelta(week.intake, week.weeklyFoodTarget);
  const weeklyBurnDelta = burnDelta(week.burn, week.weeklyBurnTarget);
  const weeklyDeficitDelta = deficitDelta(week.net, week.weeklyDeficitTarget);

  const hero = document.createElement('section');
  hero.className = 'card hero-card compact-hero-card';
  const heroColumns = document.createElement('div');
  heroColumns.className = 'hero-three-column-layout';

  // Left column: logo/name above Previous Day.
  const leftColumn = document.createElement('div');
  leftColumn.className = 'hero-column hero-column-left';
  const title = document.createElement('div');
  title.className = 'brand-title hero-brand';
  title.appendChild(logo());
  title.insertAdjacentHTML('beforeend', '<div class="hero-brand-copy"><h1>ChrisFit</h1><div class="version-label"></div></div>');
  title.querySelector('.version-label').textContent = APP_VERSION;
  const previous = button(e().emojiPrevious, 'date-button compact-nav-button', () => changeDay(-1), 'Previous day');
  previous.setAttribute('aria-label', 'Previous day');
  leftColumn.append(title, previous);

  // Centre column: selected date above Add, Copy and Save.
  const middleColumn = document.createElement('div');
  middleColumn.className = 'hero-column hero-column-middle';
  const center = document.createElement('div');
  center.className = 'compact-hero-center';
  const dateWrap = document.createElement('div');
  dateWrap.className = 'date-picker-wrap';
  const selected = button('', 'selected-date compact-selected-date', () => chooseDate(dateInput), 'Select date');
  selected.innerHTML = `<strong>${dateUtils.getDayName(state.selectedDate)}</strong><span>${dateUtils.formatDisplay(state.selectedDate)}</span>`;
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'native-date-picker';
  dateInput.value = selectedIso;
  dateInput.setAttribute('aria-label', 'Select date');
  dateInput.addEventListener('change', () => applyPickedDate(dateInput.value));
  dateWrap.append(selected, dateInput);
  center.appendChild(dateWrap);
  const middleActions = document.createElement('div');
  middleActions.className = 'hero-middle-actions';
  const addFoodButton = button(`${e().emojiFood} Add`, 'btn-blue hero-add-food-button', openAddFoodDialog, 'Add food to the selected day');
  const copyButton = button('📋 Copy', 'btn-purple hero-copy-button', () => copyToday(day, week), 'Copy today and weekly summary to clipboard');
  const saveButton = button('💾 Save', 'btn-green hero-save-button', () => api.saveNow(), 'Force-save queued local changes now');
  addFoodButton.setAttribute('aria-label', 'Add Food');
  copyButton.setAttribute('aria-label', 'Copy Today');
  saveButton.setAttribute('aria-label', 'Save Now');
  middleActions.append(addFoodButton, copyButton, saveButton);
  middleColumn.append(center, middleActions);

  // Right column: Reconnect and Settings above Next Day.
  const rightColumn = document.createElement('div');
  rightColumn.className = 'hero-column hero-column-right';
  const topActions = document.createElement('div');
  topActions.className = 'hero-top-actions';
  const reconnect = button('🔄', 'btn-outline reconnect-button hero-top-action', () => api.reconnect(), 'Reconnect to Google and retry pending changes');
  reconnect.setAttribute('aria-label', 'Reconnect');
  const settingsButton = button(e().emojiSettings, 'btn-outline hero-top-action', () => navigate('settings'), 'Settings');
  settingsButton.setAttribute('aria-label', 'Settings');
  topActions.append(reconnect, settingsButton);
  const next = button(e().emojiNext, 'date-button compact-nav-button', () => changeDay(1), 'Next day');
  next.setAttribute('aria-label', 'Next day');
  rightColumn.append(topActions, next);

  heroColumns.append(leftColumn, middleColumn, rightColumn);
  hero.appendChild(heroColumns);
  container.appendChild(hero);

  const overview = document.createElement('section');
  overview.className = 'overview-compact';
  const summary = document.createElement('article');
  summary.className = 'card summary-matrix-card';
  summary.setAttribute('aria-label', 'Daily and weekly summaries');
  const matrix = document.createElement('div');
  matrix.className = 'summary-matrix';
  const legend = document.createElement('div');
  legend.className = 'summary-matrix-legend';
  const legendSpacers = ['',''];
  legendSpacers.forEach(() => {
    const spacer = document.createElement('span');
    spacer.setAttribute('aria-hidden', 'true');
    legend.appendChild(spacer);
  });
  [['🧾', 'Actual'], ['🎯', 'Target'], ['↕️', 'Difference']].forEach(([icon, label]) => {
    const marker = document.createElement('span');
    marker.className = 'summary-matrix-row-label';
    marker.textContent = icon;
    marker.title = label;
    marker.setAttribute('aria-label', label);
    legend.appendChild(marker);
  });
  matrix.append(
    legend,
    compactSummaryGroup('Daily', [
      [e().emojiFood, 'Food', day.intake, e().dailyCalories, dailyFoodDelta],
      [e().emojiBurn, 'Burn', day.burn, e().dailyBurnTarget, dailyBurnDelta],
      [e().emojiDeficit, 'Deficit', day.net, `-${e().dailyDeficit}`, dailyDeficitDelta]
    ]),
    compactSummaryGroup('Weekly', [
      [e().emojiFood, 'Food', week.intake, week.weeklyFoodTarget, weeklyFoodDelta],
      [e().emojiBurn, 'Burn', week.burn, week.weeklyBurnTarget, weeklyBurnDelta],
      [e().emojiDeficit, 'Deficit', week.net, `-${week.weeklyDeficitTarget}`, weeklyDeficitDelta]
    ], true)
  );
  summary.appendChild(matrix);
  overview.appendChild(summary);
  const selectedWeight = calc.getWeightForDate(state.weights, selectedIso);
  const weight = document.createElement('article');
  weight.className = 'card summary-card weight-summary weight-summary-compact';
  const weightDetails = document.createElement('div');
  weightDetails.className = 'weight-compact-details';
  if (selectedWeight) {
    const carriedForward = selectedWeight.date !== selectedIso;
    const recordedLabel = carriedForward
      ? `Last recorded ${dateUtils.formatDisplay(selectedWeight.date)}`
      : `Recorded ${dateUtils.formatDisplay(selectedWeight.date)}`;
    weightDetails.innerHTML = `<h2>${e().emojiWeight} Weight</h2><div class="weight-value">${selectedWeight.value} kg</div><p class="subtle-label">${calc.calculateBMI(selectedWeight.value).toFixed(1)} BMI<br>${recordedLabel}</p>`;
  } else {
    weightDetails.innerHTML = `<h2>${e().emojiWeight} Weight</h2><div class="weight-value">— kg</div><p class="subtle-label">No weight recorded on or before ${dateUtils.formatDisplay(state.selectedDate)}</p>`;
  }
  const weightActions = document.createElement('div');
  weightActions.className = 'inline-actions weight-compact-actions';
  weightActions.append(button(`${e().emojiWeight} Add`, 'btn-green', () => showWeightDialog()));
  if (selectedWeight) {
    weightActions.append(button(`${e().emojiEdit} Edit`, 'btn-outline', () => showWeightDialog(selectedWeight), `Edit weight recorded ${dateUtils.formatDisplay(selectedWeight.date)}`));
  }
  weight.append(weightDetails, weightActions);
  overview.appendChild(weight);
  container.appendChild(overview);
  container.appendChild(renderGuidanceCard(state.selectedDate));

  const quick = document.createElement('section'); quick.className = 'card';
  quick.innerHTML = `<div class="card-heading"><div><h2>Quick Add</h2><p>Tap saved items repeatedly to log multiple units.</p></div></div>`;
  const actions = document.createElement('div'); actions.className = 'primary-actions';
  actions.append(button(`${e().emojiFood} Add Food`, 'btn-blue', openAddFoodDialog), button(`${e().emojiBurn} Add Burn`, 'btn-red', () => showEntryDialog('burn')), button(`${e().emojiBmr} BMR`, 'btn-green', () => api.addEntry(state.selectedDate, 'BMR', -Math.abs(e().bmr))), button(`${e().emojiHistory} History`, 'btn-outline', () => navigate('history')));
  const foods = document.createElement('div'); foods.className = 'food-grid';
  const activeFoods = state.foods.filter(food => food.active);
  if (!activeFoods.length) foods.innerHTML = '<p class="empty-state">No visible saved food buttons. Manage them in Settings.</p>';
  activeFoods.forEach(food => foods.append(button(`${food.emoji || e().emojiFood} ${food.name} · ${food.calories}`, 'saved-food-button', () => api.addEntry(state.selectedDate, food.name, food.calories))));
  quick.append(actions, foods); container.appendChild(quick);

  const entries = document.createElement('section'); entries.className = 'card entries-card'; entries.innerHTML = `<div class="card-heading"><div><h2>Entries</h2><p>${dateUtils.formatDisplay(state.selectedDate)}</p></div></div>`;
  const list = document.createElement('div'); list.className = 'entries-list';
  if (!state.entries.length) list.innerHTML = '<p class="empty-state">No entries for this day.</p>';
  state.entries.forEach(entry => {
    const row = document.createElement('div'); row.className = `entry-row ${entry._pending ? 'entry-pending' : ''}`;
    const foodMatch = state.foods.find(food => food.name === entry.name) || state.library.find(food => food.name === entry.name);
    const entryIcon = Number(entry.calories) < 0 ? e().emojiBurn : (foodMatch?.emoji || e().emojiFood);
    const identity = document.createElement('div'); identity.className = 'entry-identity'; identity.innerHTML = `<strong>${entryIcon} ${entry.name || 'Unnamed entry (imported)'}</strong><span class="${Number(entry.calories) < 0 ? 'entry-burn' : 'entry-food'}">${Number(entry.calories) < 0 ? 'Burn' : 'Food'}${entry._pending ? ' · syncing' : ''}</span>`;
    const amount = document.createElement('span'); amount.className = 'entry-amount'; amount.textContent = `${Number(entry.calories) > 0 ? '+' : ''}${entry.calories}`;
    const rowActions = document.createElement('div'); rowActions.className = 'entry-actions';
    rowActions.append(button(e().emojiEdit, 'icon-button', () => showEntryDialog(Number(entry.calories) < 0 ? 'burn' : 'food', entry), 'Edit entry'), button(e().emojiDelete, 'icon-button danger', () => api.deleteEntry(entry.id), 'Delete entry'));
    row.append(identity, amount, rowActions); list.appendChild(row);
  });
  entries.appendChild(list); container.appendChild(entries);

  // Daily-only fixed totals strip: kept in this screen's DOM so it vanishes
  // automatically when navigating to Settings or History.
  // Reuse the same calculated daily numbers shown in the top summary.
  const totals = document.createElement('section');
  totals.className = 'card entry-totals-card';
  totals.setAttribute('aria-label', 'Totals for selected day');
  const totalMetrics = [
    [e().emojiFood, 'Total Food', day.intake],
    [e().emojiBurn, 'Total Burn', day.burn],
    [e().emojiDeficit, 'Deficit', day.net]
  ];
  totalMetrics.forEach(([emoji, label, value]) => {
    const item = document.createElement('div');
    item.className = 'entry-totals-item';
    const name = document.createElement('span');
    name.className = 'entry-totals-label';
    name.textContent = `${emoji} ${label}`;
    const amount = document.createElement('strong');
    amount.className = 'entry-totals-value';
    amount.textContent = String(value);
    item.append(name, amount);
    totals.appendChild(item);
  });
  container.appendChild(totals);

  return container;
}
