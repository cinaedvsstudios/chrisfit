import { state, showToast } from './state.js';
import * as api from './api.js';
import * as calc from './calculations.js';
import * as dateUtils from './date-utils.js';

function icons() { return state.settings; }
function field(labelText, type = 'text', value = '') {
  const label = document.createElement('label');
  label.className = 'form-group';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  label.append(span, input);
  return { label, input };
}
function modal(title) {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  const box = document.createElement('section'); box.className = 'modal';
  const heading = document.createElement('h2'); heading.textContent = title;
  box.appendChild(heading); overlay.appendChild(box); document.body.appendChild(overlay);
  return { overlay, box };
}
function footer(overlay, saveLabel, onSave) {
  const actions = document.createElement('div'); actions.className = 'modal-actions';
  const cancel = document.createElement('button'); cancel.className = 'btn-outline'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button'); save.className = 'btn-green'; save.textContent = saveLabel; save.addEventListener('click', onSave);
  actions.append(cancel, save); return actions;
}
function validName(input) {
  const value = input.value.trim();
  if (!value) { showToast('Please enter a name before saving.', 'error', 3000); input.focus(); return null; }
  return value;
}
function validPositiveNumber(input, label = 'calories') {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) { showToast(`Please enter valid ${label}.`, 'error', 3000); input.focus(); return null; }
  return value;
}

export function showEntryDialog(mode = 'food', existing = null) {
  const editing = Boolean(existing);
  const initialBurn = existing ? Number(existing.calories) < 0 : mode === 'burn';
  const { overlay, box } = modal(`${editing ? icons().emojiEdit + ' Edit Entry' : initialBurn ? icons().emojiBurn + ' Add Burn' : icons().emojiFood + ' Add Food'}`);
  const search = field(`${icons().emojiSearch} Search saved foods`, 'search');
  const suggestions = document.createElement('div'); suggestions.className = 'food-suggestions';
  if (!initialBurn && !editing) {
    box.append(search.label, suggestions);
    const updateSuggestions = () => {
      const query = search.input.value.trim().toLowerCase();
      suggestions.innerHTML = '';
      if (!query) return;
      state.foods.filter(food => food.active && food.name.toLowerCase().includes(query)).slice(0, 8).forEach(food => {
        const choice = document.createElement('button');
        choice.className = 'suggestion-button';
        choice.textContent = `${icons().emojiFood} ${food.name} · ${food.calories}`;
        choice.addEventListener('click', () => { name.input.value = food.name; calories.input.value = food.calories; suggestions.innerHTML = ''; });
        suggestions.appendChild(choice);
      });
    };
    search.input.addEventListener('input', updateSuggestions);
  }
  const name = field('Name', 'text', existing?.name || '');
  const calories = field('Calories', 'number', existing ? Math.abs(Number(existing.calories)) : '');
  calories.input.min = '1';
  const burnLabel = document.createElement('label'); burnLabel.className = 'checkbox-row';
  const burn = document.createElement('input'); burn.type = 'checkbox'; burn.checked = initialBurn;
  burnLabel.append(burn, document.createTextNode(' Save as burn (negative calories)'));
  box.append(name.label, calories.label, burnLabel);
  if (!editing && initialBurn) {
    const estimate = document.createElement('button');
    estimate.className = 'btn-soft full-button';
    estimate.textContent = `${icons().emojiBurn} Estimate Total Burn to Midnight`;
    estimate.addEventListener('click', () => { overlay.remove(); showEstimateDialog(); });
    box.appendChild(estimate);
  }
  box.appendChild(footer(overlay, editing ? `${icons().emojiEdit} Update` : 'Save', () => {
    const cleanName = validName(name.input); const value = validPositiveNumber(calories.input);
    if (!cleanName || value === null) return;
    try {
      const signed = burn.checked ? -Math.abs(value) : Math.abs(value);
      if (editing) api.updateEntry(existing.id, { date: existing.date, name: cleanName, calories: signed });
      else api.addEntry(state.selectedDate, cleanName, signed);
      overlay.remove();
    } catch (error) { showToast(error.message, 'error', 3200); }
  }));
  name.input.focus();
}

function showEstimateDialog() {
  const { overlay, box } = modal(`${icons().emojiBurn} Estimate Total Burn`);
  const help = document.createElement('p'); help.className = 'modal-help';
  help.textContent = 'Enter the total burn your health app shows right now. ChrisFit adds only the remaining hours at your BMR pace until midnight.';
  const current = field('Current total burn shown now', 'number'); current.input.min = '1';
  const preview = document.createElement('div'); preview.className = 'estimate-preview';
  const update = () => {
    const value = Number(current.input.value);
    if (!Number.isFinite(value) || value <= 0) { preview.textContent = ''; return; }
    const result = calc.estimateBurnToMidnight(value, state.settings.bmr);
    preview.innerHTML = `<div>Current burn: <strong>${Math.round(value)}</strong></div><div>Remaining BMR burn: <strong>+${result.remainingBaseline}</strong></div><div class="estimate-total">Estimated final burn: <strong>${result.total}</strong></div>`;
  };
  current.input.addEventListener('input', update);
  box.append(help, current.label, preview);
  box.appendChild(footer(overlay, 'Save Estimate', () => {
    const value = validPositiveNumber(current.input, 'current burn'); if (value === null) return;
    const result = calc.estimateBurnToMidnight(value, state.settings.bmr);
    if (api.replaceBurnWithEstimate(state.selectedDate, result.total)) overlay.remove();
  }));
  current.input.focus();
}

export function showWeightDialog(existing = null) {
  const editing = Boolean(existing);
  const { overlay, box } = modal(`${icons().emojiWeight} ${editing ? 'Edit Weight' : 'Add Weight'}`);
  const date = field('Date (DD-MM-YYYY)', 'text', dateUtils.formatDisplay(existing?.date || state.selectedDate));
  const weight = field('Weight (kg)', 'number', existing?.value ?? ''); weight.input.step = '0.1'; weight.input.min = '1';
  box.append(date.label, weight.label);
  box.appendChild(footer(overlay, editing ? 'Update Weight' : 'Save Weight', () => {
    const chosen = dateUtils.parseDisplayDate(date.input.value);
    const value = validPositiveNumber(weight.input, 'weight');
    if (!chosen) { showToast('Use date format DD-MM-YYYY.', 'error', 3000); date.input.focus(); return; }
    if (value === null) return;
    if (editing) api.updateWeight(existing.id, { date: dateUtils.toIso(chosen), value }); else api.addWeight(chosen, value);
    overlay.remove();
  }));
  weight.input.focus();
}
