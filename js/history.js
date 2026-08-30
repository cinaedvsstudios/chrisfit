import { state, showToast } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate } from './navigation.js';
import { showEntryDialog, showWeightDialog } from './dialogs.js';

const CUSTOM_PERIOD_KEY = 'chrisfit.history.customPeriod.v1';
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

function getMonthStart(monthKey) {
  return `${monthKey}-01`;
}

function getMonthEnd(monthKey) {
  const date = dateUtils.parseIso(`${monthKey}-01`);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return dateUtils.toIso(date);
}

function countDaysInclusive(startIso, endIso) {
  const start = dateUtils.parseIso(startIso);
  const end = dateUtils.parseIso(endIso);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function entriesBetween(entries, startIso, endIso) {
  return entries.filter(entry => entry.date >= startIso && entry.date <= endIso);
}

function buildPeriodStats(entries, targetDays) {
  const totals = calc.calculateDay(entries, i());
  const days = Math.max(1, Number(targetDays) || 1);
  return {
    ...totals,
    weeklyFoodTarget: Number(i().dailyCalories ?? 1500) * days,
    weeklyBurnTarget: Number(i().dailyBurnTarget ?? 2500) * days,
    weeklyDeficitTarget: Number(i().dailyDeficit ?? 500) * days,
    targetDays: days
  };
}

function targetRangeLabel(startIso, endIso) {
  return `${dateUtils.formatDisplay(startIso)} – ${dateUtils.formatDisplay(endIso)}`;
}

function readCustomPeriod(selectedWeek) {
  const fallback = { start: selectedWeek, end: dateUtils.getWeekEnd(selectedWeek) };
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_PERIOD_KEY) || '{}');
    if (/^\d{4}-\d{2}-\d{2}$/.test(stored.start) && /^\d{4}-\d{2}-\d{2}$/.test(stored.end)) {
      return stored.start <= stored.end ? stored : fallback;
    }
  } catch (_) {}
  return fallback;
}

function saveCustomPeriod(startIso, endIso) {
  localStorage.setItem(CUSTOM_PERIOD_KEY, JSON.stringify({ start: startIso, end: endIso }));
}

function totalSummary(stats, title = 'Week Total') {
  const box = document.createElement('div');
  box.className = 'history-summary history-total-summary';
  const heading = document.createElement('h3');
  heading.className = 'history-summary-title';
  heading.textContent = title;
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

function dailyAverageSummary(stats, entries, titlePrefix = 'Daily Average') {
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
  heading.textContent = `${titlePrefix} · ${recordedDays} logged ${recordedDays === 1 ? 'day' : 'days'}`;
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

function periodSummary(label, entries, targetDays, startIso, endIso) {
  const block = document.createElement('div');
  block.className = `period-summary-block ${label.toLowerCase().replace(/\s+/g, '-')}-summary-block`;
  const heading = document.createElement('div');
  heading.className = 'period-summary-heading';
  heading.innerHTML = `<h3>${label}</h3><span>${targetRangeLabel(startIso, endIso)}</span>`;
  block.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'week-summary-grid period-summary-grid';
  const stats = buildPeriodStats(entries, targetDays);
  grid.append(
    totalSummary(stats, `${label} Total`),
    dailyAverageSummary(stats, entries, 'Daily Average')
  );
  block.appendChild(grid);
  return block;
}

function weekSummary(stats, entries) {
  const grid = document.createElement('div');
  grid.className = 'week-summary-grid';
  grid.append(totalSummary(stats, 'Week Total'), dailyAverageSummary(stats, entries, 'Daily Average'));
  return grid;
}

function customPeriodBlock(selectedWeek) {
  const period = readCustomPeriod(selectedWeek);
  const startInput = document.createElement('input');
  startInput.type = 'text';
  startInput.value = dateUtils.formatDisplay(period.start);
  startInput.placeholder = 'DD-MM-YYYY';
  startInput.setAttribute('aria-label', 'Custom period start date');
  const endInput = document.createElement('input');
  endInput.type = 'text';
  endInput.value = dateUtils.formatDisplay(period.end);
  endInput.placeholder = 'DD-MM-YYYY';
  endInput.setAttribute('aria-label', 'Custom period end date');

  const entries = entriesBetween(state.entriesFull, period.start, period.end);
  const block = periodSummary('Custom Period', entries, countDaysInclusive(period.start, period.end), period.start, period.end);
  block.classList.add('custom-period-block');

  const controls = document.createElement('div');
  controls.className = 'custom-period-controls';
  const startLabel = document.createElement('label');
  startLabel.innerHTML = '<span>From</span>';
  const endLabel = document.createElement('label');
  endLabel.innerHTML = '<span>To</span>';
  const apply = button('Apply', 'btn-green small-button', () => {
    const start = dateUtils.parseDisplayDate(startInput.value);
    const end = dateUtils.parseDisplayDate(endInput.value);
    if (!start || !end) {
      alert('Use DD-MM-YYYY for both custom period dates.');
      return;
    }
    const startIso = dateUtils.toIso(start);
    const endIso = dateUtils.toIso(end);
    if (startIso > endIso) {
      alert('The custom start date must be before the end date.');
      return;
    }
    saveCustomPeriod(startIso, endIso);
    navigate('history');
  });
  controls.append(startLabel, startInput, endLabel, endInput, apply);
  block.insertBefore(controls, block.children[1]);
  return block;
}

function eachDay(startIso, endIso) {
  const days = [];
  const current = dateUtils.parseIso(startIso);
  const end = dateUtils.parseIso(endIso);
  if (!current || !end) return days;
  while (current <= end) {
    days.push(dateUtils.toIso(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function missingDefaultsForDay(iso) {
  const date = dateUtils.parseIso(iso);
  const day = date ? date.getDay() : 1;
  const weekendValue = day === 0 || day === 5 || day === 6;
  const value = weekendValue ? 2500 : 2000;
  return { food: value, burn: value };
}

function totalsForDay(iso) {
  return calc.calculateDay(state.entriesFull.filter(entry => entry.date === iso), i());
}

function readPositiveInput(input, label, dayIso) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    alert(`${label} for ${dateUtils.formatDisplay(dayIso)} must be greater than 0.`);
    input.focus();
    return null;
  }
  return Math.round(value);
}

function addMissingEstimateEntries(row, foodInput, burnInput) {
  let added = 0;
  if (row.missingFood) {
    const food = readPositiveInput(foodInput, 'Food', row.iso);
    if (food === null) return null;
    api.addEntry(row.iso, 'Missing Food Estimate', Math.abs(food));
    added += 1;
  }
  if (row.missingBurn) {
    const burn = readPositiveInput(burnInput, 'Burn', row.iso);
    if (burn === null) return null;
    api.addEntry(row.iso, 'Missing Burn Estimate', -Math.abs(burn));
    added += 1;
  }
  return added;
}

function buildMissingRows(startIso, endIso) {
  return eachDay(startIso, endIso)
    .map(iso => {
      const totals = totalsForDay(iso);
      const defaults = missingDefaultsForDay(iso);
      const missingFood = totals.intake <= 0;
      const missingBurn = totals.burn <= 0;
      return { iso, totals, defaults, missingFood, missingBurn };
    })
    .filter(row => row.missingFood || row.missingBurn);
}

function openMissingScanWindow(defaultMonth) {
  document.querySelector('.missing-scan-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'missing-scan-overlay';
  const modal = document.createElement('section');
  modal.className = 'missing-scan-modal';
  overlay.appendChild(modal);

  const header = document.createElement('div');
  header.className = 'missing-scan-header';
  const title = document.createElement('div');
  title.innerHTML = '<h2>Scan Missing</h2><p>Find days with missing food or burn entries and add estimates without overwriting real entries.</p>';
  const close = button('×', 'missing-scan-close', () => overlay.remove(), 'Close');
  header.append(title, close);

  const controls = document.createElement('div');
  controls.className = 'missing-scan-controls';

  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  monthInput.value = defaultMonth;

  const fromInput = document.createElement('input');
  fromInput.type = 'text';
  fromInput.placeholder = 'DD-MM-YYYY';

  const toInput = document.createElement('input');
  toInput.type = 'text';
  toInput.placeholder = 'DD-MM-YYYY';

  function setMonthRange(monthKey) {
    fromInput.value = dateUtils.formatDisplay(getMonthStart(monthKey));
    toInput.value = dateUtils.formatDisplay(getMonthEnd(monthKey));
  }
  setMonthRange(defaultMonth);

  const scanButton = button('Scan', 'btn-blue small-button', () => renderResults());
  const saveAllButton = button('Save All Missing', 'btn-green small-button', () => {});
  const monthLabel = document.createElement('label');
  monthLabel.innerHTML = '<span>Month</span>';
  const fromLabel = document.createElement('label');
  fromLabel.innerHTML = '<span>From</span>';
  const toLabel = document.createElement('label');
  toLabel.innerHTML = '<span>To</span>';
  controls.append(monthLabel, monthInput, fromLabel, fromInput, toLabel, toInput, scanButton, saveAllButton);

  const results = document.createElement('div');
  results.className = 'missing-scan-results';

  monthInput.addEventListener('change', () => {
    if (monthInput.value) {
      setMonthRange(monthInput.value);
      renderResults();
    }
  });

  function readRange() {
    const start = dateUtils.parseDisplayDate(fromInput.value);
    const end = dateUtils.parseDisplayDate(toInput.value);
    if (!start || !end) {
      alert('Use DD-MM-YYYY for both scan dates.');
      return null;
    }
    const startIso = dateUtils.toIso(start);
    const endIso = dateUtils.toIso(end);
    if (startIso > endIso) {
      alert('The scan start date must be before the end date.');
      return null;
    }
    return { startIso, endIso };
  }

  function renderResults() {
    const range = readRange();
    if (!range) return;
    const missingRows = buildMissingRows(range.startIso, range.endIso);
    const rowSavers = [];
    results.innerHTML = '';

    const summary = document.createElement('p');
    summary.className = 'missing-scan-summary';
    summary.textContent = missingRows.length
      ? `${missingRows.length} day${missingRows.length === 1 ? '' : 's'} need food, burn, or both. Locked values already exist and will not be overwritten.`
      : 'No missing food or burn days found in this period.';
    results.appendChild(summary);

    if (!missingRows.length) {
      saveAllButton.disabled = true;
      return;
    }
    saveAllButton.disabled = false;

    const table = document.createElement('div');
    table.className = 'missing-scan-table';
    const heading = document.createElement('div');
    heading.className = 'missing-scan-row missing-scan-row-heading';
    heading.innerHTML = '<strong>Date</strong><strong>Food</strong><strong>Burn</strong><strong>Action</strong>';
    table.appendChild(heading);

    missingRows.forEach(row => {
      const line = document.createElement('div');
      line.className = 'missing-scan-row';

      const dateCell = document.createElement('div');
      dateCell.className = 'missing-scan-date';
      dateCell.innerHTML = `<strong>${dateUtils.formatHistoryLabel(row.iso)}</strong>`;

      const foodInput = document.createElement('input');
      foodInput.type = 'number';
      foodInput.min = '1';
      foodInput.value = row.missingFood ? row.defaults.food : row.totals.intake;
      if (!row.missingFood) {
        foodInput.disabled = true;
        foodInput.className = 'locked-field';
      }

      const burnInput = document.createElement('input');
      burnInput.type = 'number';
      burnInput.min = '1';
      burnInput.value = row.missingBurn ? row.defaults.burn : row.totals.burn;
      if (!row.missingBurn) {
        burnInput.disabled = true;
        burnInput.className = 'locked-field';
      }

      const save = button('Save Row', 'btn-green small-button', () => {
        const added = addMissingEstimateEntries(row, foodInput, burnInput);
        if (added === null) return;
        showToast(`Saved ${added} estimate${added === 1 ? '' : 's'} for ${dateUtils.formatDisplay(row.iso)}`, 'success');
        save.disabled = true;
        save.textContent = 'Saved';
        setTimeout(renderResults, 0);
      });

      rowSavers.push(() => addMissingEstimateEntries(row, foodInput, burnInput));
      line.append(dateCell, foodInput, burnInput, save);
      table.appendChild(line);
    });

    saveAllButton.onclick = () => {
      let added = 0;
      for (const saver of rowSavers) {
        const result = saver();
        if (result === null) return;
        added += result;
      }
      showToast(`Saved ${added} missing estimate${added === 1 ? '' : 's'}`, 'success', 3500);
      setTimeout(renderResults, 0);
    };

    results.appendChild(table);
  }

  modal.append(header, controls, results);
  document.body.appendChild(overlay);
  renderResults();
}

export function renderHistory(autoExpandSelectedWeek = false) {
  const container = document.createElement('main');
  container.className = 'screen history active page';

  const grouped = group(state.entriesFull);
  const selected = dateUtils.toIso(state.selectedDate);
  const selectedMonth = dateUtils.getMonthKey(selected);
  const selectedWeek = dateUtils.getWeekStart(selected);

  const header = document.createElement('section');
  header.className = 'card section-header history-titlebar';
  header.append(button(`${i().emojiPrevious} Back`, 'btn-outline', () => navigate('main')));
  const title = document.createElement('div');
  title.innerHTML = `<h1>${i().emojiHistory} History</h1><p class="subtle-label">Food, burn and weight over time</p>`;
  const actions = document.createElement('div');
  actions.className = 'history-header-actions';
  actions.append(button('Scan Missing', 'btn-blue compact-button', () => openMissingScanWindow(selectedMonth)));
  header.append(title, actions);
  container.appendChild(header);

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

          if (week === selectedWeek) {
            const monthStart = getMonthStart(selectedMonth);
            const monthEnd = getMonthEnd(selectedMonth);
            const monthEntries = entriesBetween(state.entriesFull, monthStart, monthEnd);
            wrap.appendChild(periodSummary(
              'Month',
              monthEntries,
              countDaysInclusive(monthStart, monthEnd),
              monthStart,
              monthEnd
            ));
            wrap.appendChild(customPeriodBlock(selectedWeek));
          }

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
