/*
  settings.js

  Rendering for the settings screen.  The settings view allows the
  user to adjust daily calorie and deficit targets, set a BMR value,
  manage the list of quick‑add food buttons and perform backup or
  reset operations.  Changes are persisted via the API.  The
  structure mirrors the Android settings screen and uses simple
  labelled numeric inputs.
*/

import { state } from './state.js';
import * as api from './api.js';
import { navigate } from './navigation.js';

// Helper to create labelled numeric inputs for settings and food
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

/**
 * Build the settings screen.  Includes controls for basic targets,
 * food management and data import/export/reset.  Buttons call
 * asynchronous API functions to persist changes.  The back button
 * returns to the main screen.
 *
 * @returns {HTMLElement}
 */
export function renderSettings() {
  const container = document.createElement('div');
  container.className = 'screen settings active';

  // Header with title and close button
  const header = document.createElement('div');
  header.className = 'header';
  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.alignItems = 'center';
  const title = document.createElement('h2');
  title.textContent = 'Settings';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.className = 'btn-outline';
  closeBtn.addEventListener('click', () => navigate('main'));
  titleRow.appendChild(title);
  titleRow.appendChild(closeBtn);
  header.appendChild(titleRow);
  container.appendChild(header);

  // Scrollable content area
  const content = document.createElement('div');
  content.style.padding = '1rem';
  content.style.flex = '1';
  content.style.overflowY = 'auto';

  // Settings inputs
  const calInput = createLabeledInput('Daily Calories', state.settings?.dailyCalories ?? 1500);
  const deficitInput = createLabeledInput('Daily Deficit', state.settings?.dailyDeficit ?? 500);
  const bmrInput = createLabeledInput('BMR', state.settings?.bmr ?? 2000);
  content.appendChild(calInput.container);
  content.appendChild(deficitInput.container);
  content.appendChild(bmrInput.container);

  // Save settings button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Settings';
  saveBtn.className = 'btn-green';
  saveBtn.style.width = '100%';
  saveBtn.style.marginTop = '0.5rem';
  saveBtn.addEventListener('click', async () => {
    const s = {
      dailyCalories: parseInt(calInput.input.value, 10) || 1500,
      dailyDeficit: parseInt(deficitInput.input.value, 10) || 500,
      bmr: parseInt(bmrInput.input.value, 10) || 2000
    };
    await api.saveSettings(s);
    alert('Settings saved');
  });
  content.appendChild(saveBtn);

  // Food management section
  const foodHeader = document.createElement('h3');
  foodHeader.textContent = 'Food Buttons';
  foodHeader.style.marginTop = '1rem';
  content.appendChild(foodHeader);
  // Inputs for new food
  const foodNameInput = createLabeledInput('Food Name', '', 'text');
  const foodCalInput = createLabeledInput('Calories');
  content.appendChild(foodNameInput.container);
  content.appendChild(foodCalInput.container);
  const addFoodBtn = document.createElement('button');
  addFoodBtn.textContent = 'Add Food';
  addFoodBtn.className = 'btn-green';
  addFoodBtn.style.width = '100%';
  addFoodBtn.addEventListener('click', async () => {
    const name = foodNameInput.input.value.trim();
    const cal = parseInt(foodCalInput.input.value, 10);
    if (!name || isNaN(cal)) {
      alert('Enter name and calories');
      return;
    }
    await api.addFood(name, cal);
    foodNameInput.input.value = '';
    foodCalInput.input.value = '';
  });
  content.appendChild(addFoodBtn);
  // Existing foods list with delete buttons
  state.foods.forEach(food => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '0.25rem 0';
    const label = document.createElement('span');
    label.textContent = `${food.name} (${food.calories})`;
    const del = document.createElement('button');
    del.textContent = 'X';
    del.className = 'btn-red';
    del.addEventListener('click', async () => {
      await api.deleteFood(food.id);
    });
    row.appendChild(label);
    row.appendChild(del);
    content.appendChild(row);
  });

  // Backup section
  const backupHeader = document.createElement('h3');
  backupHeader.textContent = 'Backup';
  backupHeader.style.marginTop = '1rem';
  content.appendChild(backupHeader);
  // Export
  const exportBtn = document.createElement('button');
  exportBtn.textContent = '📤 Export Data';
  exportBtn.className = 'btn-green';
  exportBtn.style.width = '100%';
  exportBtn.addEventListener('click', async () => {
    const data = await api.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
  content.appendChild(exportBtn);
  // Import
  const importBtn = document.createElement('button');
  importBtn.textContent = '📥 Import Data';
  importBtn.className = 'btn-green';
  importBtn.style.width = '100%';
  importBtn.style.marginTop = '0.5rem';
  importBtn.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const json = JSON.parse(text);
        await api.importData(json);
        alert('Imported ✓');
      } catch (e) {
        alert(e && e.message ? e.message : 'Import failed');
      }
    });
    input.click();
  });
  content.appendChild(importBtn);
  // Reset all
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '⚠ Reset All Data';
  resetBtn.className = 'btn-red';
  resetBtn.style.width = '100%';
  resetBtn.style.marginTop = '0.5rem';
  resetBtn.addEventListener('click', async () => {
    if (confirm('Delete all data?')) {
      await api.resetAllData();
    }
  });
  content.appendChild(resetBtn);

  container.appendChild(content);
  return container;
}