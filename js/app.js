/*
  app.js

  Main entry point for the ChrisFit web application.  This module
  performs initial data loading from the backend, registers render
  callbacks for state and navigation changes and triggers the
  rendering of the UI.  All presentation logic is delegated to
  separate modules.  See ui.js for details.
*/

import { state, subscribe } from './state.js';
import * as api from './api.js';
import { onNavigate } from './navigation.js';
import { render } from './ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  // Subscribe render() to state and navigation changes.  Whenever
  // state.notify() or navigate() is invoked the UI will be rebuilt.
  subscribe(render);
  onNavigate(render);
  // Load initial data from the configured API.  Settings must be
  // loaded before foods and entries because defaults depend on
  // settings values.
  await api.fetchSettings();
  await api.fetchFoods();
  await api.fetchEntriesByDate(state.selectedDate);
  await api.fetchAllEntries();
  await api.fetchWeights();
  // Render the initial view.  Without this call nothing appears on
  // first load because no state change has occurred yet.
  render();
});