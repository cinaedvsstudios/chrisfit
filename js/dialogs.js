/*
  dialogs.js

  Centralised modal dialog helpers for the ChrisFit web app.  This
  module provides functions to present forms for adding entries and
  weights.  Each function builds its own DOM elements, attaches
  event handlers and inserts the modal into the document body.  When
  the user saves a record the appropriate API function is called and
  the modal is closed.  Basic validation is performed to ensure
  required fields are present.
*/

import { state } from './state.js';
import * as api from './api.js';

// Helper to create a labelled numeric input.  Returns an object with
// the container element and a reference to the input element.  A
// default value can be provided which will be assigned to the input.
function createLabeledInput(labelText, defaultValue = '') {
  const container = document.createElement('div');
  container.className = 'form-group';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = defaultValue;
  input.style.width = '100%';
  container.appendChild(label);
  container.appendChild(input);
  return { container, input };
}

/**
 * Display a modal dialog to collect details for a new entry.  Users
 * enter a name, calorie value and optionally check a box to mark it
 * as a burn (negative calories).  When saving, the entry is sent
 * through the API and the modal is removed.
 */
export function showEntryDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h2');
  title.textContent = 'Add Entry';
  modal.appendChild(title);

  const nameGroup = createLabeledInput('Name');
  const calGroup = createLabeledInput('Calories');
  modal.appendChild(nameGroup.container);
  modal.appendChild(calGroup.container);

  // Checkbox to mark an entry as a burn.  Negative calories represent
  // burned calories in the ChrisFit domain model.
  const burnToggle = document.createElement('label');
  burnToggle.style.display = 'flex';
  burnToggle.style.alignItems = 'center';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.marginRight = '0.5rem';
  burnToggle.appendChild(checkbox);
  burnToggle.appendChild(document.createTextNode('Burn'));
  modal.appendChild(burnToggle);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'actions';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.className = 'btn-outline';
  cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button');
  save.textContent = 'Save';
  save.className = 'btn-green';
  save.addEventListener('click', async () => {
    const name = nameGroup.input.value.trim();
    const cal = parseInt(calGroup.input.value, 10);
    if (!name || isNaN(cal)) {
      alert('Enter name and calories');
      return;
    }
    const finalCal = checkbox.checked ? -cal : cal;
    await api.addEntry(state.selectedDate, name, finalCal);
    overlay.remove();
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/**
 * Display a modal dialog to collect a new weight measurement.  The
 * selected date is taken from the global state and the weight is
 * stored via the API.  Validation ensures a numeric value is
 * provided.
 */
export function showWeightDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h2');
  title.textContent = 'Add Weight';
  modal.appendChild(title);

  const inputGroup = createLabeledInput('Weight (kg)');
  inputGroup.input.type = 'number';
  modal.appendChild(inputGroup.container);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.className = 'btn-outline';
  cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button');
  save.textContent = 'Save';
  save.className = 'btn-green';
  save.addEventListener('click', async () => {
    const val = parseFloat(inputGroup.input.value);
    if (isNaN(val)) {
      alert('Enter a weight');
      return;
    }
    await api.addWeight(state.selectedDate, val);
    overlay.remove();
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}