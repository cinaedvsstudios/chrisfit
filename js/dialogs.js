/*
  Entry and weight dialogs. New records require a meaningful name; imported
  historic blank names are displayed but not silently recreated.
*/
import { state, showToast } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';

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
  return { overlay, modal, title };
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
  return { row, save };
}

export function showFoodDialog() {
  const { overlay, modal } = modalBase('Add Food');
  const name = field('Name', 'text');
  name.input.placeholder = 'e.g. Lunch';
  const calories = field('Calories', 'number');
  calories.input.placeholder = '0';
  modal.append(name.group, calories.group);
  const formActions = actions(overlay, async () => {
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
    await api.addEntry(state.selectedDate, cleanName, Math.abs(value));
    overlay.remove();
  });
  modal.appendChild(formActions.row);
  name.input.focus();
}

export function showBurnDialog() {
  const { overlay, modal, title } = modalBase('Add Burn');
  const selectedIso = dateUtils.toIso(state.selectedDate);
  const todayIso = dateUtils.toIso(new Date());

  const modeRow = document.createElement('div');
  modeRow.className = 'dialog-mode-switch';
  const manualButton = document.createElement('button');
  manualButton.type = 'button';
  manualButton.className = 'active';
  manualButton.textContent = 'Manual Burn';
  const estimateButton = document.createElement('button');
  estimateButton.type = 'button';
  estimateButton.textContent = 'Estimate to Midnight';
  modeRow.append(manualButton, estimateButton);
  modal.appendChild(modeRow);

  const manualPanel = document.createElement('div');
  const name = field('Name', 'text');
  name.input.placeholder = 'e.g. Walk or Gym';
  const calories = field('Calories burned', 'number');
  calories.input.placeholder = '0';
  manualPanel.append(name.group, calories.group);

  const estimatePanel = document.createElement('div');
  estimatePanel.className = 'hidden';
  const estimateIntro = document.createElement('p');
  estimateIntro.className = 'dialog-note';
  estimateIntro.textContent = 'Enter the total burn currently shown in your health app. ChrisFit adds only your remaining BMR-paced burn until midnight.';
  const currentBurn = field('Current total burn shown now', 'number');
  const result = document.createElement('div');
  result.className = 'estimate-result';
  estimatePanel.append(estimateIntro, currentBurn.group, result);

  modal.append(manualPanel, estimatePanel);
  let mode = 'manual';
  let calculation = null;

  function renderEstimate() {
    const current = Number.parseInt(currentBurn.input.value, 10);
    if (!Number.isFinite(current) || current <= 0) {
      result.textContent = 'Enter your current total burn to calculate an estimate.';
      return;
    }
    calculation = calc.estimateBurnToMidnight(current, state.settings?.bmr ?? 2000);
    result.innerHTML = `<div><span>Remaining BMR burn</span><strong>+${calculation.remainingBaseline}</strong></div><div class="estimate-total"><span>Estimated total burn</span><strong>${calculation.total}</strong></div>`;
  }
  currentBurn.input.addEventListener('input', renderEstimate);

  manualButton.addEventListener('click', () => {
    mode = 'manual';
    title.textContent = 'Add Burn';
    manualButton.classList.add('active');
    estimateButton.classList.remove('active');
    manualPanel.classList.remove('hidden');
    estimatePanel.classList.add('hidden');
    name.input.focus();
  });
  estimateButton.addEventListener('click', () => {
    mode = 'estimate';
    title.textContent = 'Estimate Total Burn';
    estimateButton.classList.add('active');
    manualButton.classList.remove('active');
    manualPanel.classList.add('hidden');
    estimatePanel.classList.remove('hidden');
    if (selectedIso !== todayIso) {
      result.textContent = 'Estimates can only be saved for today, because they use the current time.';
      currentBurn.input.disabled = true;
    } else {
      currentBurn.input.disabled = false;
      renderEstimate();
      currentBurn.input.focus();
    }
  });

  const formActions = actions(overlay, async () => {
    if (mode === 'manual') {
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
      await api.addEntry(state.selectedDate, cleanName, -Math.abs(value));
      overlay.remove();
      return;
    }

    if (selectedIso !== todayIso) {
      showToast('A live estimate can only be saved for today.', 'error', 3000);
      return;
    }
    const current = Number.parseInt(currentBurn.input.value, 10);
    if (!Number.isFinite(current) || current <= 0) {
      showToast('Enter your current health-app burn value.', 'error', 3000);
      currentBurn.input.focus();
      return;
    }
    calculation = calc.estimateBurnToMidnight(current, state.settings?.bmr ?? 2000);
    const otherBurns = state.entries.filter(entry => Number(entry.calories) < 0 && !['BMR', 'Estimated Total Burn'].includes(entry.name));
    const warning = otherBurns.length
      ? '\n\nThis day already contains another burn entry, which may double-count burn when combined with a total-burn estimate.'
      : '';
    const confirmed = confirm(`Save Estimated Total Burn as -${calculation.total}?\n\nThis replaces any BMR or previous Estimated Total Burn entry for today to avoid double counting.${warning}`);
    if (!confirmed) return;
    await api.saveEstimatedTotalBurn(state.selectedDate, calculation.total);
    overlay.remove();
  });
  modal.appendChild(formActions.row);
  name.input.focus();
}

export function showWeightDialog() {
  const { overlay, modal } = modalBase('Add Weight');
  const weight = field('Weight (kg)', 'number');
  weight.input.step = '0.1';
  modal.appendChild(weight.group);
  const formActions = actions(overlay, async () => {
    const value = Number.parseFloat(weight.input.value);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Please enter a valid weight.', 'error', 3000);
      weight.input.focus();
      return;
    }
    await api.addWeight(state.selectedDate, value);
    overlay.remove();
  });
  modal.appendChild(formActions.row);
  weight.input.focus();
}
