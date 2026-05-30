/*
  Date utilities.

  The Android app uses several date formats: a short ISO-like form
  (yyyy-MM-dd) for storage, a more human friendly "d MMMM yyyy" for the
  header, and a compact "EEE dd-MM-yyyy" in the history tables.  These
  helpers replicate that behaviour.
*/

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const displayFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric'
});
const isoFormat = new Intl.DateTimeFormat('en-CA');
const historyFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
});

export function toIso(date) {
  return isoFormat.format(date);
}

export function getDayName(date) {
  return dayFormat.format(date);
}

export function getDisplayDate(date) {
  return displayFormat.format(date);
}

export function formatHistoryLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // e.g. "MON 01-05-2024"
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date).toUpperCase();
  const twoDigit = (n) => String(n).padStart(2, '0');
  return `${day} ${twoDigit(d)}-${twoDigit(m)}-${y}`;
}

export function getWeekStart(date) {
  // Monday as first day of week
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}