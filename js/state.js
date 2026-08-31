/* Shared runtime state and defaults for ChrisFit Web. */
export const defaultSettings = Object.freeze({
  id: 1,
  dailyCalories: 1500,
  dailyBurnTarget: 2500,
  dailyDeficit: 500,
  bmr: 2000,
  emojiFood: '🥦',
  emojiBurn: '🔥',
  emojiDeficit: '📉',
  emojiWeight: '⚖️',
  emojiBmr: '⚡',
  emojiHistory: '📜',
  emojiSettings: '⚙️',
  emojiPrevious: '⬅️',
  emojiNext: '➡️',
  emojiEdit: '✏️',
  emojiDelete: '🗑️',
  emojiSheet: '📊',
  emojiSearch: '🔎',
  googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM/edit?usp=sharing'
});

export const state = {
  selectedDate: new Date(),
  entries: [],
  entriesFull: [],
  foods: [],
  library: [],
  guidance: [],
  weights: [],
  settings: { ...defaultSettings },
  sync: { phase: 'idle', pending: 0, message: '' },
  toast: null,
  listeners: new Set()
};

export function subscribe(fn) { state.listeners.add(fn); }
export function notify() { for (const fn of state.listeners) fn(); }
export function setState(key, value) { state[key] = value; notify(); }
export function setSync(phase, pending = 0, message = '') { state.sync = { phase, pending, message }; notify(); }

let toastTimeout = null;
export function showToast(message, type = 'info', duration = 2600) {
  const id = Date.now();
  state.toast = { id, message, type };
  notify();
  if (toastTimeout) clearTimeout(toastTimeout);
  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      if (state.toast && state.toast.id === id) { state.toast = null; notify(); }
    }, duration);
  }
}
