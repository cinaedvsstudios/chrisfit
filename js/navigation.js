/*
  navigation.js

  Simple navigation state for the ChrisFit web app.  The app has
  three top‑level screens – main, history and settings – and the
  currently active screen is stored in this module.  Consumers can
  query the current screen via `getActiveScreen()` and react to
  changes by subscribing with `onNavigate()`.  Calling `navigate()`
  updates the state and notifies subscribers.
*/

// Current active screen ("main" by default)
let activeScreen = 'main';

// Set of listener functions to be invoked when navigation changes
const listeners = new Set();

/**
 * Navigate to a different screen.  Updates the internal state and
 * notifies all registered listeners.  Valid screens are "main",
 * "history" and "settings".
 *
 * @param {string} screen The screen name to show
 */
export function navigate(screen) {
  activeScreen = screen;
  for (const fn of listeners) {
    try {
      fn(activeScreen);
    } catch (_) {
      // ignore listener errors
    }
  }
}

/**
 * Get the name of the current active screen.
 *
 * @returns {string}
 */
export function getActiveScreen() {
  return activeScreen;
}

/**
 * Register a callback to be invoked whenever the active screen
 * changes.  Callbacks receive the new screen name as their sole
 * argument.  Callbacks are not removed automatically; if you no
 * longer need to listen then do nothing and GC will clean them up.
 *
 * @param {Function} fn
 */
export function onNavigate(fn) {
  listeners.add(fn);
}