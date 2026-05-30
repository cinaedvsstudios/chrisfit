import { state } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate } from './navigation.js';

const openMonths = new Set();
const openWeeks = new Set();
const openDays = new Set();
let defaultsApplied = false;
let weightEditMode = false;

function toggle(set, key) {
  set.has(key) ? set.delete(key) : set.add(key);
  navigate('history');
}

function entriesByMonth(entries) {
  const result = {};
  entries.forEach(entry => {
    const month = dateUtils.getMonthKey(entry.date);
    const week = dateUtils.getWeekStart(entry.date);
    result[month] ||= {};
    result[month][week] ||= [];
    result[month][week].push(entry);
  });
  return result;
}

function summaryRows(stats, weekly = false) {
  const rows = document.createElement('div');
  rows.className = 'history-summary';
  const values = [
    ['Total Food', stats.intake, weekly ? stats.weeklyFoodTarget : undefined],
    ['Total Burn', stats.burn, undefined],
    ['Total Deficit', stats.net, weekly ? `-${stats.weeklyDeficitTarget}` : undefined]
  ];
  values.forEach(([label, value, target]) => {
    const row = document.createElement('div');
    row.innerHTML = `<span>${label}</span><strong>${target === undefined ? value : `${value} / ${target}`}</strong>`;
    rows.appendChild(row);
  });
  if (weekly) {
    const estimate = document.createElement('p');
    estimate.className = 'weight-estimate';
    estimate.textContent = calc.estimateWeightText(stats.net);
    rows.appendChild(estimate);
  }
  return rows;
}

export function renderHistory() {
  const container = document.createElement('main');
  container.className = 'screen history active page';

  const header = document.createElement('section');
  header.className = 'card section-header';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn-outline';
  back.textContent = '← Back';
  back.addEventListener('click', () => navigate('main'));
  const heading = document.createElement('div');
  heading.innerHTML = '<h1>History</h1><p class="subtle-label">Food, burn and weight over time</p>';
  header.append(back, heading);
  container.appendChild(header);

  const allEntries = state.entriesFull || [];
  const grouped = entriesByMonth(allEntries);
  const todayMonth = dateUtils.getMonthKey(dateUtils.toIso(new Date()));
  const currentWeek = dateUtils.getWeekStart(new Date());
  const selectedWeek = dateUtils.getWeekStart(state.selectedDate);
  if (!defaultsApplied) {
    openMonths.add(todayMonth);
    openMonths.add(dateUtils.getMonthKey(dateUtils.toIso(state.selectedDate)));
    openWeeks.add(currentWeek);
    openWeeks.add(selectedWeek);
    defaultsApplied = true;
  }

  const foodHistory = document.createElement('section');
  foodHistory.className = 'history-stack';
  if (!Object.keys(grouped).length) {
    foodHistory.innerHTML = '<section class="card"><p class="empty-state">No food or burn history yet.</p></section>';
  }

  Object.keys(grouped).sort().reverse().forEach(month => {
    const monthCard = document.createElement('section');
    monthCard.className = 'card history-month';
    const monthHeader = document.createElement('button');
    monthHeader.type = 'button';
    monthHeader.className = 'history-toggle month-toggle';
    monthHeader.innerHTML = `<strong>${dateUtils.formatMonthHeading(month)}</strong><span>${openMonths.has(month) ? '−' : '+'}</span>`;
    monthHeader.addEventListener('click', () => toggle(openMonths, month));
    monthCard.appendChild(monthHeader);

    if (openMonths.has(month)) {
      Object.keys(grouped[month]).sort().reverse().forEach(week => {
        const weekEntries = grouped[month][week];
        const weekStats = calc.calculateWeek(weekEntries, state.settings);
        const weekWrap = document.createElement('div');
        weekWrap.className = 'week-block';
        const weekHeader = document.createElement('button');
        weekHeader.type = 'button';
        weekHeader.className = 'history-toggle week-toggle';
        weekHeader.innerHTML = `<span>Week ${dateUtils.formatDisplay(week)} – ${dateUtils.formatDisplay(dateUtils.getWeekEnd(week))}</span><strong>${openWeeks.has(week) ? '−' : '+'}</strong>`;
        weekHeader.addEventListener('click', () => toggle(openWeeks, week));
        weekWrap.appendChild(weekHeader);

        if (openWeeks.has(week)) {
          weekWrap.appendChild(summaryRows(weekStats, true));
          const byDay = {};
          weekEntries.forEach(entry => { (byDay[entry.date] ||= []).push(entry); });
          Object.keys(byDay).sort().reverse().forEach(day => {
            const dayKey = `${week}:${day}`;
            const dayStats = calc.calculateDay(byDay[day], state.settings);
            const dayHeader = document.createElement('button');
            dayHeader.type = 'button';
            dayHeader.className = 'history-day-row';
            dayHeader.innerHTML = `<span class="day-label">${dateUtils.formatHistoryLabel(day)}</span><span>Food <strong>${dayStats.intake}</strong></span><span>Burn <strong>${dayStats.burn}</strong></span><span>Deficit <strong>${dayStats.net}</strong></span><b>${openDays.has(dayKey) ? '−' : '+'}</b>`;
            dayHeader.addEventListener('click', () => toggle(openDays, dayKey));
            weekWrap.appendChild(dayHeader);
            if (openDays.has(dayKey)) {
              const items = document.createElement('div');
              items.className = 'history-entries';
              byDay[day].forEach(entry => {
                const row = document.createElement('div');
                row.className = 'history-entry';
                row.innerHTML = `<span>${entry.name || 'Unnamed entry (imported)'}</span><strong>${entry.calories > 0 ? '+' : ''}${entry.calories}</strong>`;
                items.appendChild(row);
              });
              weekWrap.appendChild(items);
            }
          });
        }
        monthCard.appendChild(weekWrap);
      });
    }
    foodHistory.appendChild(monthCard);
  });
  container.appendChild(foodHistory);

  const weights = document.createElement('section');
  weights.className = 'card weight-history';
  const weightHeading = document.createElement('div');
  weightHeading.className = 'card-heading';
  weightHeading.innerHTML = '<div><h2>Weight History</h2><p>Recorded weights and BMI</p></div>';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn-outline compact-button';
  edit.textContent = weightEditMode ? 'Done' : 'Edit';
  edit.addEventListener('click', () => { weightEditMode = !weightEditMode; navigate('history'); });
  weightHeading.appendChild(edit);
  weights.appendChild(weightHeading);
  if (!state.weights.length) weights.innerHTML += '<p class="empty-state">No weights recorded.</p>';
  state.weights.forEach(weight => {
    const row = document.createElement('div');
    row.className = 'weight-row';
    row.innerHTML = `<span>${dateUtils.formatDisplay(weight.date)}</span><strong>${weight.value} kg</strong><span>${calc.calculateBMI(weight.value).toFixed(1)} BMI</span>`;
    if (weightEditMode) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-text-danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => api.deleteWeight(weight.id));
      row.appendChild(remove);
    }
    weights.appendChild(row);
  });
  container.appendChild(weights);
  return container;
}
