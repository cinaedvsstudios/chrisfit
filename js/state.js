/*
  Application state management.

  The state object centralises all runtime data required by the
  application.  Components read from and write to this object.  When a
  property changes the registered listeners are notified so they can
  re-render the UI.  This rudimentary observer pattern avoids the need
  for a full framework while keeping concerns separated.
*/

export const state = {
  selectedDate: new Date(),
  entries: [],
  foods: [],
  weights: [],
  settings: null,
  listeners: new Set()
};

/**
 * Register a listener to be called whenever state changes.
 * @param {Function} fn
 */
export function subscribe(fn) {
  state.listeners.add(fn);
}

/**
 * Notify all listeners of a state change.
 */
export function notify() {
  for (const fn of state.listeners) {
    fn();
  }
}

/**
 * Update a state property and emit change notifications.
 * @param {string} key
 * @param {*} value
 */
export function setState(key, value) {
  state[key] = value;
  notify();
}