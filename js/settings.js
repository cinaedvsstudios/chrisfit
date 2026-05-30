import { state, defaultSettings, showToast } from './state.js';
import * as api from './api.js';
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
  status.textContent = `Mode: ${info.mode} · Pending local changes: ${info.pendingChanges} · State: ${info.syncPhase}`;
  const endpoint = document.createElement('p');
  endpoint.className = 'diagnostic-endpoint';
  endpoint.textContent = `Endpoint: ${info.endpoint}`;
  const output = document.createElement('textarea');
  output.className = 'diagnostic-output';
  output.readOnly = true;
  output.placeholder = 'Run the connection test to see exact results.';
  const run = button('▶️ Run Connection Test', 'btn-outline');
  run.addEventListener('click', async () => { output.value = 'Testing…'; output.value = await api.runConnectionDebugTest(); });
  const copy = button('📋 Copy Debug Report', 'btn-outline');
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(output.value); showToast('Debug report copied', 'success'); });
  const discard = button('🧹 Discard Unsynced Local Changes', 'btn-red');
  discard.addEventListener('click', () => api.discardPendingChanges());
  debug.append(status, endpoint, run, copy, discard, output);
  content.appendChild(debug);

  const notes = panel('ℹ️ Release Notes');
  notes.classList.add('release-notes');
  notes.innerHTML += `<p><strong>ChrisFit Web · v2.6</strong></p><p>Written and developed by Christopher Zachary Tyler · CINAEDVS Studios · 2026</p><ul><li>Weight card now carries forward the most recent weigh-in on or before the selected date, without showing future weights on older dates.</li><li>Weight History is grouped into expandable months.</li><li>Added a separate Food Library tab for Add Food search results without cluttering Quick Add buttons.</li><li>Added individual emoji support for Quick Add foods and Food Library records.</li><li>History and daily entries automatically display matching food emoji while storing clean entry names.</li><li>Phone history import can preserve the newly configured web Quick Add buttons and never removes the Food Library.</li><li>Retains v2.4 History weekly-average comparison and selected-week auto-expand.</li></ul>`;
  content.appendChild(notes);

  container.appendChild(content);
  return container;
}
