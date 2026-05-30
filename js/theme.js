const KEY = 'chrisfit.theme.preference';

export function getThemePreference() {
  return localStorage.getItem(KEY) || 'system';
}

export function setThemePreference(preference) {
  localStorage.setItem(KEY, preference);
  applyTheme();
}

export function applyTheme() {
  const preference = getThemePreference();
  const dark = preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
}

export function registerSystemThemeListener() {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener?.('change', () => {
    if (getThemePreference() === 'system') applyTheme();
  });
}
