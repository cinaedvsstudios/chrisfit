// Run: node --test tests/backend-sync.test.cjs
// Execute the actual Apps Script source against instrumented Sheets/Lock mocks.
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

module.exports = { backend };
