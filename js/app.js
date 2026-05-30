/* ChrisFit Web application entry point. */
import { subscribe } from './state.js';
import * as api from './api.js';
import { onNavigate } from './navigation.js';
import { render } from './ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  subscribe(render);
  onNavigate(render);
  render();
  try {
    await api.initialise();
  } catch (error) {
    console.error('Initial load failed:', error);
    const app = document.getElementById('app');
    if (app) app.innerHTML = '<div class="load-error">Could not load data from Google Sheets. Refresh or check the Apps Script connection.</div>';
  }
});

window.addEventListener('online', () => api.flushPending());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') api.flushPending();
});
