// Run: node --experimental-vm-modules tests/history-graph.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createContext, SourceTextModule } = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ctx = createContext({ Date, Intl, Math, Number, String, Array, Object, Set, Map, JSON });
const modules = new Map();
async function source(file) {
  if (modules.has(file)) return modules.get(file);
  const module = new SourceTextModule(
    fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'),
    { context: ctx, identifier: file }
  );
  modules.set(file, module);
  await module.link(specifier => source(specifier.replace('./', '')));
  return module;
}
async function load() {
  const model = await source('history-graph-data.js');
  await model.evaluate();
  return model.namespace;
}
const settings = { dailyCalories: 2000, dailyBurnTarget: 3000, dailyDeficit: 750 };
const rows = [
  { date: '2024-06-03', name: 'Food June', calories: 1500 },
  { date: '2024-06-03', name: 'Burn June', calories: -2200 },
  { date: '2024-06-04', name: 'Incomplete food', calories: 2000 },
  { date: '2024-08-10', name: 'August food', calories: 1700 },
  { date: '2024-08-10', name: 'August burn', calories: -2600 },
  { date: '2024-08-18', name: 'Future to anchor', calories: 3000 }
];
const weights = [
  { date: '2024-07-01', value: 82.5, id: 1 },
  { date: '2024-08-12', value: 80, id: 2 }
];
test('three calendar months use weekly buckets with correct totals, complete days and targets', async () => {
  const { buildHistoryGraphModel } = await load();
  const model = buildHistoryGraphModel({ entries: rows, weights, settings, months: '3', anchor: '2024-08-15' });
  assert.equal(model.start, '2024-06-01');
  assert.equal(model.end, '2024-08-15');
  assert.equal(model.granularity, 'week');
  assert.equal(model.intake, 5200);
  assert.equal(model.burn, 4800);
  assert.equal(model.net, 400);
  assert.equal(model.loggedDays, 3);
  assert.equal(model.completeDays, 2);
  assert.equal(model.foodDays, 3);
  assert.equal(model.burnDays, 2);
  assert.equal(model.periodDays, 76);
  assert.equal(model.targetFood, 152000);
  assert.equal(model.targetBurn, 228000);
  assert.equal(model.targetNet, -57000);
  assert.equal(model.weightLast.value, 80);
  assert.equal(model.weightRecords, 2);
  assert.equal(model.buckets.reduce((sum, bucket) => sum + bucket.days, 0), model.periodDays);
  assert.equal(model.buckets.reduce((sum, bucket) => sum + bucket.intake, 0), model.intake);
});
test('one month uses daily buckets and 6 months uses week buckets', async () => {
  const { buildHistoryGraphModel } = await load();
  const d = buildHistoryGraphModel({ entries: rows, settings, months: '1', anchor: '2024-08-15' });
  assert.equal(d.granularity, 'day');
  assert.equal(d.start, '2024-08-01');
  assert.equal(d.buckets.length, 15);
  assert.equal(d.buckets[0].start, '2024-08-01');
  assert.equal(d.buckets[14].end, '2024-08-15');
  assert.equal(d.net, -900);
  const w = buildHistoryGraphModel({ entries: rows, settings, months: '6', anchor: '2024-08-15' });
  assert.equal(w.start, '2024-03-01');
  assert.equal(w.granularity, 'week');
});
test('one year uses monthly buckets and all history spans earliest observed date, yearly for long ranges', async () => {
  const { buildHistoryGraphModel } = await load();
  const year = buildHistoryGraphModel({ entries: rows, settings, months: '12', anchor: '2024-08-15' });
  assert.equal(year.start, '2023-09-01');
  assert.equal(year.granularity, 'month');
  assert.equal(year.buckets.length, 12);
  const all = buildHistoryGraphModel({ entries: [{ date: '2022-02-02', calories: -100 }, ...rows], settings, months: 'all', anchor: '2024-08-15' });
  assert.equal(all.start, '2022-02-02');
  assert.equal(all.granularity, 'year');
  assert.deepEqual(Array.from(all.buckets, bucket => bucket.label), ['2022', '2023', '2024']);
  assert.equal(all.buckets.reduce((sum, bucket) => sum + bucket.days, 0), all.periodDays);
});
test('only recorded weights are graphed; missing weight buckets are null, not zero', async () => {
  const { buildHistoryGraphModel } = await load();
  const m = buildHistoryGraphModel({ entries: rows, weights, months: '3', metric: 'weight', anchor: '2024-08-15' });
  assert.ok(m.buckets.some(bucket => bucket.weight === null));
  assert.equal(m.buckets.filter(bucket => bucket.weight !== null).length, 2);
  assert.equal(m.weightFirst.value, 82.5);
  assert.equal(m.weightLast.value, 80);
});
test('report respects selected metric and summarizes selected dates, values and logged-day caveat', async () => {
  const { buildHistoryGraphModel, buildHistoryGraphReport } = await load();
  const m = buildHistoryGraphModel({ entries: rows, weights, settings, months: '3', anchor: '2024-08-15', metric: 'net' });
  const report = buildHistoryGraphReport(m);
  assert.match(report, /01-06-2024.*15-08-2024/);
  assert.match(report, /View: Deficit/);
  assert.match(report, /Logged days: 3/);
  assert.match(report, /Days with both food and burn: 2/);
  assert.match(report, /Net \(food − burn\): 400 kcal/);
  assert.match(report, /Negative net means a calorie deficit/);
  assert.match(report, /Calendar targets cover every day/);
  assert.ok(report.split('PERIOD BREAKDOWN')[1].includes('Net '));
  assert.ok(!report.split('PERIOD BREAKDOWN')[1].includes('| Food '));
});
test('no data is reported without inventing values or dividing by zero', async () => {
  const { buildHistoryGraphModel, buildHistoryGraphReport } = await load();
  const m = buildHistoryGraphModel({ entries: [], weights: [], months: '1', anchor: '2024-08-15' });
  assert.equal(m.loggedDays, 0);
  assert.equal(m.averageFood, null);
  assert.equal(m.averageNet, null);
  assert.equal(m.weightRecords, 0);
  assert.match(buildHistoryGraphReport(m), /n\/a/);
});

test('graph UI renders overview SVG, table detail, ranges and copy button from existing state', async () => {
  class Node {
    constructor(tag, content = '') {
      this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.style = {};
      this.textContent = content; this.value = ''; this.className = '';
    }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); return item; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(event, callback) { this.listeners[event] = callback; }
  }
  const fakeDocument = {
    createElement: tag => new Node(tag),
    createElementNS: (_ns, tag) => new Node(tag),
    createTextNode: text => new Node('#text', text)
  };
  ctx.document = fakeDocument;
  const graph = await source('history-graph.js');
  await graph.evaluate();
  const state = modules.get('state.js').namespace.state;
  state.selectedDate = new Date(2024, 7, 15);
  state.entriesFull = rows.slice();
  state.weights = weights.slice();
  state.settings = { ...state.settings, ...settings };
  const root = graph.namespace.renderHistoryGraph();
  const nodes = [];
  function collect(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    (node.children || []).forEach(collect);
  }
  collect(root);
  assert.equal(root.className, 'history-graph-root');
  assert.equal(nodes.filter(node => node.tag === 'select').length, 2);
  assert.equal(nodes.filter(node => node.tag === 'svg').length, 3);
  assert.ok(nodes.some(node => node.tag === 'button' && node.textContent === '📋 Copy Report'));
  assert.ok(nodes.some(node => node.tag === 'summary' && node.textContent === 'View data behind the graph'));
  const metric = nodes.find(node => node.tag === 'select' && node.attributes['aria-label'] === 'Graph metric');
  assert.ok(metric);
  metric.value = 'net';
  metric.listeners.change();
  const updated = graph.namespace.renderHistoryGraph();
  const nextNodes = [];
  function walk(node) {
    nextNodes.push(node);
    (node.children || []).forEach(walk);
  }
  walk(updated);
  assert.equal(nextNodes.filter(node => node.tag === 'svg').length, 1);
  assert.ok(nextNodes.some(node => node.tag === 'h3' && node.textContent === 'Deficit / Surplus'));
});
