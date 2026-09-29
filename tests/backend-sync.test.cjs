// Run: node --test tests/backend-sync.test.cjs
// Execute the actual Apps Script source against instrumented Sheets/Lock mocks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../google-apps-script/Code.gs'), 'utf8');

function backend() {
  const calls = [];
  let locked = false;
  const sheets = new Map();
  class Sheet {
    constructor(name, rows) { this.name = name; this.rows = rows; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); }
    getDataRange() {
      calls.push(['fullRead', this.name]);
      return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
    }
    getRange(r, c, nr = 1, nc = 1) {
      assert.ok(r > 0 && c > 0 && nr > 0 && nc > 0);
      return {
        getValues: () => {
          calls.push(['read', this.name, r, c, nr, nc]);
          return Array.from({ length: nr }, (_, i) =>
            Array.from({ length: nc }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? ''));
        },
        setValues: values => {
          assert.equal(locked, true, 'all mutations must hold the script lock');
          calls.push(['write', this.name, r, c]);
          values.forEach((row, i) => row.forEach((value, j) => {
            this.rows[r - 1 + i] ??= [];
            this.rows[r - 1 + i][c - 1 + j] = value;
          }));
        },
        setValue: value => this.getRange(r, c).setValues([[value]])
      };
    }
    appendRow(row) {
      assert.equal(locked, true);
      calls.push(['append', this.name]);
      this.rows.push(Array.from(row));
    }
    deleteRow(row) { this.deleteRows(row, 1); }
    deleteRows(row, count) {
      assert.equal(locked, true);
      calls.push(['delete', this.name]);
      this.rows.splice(row - 1, count);
    }
  }
  // Deliberately reorder columns and use aliases to exercise existing sheet compatibility.
  sheets.set('entries', new Sheet('entries', [
    ['name', 'kcal', 'date', 'id'], ['Existing meal', 200, '2026-09-28', 7]
  ]));
  sheets.set('foods', new Sheet('foods', [['id', 'name', 'calories', 'sortOrder', 'active', 'emoji']]));
  sheets.set('library', new Sheet('library', [['id', 'name', 'amount', 'calories', 'emoji']]));
  sheets.set('weights', new Sheet('weights', [['date', 'kg', 'id'], ['2026-09-28', 87, 3]]));
  sheets.set('settings', new Sheet('settings', [['id', 'dailyCalories'], [1, 2000]]));
  const book = {
    getSheetByName: name => sheets.get(name),
    insertSheet: name => {
      assert.equal(locked, true);
      calls.push(['insert', name]);
      const sheet = new Sheet(name, []);
      sheets.set(name, sheet);
      return sheet;
    },
    getSpreadsheetTimeZone: () => 'Europe/Berlin'
  };
  const context = vm.createContext({
    SpreadsheetApp: {
      openById: () => book,
      flush: () => { assert.equal(locked, true); calls.push(['flush']); }
    },
    LockService: { getScriptLock: () => ({
      waitLock: () => { assert.equal(locked, false, 'no nested lock acquisition'); locked = true; calls.push(['lock']); },
      releaseLock: () => { locked = false; calls.push(['unlock']); }
    }) },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: value => ({ setMimeType: () => JSON.parse(value) })
    }
  });
  vm.runInContext(source, context);
  return {
    calls, sheets, context,
    get: (action, params = {}) => context.doGet({ parameter: { action, ...params } }),
    post: (action, data = {}) => context.doPost({
      parameter: { action }, postData: { contents: JSON.stringify(data) }
    }),
    setup: () => context.setupSync()
  };
}
const meal = (clientId, name = 'Meal') => ({ clientId, name, calories: 300, date: '2026-09-29' });
const mutations = calls => calls.filter(call => ['write', 'append', 'insert', 'delete'].includes(call[0]));

test('legacy GETs work without metadata and never alter sheets; missing library stays absent', () => {
  const b = backend();
  assert.equal(b.get('entries')[0].id, 7);
  assert.equal(b.get('settings').dailyCalories, 2000);
  assert.equal(b.get('weights')[0].value, 87);
  assert.deepEqual(b.get('foods'), []);
  b.sheets.delete('library');
  assert.deepEqual(b.get('library'), []);
  assert.equal(b.sheets.has('library'), false);
  assert.equal(b.get('manifest').success, false);
  assert.deepEqual(mutations(b.calls), []);
});

test('setup preserves existing values, creates metadata once, manifest reads just five rows', () => {
  const b = backend();
  b.setup();
  assert.deepEqual(b.sheets.get('entries').rows[1].slice(0, 4), ['Existing meal', 200, '2026-09-28', 7]);
  const before = b.get('manifest');
  b.setup();
  assert.deepEqual(b.get('manifest').revisions, before.revisions);
  b.calls.length = 0;
  const manifest = b.get('manifest');
  assert.equal(manifest.backendVersion, '2.16');
  assert.deepEqual(b.calls, [['read', 'sync_meta', 2, 1, 5, 3]]);
});

test('bootstrap and dataset envelopes are read-only; legacy range/date/export shapes remain compatible', () => {
  const b = backend(); b.setup(); b.calls.length = 0;
  const snapshot = b.get('bootstrap');
  assert.equal(snapshot.settings.dailyCalories, 2000);
  assert.equal(snapshot.entries[0].id, 7);
  assert.equal(snapshot.meta.backendVersion, '2.16');
  assert.deepEqual(b.get('dataset', { dataset: 'entries' }).data, snapshot.entries);
  assert.equal(b.get('entries', { date: '2026-09-28' }).length, 1);
  assert.equal(b.get('entries', { from: '2026-09-29', to: '2026-09-30' }).length, 0);
  assert.deepEqual(b.get('export').entries[0], { name: 'Existing meal', calories: 200, date: '2026-09-28' });
  assert.deepEqual(mutations(b.calls), []);
  assert.equal(b.get('dataset', { dataset: 'nope' }).success, false);
});

test('lost acknowledgement retries of all add types create one row and advance only their revision', () => {
  const b = backend(); b.setup();
  for (const [dataset, data] of [
    ['entries', meal('entry-1')], ['weights', { clientId: 'weight-1', value: 86.8, date: '2026-09-29' }],
    ['foods', { clientId: 'food-1', name: 'Egg', calories: 80 }],
    ['library', { clientId: 'lib-1', name: 'Rice', amount: '60g', calories: 210 }]
  ]) {
    const before = b.get('manifest').revisions;
    const first = b.post(dataset, data);
    assert.equal(first.success, true);
    const rowCount = b.sheets.get(dataset).getLastRow();
    const retry = b.post(dataset, data);
    assert.equal(retry.duplicate, true);
    assert.equal(retry.id, first.id);
    assert.equal(b.sheets.get(dataset).getLastRow(), rowCount);
    const after = b.get('manifest').revisions;
    for (const key of Object.keys(before)) assert.equal(after[key], before[key] + (key === dataset ? 1 : 0));
    assert.ok(b.get(dataset).find(row => row.clientId === data.clientId).updatedAt);
  }
});

test('partially applied batch can retry without duplicating its successful add', () => {
  const b = backend(); b.setup();
  const operations = [
    { type: 'entries', data: meal('batch-1') },
    { type: 'foods', data: { clientId: 'batch-2', name: '', calories: 80 } }
  ];
  const before = b.get('manifest').revisions.entries;
  assert.equal(b.post('batch', { operations }).success, false);
  assert.equal(b.get('entries').filter(row => row.clientId === 'batch-1').length, 1);
  assert.ok(b.get('manifest').revisions.entries > before);
  operations[1].data.name = 'Egg';
  const result = b.post('batch', { operations });
  assert.equal(result.success, true);
  assert.equal(result.results[0].duplicate, true);
  assert.equal(b.get('entries').filter(row => row.clientId === 'batch-1').length, 1);
  assert.equal(b.calls.at(-1)[0], 'read');
});

test('edit/delete can resolve a local record by its clientId; stale deletes preserve legacy batch handling', () => {
  const b = backend(); b.setup();
  b.post('entries', meal('local-1'));
  const edited = { ...meal('edit-1', 'Updated meal'), id: 'pending-local', recordClientId: 'local-1' };
  assert.equal(b.post('updateEntry', edited).success, true);
  assert.equal(b.get('entries').find(row => row.clientId === 'local-1').name, 'Updated meal');
  const operation = { type: 'deleteEntry', data: { id: 'pending-local', recordClientId: 'local-1' } };
  assert.equal(b.post('batch', { operations: [operation] }).skippedMissing, 0);
  assert.equal(b.post('batch', { operations: [operation] }).skippedMissing, 1);
  assert.equal(b.get('entries').filter(row => row.clientId === 'local-1').length, 0);
});

test('entry writes do not scan or schema-check library; settings/import/reset invalidate relevant datasets', () => {
  const b = backend(); b.setup(); b.calls.length = 0;
  assert.equal(b.post('entries', meal('isolation-1')).success, true);
  assert.equal(b.calls.some(call => call[1] === 'library'), false);
  const initial = b.get('manifest').revisions;
  b.post('settings', { dailyCalories: 1900 });
  assert.equal(b.get('settings').dailyCalories, 1900);
  assert.equal(b.get('manifest').revisions.settings, initial.settings + 1);
  const before = b.get('manifest').revisions;
  assert.equal(b.post('import', { entries: [meal('ignored')], weights: [], foods: [] }).success, true);
  const after = b.get('manifest').revisions;
  assert.equal(after.entries, before.entries + 1);
  assert.equal(after.weights, before.weights + 1);
  assert.equal(after.foods, before.foods);
  assert.equal(after.library, before.library);
  assert.equal(b.post('reset').success, true);
  assert.deepEqual(b.get('entries'), []);
  assert.deepEqual(b.get('weights'), []);
  assert.equal(b.get('manifest').revisions.library, after.library);
});

test('write failure releases the lock and keeps revision invalidated for the next read', () => {
  const b = backend(); b.setup();
  const before = b.get('manifest').revisions.entries;
  assert.equal(b.post('entries', meal('bad', '')).success, false);
  assert.equal(b.calls.at(-1)[0], 'unlock');
  assert.equal(b.get('manifest').revisions.entries, before + 1);
  assert.equal(b.post('entries', meal('good')).success, true);
  const meta = b.sheets.get('sync_meta');
  meta.rows[1][1] = 'broken';
  assert.match(b.get('manifest').error, /Invalid sync_meta/);
});
