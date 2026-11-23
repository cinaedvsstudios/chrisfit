/*
 * ChrisFit browser storage manager.
 * Registry entries are based on audited app writers, never guessed from prefixes.
 * No operation clears a whole origin or alters Google Sheets.
 */
import * as api from './api.js';
import { validateCache } from './cache.js';
import { showToast } from './state.js';

const APP_ID = 'chrisfit';
const BACKUP_TYPE = 'ChrisFitBrowserStorageBackup';
const BACKUP_VERSION = 1;
const REGISTRY = [
  { key: 'chrisfit.cache.v1', category: 'User Data', label: 'Offline fitness snapshot', note: 'Google-backed entries, weights, foods, settings and sync receipts. Required for fast startup and offline use.', protected: true, status: 'Offline copy' },
  { key: 'chrisfit.pendingWrites.v3', category: 'Drafts & Unsaved Changes', label: 'Pending Google Sheets updates', note: 'Unconfirmed local changes, including food and burn entries. Never removed by cleanup.', protected: true, status: 'Awaiting sync' },
  { key: 'chrisfit.connectionReports.v1', category: 'History & Logs', label: 'Connection error reports', note: 'Local diagnostic history. Review before deleting; it does not contain fitness records.', protected: false, review: true, status: 'Reviewable' },
  { key: 'chrisfit.theme.preference', category: 'Settings & Preferences', label: 'Display theme', note: 'Light, dark or system appearance selection.', protected: true, editable: true, status: 'Local preference' },
  { key: 'chrisfit.history.customPeriod.v1', category: 'Settings & Preferences', label: 'History date-range preference', note: 'Saved start and end dates for the custom History period.', protected: true, editable: true, status: 'Local preference' }
];
const OWNED = new Map(REGISTRY.map(entry => [entry.key, entry]));
const CATEGORIES = ['User Data', 'Drafts & Unsaved Changes', 'Settings & Preferences', 'History & Logs', 'Unknown / Unclassified'];
const OPERATIONS = new Set(['entries', 'updateEntry', 'deleteEntry', 'foods', 'updateFood', 'deleteFood', 'library', 'updateLibrary', 'deleteLibrary', 'weights', 'updateWeight', 'deleteWeight', 'settings']);
let activeManager = null;

function node(tag, cls = '', label = '') {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (label !== '') item.textContent = label;
  return item;
}
function button(label, fn, cls = 'btn-outline') {
  const item = node('button', cls, label);
  item.type = 'button';
  item.addEventListener('click', fn);
  return item;
}
function formattedSize(bytes) {
  if (bytes == null) return 'Unavailable';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}
function measure(key, value) {
  try { return new Blob([key, value]).size; }
  catch (_) { return (key.length + value.length) * 2; }
}
function formatJSON(raw) {
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch (_) { return raw; }
}
function validated(key, value) {
  if (key === 'chrisfit.cache.v1') {
    try { return validateCache(JSON.parse(value)); } catch (_) { return false; }
  }
  if (key === 'chrisfit.pendingWrites.v3') {
    try {
      const data = JSON.parse(value);
      return Array.isArray(data) && data.every(op => op && OPERATIONS.has(op.type) && op.data && typeof op.data === 'object' && !Array.isArray(op.data));
    } catch (_) { return false; }
  }
  if (key === 'chrisfit.connectionReports.v1') {
    try { return Array.isArray(JSON.parse(value)); } catch (_) { return false; }
  }
  if (key === 'chrisfit.theme.preference') return ['system', 'light', 'dark'].includes(value);
  if (key === 'chrisfit.history.customPeriod.v1') {
    try {
      const d = JSON.parse(value), iso = /^\d{4}-\d{2}-\d{2}$/;
      return !!(d && iso.test(d.start) && iso.test(d.end) && d.start <= d.end);
    } catch (_) { return false; }
  }
  return false;
}
function syncSafe() {
  const info = api.getConnectionInfo();
  if (['loading', 'saving'].includes(info.syncPhase)) throw new Error('A Google sync is running. Try again when it finishes.');
  return info;
}
async function copy(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
    else {
      const field = node('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-10000px';
      document.body.appendChild(field);
      field.select();
      const success = document.execCommand('copy');
      field.remove();
      if (!success) throw new Error('Clipboard unavailable');
    }
    showToast('Copied to clipboard', 'success');
  } catch (error) { showToast('Copy failed: ' + error.message, 'error', 4000); }
}
function download(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = node('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast('Export generated; check your browser downloads', 'info');
}
async function capabilities() {
  const capabilities = [];
  function status(name, description) { capabilities.push({ name, description }); }
  try {
    const n = sessionStorage.length;
    status('sessionStorage', n + ' origin entries; no ChrisFit-owned session keys registered');
  } catch (_) { status('sessionStorage', 'Unavailable or restricted'); }
  try {
    if (typeof indexedDB?.databases === 'function') {
      const databases = await indexedDB.databases();
      status('IndexedDB', databases.length + ' origin databases; none registered as ChrisFit-owned');
    } else status('IndexedDB', 'Database enumeration not supported; none registered as ChrisFit-owned');
  } catch (_) { status('IndexedDB', 'Unavailable or restricted'); }
  try {
    if ('caches' in window) {
      const names = await window.caches.keys();
      status('Cache Storage', names.length + ' origin caches; none registered as ChrisFit-owned');
    } else status('Cache Storage', 'Unavailable');
  } catch (_) { status('Cache Storage', 'Unavailable or restricted'); }
  status('OPFS', navigator.storage && typeof navigator.storage.getDirectory === 'function'
    ? 'API available; ChrisFit does not currently register any files'
    : 'Unavailable or unsupported');
  status('Cookies', 'No JavaScript-accessible cookies are registered as ChrisFit-owned');
  return capabilities;
}

class StorageManager {
  constructor() {
    this.entries = [];
    this.unknown = [];
    this.capabilities = [];
    this.usage = null;
    this.selected = new Set();
    this.tab = 'overview';
    this.query = '';
    this.showProtected = true;
    this.onlyRemovable = false;
    this.verification = { status: 'unchecked', message: 'Not checked against Google Sheets yet.' };
    this.restoreItems = null;
    this.restoreMode = 'missing';
    this.overlay = node('div', 'storage-overlay');
    this.overlay.setAttribute('role', 'presentation');
    this.dialog = node('section', 'storage-dialog');
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', 'Storage & Cleanup');
    this.overlay.appendChild(this.dialog);
    this.onKey = event => { if (event.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.onKey);
    this.overlay.addEventListener('click', event => {
      if (event.target === this.overlay) this.close();
    });
    document.body.appendChild(this.overlay);
    this.draw();
    this.scan();
  }
  close() {
    document.removeEventListener('keydown', this.onKey);
    this.overlay.remove();
    if (activeManager === this) activeManager = null;
  }
  async scan() {
    try {
      this.entries = [];
      this.unknown = [];
      const seen = new Set();
      for (const definition of REGISTRY) {
        const value = localStorage.getItem(definition.key);
        if (value == null) continue;
        this.entries.push({ ...definition, value, bytes: measure(definition.key, value) });
        seen.add(definition.key);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || seen.has(key)) continue;
        const value = localStorage.getItem(key);
        this.unknown.push({ key, bytes: value == null ? 0 : measure(key, value), label: 'Unclassified browser entry', category: 'Unknown / Unclassified', protected: true, status: 'Ownership unknown' });
      }
      this.selected = new Set([...this.selected].filter(key => this.entries.some(entry => entry.key === key && entry.review)));
      try { this.usage = navigator.storage?.estimate ? await navigator.storage.estimate() : null; }
      catch (_) { this.usage = null; }
      this.capabilities = await capabilities();
    } catch (error) {
      this.capabilities = [{ name: 'localStorage', description: 'Browser access is restricted: ' + (error.message || error) }];
      this.entries = []; this.unknown = []; this.selected.clear();
    }
    this.draw();
  }
  totals() {
    const all = [...this.entries, ...this.unknown];
    return {
      bytes: this.entries.reduce((total, e) => total + e.bytes, 0),
      protected: all.filter(e => e.protected).length,
      review: this.entries.filter(e => e.review).length + this.unknown.length,
      verified: this.verification.status === 'verified' ? 1 : 0
    };
  }
  async verify() {
    this.verification = { status: 'checking', message: 'Comparing the complete offline snapshot with current Google data…' };
    this.draw();
    try { this.verification = await api.verifyStoredSnapshot(); }
    catch (error) { this.verification = { status: 'error', message: 'Verification failed. No data was deleted: ' + (error.message || error) }; }
    this.draw();
  }
  async remove(keys, strong = false) {
    if (!keys.length) { showToast('Nothing eligible to remove', 'info'); return; }
    const ownedKeys = keys.filter(key => OWNED.has(key));
    const all = ownedKeys.map(key => OWNED.get(key));
    if (!strong && all.some(def => def.protected)) { showToast('Protected records cannot be removed through ordinary cleanup', 'error'); return; }
    const message = 'Remove ' + ownedKeys.length + ' ChrisFit browser storage item(s) from this device?\n\nGoogle Sheets data is not deleted. This cannot necessarily be undone.';
    if (!window.confirm(message)) return;
    try {
      syncSafe();
      for (const key of ownedKeys) {
        if (key === 'chrisfit.cache.v1') api.clearLocalCache();
        else localStorage.removeItem(key);
      }
      showToast(ownedKeys.length + ' item(s) removed', 'success');
      await this.scan();
    } catch (error) { showToast('Cleanup stopped: ' + (error.message || error), 'error', 4500); }
  }
  quickClean() {
    // Current ChrisFit v2.18 has no proven disposable cache or temporary records.
    // Its cached Google snapshot is required for local-first/offline startup.
    window.alert('No confirmed disposable items were found. Your offline fitness snapshot, pending changes and preferences are protected. Connection reports can be cleared manually after review.');
  }
  clearEverything() {
    const keys = this.entries.map(e => e.key);
    if (!keys.length) { showToast('No ChrisFit browser data to reset', 'info'); return; }
    const info = api.getConnectionInfo();
    const details = keys.map(key => '• ' + OWNED.get(key).label).join('\n');
    const extra = info.pendingChanges ? '\nWARNING: ' + info.pendingChanges + ' unsynchronised change(s) could be lost.' : '';
    const typed = window.prompt('LOCAL DEVICE RESET — Google Sheets will NOT be changed.\n\nThis removes:\n' + details + extra +
      '\n\nExport a storage backup first if needed. To proceed, type DELETE CHRISFIT LOCAL DATA:');
    if (typed !== 'DELETE CHRISFIT LOCAL DATA') return;
    if (!window.confirm('Final confirmation: erase all recognised ChrisFit browser data on THIS device and reload? Your Google Sheet remains unchanged.')) return;
    try {
      syncSafe();
      if (info.pendingChanges) api.discardPendingChanges(); // Sync guard refuses uncertain/in-flight writes.
      for (const key of keys) localStorage.removeItem(key);
      window.location.reload();
    } catch (error) { showToast('Reset blocked to protect your data: ' + (error.message || error), 'error', 5000); }
  }
  exportSelection(keys = this.entries.map(e => e.key)) {
    const items = this.entries.filter(e => keys.includes(e.key)).map(e => ({ key: e.key, technology: 'localStorage', category: e.category, value: e.value }));
    if (!items.length) { showToast('No selected data to export', 'info'); return; }
    download('chrisfit-browser-storage-' + new Date().toISOString().slice(0, 10) + '.json', {
      type: BACKUP_TYPE, version: BACKUP_VERSION, appId: APP_ID, exportedAt: new Date().toISOString(),
      records: items
    });
  }
  async readBackup(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Backup exceeds the 50 MB safety limit.');
      const backup = JSON.parse(await file.text());
      if (backup.type !== BACKUP_TYPE || backup.version !== BACKUP_VERSION || backup.appId !== APP_ID || !Array.isArray(backup.records)) {
        throw new Error('This is not a compatible ChrisFit browser-storage backup.');
      }
      const unique = new Set();
      for (const record of backup.records) {
        if (!record || record.technology !== 'localStorage' || !OWNED.has(record.key) || typeof record.value !== 'string' ||
          unique.has(record.key) || !validated(record.key, record.value)) {
          throw new Error('The backup contains duplicate, unrecognised or invalid records. Nothing was restored.');
        }
        unique.add(record.key);
      }
      this.restoreItems = backup.records;
      this.draw();
    } catch (error) {
      this.restoreItems = null;
      showToast('Backup rejected: ' + (error.message || error), 'error', 5000);
      this.draw();
    }
  }
  restore() {
    if (!this.restoreItems) return;
    try {
      const info = syncSafe();
      if (info.pendingChanges) throw new Error('Synchronise or explicitly discard pending changes before restoring browser storage.');
      const planned = this.restoreItems.filter(item => this.restoreMode === 'replace' || localStorage.getItem(item.key) == null);
      const conflicts = planned.filter(item => localStorage.getItem(item.key) != null).length;
      if (!planned.length) { showToast('All backup records already exist; nothing to restore', 'info'); return; }
      const detail = 'Restore ' + planned.length + ' item(s), replacing ' + conflicts + ' existing record(s)?\nThe app will reload. Current Google Sheets data will not change.';
      if (!window.confirm(detail)) return;
      if (conflicts && window.prompt('Type REPLACE LOCAL DATA to confirm replacing existing stored values:') !== 'REPLACE LOCAL DATA') return;
      const previous = planned.map(item => [item.key, localStorage.getItem(item.key)]);
      try {
        planned.forEach(item => localStorage.setItem(item.key, item.value));
      } catch (error) {
        for (const [key, value] of previous) {
          try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) {}
        }
        throw error;
      }
      window.location.reload();
    } catch (error) { showToast('Restore blocked: ' + (error.message || error), 'error', 5000); }
  }
  heading(label, help = '') {
    const header = node('div', 'storage-section-heading');
    header.appendChild(node('h3', '', label));
    if (help) header.appendChild(node('p', 'settings-note', help));
    return header;
  }
  drawOverview(mount) {
    const totals = this.totals();
    const summary = node('div', 'storage-summary');
    for (const [label, value] of [
      ['ChrisFit storage', formattedSize(totals.bytes)],
      ['Stored items', this.entries.length],
      ['Protected items', totals.protected],
      ['Safe to clean', 0],
      ['Server verified', totals.verified],
      ['Needs review', totals.review]
    ]) {
      const tile = node('div', 'storage-stat');
      tile.append(node('span', 'storage-stat-value', String(value)), node('span', 'storage-stat-label', label));
      summary.appendChild(tile);
    }
    mount.appendChild(summary);
    const origin = this.usage && Number.isFinite(this.usage.usage) ? this.usage.usage : null;
    const quota = this.usage && Number.isFinite(this.usage.quota) ? this.usage.quota : null;
    const capacity = node('div', 'storage-capacity');
    capacity.appendChild(node('p', 'settings-note',
      'Application-owned localStorage (calculated): ' + formattedSize(totals.bytes) +
      '. Origin-wide storage (browser estimate): ' + formattedSize(origin) + (quota ? ' of ' + formattedSize(quota) + ' quota' : '') +
      '. Origin totals can include unrelated data and are not ChrisFit usage.'));
    const track = node('div', 'storage-track');
    const bar = node('div', 'storage-track-fill');
    bar.style.width = origin && quota ? Math.max(0, Math.min(100, origin / quota * 100)) + '%' : '0%';
    track.appendChild(bar); capacity.appendChild(track);
    mount.appendChild(capacity);

    mount.appendChild(this.heading('Storage categories', 'Only confirmed ChrisFit-owned records can be selected. Protected records cannot be included in ordinary cleanup.'));
    for (const category of CATEGORIES) {
      const entries = [...this.entries, ...this.unknown].filter(e => e.category === category);
      if (!entries.length) continue;
      const item = node('div', 'storage-category');
      const top = node('div', 'storage-category-top');
      const title = node('strong', '', category);
      const desc = node('span', 'storage-muted', entries.length + ' item(s) · ' + formattedSize(entries.reduce((n, e) => n + e.bytes, 0)));
      top.append(title, desc);
      item.appendChild(top);
      const eligible = entries.filter(e => e.review);
      if (eligible.length) {
        const check = node('input'); check.type = 'checkbox';
        check.checked = eligible.every(e => this.selected.has(e.key));
        check.addEventListener('change', () => {
          eligible.forEach(e => check.checked ? this.selected.add(e.key) : this.selected.delete(e.key));
          this.draw();
        });
        const line = node('label', 'storage-checkbox-line');
        line.append(check, node('span', '', 'Select reviewed logs for manual cleanup'));
        item.appendChild(line);
      }
      const protectedCount = entries.filter(e => e.protected).length;
      item.appendChild(node('p', 'storage-muted', protectedCount ? protectedCount + ' protected/unknown item(s) preserved' : 'Reviewable diagnostic data'));
      mount.appendChild(item);
    }

    mount.appendChild(this.heading('Actions'));
    const row = node('div', 'storage-actions');
    row.append(
      button('🧹 Quick Clean', () => this.quickClean()),
      button('Clear Selected', () => this.remove([...this.selected])),
      button('Remove Server-Verified Copies', () => window.alert('No redundant server-verified copies are eligible. ChrisFit must retain the offline snapshot for local-first operation.')),
      button('Browse Storage', () => { this.tab = 'browse'; this.draw(); }),
      button('Backup / Export', () => { this.tab = 'backup'; this.draw(); })
    );
    mount.appendChild(row);
    const verify = node('div', 'storage-verification');
    verify.append(button('Check Google Server', () => this.verify()), node('span', 'storage-muted', this.verification.message));
    mount.appendChild(verify);
    const danger = node('div', 'storage-danger');
    danger.appendChild(node('p', 'settings-note', 'Clear Everything affects only recognised ChrisFit browser keys on this device, never the Google spreadsheet. Export a backup first.'));
    danger.appendChild(button('⚠️ Clear Everything (this device)', () => this.clearEverything(), 'btn-red'));
    mount.appendChild(danger);
    mount.appendChild(this.heading('Browser storage capabilities', 'Other origin resources are not claimed as ChrisFit-owned and cannot be deleted here.'));
    for (const cap of this.capabilities) mount.appendChild(node('p', 'storage-muted', cap.name + ': ' + cap.description));
  }
  entryCard(entry, mount) {
    const card = node('div', 'storage-entry');
    const head = node('div', 'storage-category-top');
    head.append(node('strong', '', entry.label), node('span', 'storage-muted', formattedSize(entry.bytes)));
    card.appendChild(head);
    card.appendChild(node('p', 'storage-muted', entry.key + ' · ' + entry.status + ' · ' + (entry.protected ? 'Protected' : 'Needs review')));
    if (entry.note) card.appendChild(node('p', 'settings-note', entry.note));
    if (OWNED.has(entry.key)) {
      const actions = node('div', 'storage-actions');
      actions.append(
        button('View contents', () => {
          const visible = card.querySelector('.storage-entry-details');
          if (visible) { visible.remove(); return; }
          const detail = node('div', 'storage-entry-details');
          const preview = node('pre', 'storage-preview', formatJSON(entry.value));
          detail.appendChild(preview);
          const tools = node('div', 'storage-actions');
          tools.append(button('Copy', () => copy(entry.value)),
            button('Export entry', () => this.exportSelection([entry.key])));
          if (entry.editable) {
            tools.appendChild(button('Edit', () => {
              detail.replaceChildren();
              const editor = node('textarea', 'storage-editor');
              editor.value = formatJSON(entry.value);
              detail.append(editor, button('Save validated edit', () => {
                try {
                  syncSafe();
                  if (api.getConnectionInfo().pendingChanges) throw new Error('Finish pending changes before editing local data.');
                  if (!validated(entry.key, editor.value)) throw new Error('Value fails the known ChrisFit schema.');
                  if (!window.confirm('Save the new local value and reload ChrisFit?')) return;
                  localStorage.setItem(entry.key, entry.key.endsWith('theme.preference') ? editor.value : JSON.stringify(JSON.parse(editor.value)));
                  window.location.reload();
                } catch (error) { showToast('Edit cancelled: ' + (error.message || error), 'error'); }
              }), button('Cancel', () => { detail.remove(); }));
            }));
          }
          if (entry.review) tools.appendChild(button('Delete reviewed logs', () => this.remove([entry.key]), 'btn-red'));
          detail.appendChild(tools);
          card.appendChild(detail);
        })
      );
      card.appendChild(actions);
    }
    mount.appendChild(card);
  }
  drawBrowse(mount) {
    mount.appendChild(this.heading('Browse Storage', 'Detailed view. Sensitive fitness data stays hidden until you select View contents. Unknown entries cannot be edited or removed.'));
    const controls = node('div', 'storage-browse-controls');
    const search = node('input');
    search.type = 'search'; search.placeholder = 'Search key or category'; search.value = this.query;
    search.addEventListener('input', () => { this.query = search.value; listEntries(); });
    const only = node('label', 'storage-checkbox-line');
    const check = node('input'); check.type = 'checkbox'; check.checked = this.onlyRemovable;
    check.addEventListener('change', () => { this.onlyRemovable = check.checked; listEntries(); });
    only.append(check, node('span', '', 'Show reviewable items only'));
    controls.append(search, only);
    mount.appendChild(controls);
    const list = node('div');
    mount.appendChild(list);
    const listEntries = () => {
      list.replaceChildren();
      const query = this.query.toLowerCase();
      const matches = [...this.entries, ...this.unknown].filter(e =>
        (!this.onlyRemovable || e.review) && (e.label + ' ' + e.key + ' ' + e.category).toLowerCase().includes(query));
      if (!matches.length) list.appendChild(node('p', 'settings-note', 'No entries match these filters.'));
      matches.sort((a, b) => b.bytes - a.bytes).forEach(e => this.entryCard(e, list));
    };
    listEntries();
  }
  drawBackup(mount) {
    mount.appendChild(this.heading('Backup & Restore', 'These exports contain fitness information stored by this browser. Keep them somewhere private. Google Sheets is not changed.'));
    mount.append(button('📤 Export all application-owned browser data', () => this.exportSelection()));
    const note = node('p', 'settings-note', 'This is a browser-storage backup, separate from the existing Android-compatible fitness backup in Settings. It includes recognised ChrisFit keys and excludes unrelated or unknown data.');
    mount.append(note);
    const input = node('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => this.readBackup(input));
    mount.append(this.heading('Import browser storage backup'), input);
    if (this.restoreItems) {
      mount.appendChild(node('p', 'storage-muted', this.restoreItems.length + ' valid ChrisFit storage item(s) available for restoration.'));
      const select = node('select');
      for (const [value, label] of [['missing', 'Restore missing only (recommended)'], ['replace', 'Replace existing browser data']]) {
        const opt = node('option', '', label); opt.value = value; select.appendChild(opt);
      }
      select.value = this.restoreMode;
      select.addEventListener('change', () => { this.restoreMode = select.value; });
      mount.append(select, button('Restore selected backup', () => this.restore(), 'btn-blue'));
    }
  }
  draw() {
    this.dialog.replaceChildren();
    const header = node('div', 'storage-header');
    const title = node('div');
    title.append(node('h2', '', '💾 Storage & Cleanup'), node('p', 'settings-note', 'ChrisFit browser data on this device'));
    header.append(title, button('✕ Close', () => this.close()));
    this.dialog.appendChild(header);
    const tabs = node('div', 'storage-tabs');
    for (const [tab, label] of [['overview', 'Overview'], ['browse', 'Browse Storage'], ['backup', 'Backup / Restore']]) {
      const item = button(label, () => { this.tab = tab; this.draw(); }, this.tab === tab ? 'btn-blue' : 'btn-outline');
      tabs.appendChild(item);
    }
    this.dialog.appendChild(tabs);
    const body = node('div', 'storage-body');
    if (this.tab === 'browse') this.drawBrowse(body);
    else if (this.tab === 'backup') this.drawBackup(body);
    else this.drawOverview(body);
    this.dialog.appendChild(body);
  }
}
export function openStorageManager() {
  if (activeManager) { activeManager.dialog.focus(); return; }
  activeManager = new StorageManager();
}
