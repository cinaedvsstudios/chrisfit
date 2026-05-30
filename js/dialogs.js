/*
  Entry and weight dialogs. New records require a meaningful name;
  imported historical blank names are left untouched for backup fidelity.
*/
import { state, showToast } from './state.js';
import * as api from './api.js';

function field(labelText, type = 'text', defaultValue = '') {
  const group = document.createElement('label');
  group.className = 'form-group';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = defaultValue;
  if (type === 'number') input.min = '0';
  group.append(label, input);
  return { group, input };
}

function modalBase(titleText) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('section');
  modal.className = 'modal';
  const title = document.createElement('h2');
  title.textContent = titleText;
  modal.appendChild(title);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return { overlay, modal };
}

function actions(overlay, onSave) {
  const row = document.createElement('div');
  row.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn-outline';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn-green';
  save.textContent = 'Save';
  save.addEventListener('click', onSave);
  row.append(cancel, save);
  return row;
}

export function showEntryDialog(mode = 'food') {
  const isBurn = mode === 'burn';
  const { overlay, modal } = modalBase(isBurn ? 'Add Burn' : 'Add Food');
  const name = field('Name', 'text');
  name.input.placeholder = isBurn ? 'e.g. Walk or Gym' : 'e.g. Lunch';
  const calories = field('Calories', 'number');
  calories.input.placeholder = '0';

  const burnRow = document.createElement('label');
  burnRow.className = 'checkbox-row';
  const burnCheckbox = document.createElement('input');
  burnCheckbox.type = 'checkbox';
  burnCheckbox.checked = isBurn;
  burnRow.append(burnCheckbox, document.createTextNode(' Save as burn (negative calories)'));

  modal.append(name.group, calories.group, burnRow);
  modal.appendChild(actions(overlay, async () => {
    const cleanName = name.input.value.trim();
    const value = Number.parseInt(calories.input.value, 10);
    if (!cleanName) {
      showToast('Please enter a name before saving.', 'error', 3000);
      name.input.focus();
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Please enter calories greater than zero.', 'error', 3000);
      calories.input.focus();
      return;
    }
    try {
      await api.addEntry(state.selectedDate, cleanName, burnCheckbox.checked ? -Math.abs(value) : Math.abs(value));
      overlay.remove();
    } catch (error) {
      showToast(error.message || 'Could not save entry.', 'error', 3500);
    }
  }));
  name.input.focus();
}

export function showWeightDialog() {
  const { overlay, modal } = modalBase('Add Weight');
  const weight = field('Weight (kg)', 'number');
  weight.input.step = '0.1';
  modal.appendChild(weight.group);
  modal.appendChild(actions(overlay, async () => {
    const value = Number.parseFloat(weight.input.value);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Please enter a valid weight.', 'error', 3000);
      weight.input.focus();
      return;
    }
    await api.addWeight(state.selectedDate, value);
    overlay.remove();
  }));
  weight.input.focus();
}
