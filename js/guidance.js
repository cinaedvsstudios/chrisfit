import { state, notify } from './state.js';
import { CONFIG } from './config.js';
import * as calc from './calculations.js';
import * as dateUtils from './date-utils.js';

const FALLBACK_GUIDANCE = [
  { scope: 'today', condition: 'missing_food', priority: 1, message: 'You need to be more diligent adding your food data.' },
  { scope: 'today', condition: 'missing_burn', priority: 1, message: 'You need to be more diligent adding your burn data.' },
  { scope: 'today', condition: 'missing_both', priority: 1, message: 'You need to be more diligent adding your data.' },
  { scope: 'yesterday', condition: 'missing_food', priority: 1, message: 'Yesterday has no food logged. You need to be more diligent adding your data.' },
  { scope: 'yesterday', condition: 'missing_burn', priority: 1, message: 'Yesterday has no burn logged. You need to be more diligent adding your data.' },
  { scope: 'yesterday', condition: 'missing_both', priority: 1, message: 'Yesterday is missing food and burn. You need to be more diligent adding your data.' },
  { scope: 'today', condition: 'strong_deficit', priority: 5, message: 'Today is strongly on track. Keep it steady and do not turn a good day into random extra food.' },
  { scope: 'today', condition: 'on_track', priority: 10, message: 'Today is on track. The numbers are doing what they need to do.' },
  { scope: 'today', condition: 'behind', priority: 10, message: 'Today is not on target yet. Either food needs to stop here or burn needs to come up.' },
  { scope: 'today', condition: 'surplus', priority: 5, message: 'Today is running too high. Stop the damage now rather than adding more.' },
  { scope: 'today', condition: 'food_high', priority: 20, message: 'Food is high today, so the main thing to control now is extra snacks or another big meal.' },
  { scope: 'today', condition: 'food_slightly_high', priority: 30, message: 'Food is a bit over target today. Keep the rest of the day simple and it is still manageable.' },
  { scope: 'today', condition: 'food_controlled', priority: 40, message: 'Food is under control today. The bigger question is whether burn is high enough.' },
  { scope: 'today', condition: 'burn_strong', priority: 15, message: 'Burn is strong today. You have already cleared the daily movement target.' },
  { scope: 'today', condition: 'burn_low', priority: 15, message: 'Movement is low today. A walk or some extra activity would help balance the day.' },
  { scope: 'today', condition: 'burn_very_low', priority: 5, message: 'Burn is clearly low today, so the deficit will depend mostly on keeping food controlled.' },
  { scope: 'yesterday', condition: 'on_track', priority: 10, message: 'Yesterday finished on target. That is the kind of day that moves the weekly average down.' },
  { scope: 'yesterday', condition: 'behind', priority: 10, message: 'Yesterday was off target. Today needs to be cleaner rather than letting the week slide.' },
  { scope: 'yesterday', condition: 'surplus', priority: 5, message: 'Yesterday was a high day. Treat today as a reset, not as an excuse to keep drifting.' },
  { scope: 'yesterday', condition: 'food_high', priority: 20, message: 'Yesterday’s food was the main issue. Today, the easiest win is controlling intake earlier.' },
  { scope: 'yesterday', condition: 'burn_low', priority: 20, message: 'Yesterday’s burn was low. Today needs more movement if you want the week to recover.' },
  { scope: 'yesterday', condition: 'burn_strong', priority: 20, message: 'Yesterday’s burn was strong. If food stays reasonable, that kind of day helps a lot.' },
  { scope: 'week', condition: 'missing_data', priority: 1, message: 'Some days this week are missing food or burn. You need to be more diligent adding your data.' },
  { scope: 'week', condition: 'well_ahead', priority: 5, message: 'The week is well ahead of target. Good work — the key now is not wasting the lead.' },
  { scope: 'week', condition: 'on_track', priority: 10, message: 'The week is on track. Keep the same pattern and avoid the usual weekend damage.' },
  { scope: 'week', condition: 'behind', priority: 10, message: 'The week is behind target. You do not need panic, but you do need cleaner food or more burn.' },
  { scope: 'week', condition: 'food_high', priority: 20, message: 'Food is the main pressure this week. The best fix is fewer high-calorie extras.' },
  { scope: 'week', condition: 'food_slightly_high', priority: 30, message: 'Food is a bit high for the week. Keep the next few days boring and predictable.' },
  { scope: 'week', condition: 'food_controlled', priority: 40, message: 'Food is under control for the week so far. Keep it steady rather than trying to overcorrect.' },
  { scope: 'week', condition: 'burn_low', priority: 15, message: 'Weekly burn is behind target. More movement is needed if you want the weekly deficit to hold.' },
  { scope: 'week', condition: 'burn_strong', priority: 15, message: 'Weekly burn is strong this week. That gives you more room, but it does not cancel unlimited food.' },
  { scope: 'week', condition: 'weekend_warning', priority: 25, message: 'The week is okay so far, but the weekend can still flip it. Plan food before alcohol or takeaway happens.' }
];

let guidanceRequested = false;

function settings() { return state.settings || {}; }
function normaliseRemoteGuidance(item, index = 0) {
  return {
    id: item.id ?? index + 1,
    active: item.active === false || String(item.active).toLowerCase() === 'false' ? false : true,
    scope: String(item.scope || '').trim().toLowerCase(),
    metric: String(item.metric || '').trim().toLowerCase(),
    condition: String(item.condition || '').trim().toLowerCase(),
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 999,
    message: String(item.message || '').trim()
  };
}
function requestRemoteGuidance() {
  if (guidanceRequested || !CONFIG.baseUrl) return;
  guidanceRequested = true;
  const url = new URL(CONFIG.baseUrl);
  url.searchParams.set('action', 'guidance');
  if (CONFIG.token) url.searchParams.set('token', CONFIG.token);
  fetch(url.toString())
    .then(response => response.ok ? response.json() : [])
    .then(data => {
      if (data && data.success === false) return;
      if (!Array.isArray(data)) return;
      state.guidance = data.map(normaliseRemoteGuidance).filter(item => item.active && item.scope && item.condition && item.message);
      notify();
    })
    .catch(error => console.warn('Guidance sheet could not be loaded; using built-in fallback guidance.', error));
}
function guidanceRows() { return state.guidance?.length ? state.guidance : FALLBACK_GUIDANCE; }
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function entriesForDate(iso) { return state.entriesFull.filter(entry => entry.date === iso); }
function hasFood(entries) { return entries.some(entry => Number(entry.calories) > 0); }
function hasBurn(entries) { return entries.some(entry => Number(entry.calories) < 0); }
function dayConditions(entries) {
  const conditions = [];
  const food = hasFood(entries);
  const burn = hasBurn(entries);
  if (!food && !burn) return ['missing_both'];
  if (!food) return ['missing_food'];
  if (!burn) return ['missing_burn'];

  const totals = calc.calculateDay(entries, settings());
  const foodTarget = Number(settings().dailyCalories ?? 1500);
  const burnTarget = Number(settings().dailyBurnTarget ?? 2500);
  const deficitTarget = Number(settings().dailyDeficit ?? 500);

  if (totals.net > 0) conditions.push('surplus');
  else if (totals.net <= -deficitTarget * 3) conditions.push('strong_deficit');
  else if (totals.net <= -deficitTarget) conditions.push('on_track');
  else conditions.push('behind');

  if (totals.intake >= foodTarget * 1.2) conditions.push('food_high');
  else if (totals.intake > foodTarget) conditions.push('food_slightly_high');
  else conditions.push('food_controlled');

  if (totals.burn >= burnTarget) conditions.push('burn_strong');
  else if (totals.burn < burnTarget * 0.5) conditions.push('burn_very_low');
  else if (totals.burn < burnTarget * 0.8) conditions.push('burn_low');

  return conditions;
}
function weekEntriesFor(selectedIso) {
  const weekStart = dateUtils.getWeekStart(selectedIso);
  return state.entriesFull.filter(entry => dateUtils.getWeekStart(entry.date) === weekStart);
}
function weekConditions(selectedIso) {
  const conditions = [];
  const weekStart = dateUtils.getWeekStart(selectedIso);
  const entries = weekEntriesFor(selectedIso);
  const selected = dateUtils.parseIso(selectedIso);
  let cursor = dateUtils.parseIso(weekStart);
  while (cursor <= selected) {
    const dayEntries = entriesForDate(dateUtils.toIso(cursor));
    if (!hasFood(dayEntries) || !hasBurn(dayEntries)) {
      conditions.push('missing_data');
      break;
    }
    cursor = addDays(cursor, 1);
  }

  const totals = calc.calculateWeek(entries, settings());
  const deficitTarget = Number(totals.weeklyDeficitTarget ?? Number(settings().dailyDeficit ?? 500) * 7);
  if (totals.net <= -deficitTarget * 1.5) conditions.push('well_ahead');
  else if (totals.net <= -deficitTarget) conditions.push('on_track');
  else conditions.push('behind');

  if (totals.intake >= totals.weeklyFoodTarget * 1.05) conditions.push('food_high');
  else if (totals.intake >= totals.weeklyFoodTarget * 0.9) conditions.push('food_slightly_high');
  else conditions.push('food_controlled');

  if (totals.burn >= totals.weeklyBurnTarget) conditions.push('burn_strong');
  else if (totals.burn < totals.weeklyBurnTarget * 0.75) conditions.push('burn_low');

  const day = dateUtils.parseIso(selectedIso).getDay();
  if ([5, 6, 0].includes(day) && !conditions.includes('behind')) conditions.push('weekend_warning');
  return conditions;
}
function pickMessage(scope, conditions) {
  const wanted = new Set(conditions);
  const matches = guidanceRows()
    .filter(row => row.active !== false)
    .filter(row => String(row.scope).toLowerCase() === scope)
    .filter(row => wanted.has(String(row.condition).toLowerCase()))
    .filter(row => String(row.message || '').trim())
    .sort((a, b) => Number(a.priority ?? 999) - Number(b.priority ?? 999));
  return matches[0]?.message || 'No guidance available yet.';
}
function line(label, text) {
  const row = document.createElement('div');
  row.className = 'guidance-line';
  row.innerHTML = `<strong>${label}</strong><span>${text}</span>`;
  return row;
}
function approxWeightText(label, netCalories) {
  const net = Number(netCalories) || 0;
  const kg = Math.abs(net) / 7700;
  const result = net > 0 ? 'gain' : 'loss';
  const cssClass = net > 0 ? 'trend-gain' : 'trend-loss';
  return `<span class="${cssClass}"><strong>${label}</strong> · ${kg.toFixed(2)} kg approx ${result}</span>`;
}
function weightTrendLine(dayTotals, weekTotals) {
  const row = document.createElement('div');
  row.className = 'guidance-trend-line';
  row.innerHTML = `${approxWeightText('Day', dayTotals.net)}${approxWeightText('Week', weekTotals.net)}`;
  return row;
}

export function renderGuidanceCard(selectedDate = state.selectedDate) {
  requestRemoteGuidance();
  const selectedIso = dateUtils.toIso(selectedDate);
  const yesterdayIso = dateUtils.toIso(addDays(selectedDate, -1));
  const selectedEntries = entriesForDate(selectedIso);
  const todayMessage = pickMessage('today', dayConditions(selectedEntries));
  const yesterdayMessage = pickMessage('yesterday', dayConditions(entriesForDate(yesterdayIso)));
  const weekMessage = pickMessage('week', weekConditions(selectedIso));
  const dayTotals = calc.calculateDay(selectedEntries, settings());
  const weekTotals = calc.calculateWeek(weekEntriesFor(selectedIso), settings());

  const card = document.createElement('section');
  card.className = 'card guidance-card';
  card.innerHTML = '<div class="card-heading"><div><h2>Guidance</h2></div></div>';
  const body = document.createElement('div');
  body.className = 'guidance-lines';
  body.append(
    line('Today', todayMessage),
    line('Yesterday', yesterdayMessage),
    line('This week', weekMessage),
    weightTrendLine(dayTotals, weekTotals)
  );
  card.appendChild(body);
  return card;
}
