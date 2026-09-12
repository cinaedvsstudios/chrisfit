import { state, defaultSettings, showToast } from './state.js';
import * as api from './api.js';
import * as reports from './connection-reports.js';
import { navigate } from './navigation.js';
import { getThemePreference, setThemePreference } from './theme.js';

function s() { return state.settings; }
function field(label, value, type = 'text') {
  const wrap = document.createElement('label');
  wrap.className = 'form-group';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  wrap.append(span, input);
  return { wrap, input };
}
function button(text, cls = 'btn-green') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  return b;
}
function panel(title) {
  const section = document.createElement('section');
  section.className = 'settings-card';
  const h = document.createElement('h3');
  h.textContent = title;
  section.appendChild(h);
  return section;
}
async function copyText_(text, successMessage = 'Copied') {
  if (!text) {
    showToast('Nothing to copy yet', 'error');
    return false;
  }
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
    showToast(successMessage, 'success');
    return true;
  } catch (error) {
    showToast(`Copy failed: ${error.message || String(error)}`, 'error', 4200);
    return false;
  }
}
function localIso_(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function addDays_(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function dateLabel_(iso) {
  const today = localIso_(new Date());
  const yesterday = localIso_(addDays_(new Date(), -1));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
function timeLabel_(iso) {
  const date = new Date(iso || '');
  return Number.isNaN(date.getTime()) ? '(unknown time)' : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function renderConnectionReports_(mount, selected) {
  const allReports = reports.getConnectionReports();
  const dates = reports.getConnectionReportDates();
  mount.innerHTML = '';
  if (!allReports.length) {
    const empty = document.createElement('p');
    empty.className = 'diagnostic-report-empty';
    empty.textContent = 'No local connection error reports saved yet.';
    mount.appendChild(empty);
    selected.day = '';
    return;
  }
  if (!selected.day || !dates.includes(selected.day)) selected.day = dates[0];

  const grid = document.createElement('div');
  grid.className = 'diagnostic-history-grid';
  const dateColumn = document.createElement('div');
  dateColumn.className = 'diagnostic-report-dates';
  const reportColumn = document.createElement('div');
  reportColumn.className = 'diagnostic-report-list';

  dates.forEach(day => {
    const count = allReports.filter(report => report.day === day).length;
    const dateButton = button(`${dateLabel_(day)} (${count})`, `diagnostic-date-button ${day === selected.day ? 'selected' : ''}`);
    dateButton.addEventListener('click', () => {
      selected.day = day;
      renderConnectionReports_(mount, selected);
    });
    dateColumn.appendChild(dateButton);
  });

  const clearDay = button('🧹 Clear selected day', 'btn-outline small-button');
  clearDay.addEventListener('click', () => {
    if (!selected.day) return;
    reports.clearConnectionReportsForDate(selected.day);
    renderConnectionReports_(mount, selected);
    showToast('Error reports cleared for selected day', 'info');
  });
  dateColumn.appendChild(clearDay);

  const matching = allReports.filter(report => report.day === selected.day);
  if (!matching.length) {
    const empty = document.createElement('p');
    empty.className = 'diagnostic-report-empty';
    empty.textContent = 'No reports for this date.';
    reportColumn.appendChild(empty);
  }
  matching.forEach(report => {
    const card = document.createElement('article');
    card.className = 'diagnostic-report-card';
    const heading = document.createElement('div');
    heading.className = 'diagnostic-report-card-heading';
    const title = document.createElement('strong');
    title.textContent = report.title || 'Connection error';
    const meta = document.createElement('span');
    meta.className = 'diagnostic-report-meta';
    meta.textContent = `${timeLabel_(report.createdAt)} · ${report.action || report.source || 'connection'}${report.elapsedMs ? ` · ${report.elapsedMs} ms` : ''}`;
    heading.append(title, meta);

    const summary = document.createElement('p');
    summary.className = 'diagnostic-report-summary';
    summary.textContent = report.message || '(no error message)';

    const details = document.createElement('pre');
    details.className = 'diagnostic-report-message';
    details.textContent = reports.formatConnectionReport(report);

    const actions = document.createElement('div');
    actions.className = 'diagnostic-report-actions';
    const copy = button('📋 Copy', 'btn-outline small-button');
    copy.addEventListener('click', () => copyText_(reports.formatConnectionReport(report), 'Error report copied'));
    const remove = button('🗑️ Delete', 'btn-red small-button');
    remove.addEventListener('click', () => {
      reports.deleteConnectionReport(report.id);
      renderConnectionReports_(mount, selected);
      showToast('Error report deleted', 'info');
    });
    actions.append(copy, remove);
    card.append(heading, summary, details, actions);
    reportColumn.appendChild(card);
  });

  grid.append(dateColumn, reportColumn);
  mount.appendChild(grid);
}
function saveFoodRow(food) {
  const row = document.createElement('div');
  row.className = 'food-editor-row food-editor-row-emoji';
  const emoji = document.createElement('input');
  emoji.type = 'text';
  emoji.value = food.emoji || '';
  emoji.placeholder = s().emojiFood;
  emoji.maxLength = 8;
  emoji.setAttribute('aria-label', 'Button emoji');
  const name = document.createElement('input');
  name.type = 'text';
  name.value = food.name;
  name.setAttribute('aria-label', 'Food name');
  const cal = document.createElement('input');
  cal.type = 'number';
  cal.min = '1';
  cal.value = food.calories;
  cal.setAttribute('aria-label', 'Calories');
  const controls = document.createElement('div');
  controls.className = 'food-editor-actions';
  const up = button('⬆️', 'icon-button');
  const down = button('⬇️', 'icon-button');
  const visible = button(food.active ? '👁️ Hide' : '🙈 Show', 'btn-outline small-button');
  const save = button('💾 Save', 'btn-green small-button');
  const remove = button(s().emojiDelete, 'icon-button danger');
  up.addEventListener('click', () => api.reorderFood(food.id, -1));
  down.addEventListener('click', () => api.reorderFood(food.id, 1));
  visible.addEventListener('click', () => api.updateFood(food.id, { ...food, active: !food.active }));
  save.addEventListener('click', () => {
    try {
      api.updateFood(food.id, { ...food, emoji: emoji.value, name: name.value, calories: Number(cal.value) });
      showToast('Quick button updated', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  remove.addEventListener('click', () => {
    if (confirm(`Delete quick button “${food.name}”?`)) api.deleteFood(food.id);
  });
  controls.append(up, down, visible, save, remove);
  row.append(emoji, name, cal, controls);
  return row;
}
function libraryRow(item) {
  const row = document.createElement('div');
  row.className = 'library-editor-row';
  const emoji = document.createElement('input');
  emoji.type = 'text';
  emoji.value = item.emoji || '';
  emoji.placeholder = s().emojiFood;
  emoji.maxLength = 8;
  emoji.setAttribute('aria-label', 'Library food emoji');
  const name = document.createElement('input');
  name.type = 'text';
  name.value = item.name;
  name.setAttribute('aria-label', 'Library food name');
  const amount = document.createElement('input');
  amount.type = 'text';
  amount.value = item.amount;
  amount.setAttribute('aria-label', 'Serving amount');
  const calories = document.createElement('input');
  calories.type = 'number';
  calories.min = '1';
  calories.value = Number.isFinite(item.calories) && item.calories > 0 ? item.calories : '';
  calories.setAttribute('aria-label', 'Calories');
  const actions = document.createElement('div');
  actions.className = 'food-editor-actions';
  const save = button('💾 Save', 'btn-green small-button');
  const remove = button(s().emojiDelete, 'icon-button danger');
  save.addEventListener('click', () => {
    try {
      api.updateLibraryItem(item.id, { emoji: emoji.value, name: name.value, amount: amount.value, calories: Number(calories.value) });
      showToast('Library food updated', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  remove.addEventListener('click', () => {
    if (confirm(`Delete “${item.name}” from the Food Library?`)) api.deleteLibraryItem(item.id);
  });
  actions.append(save, remove);
  row.append(emoji, name, amount, calories, actions);
  return row;
}

export function renderSettings() {
  const container = document.createElement('main');
  container.className = 'screen settings active page settings-page';
  const header = document.createElement('section');
  header.className = 'card section-header settings-header';
  const back = button(`${s().emojiPrevious} Back`, 'btn-outline');
  back.addEventListener('click', () => navigate('main'));
  const title = document.createElement('div');
  title.innerHTML = `<h1>${s().emojiSettings} Settings</h1><p class="subtle-label">Targets, appearance and data controls</p>`;
  header.append(back, title);
  container.appendChild(header);
  const content = document.createElement('div');
  content.className = 'settings-content';

  const link = panel(`${s().emojiSheet} Data Sheet`);
  const sheetLink = document.createElement('a');
  sheetLink.className = 'sheet-link';
  sheetLink.href = s().googleSheetUrl || defaultSettings.googleSheetUrl;
  sheetLink.target = '_blank';
  sheetLink.rel = 'noopener';
  sheetLink.textContent = `${s().emojiSheet} Open Google Sheet`;
  link.appendChild(sheetLink);
  content.appendChild(link);

  const targets = panel('🎯 Targets');
  const dailyFood = field('Daily Food Target', s().dailyCalories, 'number');
  const dailyBurn = field('Daily Burn Target', s().dailyBurnTarget, 'number');
  const dailyDeficit = field('Daily Deficit Target', s().dailyDeficit, 'number');
  const bmr = field('BMR', s().bmr, 'number');
  targets.append(dailyFood.wrap, dailyBurn.wrap, dailyDeficit.wrap, bmr.wrap);
  const saveTargets = button('💾 Save Targets');
  saveTargets.addEventListener('click', () => {
    api.saveSettings({ ...s(), dailyCalories: Number(dailyFood.input.value), dailyBurnTarget: Number(dailyBurn.input.value), dailyDeficit: Number(dailyDeficit.input.value), bmr: Number(bmr.input.value) });
    showToast('Targets saved', 'success');
  });
  targets.appendChild(saveTargets);
  content.appendChild(targets);

  const appearance = panel('🎨 Appearance');
  const theme = document.createElement('select');
  ['system', 'light', 'dark'].forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    theme.appendChild(option);
  });
  theme.value = getThemePreference();
  theme.addEventListener('change', () => setThemePreference(theme.value));
  const themeLabel = document.createElement('label');
  themeLabel.className = 'form-group';
  themeLabel.innerHTML = '<span>Theme</span>';
  themeLabel.appendChild(theme);
  appearance.appendChild(themeLabel);
  const emojiFields = [['emojiFood','Food fallback'],['emojiBurn','Burn'],['emojiDeficit','Deficit'],['emojiWeight','Weight'],['emojiBmr','BMR'],['emojiHistory','History'],['emojiSettings','Settings'],['emojiPrevious','Previous Day'],['emojiNext','Next Day'],['emojiEdit','Edit'],['emojiDelete','Delete'],['emojiSheet','Google Sheet'],['emojiSearch','Search']];
  const emojiGrid = document.createElement('div');
  emojiGrid.className = 'emoji-grid';
  const inputs = {};
  emojiFields.forEach(([key, label]) => {
    const item = field(label, s()[key], 'text');
    item.input.maxLength = 8;
    inputs[key] = item.input;
    emojiGrid.appendChild(item.wrap);
  });
  appearance.appendChild(emojiGrid);
  const saveEmoji = button('💾 Save Emoji Choices');
  saveEmoji.addEventListener('click', () => {
    const changes = {};
    emojiFields.forEach(([key]) => { changes[key] = inputs[key].value || defaultSettings[key]; });
    api.saveSettings({ ...s(), ...changes });
    showToast('Emoji choices saved', 'success');
  });
  appearance.appendChild(saveEmoji);
  content.appendChild(appearance);

  const foods = panel(`${s().emojiFood} Quick Add Buttons`);
  const foodsHelp = document.createElement('p');
  foodsHelp.className = 'settings-note';
  foodsHelp.textContent = 'These appear as one-tap buttons on the daily screen. Their emoji is display-only; entries keep a clean food name.';
  foods.appendChild(foodsHelp);
  const addRow = document.createElement('div');
  addRow.className = 'food-add-row food-add-row-emoji';
  const newEmoji = document.createElement('input');
  newEmoji.placeholder = s().emojiFood;
  newEmoji.maxLength = 8;
  const newName = document.createElement('input');
  newName.placeholder = 'New quick button';
  const newCal = document.createElement('input');
  newCal.type = 'number';
  newCal.placeholder = 'Calories';
  newCal.min = '1';
  const add = button(`${s().emojiFood} Add`);
  add.addEventListener('click', () => {
    try {
      api.addFood(newName.value, Number(newCal.value), newEmoji.value);
      newEmoji.value = '';
      newName.value = '';
      newCal.value = '';
    } catch (error) { showToast(error.message, 'error'); }
  });
  addRow.append(newEmoji, newName, newCal, add);
  foods.appendChild(addRow);
  state.foods.forEach(food => foods.appendChild(saveFoodRow(food)));
  content.appendChild(foods);

  const library = panel(`${s().emojiSearch} Food Library`);
  const libraryHelp = document.createElement('p');
  libraryHelp.className = 'settings-note';
  libraryHelp.textContent = 'Searchable foods used inside Add Food. These do not appear as quick buttons on the main screen.';
  library.appendChild(libraryHelp);
  const libraryAdd = document.createElement('div');
  libraryAdd.className = 'library-add-row';
  const libEmoji = document.createElement('input');
  libEmoji.placeholder = s().emojiFood;
  libEmoji.maxLength = 8;
  const libName = document.createElement('input');
  libName.placeholder = 'Food name';
  const libAmount = document.createElement('input');
  libAmount.placeholder = 'Amount / serving';
  const libCalories = document.createElement('input');
  libCalories.type = 'number';
  libCalories.min = '1';
  libCalories.placeholder = 'kcal';
  const libAddButton = button('＋ Add');
  libAddButton.addEventListener('click', () => {
    try {
      api.addLibraryItem(libName.value, libAmount.value, Number(libCalories.value), libEmoji.value);
      libEmoji.value = '';
      libName.value = '';
      libAmount.value = '';
      libCalories.value = '';
    } catch (error) { showToast(error.message, 'error'); }
  });
  libraryAdd.append(libEmoji, libName, libAmount, libCalories, libAddButton);
  library.appendChild(libraryAdd);
  if (!state.library.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No library items loaded yet. You can add them here or paste rows into the library sheet tab.';
    library.appendChild(empty);
  }
  state.library.forEach(item => library.appendChild(libraryRow(item)));
  content.appendChild(library);

  const backup = panel('💾 Backup & Data');
  const importNote = document.createElement('p');
  importNote.className = 'settings-note';
  importNote.textContent = 'Phone backup import never deletes your Food Library. You can keep your newer Quick Add buttons or replace them with the older phone buttons.';
  backup.appendChild(importNote);
  const exportButton = button('📤 Export Android-Compatible Backup', 'btn-outline full-button');
  exportButton.addEventListener('click', async () => {
    const data = await api.exportData();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    link.download = 'chrisfit-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  });
  const importButton = button('📥 Import Phone Backup', 'btn-outline full-button');
  importButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const count = `${data.entries?.length || 0} entries, ${data.foods?.length || 0} phone quick buttons and ${data.weights?.length || 0} weights`;
        const preserveFoods = confirm(
          `Import ${count}?\n\nRecommended: press OK to KEEP your current web Quick Add buttons and emoji, and import only the phone history/weights.\n\nPress Cancel to choose exact phone restore instead. Your Food Library is never removed.`
        );
        if (preserveFoods) {
          await api.importData(data, { preserveFoods: true });
          showToast('Phone history imported; quick buttons kept', 'success', 4000);
          return;
        }
        if (confirm('Replace your current Quick Add buttons with the older buttons from the phone backup?')) {
          await api.importData(data, { preserveFoods: false });
          showToast('Phone backup imported; quick buttons replaced', 'success', 4000);
        }
      } catch (error) { showToast(error.message || 'Import failed', 'error', 4000); }
    });
    input.click();
  });
  const reset = button('⚠️ Reset Entries, Quick Buttons & Weights', 'btn-red full-button');
  reset.addEventListener('click', async () => {
    if (confirm('Delete all entries, quick buttons and weights from the cloud sheet? The Food Library remains available.')) {
      await api.resetAllData();
      showToast('Tracking data reset; library kept', 'success');
    }
  });
  backup.append(exportButton, importButton, reset);
  content.appendChild(backup);

  const debug = panel('🛠️ Connection Debug');
  debug.classList.add('diagnostic-panel');
  const info = api.getConnectionInfo();
  const status = document.createElement('p');
  status.className = 'diagnostic-status';
  status.textContent = `Mode: ${info.mode} · Pending local changes: ${info.pendingChanges} · State: ${info.syncPhase} · Timeout: ${Math.round(info.timeoutMs / 1000)}s`;
  const endpoint = document.createElement('p');
  endpoint.className = 'diagnostic-endpoint';
  endpoint.textContent = `Endpoint: ${info.endpoint}`;
  const output = document.createElement('textarea');
  output.className = 'diagnostic-output';
  output.readOnly = true;
  output.placeholder = 'Run the connection test to see exact results.';
  const actions = document.createElement('div');
  actions.className = 'diagnostic-actions';
  const run = button('▶️ Run Connection Test', 'btn-outline');
  const copy = button('📋 Copy Debug Report', 'btn-outline');
  const discard = button('🧹 Discard Unsynced Local Changes', 'btn-red');
  const reportState = { day: reports.getConnectionReportDates()[0] || '' };
  const reportIntro = document.createElement('p');
  reportIntro.className = 'settings-note';
  reportIntro.textContent = 'Local error reports are saved only on this device and kept for the most recent 5 error days.';
  const reportMount = document.createElement('div');
  reportMount.className = 'diagnostic-report-mount';
  renderConnectionReports_(reportMount, reportState);
  run.addEventListener('click', async () => {
    run.disabled = true;
    output.value = 'Testing…';
    try {
      output.value = await api.runConnectionDebugTest();
      showToast('Connection test finished', 'info');
    } catch (error) {
      reports.recordConnectionReport({ source: 'settings', label: 'Run Connection Test crashed', action: 'runConnectionDebugTest', error, info: api.getConnectionInfo() });
      output.value = `Connection test crashed before it could finish.\n\n${error.message || String(error)}`;
      showToast('Connection test crashed — report saved', 'error', 4200);
    } finally {
      run.disabled = false;
      reportState.day = reports.getConnectionReportDates()[0] || reportState.day;
      renderConnectionReports_(reportMount, reportState);
    }
  });
  copy.addEventListener('click', async () => {
    const fallbackReport = reports.getConnectionReports()[0];
    await copyText_(output.value || reports.formatConnectionReport(fallbackReport), 'Debug report copied');
  });
  discard.addEventListener('click', () => api.discardPendingChanges());
  actions.append(run, copy, discard);
  debug.append(status, endpoint, actions, output, reportIntro, reportMount);
  content.appendChild(debug);

  const notes = panel('ℹ️ Release Notes');
  notes.classList.add('release-notes');
  notes.innerHTML += `<p><strong>ChrisFit Web · v2.15</strong></p><p>Written and developed by Christopher Zachary Tyler · CINAEDVS Studios · 2026</p><ul><li>Added local connection error reports to Settings, grouped by error date and kept for the most recent 5 error days on this device.</li><li>Connection test now runs requests in parallel and uses the same timeout as app reconnect.</li><li>Startup, date-load, sync and reconnect failures save copyable reports locally.</li></ul>`;
  content.appendChild(notes);

  container.appendChild(content);
  return container;
}
