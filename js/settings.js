/*
  settings.js

  Settings, saved food buttons, backups and connection diagnostics for ChrisFit.
  The Connection Test is intentionally non-destructive: it reads data and sends
  an empty batch request only, so it can test sync without creating rows.
*/

import { state } from './state.js';
import * as api from './api.js';
import { navigate } from './navigation.js';

function createLabeledInput(labelText, defaultValue = '', type = 'number') {
  const container = document.createElement('div');
  container.className = 'form-group';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = defaultValue;
  input.style.width = '100%';
  container.appendChild(label);
  container.appendChild(input);
  return { container, input };
}

function fullWidthButton(text, className = 'btn-green') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = className;
  button.style.width = '100%';
  button.style.marginTop = '0.5rem';
  return button;
}

function createConnectionDiagnostics() {
  const panel = document.createElement('section');
  panel.className = 'diagnostic-panel';

  const heading = document.createElement('h3');
  heading.textContent = 'Connection Debug';
  panel.appendChild(heading);

  const help = document.createElement('p');
  help.className = 'diagnostic-help';
  help.textContent = 'Runs read-only checks plus an empty sync request. It will not add, import or delete spreadsheet rows.';
  panel.appendChild(help);

  const info = api.getConnectionInfo();
  const status = document.createElement('div');
  status.className = 'diagnostic-status';
  status.textContent = `Mode: ${info.mode} · Pending local changes: ${info.pendingChanges}`;
  panel.appendChild(status);

  const endpoint = document.createElement('div');
  endpoint.className = 'diagnostic-endpoint';
  endpoint.textContent = `Endpoint: ${info.endpoint}`;
  panel.appendChild(endpoint);

  const output = document.createElement('textarea');
  output.className = 'diagnostic-output';
  output.readOnly = true;
  output.placeholder = 'Press “Run Connection Test” and copy the report back into chat.';
  panel.appendChild(output);

  const runButton = fullWidthButton('Run Connection Test', 'btn-blue');
  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    runButton.textContent = 'Testing…';
    output.value = 'Running connection diagnostics…';
    try {
      output.value = await api.runConnectionDebugTest();
    } catch (error) {
      output.value = `Debug test crashed before completing:\n${error && error.stack ? error.stack : String(error)}`;
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'Run Connection Test';
    }
  });
  panel.appendChild(runButton);

  const copyButton = fullWidthButton('Copy Debug Report', 'btn-outline');
  copyButton.addEventListener('click', async () => {
    if (!output.value.trim()) {
      alert('Run the connection test first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(output.value);
      copyButton.textContent = 'Copied ✓';
      window.setTimeout(() => { copyButton.textContent = 'Copy Debug Report'; }, 1800);
    } catch (_) {
      output.focus();
      output.select();
      alert('Copy was blocked by the browser. The report is selected; press Ctrl+C.');
    }
  });
  panel.appendChild(copyButton);

  if (info.pendingChanges > 0) {
    const warning = document.createElement('p');
    warning.className = 'diagnostic-warning';
    warning.textContent = `There are ${info.pendingChanges} unsynced browser-side changes waiting to retry. Clear them before fixing sync if they were only test entries.`;
    panel.appendChild(warning);

    const discard = fullWidthButton(`Discard ${info.pendingChanges} Unsynced Local Change${info.pendingChanges === 1 ? '' : 's'}`, 'btn-red');
    discard.addEventListener('click', () => {
      const confirmed = confirm('Discard the queued unsynced changes visible in this browser? This does not delete rows already saved in Google Sheets.');
      if (!confirmed) return;
      api.discardPendingChanges();
      status.textContent = 'Mode: google-apps-script · Pending local changes: 0';
      warning.remove();
      discard.remove();
    });
    panel.appendChild(discard);
  }
  return panel;
}

export function renderSettings() {
  const container = document.createElement('div');
  container.className = 'screen settings active';

  const header = document.createElement('div');
  header.className = 'header';
  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.alignItems = 'center';
  const title = document.createElement('h2');
  title.textContent = 'Settings';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.className = 'btn-outline';
  closeBtn.addEventListener('click', () => navigate('main'));
  titleRow.append(title, closeBtn);
  header.appendChild(titleRow);
  container.appendChild(header);

  const content = document.createElement('div');
  content.className = 'settings-content';

  content.appendChild(createConnectionDiagnostics());

  const targetsHeader = document.createElement('h3');
  targetsHeader.textContent = 'Targets';
  content.appendChild(targetsHeader);

  const calInput = createLabeledInput('Daily Calories', state.settings?.dailyCalories ?? 1500);
  const deficitInput = createLabeledInput('Daily Deficit', state.settings?.dailyDeficit ?? 500);
  const bmrInput = createLabeledInput('BMR', state.settings?.bmr ?? 2000);
  content.append(calInput.container, deficitInput.container, bmrInput.container);

  const saveBtn = fullWidthButton('Save Settings');
  saveBtn.addEventListener('click', async () => {
    const settings = {
      dailyCalories: parseInt(calInput.input.value, 10) || 1500,
      dailyDeficit: parseInt(deficitInput.input.value, 10) || 500,
      bmr: parseInt(bmrInput.input.value, 10) || 2000
    };
    await api.saveSettings(settings);
    alert('Settings queued to save');
  });
  content.appendChild(saveBtn);

  const foodHeader = document.createElement('h3');
  foodHeader.textContent = 'Food Buttons';
  foodHeader.style.marginTop = '1rem';
  content.appendChild(foodHeader);
  const foodNameInput = createLabeledInput('Food Name', '', 'text');
  const foodCalInput = createLabeledInput('Calories');
  content.append(foodNameInput.container, foodCalInput.container);
  const addFoodBtn = fullWidthButton('Add Food');
  addFoodBtn.addEventListener('click', async () => {
    const name = foodNameInput.input.value.trim();
    const calories = parseInt(foodCalInput.input.value, 10);
    if (!name || Number.isNaN(calories)) {
      alert('Enter name and calories');
      return;
    }
    await api.addFood(name, calories);
    foodNameInput.input.value = '';
    foodCalInput.input.value = '';
  });
  content.appendChild(addFoodBtn);

  state.foods.forEach(food => {
    const row = document.createElement('div');
    row.className = 'settings-food-row';
    const label = document.createElement('span');
    label.textContent = `${food.name} (${food.calories})`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'X';
    del.className = 'btn-red';
    del.addEventListener('click', async () => api.deleteFood(food.id));
    row.append(label, del);
    content.appendChild(row);
  });

  const backupHeader = document.createElement('h3');
  backupHeader.textContent = 'Backup';
  backupHeader.style.marginTop = '1rem';
  content.appendChild(backupHeader);

  const exportBtn = fullWidthButton('📤 Export Data');
  exportBtn.addEventListener('click', async () => {
    const data = await api.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
  content.appendChild(exportBtn);

  const importBtn = fullWidthButton('📥 Import Data');
  importBtn.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        await api.importData(JSON.parse(await file.text()));
        alert('Imported ✓');
      } catch (error) {
        alert(error && error.message ? error.message : 'Import failed');
      }
    });
    input.click();
  });
  content.appendChild(importBtn);

  const resetBtn = fullWidthButton('⚠ Reset All Data', 'btn-red');
  resetBtn.addEventListener('click', async () => {
    if (confirm('Delete all data?')) await api.resetAllData();
  });
  content.appendChild(resetBtn);

  container.appendChild(content);
  return container;
}
