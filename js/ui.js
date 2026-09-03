import { state, showToast } from './state.js';
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
function metric(icon, label, current, target, delta, achieved = false) {
  const deltaNumber = Math.round(Number(delta) || 0);
  const deltaClass = deltaNumber >= 0 ? 'summary-delta-good' : 'summary-delta-bad';
  const targetText = target === undefined ? '' : ` / ${target}`;
  const deltaText = delta === undefined ? '' : ` / <span class="summary-delta ${deltaClass}">${formatSigned(deltaNumber)}</span>`;
  const row = document.createElement('div'); row.className = `summary-metric ${achieved ? 'on-target' : ''}`;
  row.innerHTML = `<span>${icon} ${label}</span><strong class="summary-values"><span>${current}${targetText}</span>${deltaText}</strong>`; return row;
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
  app.appendChild(active === 'settings' ? renderSettings() : active === 'history' ? renderHistory(enteringHistory) : renderMain());
  lastRenderedScreen = active;
  if (state.sync.message && !['idle','saved'].includes(state.sync.phase)) { const status = document.createElement('div'); status.className = `sync-status sync-${state.sync.phase}`; status.textContent = state.sync.message; app.appendChild(status); }
  if (state.toast) { const toast = document.createElement('div'); toast.className = `toast toast-${state.toast.type}`; toast.textContent = state.toast.message; app.appendChild(toast); }
}
export function renderMain() {
  const container = document.createElement('main'); container.className = 'screen main active page'; addSwipe(container);
  if (api.isDemoMode()) { const demo = document.createElement('div'); demo.className = 'demo-banner'; demo.textContent = 'DEMO MODE — changes are not saved to Google Sheets'; container.appendChild(demo); }

  const hero = document.createElement('section'); hero.className = 'card hero-card compact-hero-card';
  const left = document.createElement('div'); left.className = 'compact-hero-left';
  const title = document.createElement('div'); title.className = 'brand-title'; title.appendChild(logo()); title.insertAdjacentHTML('beforeend', '<div><h1>ChrisFit</h1><div class="version-label">Web · v2.12</div></div>');
  left.append(title, button(e().emojiPrevious, 'date-button compact-nav-button', () => changeDay(-1), 'Previous day'));

  const selectedIso = dateUtils.toIso(state.selectedDate);
  const center = document.createElement('div'); center.className = 'compact-hero-center';
  const dateWrap = document.createElement('div'); dateWrap.className = 'date-picker-wrap';
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

  const right = document.createElement('div'); right.className = 'compact-hero-right';
  right.append(button(`${e().emojiSettings} Settings`, 'btn-outline compact-button', () => navigate('settings')), button(e().emojiNext, 'date-button compact-nav-button', () => changeDay(1), 'Next day'));
  hero.append(left, center, right); container.appendChild(hero);

  const day = calc.calculateDay(state.entries, e());
  const weekEntries = state.entriesFull.filter(entry => dateUtils.getWeekStart(entry.date) === dateUtils.getWeekStart(selectedIso));
  const week = calc.calculateWeek(weekEntries, e());
  const dailyFoodDelta = foodDelta(day.intake, e().dailyCalories);
  const dailyBurnDelta = burnDelta(day.burn, e().dailyBurnTarget);
  const dailyDeficitDelta = deficitDelta(day.net, e().dailyDeficit);
  const weeklyFoodDelta = foodDelta(week.intake, week.weeklyFoodTarget);
  const weeklyBurnDelta = burnDelta(week.burn, week.weeklyBurnTarget);
  const weeklyDeficitDelta = deficitDelta(week.net, week.weeklyDeficitTarget);
  const daily = document.createElement('article'); daily.className = 'card summary-card'; daily.innerHTML = '<h2>Daily Summary</h2>';
  daily.append(metric(e().emojiFood, 'Food', day.intake, e().dailyCalories, dailyFoodDelta), metric(e().emojiBurn, 'Burn', day.burn, e().dailyBurnTarget, dailyBurnDelta), metric(e().emojiDeficit, 'Deficit', day.net, `-${e().dailyDeficit}`, dailyDeficitDelta, day.achieved));
  const weekly = document.createElement('article'); weekly.className = 'card summary-card'; weekly.innerHTML = '<h2>Weekly Summary</h2>';
  weekly.append(metric(e().emojiFood, 'Food', week.intake, week.weeklyFoodTarget, weeklyFoodDelta), metric(e().emojiBurn, 'Burn', week.burn, week.weeklyBurnTarget, weeklyBurnDelta), metric(e().emojiDeficit, 'Deficit', week.net, `-${week.weeklyDeficitTarget}`, weeklyDeficitDelta, week.achieved));
  const selectedWeight = calc.getWeightForDate(state.weights, selectedIso);
  const weight = document.createElement('article'); weight.className = 'card summary-card weight-summary';
  if (selectedWeight) {
    const carriedForward = selectedWeight.date !== selectedIso;
    const recordedLabel = carriedForward
      ? `Last recorded ${dateUtils.formatDisplay(selectedWeight.date)}`
      : `Recorded ${dateUtils.formatDisplay(selectedWeight.date)}`;
    weight.innerHTML = `<h2>${e().emojiWeight} Weight</h2><div class="weight-value">${selectedWeight.value} kg</div><p class="subtle-label">${calc.calculateBMI(selectedWeight.value).toFixed(1)} BMI<br>${recordedLabel}</p>`;
  } else {
    weight.innerHTML = `<h2>${e().emojiWeight} Weight</h2><div class="weight-value">— kg</div><p class="subtle-label">No weight recorded on or before ${dateUtils.formatDisplay(state.selectedDate)}</p>`;
  }
  const weightActions = document.createElement('div'); weightActions.className = 'inline-actions'; weightActions.append(button(`${e().emojiWeight} Add`, 'btn-green', () => showWeightDialog()));
  if (selectedWeight) weightActions.append(button(`${e().emojiEdit} Edit`, 'btn-outline', () => showWeightDialog(selectedWeight), `Edit weight recorded ${dateUtils.formatDisplay(selectedWeight.date)}`));
  weight.appendChild(weightActions);
  const overview = document.createElement('section'); overview.className = 'overview-grid'; overview.append(daily, weekly, weight); container.appendChild(overview);
  container.appendChild(renderGuidanceCard(state.selectedDate));

  const quick = document.createElement('section'); quick.className = 'card';
  quick.innerHTML = `<div class="card-heading"><div><h2>Quick Add</h2><p>Tap saved items repeatedly to log multiple units.</p></div></div>`;
  const actions = document.createElement('div'); actions.className = 'primary-actions';
  actions.append(button(`${e().emojiFood} Add Food`, 'btn-blue', () => showEntryDialog('food')), button(`${e().emojiBurn} Add Burn`, 'btn-red', () => showEntryDialog('burn')), button(`${e().emojiBmr} BMR`, 'btn-green', () => api.addEntry(state.selectedDate, 'BMR', -Math.abs(e().bmr))), button(`${e().emojiHistory} History`, 'btn-outline', () => navigate('history')));
  const foods = document.createElement('div'); foods.className = 'food-grid';
  const activeFoods = state.foods.filter(food => food.active);
  if (!activeFoods.length) foods.innerHTML = '<p class="empty-state">No visible saved food buttons. Manage them in Settings.</p>';
  activeFoods.forEach(food => foods.append(button(`${food.emoji || e().emojiFood} ${food.name} · ${food.calories}`, 'saved-food-button', () => api.addEntry(state.selectedDate, food.name, food.calories))));
  quick.append(actions, foods); container.appendChild(quick);

  const entries = document.createElement('section'); entries.className = 'card entries-card'; entries.innerHTML = `<div class="card-heading"><div><h2>Entries</h2><p>${dateUtils.formatDisplay(state.selectedDate)}</p></div></div>`;
  const list = document.createElement('div'); list.className = 'entries-list';
  if (!state.entries.length) list.innerHTML = '<p class="empty-state">No entries for this day.</p>';
  state.entries.forEach(entry => {
    const row = document.createElement('div'); row.className = 'entry-row';
    const foodMatch = state.foods.find(food => food.name === entry.name) || state.library.find(food => food.name === entry.name);
    const entryIcon = Number(entry.calories) < 0 ? e().emojiBurn : (foodMatch?.emoji || e().emojiFood);
    const identity = document.createElement('div'); identity.className = 'entry-identity'; identity.innerHTML = `<strong>${entryIcon} ${entry.name || 'Unnamed entry (imported)'}</strong><span class="${Number(entry.calories) < 0 ? 'entry-burn' : 'entry-food'}">${Number(entry.calories) < 0 ? 'Burn' : 'Food'}${entry._pending ? ' · syncing' : ''}</span>`;
    const amount = document.createElement('span'); amount.className = 'entry-amount'; amount.textContent = `${Number(entry.calories) > 0 ? '+' : ''}${entry.calories}`;
    const rowActions = document.createElement('div'); rowActions.className = 'entry-actions';
    rowActions.append(button(e().emojiEdit, 'icon-button', () => showEntryDialog(Number(entry.calories) < 0 ? 'burn' : 'food', entry), 'Edit entry'), button(e().emojiDelete, 'icon-button danger', () => api.deleteEntry(entry.id), 'Delete entry'));
    row.append(identity, amount, rowActions); list.appendChild(row);
  });
  entries.appendChild(list); container.appendChild(entries);

  const copy = document.createElement('section');
  copy.className = 'copy-today-card';
  copy.appendChild(button('📋 Copy Today', 'btn-purple copy-today-button', () => copyToday(day, week), 'Copy today and weekly summary to clipboard'));
  container.appendChild(copy);
  return container;
}
