/*
  ChrisFit visible-date rule:
  - Storage/API dates remain yyyy-MM-dd.
  - All user-facing dates and typed input use DD-MM-YYYY.
*/

const pad2 = value => String(value).padStart(2, '0');

export function toIso(date) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

export function parseIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!match) return null;
  const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(value.getTime()) ? null : value;
}

export function formatDisplay(dateOrIso) {
  const value = dateOrIso instanceof Date ? dateOrIso : parseIso(dateOrIso);
  if (!value) return '';
  return `${pad2(value.getDate())}-${pad2(value.getMonth() + 1)}-${value.getFullYear()}`;
}

export function parseDisplayDate(display) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(display || '').trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const value = new Date(year, month - 1, day);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return null;
  return value;
}

export function getDayName(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
}

export function getDisplayDate(date) {
  return formatDisplay(date);
}

export function formatHistoryLabel(iso) {
  const value = parseIso(iso);
  if (!value) return '';
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(value).toUpperCase();
  return `${weekday} ${formatDisplay(value)}`;
}

export function getWeekStart(dateOrIso) {
  const date = dateOrIso instanceof Date ? new Date(dateOrIso) : parseIso(dateOrIso);
  if (!date) return '';
  const day = date.getDay();
  date.setDate(date.getDate() + ((day === 0 ? -6 : 1) - day));
  return toIso(date);
}

export function getWeekEnd(weekStartIso) {
  const date = parseIso(weekStartIso);
  if (!date) return '';
  date.setDate(date.getDate() + 6);
  return toIso(date);
}

export function getMonthKey(iso) {
  return String(iso || '').slice(0, 7);
}

export function formatMonthHeading(monthKey) {
  const date = parseIso(`${monthKey}-01`);
  return date ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date).toUpperCase() : monthKey;
}
