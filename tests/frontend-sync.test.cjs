// Run: node --experimental-vm-modules tests/frontend-sync.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SourceTextModule, createContext } = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { backend } = require('./backend-mock.cjs');
const endpoint = 'https://script.google.com/macros/s/AKfycbwiM61R-bfvWbbkciZBDYorbx9F3hgOXU85f5lyuC78kB1zJe1B4MmmHLw6eVk-XDeS/exec';
const clone = value => JSON.parse(JSON.stringify(value));
const queueKey = 'chrisfit.pendingWrites.v3', cacheKey = 'chrisfit.cache.v1';
const tick = async () => { for (let n = 0; n < 10; n++) await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function storage() {
  const values = new Map();
  return {
    values, reject: () => false,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (this.reject(key, value)) throw new Error('Quota exceeded'); values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}
async function app({ server = backend(), disk = storage(), handler, offline = false } = {}) {
  if (!server.sheets.has('sync_meta')) server.setup();
  const calls = [], timers = new Map(), navigator = { onLine: !offline, userAgent: 'test' };
  let nextTimer = 1, nextId = 1;
  const context = createContext({
    URL, AbortController, Blob, performance, console, navigator,
    localStorage: disk, window: { location: { href: 'https://cinaedvsstudios.github.io/chrisfit/' } },
    crypto: { randomUUID: () => 'test-id-' + nextId++ },
    setTimeout: (fn, delay) => {
      const id = nextTimer++;
      if (delay === 600) queueMicrotask(fn); else timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      const parsed = new URL(url), action = parsed.searchParams.get('action');
      const params = Object.fromEntries(parsed.searchParams);
      const body = options.method === 'POST' ? JSON.parse(options.body) : null;
      calls.push({ action, params, body, method: options.method });
      const next = () => ({
        ok: true, status: 200,
        json: async () => clone(body ? server.post(action, body) : server.get(action, params))
      });
      return handler ? handler({ action, params, body, options, next, server }) : next();
    }
  });
  const modules = new Map();
  async function module(file) {
    if (modules.has(file)) return modules.get(file);
    const item = new SourceTextModule(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), { context, identifier: file });
    modules.set(file, item);
    await item.link(specifier => module(specifier.replace('./', '')));
    return item;
  }
  const root = await module('api.js'); await root.evaluate();
  const state = modules.get('state.js').namespace.state;
  state.selectedDate = new Date(2026, 8, 29);
  return { api: root.namespace, state, calls, disk, server, timers, navigator,
    subscribe: modules.get('state.js').namespace.subscribe };
}
function seed(disk, server) {
  const snapshot = clone(server.get('bootstrap'));
  disk.setItem(cacheKey, JSON.stringify({
    version: 1, endpoint, meta: snapshot.meta, entriesComplete: true, acknowledged: [],
    data: Object.fromEntries(['settings', 'foods', 'library', 'entries', 'weights'].map(name => [name, snapshot[name]]))
  }));
}
test('fresh startup uses one bootstrap; full history navigates without network', async () => {
  const a = await app(); assert.equal(await a.api.initialise(), true);
  assert.deepEqual(a.calls.map(call => call.action), ['bootstrap']);
  assert.equal(a.state.entriesFull[0].name, 'Existing meal');
  assert.equal(a.state.settings.dailyCalories, 2000);
  assert.ok(a.disk.getItem(cacheKey));
  await a.api.ensureEntriesForDate('2020-01-01'); assert.equal(a.calls.length, 1);
});
test('cached startup renders and returns before Google replies; unchanged revisions fetch nothing else', async () => {
  const disk = storage(), server = backend(); server.setup(); seed(disk, server);
  const gate = deferred();
  const a = await app({ disk, server, handler: async req => { await gate.promise; return req.next(); } });
  let early = false;
  a.subscribe(() => { if (a.state.entriesFull.length && !a.calls.length) early = true; });
  assert.equal(await a.api.initialise(), true);
  assert.equal(early, true); assert.equal(a.state.entriesFull.length, 1);
  gate.resolve(); await tick();
  assert.deepEqual(a.calls.map(call => call.action), ['manifest']);
  assert.equal(a.state.sync.phase, 'saved');
});
test('offline restart preserves cached data and queues food/burn/weight; reconnect sends each once', async () => {
  const disk = storage(), server = backend(); server.setup(); seed(disk, server);
  let a = await app({ disk, server, offline: true });
  await a.api.initialise(); await tick(); assert.match(a.state.sync.message, /Using saved data/);
  a.api.addEntry('2026-09-29', 'Food', 250);
  a.api.addEntry('2026-09-29', 'Burn', -3000);
  a.api.addWeight('2026-09-29', 86.8);
  assert.equal(a.state.entries.length, 2); assert.equal(a.state.pendingChanges.length, 3);
  a = await app({ disk, server }); await a.api.initialise(); await tick();
  assert.equal(a.state.pendingChanges.length, 0);
  assert.equal(server.get('entries').filter(row => row.date === '2026-09-29').length, 2);
  assert.equal(server.get('weights').length, 2);
  assert.equal(a.calls.filter(call => call.action === 'batch').length, 1);
  await a.api.reconnect(); assert.equal(a.calls.filter(call => call.action === 'batch').length, 1);
});
test('failed GET retries once and reports exact action, URL, attempts and cached-data status', async () => {
  const disk = storage(), server = backend(); server.setup(); seed(disk, server);
  const a = await app({ disk, server, handler: async () => { throw new Error('Network failed'); } });
  await a.api.initialise(); await tick();
  assert.equal(a.calls.length, 2); assert.equal(a.state.entriesFull.length, 1);
  assert.match(a.state.sync.message, /Using saved data/);
  const report = JSON.parse(disk.getItem('chrisfit.connectionReports.v1'))[0];
  assert.equal(report.action, 'manifest'); assert.match(report.url, /action=manifest/);
  assert.equal(report.attempt, 2); assert.equal(report.retryCount, 1);
  assert.equal(report.cacheAvailable, true); assert.equal(report.usingCachedData, true);
});
test('corrupt cache bootstraps and preserves/migrates the independent pending queue', async () => {
  const disk = storage(); disk.setItem(cacheKey, '{broken');
  disk.setItem(queueKey, JSON.stringify([{ type: 'entries', queueId: 'legacy-1', tempId: 'pending-1',
    data: { date: '2026-09-29', name: 'Legacy pending', calories: 123 } }]));
  const a = await app({ disk }); await a.api.initialise();
  assert.deepEqual(a.calls.map(call => call.action), ['bootstrap', 'batch']);
  assert.equal(a.server.get('entries').filter(row => row.clientId === 'legacy-1').length, 1);
});
test('changed weights refresh alone; changed library waits until opened and then updates its revision', async () => {
  const disk = storage(), server = backend(); server.setup(); seed(disk, server);
  server.post('weights', { date: '2026-09-29', value: 86.8, clientId: 'external-weight' });
  server.post('library', { name: 'Rice', calories: 210, amount: '60g', clientId: 'external-rice' });
  const a = await app({ disk, server }); await a.api.initialise(); await tick();
  assert.deepEqual(a.calls.map(call => call.params.dataset || call.action), ['manifest', 'weights']);
  assert.equal(a.state.library.length, 0); assert.equal(a.state.backendManifest.revisions.library, 1);
  await a.api.ensureLibrary(); assert.equal(a.state.library[0].name, 'Rice');
  assert.deepEqual(a.calls.map(call => call.params.dataset || call.action), ['manifest', 'weights', 'manifest', 'library']);
});
test('lost POST response is not blindly retried; restart retries the same ID without a duplicate', async () => {
  const disk = storage(), server = backend();
  let a = await app({ disk, server }); await a.api.initialise();
  a.api.addEntry('2026-09-29', 'Saved but reply lost', 200);
  let lose = true;
  a = await app({ disk, server, handler: req => {
    if (req.action === 'batch' && lose) { lose = false; req.server.post('batch', req.body); throw new Error('Reply lost'); }
    return req.next();
  } });
  await a.api.initialise(); await tick();
  assert.equal(a.calls.filter(call => call.action === 'batch').length, 1);
  assert.equal(a.state.pendingChanges.length, 1);
  const clientId = a.state.pendingChanges[0].data.clientId;
  a = await app({ disk, server }); await a.api.initialise(); await tick();
  assert.equal(a.state.pendingChanges.length, 0);
  assert.equal(a.state.entriesFull.filter(item => item.clientId === clientId).length, 1);
  assert.equal(server.get('entries').filter(item => item.clientId === clientId).length, 1);
});
test('edit during an in-flight add is a separate durable operation and maps to the saved record', async () => {
  const gate = deferred(); let started = false;
  const a = await app({ handler: async req => {
    if (req.action === 'batch' && !started) { started = true; await gate.promise; }
    return req.next();
  } });
  await a.api.initialise(); a.api.addEntry('2026-09-29', 'Before edit', 200);
  const tempId = a.state.entries[0].id, first = a.api.flushPending(); await tick();
  a.api.updateEntry(tempId, { date: '2026-09-29', name: 'After edit', calories: 300 });
  assert.equal(a.state.pendingChanges.length, 2);
  assert.equal(a.calls.find(call => call.action === 'batch').body.operations[0].data.name, 'Before edit');
  gate.resolve(); assert.equal(await first, true);
  assert.equal(a.state.entries[0].name, 'After edit');
  await a.api.flushPending();
  assert.equal(a.server.get('entries').filter(row => row.date === '2026-09-29').length, 1);
  assert.equal(a.server.get('entries')[0].name, 'After edit');
});
test('delete during an in-flight add remains queued; crash before queue removal cannot replay settings', async () => {
  const disk = storage(), gate = deferred(); let started = false;
  let a = await app({ disk, handler: async req => {
    if (req.action === 'batch' && !started) { started = true; await gate.promise; }
    return req.next();
  } });
  await a.api.initialise(); a.api.addEntry('2026-09-29', 'Delete while saving', 200);
  const tempId = a.state.entries[0].id, saving = a.api.flushPending(); await tick();
  a.api.deleteEntry(tempId); gate.resolve(); await saving;
  assert.equal(a.state.entries.length, 0);
  await a.api.flushPending();
  assert.equal(a.server.get('entries').filter(row => row.date === '2026-09-29').length, 0);
  a.api.saveSettings({ ...a.state.settings, dailyCalories: 1800 });
  disk.reject = (key, value) => key === queueKey && value === '[]';
  await a.api.flushPending(); assert.ok(JSON.parse(disk.getItem(cacheKey)).acknowledged.length);
  await a.api.reconnect(); assert.ok(JSON.parse(disk.getItem(cacheKey)).acknowledged.length);
  const server = a.server; disk.reject = () => false;
  a = await app({ disk, server }); await a.api.initialise(); await tick();
  assert.equal(a.calls.some(call => call.action === 'batch'), false);
  assert.equal(a.state.settings.dailyCalories, 1800);
});
test('cache-write failure retains the frozen queue and retry does not duplicate saved rows', async () => {
  const a = await app(); await a.api.initialise(); a.api.addEntry('2026-09-29', 'Quota test', 100);
  a.disk.reject = key => key === cacheKey;
  assert.equal(await a.api.flushPending(), false); assert.equal(a.state.pendingChanges.length, 1);
  assert.equal(a.server.get('entries').filter(row => row.name === 'Quota test').length, 1);
  a.disk.reject = () => false; assert.equal(await a.api.flushPending(), true);
  assert.equal(a.server.get('entries').filter(row => row.name === 'Quota test').length, 1);
});
test('full refresh uses bootstrap even unchanged; clear-cache preserves unsynced writes', async () => {
  const a = await app(); await a.api.initialise(); await a.api.forceFullRefresh();
  assert.deepEqual(a.calls.map(call => call.action), ['bootstrap', 'bootstrap']);
  a.api.addEntry('2026-09-29', 'Keep queue', 200); a.api.clearLocalCache();
  assert.equal(a.disk.getItem(cacheKey), null); assert.equal(JSON.parse(a.disk.getItem(queueKey)).length, 1);
  assert.equal(a.state.pendingChanges.length, 1);
});
test('storage-disabled enqueue fails explicitly and never claims it was saved locally', async () => {
  const a = await app(); await a.api.initialise(); a.disk.reject = () => true;
  assert.throws(() => a.api.addEntry('2026-09-29', 'Not durable', 100), /could not be saved/);
  assert.equal(a.state.entries.length, 0); assert.equal(a.state.pendingChanges.length, 0);
});
test('invalid manifest and malformed dataset responses preserve saved data and identify the failed request', async () => {
  const disk = storage(), server = backend(); server.setup(); seed(disk, server);
  server.post('weights', { date: '2026-09-29', value: 86.8, clientId: 'changed-weight' });
  const a = await app({ disk, server, handler: req => req.action === 'dataset'
    ? { ok: true, status: 200, json: async () => ({ ...server.get('dataset', req.params), data: 'rubbish' }) }
    : req.next() });
  await a.api.initialise(); await tick();
  assert.equal(a.state.weights.length, 1);
  assert.equal(a.state.backendManifest.revisions.weights, 1);
  const report = JSON.parse(disk.getItem('chrisfit.connectionReports.v1'))[0];
  assert.equal(report.action, 'dataset'); assert.match(report.url, /dataset=weights/);
  assert.equal(report.httpStatus, 200);
});
test('partial batch save survives restart and applies all remaining changes without repeating the add', async () => {
  const disk = storage(), server = backend();
  let failed = false;
  let a = await app({ disk, server, handler: req => {
    if (req.action === 'batch' && !failed) {
      failed = true;
      server.post('batch', { operations: req.body.operations.slice(0, 1) });
      return { ok: true, status: 200, json: async () => ({ success: false, error: 'Interrupted batch' }) };
    }
    return req.next();
  } });
  await a.api.initialise();
  a.api.addEntry('2026-09-29', 'Partial batch food', 200);
  a.api.addWeight('2026-09-29', 86.5);
  assert.equal(await a.api.flushPending(), false);
  a = await app({ disk, server }); await a.api.initialise(); await tick();
  assert.equal(a.state.pendingChanges.length, 0);
  assert.equal(server.get('entries').filter(row => row.name === 'Partial batch food').length, 1);
  assert.equal(server.get('weights').filter(row => row.date === '2026-09-29').length, 1);
});
test('missing server records disappear from the acknowledged local snapshot', async () => {
  const a = await app(); await a.api.initialise();
  a.server.post('deleteEntry', { id: 7 });
  a.api.deleteEntry(7);
  assert.equal(await a.api.flushPending(), true);
  assert.equal(a.state.entriesFull.length, 0);
  assert.equal(JSON.parse(a.disk.getItem(cacheKey)).data.entries.length, 0);
});
