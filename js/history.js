import { state } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate } from './navigation.js';
import { showEntryDialog, showWeightDialog } from './dialogs.js';

const openMonths = new Set();
const openWeeks = new Set();
const openDays = new Set();
const openWeightMonths = new Set();
let lastAutoExpandedWeek = null;
let lastAutoExpandedWeightMonth = null;

function i() { return state.settings; }

function button(text, cls, fn, title = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', fn);
  return b;
}

function toggle(set, key) {
  set.has(key) ? set.delete(key) : set.add(key);
  navigate('history');
}

function group(entries) {
  const output = {};
  entries.forEach(entry => {
    const month = dateUtils.getMonthKey(entry.date);
    const week = dateUtils.getWeekStart(entry.date);
    output[month] ||= {};
    output[month][week] ||= [];
    output[month][week].push(entry);
  });
  return output;
}

function totalSummary(stats) {
  const box = document.createElement('div');
  box.className = 'history-summary history-total-summary';
  const heading = document.createElement('h3');
  heading.className = 'history-summary-title';
  heading.textContent = 'Week Total';
  box.appendChild(heading);

  [
    [i().emojiFood, 'Total Food', stats.intake, stats.weeklyFoodTarget],
    [i().emojiBurn, 'Total Burn', stats.burn, stats.weeklyBurnTarget],
    [i().emojiDeficit, 'Total Deficit', stats.net, `-${stats.weeklyDeficitTarget}`]
  ].forEach(([icon, label, value, target]) => {
    const row = document.createElement('div');
    row.innerHTML = `<span>${icon} ${label}</span><strong>${value} / ${target}</strong>`;
    box.appendChild(row);
  });

  const estimate = document.createElement('p');
  estimate.className = 'weight-estimate';
  estimate.textContent = calc.estimateWeightText(stats.net);
  box.appendChild(estimate);
  return box;
}

function dailyAverageSummary(stats, entries) {
  const box = document.createElement('div');
  box.className = 'history-summary history-average-summary';
  const recordedDays = Math.max(1, new Set(entries.map(entry => entry.date)).size);
  const averageFood = Math.round(stats.intake / recordedDays);
  const averageBurn = Math.round(stats.burn / recordedDays);
  const averageDeficit = Math.round(stats.net / recordedDays);
  const dailyTarget = -Math.abs(Number(i().dailyDeficit ?? 500));
  const againstTarget = averageDeficit - dailyTarget;
  const targetText = againstTarget === 0
    ? 'On target'
    : `${Math.abs(againstTarget)} ${againstTarget < 0 ? 'under' : 'over'}`;
  const deficitClass = averageDeficit < 0 ? 'outcome-loss' : averageDeficit > 0 ? 'outcome-gain' : 'outcome-neutral';
  const targetClass = againstTarget <= 0 ? 'outcome-loss' : 'outcome-gain';

  const heading = document.createElement('h3');
  heading.className = 'history-summary-title';
  heading.textContent = `Daily Average · ${recordedDays} logged ${recordedDays === 1 ? 'day' : 'days'}`;
  box.appendChild(heading);

  [
    [i().emojiFood, 'Food', averageFood, ''],
    [i().emojiBurn, 'Burn', averageBurn, ''],
    [i().emojiDeficit, 'Deficit', averageDeficit, deficitClass],
    ['🎯', 'Vs Target', targetText, targetClass]
  ].forEach(([icon, label, value, resultClass]) => {
    const row = document.createElement('div');
    const valueClass = resultClass ? ` class="${resultClass}"` : '';
    row.innerHTML = `<span>${icon} ${label}</span><strong${valueClass}>${value}</strong>`;
    box.appendChild(row);
  });

  return box;
}

function weekSummary(stats, entries) {
  const grid = document.createElement('div');
  grid.className = 'week-summary-grid';
  grid.append(totalSummary(stats), dailyAverageSummary(stats, entries));
  return grid;
}

export function renderHistory(autoExpandSelectedWeek = false) {
  const container = document.createElement('main');
  container.className = 'screen history active page';

  const header = document.createElement('section');
  header.className = 'card section-header';
  header.append(button(`${i().emojiPrevious} Back`, 'btn-outline', () => navigate('main')));
  const title = document.createElement('div');
  title.innerHTML = `<h1>${i().emojiHistory} History</h1><p class="subtle-label">Food, burn and weight over time</p>`;
  header.appendChild(title);
  container.appendChild(header);

  const grouped = group(state.entriesFull);
  const selected = dateUtils.toIso(state.selectedDate);
  const selectedMonth = dateUtils.getMonthKey(selected);
  const selectedWeek = dateUtils.getWeekStart(selected);

  // Open the week matching the date the user was viewing when History is entered.
  // Once open, the user can still collapse it without the render immediately reopening it.
  if (autoExpandSelectedWeek || selectedWeek !== lastAutoExpandedWeek) {
    openMonths.add(selectedMonth);
    openWeeks.add(selectedWeek);
    lastAutoExpandedWeek = selectedWeek;
  }

  const stack = document.createElement('section');
  stack.className = 'history-stack';
  if (!Object.keys(grouped).length) {
    stack.innerHTML = '<section class="card"><p class="empty-state">No food or burn history yet.</p></section>';
  }

  Object.keys(grouped).sort().reverse().forEach(month => {
    const card = document.createElement('section');
    card.className = 'card history-month';
    const mh = button('', 'history-toggle month-toggle', () => toggle(openMonths, month));
    mh.innerHTML = `<strong>${dateUtils.formatMonthHeading(month)}</strong><span>${openMonths.has(month) ? '−' : '+'}</span>`;
    card.appendChild(mh);

    if (openMonths.has(month)) {
      Object.keys(grouped[month]).sort().reverse().forEach(week => {
        const entries = grouped[month][week];
        const stats = calc.calculateWeek(entries, i());
        const wrap = document.createElement('div');
        wrap.className = 'week-block';
        const wh = button('', 'history-toggle week-toggle', () => toggle(openWeeks, week));
        wh.innerHTML = `<span>Week ${dateUtils.formatDisplay(week)} – ${dateUtils.formatDisplay(dateUtils.getWeekEnd(week))}</span><strong>${openWeeks.has(week) ? '−' : '+'}</strong>`;
        wrap.appendChild(wh);

        if (openWeeks.has(week)) {
          wrap.appendChild(weekSummary(stats, entries));
          const days = {};
          entries.forEach(entry => { (days[entry.date] ||= []).push(entry); });

          Object.keys(days).sort().reverse().forEach(day => {
            const key = `${week}:${day}`;
            const totals = calc.calculateDay(days[day], i());
            const dh = button('', 'history-day-row', () => toggle(openDays, key));
            dh.innerHTML = `<span class="day-label">${dateUtils.formatHistoryLabel(day)}</span><span>${i().emojiFood} Food <strong>${totals.intake}</strong></span><span>${i().emojiBurn} Burn <strong>${totals.burn}</strong></span><span>${i().emojiDeficit} Deficit <strong>${totals.net}</strong></span><b>${openDays.has(key) ? '−' : '+'}</b>`;
            wrap.appendChild(dh);

            if (openDays.has(key)) {
              const list = document.createElement('div');
              list.className = 'history-entries';
              days[day].forEach(entry => {
                const row = document.createElement('div');
                row.className = 'history-entry';
                const foodMatch = state.foods.find(food => food.name === entry.name) || state.library.find(food => food.name === entry.name);
                const icon = Number(entry.calories) < 0 ? i().emojiBurn : (foodMatch?.emoji || i().emojiFood);
                const actions = document.createElement('div');
                actions.className = 'entry-actions';
                actions.append(
                  button(i().emojiEdit, 'icon-button', () => showEntryDialog(Number(entry.calories) < 0 ? 'burn' : 'food', entry), 'Edit'),
                  button(i().emojiDelete, 'icon-button danger', () => api.deleteEntry(entry.id), 'Delete')
                );
                row.innerHTML = `<span>${icon} ${entry.name || 'Unnamed entry (imported)'}</span><strong>${Number(entry.calories) > 0 ? '+' : ''}${entry.calories}</strong>`;
                row.appendChild(actions);
                list.appendChild(row);
              });
              wrap.appendChild(list);
            }
          });
        }
        card.appendChild(wrap);
      });
    }
    stack.appendChild(card);
  });
  container.appendChild(stack);

  const weights = document.createElement('section');
  weights.className = 'card weight-history';
  weights.innerHTML = `<div class="card-heading"><div><h2>${i().emojiWeight} Weight History</h2><p>Recorded weights and BMI</p></div></div>`;

  if (!state.weights.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No weights recorded.';
    weights.appendChild(empty);
  } else {
    const weightsByMonth = {};
    state.weights.forEach(weight => {
      const month = dateUtils.getMonthKey(weight.date);
      (weightsByMonth[month] ||= []).push(weight);
    });

    const selectedWeight = calc.getWeightForDate(state.weights, selected);
    const preferredWeightMonth = weightsByMonth[selectedMonth]
      ? selectedMonth
      : (selectedWeight ? dateUtils.getMonthKey(selectedWeight.date) : null);
    if (preferredWeightMonth && (autoExpandSelectedWeek || preferredWeightMonth !== lastAutoExpandedWeightMonth)) {
      openWeightMonths.add(preferredWeightMonth);
      lastAutoExpandedWeightMonth = preferredWeightMonth;
    }

    const weightMonths = document.createElement('div');
    weightMonths.className = 'weight-months';
    Object.keys(weightsByMonth).sort().reverse().forEach(month => {
      const monthBlock = document.createElement('section');
      monthBlock.className = 'weight-month-block';
      const expanded = openWeightMonths.has(month);
      const monthHeader = button('', 'history-toggle weight-month-toggle', () => toggle(openWeightMonths, month));
      monthHeader.innerHTML = `<strong>${dateUtils.formatMonthHeading(month)}</strong><span>${expanded ? '−' : '+'}</span>`;
      monthBlock.appendChild(monthHeader);

      if (expanded) {
        const rows = document.createElement('div');
        rows.className = 'weight-month-rows';
        weightsByMonth[month]
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .forEach(weight => {
            const row = document.createElement('div');
            row.className = 'weight-row';
            row.innerHTML = `<span>${dateUtils.formatDisplay(weight.date)}</span><strong>${weight.value} kg</strong><span>${calc.calculateBMI(weight.value).toFixed(1)} BMI</span>`;
            const actions = document.createElement('div');
            actions.className = 'entry-actions';
            actions.append(
              button(i().emojiEdit, 'icon-button', () => showWeightDialog(weight), 'Edit'),
              button(i().emojiDelete, 'icon-button danger', () => api.deleteWeight(weight.id), 'Delete')
            );
            row.appendChild(actions);
            rows.appendChild(row);
          });
        monthBlock.appendChild(rows);
      }
      weightMonths.appendChild(monthBlock);
    });
    weights.appendChild(weightMonths);
  }
  container.appendChild(weights);
  return container;
}
