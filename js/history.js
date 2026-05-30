/*
  history.js

  Rendering for the history screen.  The history view groups all
  entries by week and day and allows the user to expand or collapse
  each section.  It also displays the entire weight history and
  provides a back button to return to the main screen.  Internally
  the module caches which weeks and days are expanded using two
  Sets so that state persists across re-renders.
*/

import { state, setState } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate } from './navigation.js';

// Expanded state caches.  When a week or day key is present in
// expandedWeeks/days the corresponding section is shown.
const expandedWeeks = new Set();
const expandedDays = new Set();
let weightEditMode = false;

/**
 * Build and return the history view DOM fragment.  If all entries
 * haven't been loaded yet a fetch is triggered and a loading message
 * is shown.  Once data is available it is grouped by week and day
 * and rendered hierarchically with expandable sections.
 *
 * @returns {HTMLElement}
 */
export function renderHistory() {
  const container = document.createElement('div');
  container.className = 'screen history active';

  // Header
  const header = document.createElement('div');
  header.className = 'header';
  const title = document.createElement('h2');
  title.textContent = 'History';
  header.appendChild(title);
  container.appendChild(header);

  // List container for weekly entries
  const historyList = document.createElement('div');
  historyList.className = 'history-list';
  container.appendChild(historyList);

  // Ensure all entries are loaded.  If not available yet, fetch and
  // request a re-render when done.  A loading placeholder is
  // displayed until the data arrives.
  const allEntries = state.entriesFull || [];
  if (!state.entriesFull) {
    // Kick off async load.  When complete update state to trigger
    // subscribers and thus a re-render.
    api.fetchAllEntries().then(entries => {
      setState('entriesFull', entries);
    });
    historyList.textContent = 'Loading...';
  } else {
    // Group entries by week start date
    const groups = {};
    allEntries.forEach(e => {
      const week = dateUtils.getWeekStart(e.date);
      if (!groups[week]) groups[week] = [];
      groups[week].push(e);
    });
    // Sort weeks descending (most recent first)
    const sortedWeeks = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    sortedWeeks.forEach(week => {
      // Week header row
      const weekHeader = document.createElement('div');
      weekHeader.className = 'history-week';
      const expanded = expandedWeeks.has(week);
      weekHeader.textContent = (expanded ? '➖ ' : '➕ ') + week;
      weekHeader.addEventListener('click', () => {
        if (expanded) expandedWeeks.delete(week); else expandedWeeks.add(week);
        // Trigger re-render via navigation change.  Using navigate to
        // same screen ensures subscribers run without altering state.
        navigate('history');
      });
      historyList.appendChild(weekHeader);
      // If expanded render days
      if (expanded) {
        const daysGroup = {};
        groups[week].forEach(e => {
          if (!daysGroup[e.date]) daysGroup[e.date] = [];
          daysGroup[e.date].push(e);
        });
        const dayKeys = Object.keys(daysGroup).sort((a, b) => b.localeCompare(a));
        dayKeys.forEach(dateStr => {
          const key = `${week}:${dateStr}`;
          const dayExpanded = expandedDays.has(key);
          const dayStats = calc.calculateDay(daysGroup[dateStr], state.settings);
          const dayHeader = document.createElement('div');
          dayHeader.className = 'history-day';
          dayHeader.textContent = (dayExpanded ? '➖ ' : '➕ ') +
            `${dateUtils.formatHistoryLabel(dateStr)}  🥦 ${dayStats.intake}   🔥 ${dayStats.burn}   ⚖️ ${dayStats.net}`;
          dayHeader.addEventListener('click', () => {
            if (dayExpanded) expandedDays.delete(key); else expandedDays.add(key);
            navigate('history');
          });
          historyList.appendChild(dayHeader);
          if (dayExpanded) {
            const list = document.createElement('div');
            list.className = 'history-entries';
            daysGroup[dateStr].forEach(e => {
              const div = document.createElement('div');
              const isFood = e.calories > 0;
              div.textContent = `${isFood ? '🥦' : '🔥'} ${e.name} (${e.calories})`;
              list.appendChild(div);
            });
            historyList.appendChild(list);
          }
        });
        // Week summary row
        const weekStats = calc.calculateDay(groups[week], state.settings);
        const sumDiv = document.createElement('div');
        sumDiv.className = 'history-day';
        sumDiv.style.backgroundColor = 'var(--color-weight-row-alt)';
        sumDiv.textContent = `   🥦 ${weekStats.intake}   🔥 ${weekStats.burn}   ⚖️ ${weekStats.net}`;
        historyList.appendChild(sumDiv);
      }
    });
  }

  // Weight history section
  const weightTitleRow = document.createElement('div');
  weightTitleRow.style.display = 'flex';
  weightTitleRow.style.justifyContent = 'space-between';
  weightTitleRow.style.alignItems = 'center';
  weightTitleRow.style.padding = '0.5rem';
  const weightHeader = document.createElement('h3');
  weightHeader.textContent = 'Weight history';
  weightHeader.style.margin = '0';
  const editWeights = document.createElement('button');
  editWeights.className = 'btn-outline';
  editWeights.textContent = weightEditMode ? '✅' : '✏️';
  editWeights.setAttribute('aria-label', weightEditMode ? 'Finish deleting weight entries' : 'Delete weight entries');
  editWeights.addEventListener('click', () => {
    weightEditMode = !weightEditMode;
    navigate('history');
  });
  weightTitleRow.appendChild(weightHeader);
  weightTitleRow.appendChild(editWeights);
  container.appendChild(weightTitleRow);
  const weightList = document.createElement('div');
  weightList.style.backgroundColor = 'var(--color-weight-bg)';
  weightList.style.padding = '0.5rem';
  state.weights.forEach(w => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.padding = '0.25rem 0';
    const bmi = calc.calculateBMI(w.value);
    const dateCell = document.createElement('span');
    dateCell.textContent = `📅 ${dateUtils.formatHistoryLabel(w.date)}`;
    const kgCell = document.createElement('span');
    kgCell.textContent = `⚖️ ${w.value}`;
    const bmiCell = document.createElement('span');
    bmiCell.textContent = `📊 ${bmi ? bmi.toFixed(1) : '--'}`;
    row.appendChild(dateCell);
    row.appendChild(kgCell);
    row.appendChild(bmiCell);
    if (weightEditMode) {
      const remove = document.createElement('button');
      remove.className = 'btn-red';
      remove.textContent = 'X';
      remove.addEventListener('click', async () => { await api.deleteWeight(w.id); });
      row.appendChild(remove);
    }
    weightList.appendChild(row);
  });
  container.appendChild(weightList);

  // Back button
  const backBtn = document.createElement('button');
  backBtn.textContent = '⬅ Back';
  backBtn.className = 'btn-outline';
  backBtn.style.margin = '1rem auto';
  backBtn.addEventListener('click', () => navigate('main'));
  container.appendChild(backBtn);

  return container;
}