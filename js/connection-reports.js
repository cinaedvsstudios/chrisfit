import { CONFIG } from './config.js';
import { state } from './state.js';

const REPORTS_KEY = 'chrisfit.connectionReports.v1';
const MAX_REPORT_DAYS = 5;
const MAX_REPORTS = 50;
export const CONNECTION_REPORT_APP_VERSION = 'Web · v2.15';

function toLocalIsoDate_(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function safeDateTime_(value = new Date()) {
  try { return new Date(value).toISOString(); } catch (_) { return new Date().toISOString(); }
}
function readReports_() {
  try {
    const value = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}
function writeReports_(reports) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(pruneReports_(reports)));
}
function pruneReports_(reports) {
  const clean = (Array.isArray(reports) ? reports : [])
    .filter(report => report && report.id && report.day)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const keepDays = Array.from(new Set(clean.map(report => report.day))).slice(0, MAX_REPORT_DAYS);
  return clean.filter(report => keepDays.includes(report.day)).slice(0, MAX_REPORTS);
}
function safeErrorMessage_(error) {
  if (!error) return 'Unknown error';
  return String(error.message || error.name || error || 'Unknown error');
}
function safeErrorName_(error) {
  return String(error?.name || 'Error');
}
function safeErrorStack_(error) {
  return String(error?.stack || '').slice(0, 2000);
}
function sanitiseUrl_(url) {
  const text = String(url || CONFIG.baseUrl || '');
  if (!text) return '(not configured)';
  try {
    const parsed = new URL(text);
    parsed.searchParams.delete('token');
    return parsed.toString();
  } catch (_) {
    return text.replace(/([?&]token=)[^&]+/i, '$1[redacted]');
  }
}
function selectedDate_() {
  try { return toLocalIsoDate_(state.selectedDate || new Date()); } catch (_) { return '(unknown)'; }
}
function pageUrl_() {
  try { return window.location.href; } catch (_) { return '(unknown)'; }
}
function onlineState_() {
  try { return navigator.onLine ? 'online' : 'offline'; } catch (_) { return '(unknown)'; }
}
function userAgent_() {
  try { return navigator.userAgent || '(unknown)'; } catch (_) { return '(unknown)'; }
}
function makeTitle_(source, label, action) {
  const parts = [source, label || action].filter(Boolean);
  return parts.length ? parts.join(' — ') : 'Connection error';
}

export function getConnectionReports() {
  const reports = pruneReports_(readReports_());
  writeReports_(reports);
  return reports;
}
export function getConnectionReportDates() {
  return Array.from(new Set(getConnectionReports().map(report => report.day)));
}
export function deleteConnectionReport(id) {
  const before = readReports_();
  writeReports_(before.filter(report => String(report.id) !== String(id)));
}
export function clearConnectionReportsForDate(day) {
  const before = readReports_();
  writeReports_(before.filter(report => report.day !== day));
}
export function clearAllConnectionReports() {
  localStorage.removeItem(REPORTS_KEY);
}
export function recordConnectionReport({ source = 'connection', label = '', action = '', method = '', url = '', elapsedMs = null, error = null, info = null, extra = null } = {}) {
  const now = new Date();
  const report = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    day: toLocalIsoDate_(now),
    createdAt: safeDateTime_(now),
    appVersion: CONNECTION_REPORT_APP_VERSION,
    title: makeTitle_(source, label, action),
    source,
    label,
    action,
    method,
    url: sanitiseUrl_(url || info?.endpoint),
    elapsedMs: Number.isFinite(Number(elapsedMs)) ? Math.round(Number(elapsedMs)) : null,
    errorName: safeErrorName_(error),
    message: safeErrorMessage_(error),
    stack: safeErrorStack_(error),
    selectedDate: selectedDate_(),
    pageUrl: pageUrl_(),
    online: onlineState_(),
    userAgent: userAgent_(),
    syncPhase: info?.syncPhase ?? state.sync?.phase ?? '(unknown)',
    syncMessage: info?.syncMessage ?? state.sync?.message ?? '(none)',
    pendingChanges: info?.pendingChanges ?? state.sync?.pending ?? 0,
    loadedEntryRanges: info?.loadedEntryRanges ?? '(unknown)',
    extra: extra || null
  };
  writeReports_([report, ...readReports_()]);
  return report;
}
export function formatConnectionReport(report) {
  if (!report) return 'No connection report selected.';
  const lines = [
    'ChrisFit Connection Error Report',
    `Generated: ${report.createdAt || '(unknown)'}`,
    `App version: ${report.appVersion || '(unknown)'}`,
    `Title: ${report.title || '(untitled)'}`,
    `Source: ${report.source || '(unknown)'}`,
    `Action: ${report.action || '(unknown)'}`,
    `Method: ${report.method || '(unknown)'}`,
    `URL: ${report.url || '(unknown)'}`,
    `Elapsed: ${report.elapsedMs === null || report.elapsedMs === undefined ? '(unknown)' : `${report.elapsedMs} ms`}`,
    `Error: ${report.errorName || 'Error'} — ${report.message || '(none)'}`,
    `Selected date: ${report.selectedDate || '(unknown)'}`,
    `Page: ${report.pageUrl || '(unknown)'}`,
    `Online state: ${report.online || '(unknown)'}`,
    `Pending local changes: ${report.pendingChanges ?? '(unknown)'}`,
    `Sync state: ${report.syncPhase || '(unknown)'} — ${report.syncMessage || '(none)'}`,
    `Loaded entry ranges: ${report.loadedEntryRanges || '(unknown)'}`,
    `Browser: ${report.userAgent || '(unknown)'}`
  ];
  if (report.extra) lines.push('', 'Extra:', JSON.stringify(report.extra, null, 2));
  if (report.stack) lines.push('', 'Stack:', report.stack);
  return lines.join('\n');
}
