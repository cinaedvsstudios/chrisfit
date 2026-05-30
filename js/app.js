import { subscribe } from './state.js';
import * as api from './api.js';
import { onNavigate } from './navigation.js';
import { render } from './ui.js';
import { applyTheme, registerSystemThemeListener } from './theme.js';

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  registerSystemThemeListener();
  subscribe(render);
  onNavigate(render);

  // Draw immediately using safe defaults; this prevents a blank/black page if
  // loading is slow or the endpoint fails temporarily.
  render();
  try {
    await api.initialise();
  } catch (error) {
    console.error('Initial load failed:', error);
    render();
  }
});

window.addEventListener('online', () => api.flushPending());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') api.flushPending();
});
