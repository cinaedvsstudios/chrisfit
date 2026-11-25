/*
 * ChrisFit History graph UI.
 * Native SVG, no chart library or new server requests.
 * The module keeps graph controls across normal ChrisFit rerenders.
 */
import { state, showToast } from './state.js';
import { navigate } from './navigation.js';
import * as dateUtils from './date-utils.js';
import { GRAPH_METRICS, GRAPH_PERIODS, buildHistoryGraphModel, buildHistoryGraphReport } from './history-graph-data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const selection = { months: '3', metric: 'overview' };
const intFormat = number => Number(number).toLocaleString('en-GB', { maximumFractionDigits: 0 });
function element(tag, className = '', text = '') {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== '') item.textContent = text;
  return item;
}
function button(text, fn, className = 'btn-outline') {
  const b = element('button', className, text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}
function svgElement(tag, attributes = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (text !== null) node.textContent = text;
  return node;
}
function labelValue(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 10000) return (Math.round(value / 1000 * 10) / 10) + 'k';
  return intFormat(Math.round(value));
}
function graphHeader(title, subtitle) {
  const wrapper = element('div', 'history-graph-chart-title');
  wrapper.append(element('h3', '', title), element('p', 'subtle-label', subtitle));
  return wrapper;
}
function legend(items) {
  const row = element('div', 'history-graph-legend');
  items.forEach(([cls, text]) => {
    const entry = element('span');
    entry.append(element('span', 'history-graph-legend-swatch ' + cls), document.createTextNode(text));
    row.appendChild(entry);
  });
  return row;
}
function chartWrapper(title, subtitle, items = []) {
  const card = element('section', 'card history-graph-chart-card');
  card.appendChild(graphHeader(title, subtitle));
  if (items.length) card.appendChild(legend(items));
  const scroll = element('div', 'history-graph-chart-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', title + ' chart. Scroll horizontally to inspect earlier or later dates.');
  card.appendChild(scroll);
  return { card, scroll };
}
function svgChart(buckets, type, series) {
  const paired = type === 'paired';
  const barSlot = paired ? 62 : 52;
  const left = 56, right = 24, top = 25, bottom = 55, drawingHeight = 210;
  const width = Math.max(590, left + right + barSlot * buckets.length);
  const height = top + drawingHeight + bottom;
  const svg = svgElement('svg', {
    viewBox: '0 0 ' + width + ' ' + height,
    width, height,
    role: 'img', 'aria-label': series.title + '. ' + buckets.length + ' time periods.'
  });
  svg.appendChild(svgElement('title', {}, series.title));
  const values = buckets.flatMap(bucket => series.keys.map(key => Number(bucket[key]) || 0));
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (min === max) { max = Math.max(max, 100); min = Math.min(min, 0); }
  const padded = (max - min) * .08;
  min -= (min < 0 ? padded : 0);
  max += padded;
  const scale = value => top + (max - value) / (max - min) * drawingHeight;
  const zero = scale(0);

  for (let idx = 0; idx <= 4; idx++) {
    const value = min + (max - min) * idx / 4;
    const y = scale(value);
    svg.appendChild(svgElement('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'history-graph-gridline' }));
    svg.appendChild(svgElement('text', { x: left - 9, y: y + 4, 'text-anchor': 'end', class: 'history-graph-tick' }, labelValue(value)));
  }
  svg.appendChild(svgElement('line', { x1: left, x2: width - right, y1: zero, y2: zero, class: 'history-graph-zero' }));
  const plotWidth = width - left - right;
  const cell = plotWidth / Math.max(1, buckets.length);
  buckets.forEach((bucket, i) => {
    const center = left + cell * (i + .5);
    const bars = paired
      ? [{ key: 'intake', className: 'history-graph-food', offset: -11, width: 18, title: 'Food' },
         { key: 'burn', className: 'history-graph-burn', offset: 11, width: 18, title: 'Burn' }]
      : [{ key: series.keys[0], className: series.keys[0] === 'net'
        ? (bucket.net < 0 ? 'history-graph-net-negative' : 'history-graph-net-positive')
        : series.keys[0] === 'burn' ? 'history-graph-burn' : 'history-graph-food',
        offset: 0, width: 24, title: series.title }];
    bars.forEach(bar => {
      const value = Number(bucket[bar.key]) || 0;
      if (value === 0) return;
      const y = scale(value);
      const rect = svgElement('rect', {
        x: center + bar.offset - bar.width / 2, y: Math.min(y, zero),
        width: bar.width, height: Math.max(1, Math.abs(zero - y)),
        rx: 3, class: bar.className
      });
      rect.appendChild(svgElement('title', {}, dateUtils.formatDisplay(bucket.start) + ' – ' +
        dateUtils.formatDisplay(bucket.end) + ' | ' + bar.title + ': ' + intFormat(value) +
        ' kcal | Logged days: ' + bucket.loggedDays));
      svg.appendChild(rect);
    });
    const dateLabel = svgElement('text', {
      x: center, y: height - 29, 'text-anchor': 'middle', class: 'history-graph-xlabel'
    }, bucket.label);
    svg.appendChild(dateLabel);
  });
  return svg;
}
function weightChart(buckets) {
  const left = 53, right = 28, top = 24, bottom = 54, plotHeight = 195;
  const width = Math.max(590, left + right + buckets.length * 55);
  const height = top + plotHeight + bottom;
  const svg = svgElement('svg', { viewBox: '0 0 ' + width + ' ' + height,
    width, height, role: 'img', 'aria-label': 'Recorded weight trend in kilograms' });
  svg.appendChild(svgElement('title', {}, 'Weight history, recorded weigh-ins only'));
  const present = buckets.map((bucket, index) => ({ bucket, index })).filter(item => item.bucket.weight !== null);
  if (!present.length) return svg;
  const values = present.map(item => item.bucket.weight);
  const min = Math.min(...values) - 1, max = Math.max(...values) + 1;
  const x = index => left + (width - left - right) * (index + .5) / buckets.length;
  const y = value => top + (max - value) * plotHeight / (max - min);
  for (let k = 0; k <= 4; k++) {
    const value = min + k * (max - min) / 4;
    const py = y(value);
    svg.append(svgElement('line', { x1: left, x2: width - right, y1: py, y2: py, class: 'history-graph-gridline' }),
      svgElement('text', { x: left - 8, y: py + 4, 'text-anchor': 'end', class: 'history-graph-tick' }, value.toFixed(1)));
  }
  if (present.length > 1) {
    svg.appendChild(svgElement('polyline', {
      points: present.map(item => x(item.index) + ',' + y(item.bucket.weight)).join(' '),
      fill: 'none', class: 'history-graph-weight-line'
    }));
  }
  present.forEach(item => {
    const dot = svgElement('circle', { cx: x(item.index), cy: y(item.bucket.weight), r: 5, class: 'history-graph-weight-dot' });
    dot.appendChild(svgElement('title', {}, item.bucket.label + ': ' + item.bucket.weight + ' kg'));
    svg.appendChild(dot);
  });
  buckets.forEach((bucket, index) => svg.appendChild(svgElement('text', {
    x: x(index), y: height - 27, 'text-anchor': 'middle', class: 'history-graph-xlabel'
  }, bucket.label)));
  return svg;
}
function addBarChart(root, model, mode) {
  if (mode === 'paired') {
    const pane = chartWrapper('Food and Burn', 'Total kcal per ' + model.granularity + ' · actual entries, not estimates', [
      ['history-graph-food', 'Food'], ['history-graph-burn', 'Burn']
    ]);
    pane.scroll.appendChild(svgChart(model.buckets, 'paired', { keys: ['intake', 'burn'], title: 'Food and Burn' }));
    root.appendChild(pane.card);
    return;
  }
  const configs = {
    food: { title: 'Food intake', key: 'intake', legend: [['history-graph-food', 'Food kcal']] },
    burn: { title: 'Calories burned', key: 'burn', legend: [['history-graph-burn', 'Burn kcal']] },
    net: { title: 'Deficit / Surplus', key: 'net',
      legend: [['history-graph-net-negative', 'Deficit (negative)'], ['history-graph-net-positive', 'Surplus (positive)']] }
  };
  const conf = configs[mode];
  const pane = chartWrapper(conf.title, 'Totals per ' + model.granularity + (mode === 'net' ? ' · zero line separates deficit and surplus' : ''), conf.legend);
  pane.scroll.appendChild(svgChart(model.buckets, 'single', { keys: [conf.key], title: conf.title }));
  root.appendChild(pane.card);
}
function addWeightChart(root, model) {
  const pane = chartWrapper('Weight trend', 'Only periods with a recorded weigh-in are plotted', [
    ['history-graph-weight', 'Weight (kg)']
  ]);
  if (!model.weightRecords) pane.scroll.appendChild(element('p', 'empty-state', 'No weigh-ins recorded in this period.'));
  else pane.scroll.appendChild(weightChart(model.buckets));
  root.appendChild(pane.card);
}
function showManualCopy(report) {
  const overlay = element('div', 'history-graph-copy-overlay');
  const dialog = element('section', 'history-graph-copy-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.append(element('h3', '', 'Copy History Report'),
    element('p', 'subtle-label', 'Clipboard was blocked. Select and copy this report manually.'));
  const area = element('textarea');
  area.value = report;
  area.readOnly = true;
  dialog.append(area, button('Close', () => overlay.remove()));
  overlay.appendChild(dialog);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  area.focus();
  area.select();
}
export async function copyHistoryGraphReport(model) {
  const report = buildHistoryGraphReport(model);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(report);
    } else {
      const area = element('textarea');
      area.value = report;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const success = document.execCommand('copy');
      area.remove();
      if (!success) throw new Error('Clipboard access blocked');
    }
    showToast('History graph report copied', 'success');
  } catch (_) {
    showManualCopy(report);
    showToast('Clipboard unavailable — copy the report manually', 'error', 4000);
  }
}
export function renderHistoryGraph() {
  const model = buildHistoryGraphModel({
    entries: state.entriesFull, weights: state.weights,
    settings: state.settings, months: selection.months, metric: selection.metric,
    anchor: state.selectedDate
  });
  const root = element('div', 'history-graph-root');

  const controls = element('section', 'card history-graph-controls');
  const rangeLabel = element('label', 'history-graph-range-label');
  rangeLabel.appendChild(element('span', '', 'Time range'));
  const range = element('select');
  range.setAttribute('aria-label', 'Graph time range');
  GRAPH_PERIODS.forEach(option => {
    const entry = element('option', '', option.label);
    entry.value = option.value;
    range.appendChild(entry);
  });
  range.value = model.months;
  range.addEventListener('change', () => { selection.months = range.value; navigate('history'); });
  rangeLabel.appendChild(range);

  const viewLabel = element('label', 'history-graph-range-label');
  viewLabel.appendChild(element('span', '', 'Show'));
  const metric = element('select');
  metric.setAttribute('aria-label', 'Graph metric');
  GRAPH_METRICS.forEach(option => {
    const entry = element('option', '', option.label);
    entry.value = option.value;
    metric.appendChild(entry);
  });
  metric.value = model.metric;
  metric.addEventListener('change', () => { selection.metric = metric.value; navigate('history'); });
  viewLabel.appendChild(metric);

  const copy = button('📋 Copy Report', () => copyHistoryGraphReport(model), 'btn-purple history-graph-copy-button');
  controls.append(rangeLabel, viewLabel, copy);
  controls.appendChild(element('p', 'history-graph-period-label',
    dateUtils.formatDisplay(model.start) + ' – ' + dateUtils.formatDisplay(model.end) +
    ' · grouped by ' + model.granularity + ' · ' + model.loggedDays + ' logged day(s)'));
  root.appendChild(controls);

  const summaries = element('section', 'history-graph-summary');
  const metricCards = [
    ['🥦 Food', intFormat(model.intake) + ' kcal', 'Target ' + intFormat(model.targetFood), ''],
    ['🔥 Burn', intFormat(model.burn) + ' kcal', 'Target ' + intFormat(model.targetBurn), ''],
    ['📉 Net balance', (model.net > 0 ? '+' : '') + intFormat(model.net) + ' kcal', 'Target ' + intFormat(model.targetNet), model.net < 0 ? 'outcome-loss' : model.net > 0 ? 'outcome-gain' : ''],
    ['⚖️ Weight', model.weightLast ? model.weightLast.value + ' kg' : '—', model.weightRecords + ' recorded weigh-in(s)', '']
  ];
  metricCards.forEach(([heading, value, note, color]) => {
    const card = element('article', 'card history-graph-summary-card');
    card.append(element('h3', '', heading), element('strong', color, value), element('span', '', note));
    summaries.appendChild(card);
  });
  root.appendChild(summaries);
  const details = element('p', 'history-graph-note',
    'Logged days: ' + model.loggedDays + ' · Both food and burn: ' + model.completeDays +
    ' · Average per logged day: Food ' + (model.averageFood ?? '—') +
    ', Burn ' + (model.averageBurn ?? '—') + ', Net ' + (model.averageNet ?? '—') +
    ' kcal. Targets use all ' + model.periodDays + ' calendar days.');
  root.appendChild(details);

  if (!model.loggedDays && !model.weightRecords)
    root.appendChild(element('p', 'card empty-state', 'No fitness records found in the selected period.'));
  else {
    if (model.metric === 'overview') {
      addBarChart(root, model, 'paired');
      addBarChart(root, model, 'net');
      if (model.weightRecords) addWeightChart(root, model);
    } else if (model.metric === 'weight') addWeightChart(root, model);
    else addBarChart(root, model, model.metric);
  }
  const caption = element('p', 'history-graph-note',
    'Scroll charts sideways on smaller screens. Tap a bar or weight point for exact values where supported. Unlogged days are not assumed to be zero.');
  root.appendChild(caption);

  const disclosure = element('details', 'card history-graph-breakdown');
  disclosure.appendChild(element('summary', '', 'View data behind the graph'));
  const tableScroll = element('div', 'history-graph-breakdown-scroll');
  const table = element('table');
  const heading = element('thead');
  const row = element('tr');
  ['Period', 'Food', 'Burn', 'Net', 'Weight', 'Days logged'].forEach(text => row.appendChild(element('th', '', text)));
  heading.appendChild(row);
  table.appendChild(heading);
  const body = element('tbody');
  model.buckets.forEach(bucket => {
    const r = element('tr');
    [
      dateUtils.formatDisplay(bucket.start) + ' – ' + dateUtils.formatDisplay(bucket.end),
      intFormat(bucket.intake),
      intFormat(bucket.burn),
      intFormat(bucket.net),
      bucket.weight === null ? '—' : bucket.weight + ' kg',
      String(bucket.loggedDays)
    ].forEach(value => r.appendChild(element('td', '', value)));
    body.appendChild(r);
  });
  table.appendChild(body);
  tableScroll.appendChild(table);
  disclosure.appendChild(tableScroll);
  root.appendChild(disclosure);
  return root;
}
