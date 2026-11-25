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
test('three calendar months show every recorded date while keeping correct totals and targets', async () => {
  const { buildHistoryGraphModel } = await load();
  const model = buildHistoryGraphModel({ entries: rows, weights, settings, months: '3', anchor: '2024-08-15' });
  assert.equal(model.start, '2024-06-01');
  assert.equal(model.end, '2024-08-15');
  assert.equal(model.granularity, 'day');
  assert.deepEqual(Array.from(model.buckets, bucket => bucket.start), ['2024-06-03', '2024-06-04', '2024-07-01', '2024-08-10', '2024-08-12']);
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
  assert.equal(model.buckets.reduce((sum, bucket) => sum + bucket.days, 0), model.buckets.length);
  assert.equal(model.buckets.reduce((sum, bucket) => sum + (bucket.intake ?? 0), 0), model.intake);
});
test('daily detail shows only recorded days and retains dates beyond a six-month window', async () => {
  const { buildHistoryGraphModel } = await load();
  const d = buildHistoryGraphModel({ entries: rows, settings, months: '1', anchor: '2024-08-15' });
  assert.equal(d.granularity, 'day');
  assert.equal(d.start, '2024-08-01');
  assert.equal(d.buckets.length, 2);
  assert.equal(d.buckets[0].start, '2024-08-10');
  assert.equal(d.buckets[1].end, '2024-08-12');
  assert.equal(d.net, -900);
  const w = buildHistoryGraphModel({ entries: rows, settings, months: '6', anchor: '2024-08-15' });
  assert.equal(w.start, '2024-03-01');
  assert.equal(w.granularity, 'day');
  assert.equal(w.buckets.length, 5);
});
test('monthly mode uses monthly buckets, and detailed all-history retains all records', async () => {
  const { buildHistoryGraphModel } = await load();
  const year = buildHistoryGraphModel({ entries: rows, settings, months: '12', grouping: 'monthly', anchor: '2024-08-15' });
  assert.equal(year.start, '2023-09-01');
  assert.equal(year.granularity, 'month');
  assert.equal(year.buckets.length, 12);
  const all = buildHistoryGraphModel({ entries: [{ date: '2022-02-02', calories: -100 }, ...rows], settings, months: 'all', anchor: '2024-08-15' });
  assert.equal(all.start, '2022-02-02');
  assert.equal(all.granularity, 'day');
  assert.ok(all.buckets.some(bucket => bucket.start === '2022-02-02'));
  assert.equal(all.buckets.length, 5);
  assert.equal(all.entryRecords.length, 7);
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
  assert.equal(nodes.filter(node => node.tag === 'select').length, 3);
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
  const group = nextNodes.find(node => node.tag === 'select' && node.attributes['aria-label'] === 'Graph detail level');
  assert.ok(group);
  group.value = 'monthly';
  group.listeners.change();
  const monthRoot = graph.namespace.renderHistoryGraph();
  const monthlyNodes = [];
  function collectMonths(node) {
    monthlyNodes.push(node);
    (node.children || []).forEach(collectMonths);
  }
  collectMonths(monthRoot);
  assert.ok(monthlyNodes.some(node => node.tag === 'summary' && node.textContent === 'View monthly averages and minimum weights'));
  assert.ok(monthlyNodes.some(node => node.tag === 'th' && node.textContent === 'Lowest weight'));
});

test('monthly food and burn averages use their own logged-day counts; net only complete days', async () => {
  const { buildHistoryGraphModel, buildHistoryGraphReport } = await load();
  const model = buildHistoryGraphModel({
    entries: rows, weights, settings, months: '3', grouping: 'monthly', anchor: '2024-08-15'
  });
  assert.equal(model.granularity, 'month');
  assert.deepEqual(Array.from(model.buckets, b => b.id), ['2024-06', '2024-07', '2024-08']);
  const [june, july, august] = model.buckets;
  assert.equal(june.foodDays, 2);
  assert.equal(june.burnDays, 1);
  assert.equal(june.completeDays, 1);
  assert.equal(june.intake, 1750);
  assert.equal(june.burn, 2200);
  assert.equal(june.net, -700); // -700 from complete June 3; do not add incomplete June 4
  assert.equal(july.intake, null);
  assert.equal(july.burn, null);
  assert.equal(july.net, null);
  assert.equal(july.weight, 82.5);
  assert.equal(august.intake, 1700);
  assert.equal(august.burn, 2600);
  assert.equal(august.net, -900);
  const report = buildHistoryGraphReport(model);
  assert.match(report, /Display: Monthly averages \/ lowest recorded weight/);
  assert.match(report, /Avg Food 1,750 kcal \(2 food-logged days\)/);
  assert.match(report, /Avg Net -700 kcal \(1 complete days\)/);
  assert.match(report, /Lowest weight 82\.5 kg/);
});
test('monthly weight selects the minimum measured weight, not the average or last entry', async () => {
  const { buildHistoryGraphModel, buildHistoryGraphReport } = await load();
  const records = [
    { date: '2024-08-02', value: 84.5, id: 1 },
    { date: '2024-08-12', value: 80.2, id: 2 },
    { date: '2024-08-15', value: 82.9, id: 3 },
    { date: '2024-07-11', value: 83.3, id: 4 },
    { date: '2024-07-21', value: 83.0, id: 5 }
  ];
  const model = buildHistoryGraphModel({
    weights: records, months: '3', metric: 'weight', grouping: 'monthly', anchor: '2024-08-15'
  });
  const july = model.buckets.find(bucket => bucket.id === '2024-07');
  const august = model.buckets.find(bucket => bucket.id === '2024-08');
  assert.equal(july.weight, 83);
  assert.equal(july.weightDate, '2024-07-21');
  assert.equal(august.weight, 80.2);
  assert.equal(august.weightDate, '2024-08-12');
  assert.equal(model.lowestWeight.value, 80.2);
  assert.equal(model.weightLast.value, 82.9);
  assert.match(buildHistoryGraphReport(model), /Lowest weight 80\.2 kg \(12-08-2024\)/);
});
test('detailed copy report lists every underlying entry separately even on the same day', async () => {
  const { buildHistoryGraphModel, buildHistoryGraphReport } = await load();
  const model = buildHistoryGraphModel({
    entries: [
      { date: '2024-08-10', name: 'Breakfast', calories: 400 },
      { date: '2024-08-10', name: 'Lunch', calories: 600 },
      { date: '2024-08-10', name: 'Burn', calories: -1500 }
    ], weights: [
      { date: '2024-08-10', value: 83.5 },
      { date: '2024-08-10', value: 83 }
    ],
    months: '1', grouping: 'detailed', anchor: '2024-08-15'
  });
  assert.equal(model.buckets.length, 1);
  assert.equal(model.entryRecords.length, 3);
  assert.equal(model.weightMeasurements.length, 2);
  const report = buildHistoryGraphReport(model);
  assert.match(report, /INDIVIDUAL FOOD \/ BURN ENTRIES/);
  assert.match(report, /Breakfast \| 400 kcal/);
  assert.match(report, /Lunch \| 600 kcal/);
  assert.match(report, /INDIVIDUAL WEIGHT ENTRIES/);
  assert.match(report, /83\.5 kg/);
  assert.match(report, /83 kg/);
});
