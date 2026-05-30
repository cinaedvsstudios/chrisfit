/*
  ui.js

  Top‑level UI rendering module.  Provides functions to render the
  appropriate screen based on the current navigation state and to
  assemble the main screen.  Uses modular helpers from other files
  for history, settings and dialogs.  All DOM manipulation and
  element creation related to the UI lives here to keep business
  logic separate from presentation.
*/

import { state, setState } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { getActiveScreen, navigate } from './navigation.js';
import { showEntryDialog, showWeightDialog } from './dialogs.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';

/**
 * Render the entire application by clearing the #app element and
 * appending the appropriate screen based on the current
 * navigation state.  This function should be called whenever
 * navigation or state changes occur.
 */
export function render() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const screen = getActiveScreen();
  if (screen === 'main') {
    app.appendChild(renderMain());
  } else if (screen === 'history') {
    app.appendChild(renderHistory());
  } else if (screen === 'settings') {
    app.appendChild(renderSettings());
  }
}

/**
 * Build the main screen.  Shows the current day, summary stats,
 * quick‑add buttons, a list of entries for the selected date and a
 * bottom bar with a link to settings.  Buttons trigger navigation
 * changes or open modal dialogs.
 *
 * @returns {HTMLElement}
 */
export function renderMain() {
  const container = document.createElement('div');
  container.className = 'screen main active';

  // ======================= HEADER =======================
  const header = document.createElement('div');
  header.className = 'header';
  const dateRow = document.createElement('div');
  dateRow.className = 'date-row';
  // Prev/next date buttons
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '⬅️';
  prevBtn.className = 'btn-outline';
  prevBtn.addEventListener('click', () => {
    const d = new Date(state.selectedDate);
    d.setDate(d.getDate() - 1);
    setState('selectedDate', d);
    api.fetchEntriesByDate(d);
  });
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '➡️';
  nextBtn.className = 'btn-outline';
  nextBtn.addEventListener('click', () => {
    const d = new Date(state.selectedDate);
    d.setDate(d.getDate() + 1);
    setState('selectedDate', d);
    api.fetchEntriesByDate(d);
  });
  // Date display with click to prompt for manual date
  const dateCol = document.createElement('div');
  dateCol.style.cursor = 'pointer';
  dateCol.style.textAlign = 'center';
  dateCol.addEventListener('click', () => {
    const iso = dateUtils.toIso(state.selectedDate);
    const newDateStr = prompt('Select date (YYYY-MM-DD)', iso);
    if (newDateStr) {
      const newDate = new Date(newDateStr);
      if (!isNaN(newDate)) {
        setState('selectedDate', newDate);
        api.fetchEntriesByDate(newDate);
      }
    }
  });
  const dayName = document.createElement('div');
  dayName.textContent = dateUtils.getDayName(state.selectedDate);
  dayName.style.fontSize = '1.5rem';
  const dateText = document.createElement('div');
  dateText.textContent = dateUtils.getDisplayDate(state.selectedDate);
  dateText.style.fontSize = '1rem';
  dateCol.appendChild(dayName);
  dateCol.appendChild(dateText);
  dateRow.appendChild(prevBtn);
  dateRow.appendChild(dateCol);
  dateRow.appendChild(nextBtn);
  header.appendChild(dateRow);

  // ======================= SUMMARY =======================
  const summary = document.createElement('div');
  summary.className = 'summary';
  const dayStats = calc.calculateDay(state.entries, state.settings);
  // Weekly stats are computed over entries for the current week.  In
  // this simple implementation we reuse the day entries as weekly
  // entries if a proper weekly API call is not available.
  const weekStats = calc.calculateWeek(state.entries, state.settings, 1);
  // Daily column
  const dailyCol = document.createElement('div');
  dailyCol.className = 'summary-column';
  dailyCol.innerHTML =
    `<div><strong>📅 Daily</strong></div>` +
    `<div>🍔 ${dayStats.intake} / ${state.settings?.dailyCalories ?? 1500}</div>` +
    `<div>🔥 ${dayStats.burn}</div>` +
    `<div>⚖️ ${dayStats.net} / -${state.settings?.dailyDeficit ?? 500}</div>`;
  // Weight/BMI column
  const weightCol = document.createElement('div');
  weightCol.className = 'summary-column';
  const latestWeight = state.weights.length > 0 ? state.weights[0] : null;
  if (latestWeight) {
    const bmi = calc.calculateBMI(latestWeight.value);
    weightCol.innerHTML =
      `<div>⚖️ ${latestWeight.value} kg</div>` +
      `<div>📊 ${bmi ? bmi.toFixed(1) : '--'} BMI</div>`;
  } else {
    weightCol.innerHTML = `<div>⚖️ -- kg</div><div>📊 -- BMI</div>`;
  }
  // Weekly column
  const weeklyCol = document.createElement('div');
  weeklyCol.className = 'summary-column';
  weeklyCol.innerHTML =
    `<div><strong>📊 Weekly</strong></div>` +
    `<div>🍔 ${weekStats.intake} / ${weekStats.weeklyTarget}</div>` +
    `<div>🔥 ${weekStats.burn}</div>` +
    `<div>⚖️ ${weekStats.net} / -${weekStats.weeklyDeficitTarget}</div>`;
  summary.appendChild(dailyCol);
  summary.appendChild(weightCol);
  summary.appendChild(weeklyCol);
  header.appendChild(summary);

  // ======================= ACTION GRID =======================
  const grid = document.createElement('div');
  grid.className = 'action-grid';
  // History button
  const historyBtn = document.createElement('button');
  historyBtn.textContent = 'History';
  historyBtn.className = 'btn-green';
  historyBtn.addEventListener('click', () => navigate('history'));
  grid.appendChild(historyBtn);
  // Add weight button
  const weightBtn = document.createElement('button');
  weightBtn.textContent = 'Add Weight';
  weightBtn.className = 'btn-green';
  weightBtn.addEventListener('click', () => showWeightDialog());
  grid.appendChild(weightBtn);
  // Add other button
  const otherBtn = document.createElement('button');
  otherBtn.textContent = 'Add Other';
  otherBtn.className = 'btn-blue';
  otherBtn.addEventListener('click', () => showEntryDialog());
  grid.appendChild(otherBtn);
  // Add BMR button
  const bmrBtn = document.createElement('button');
  bmrBtn.textContent = 'Add BMR';
  bmrBtn.className = 'btn-blue';
  bmrBtn.addEventListener('click', async () => {
    const bmr = state.settings?.bmr ?? 2000;
    await api.addEntry(state.selectedDate, 'BMR', -bmr);
  });
  grid.appendChild(bmrBtn);
  // Food buttons
  state.foods.forEach(food => {
    const btn = document.createElement('button');
    btn.textContent = food.name;
    btn.className = 'btn-purple';
    btn.addEventListener('click', async () => {
      await api.addEntry(state.selectedDate, food.name, food.calories);
    });
    grid.appendChild(btn);
  });

  // ======================= ENTRY LIST =======================
  const list = document.createElement('div');
  list.className = 'entries-list';
  state.entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'entry-row';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${entry.name} (${entry.calories})`;
    const del = document.createElement('button');
    del.textContent = 'X';
    del.className = 'btn-red';
    del.addEventListener('click', async () => {
      await api.deleteEntry(entry.id);
    });
    row.appendChild(nameSpan);
    row.appendChild(del);
    list.appendChild(row);
  });

  // ======================= BOTTOM BAR =======================
  const bottom = document.createElement('div');
  bottom.className = 'bottom-bar';
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = '⚙ Settings';
  settingsBtn.className = 'btn-outline';
  settingsBtn.addEventListener('click', () => navigate('settings'));
  bottom.appendChild(settingsBtn);

  // Assemble main screen
  container.appendChild(header);
  container.appendChild(grid);
  container.appendChild(list);
  container.appendChild(bottom);
  return container;
}