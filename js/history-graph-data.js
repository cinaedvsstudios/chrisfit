/*
 * History graph data model for ChrisFit.
 * Dates are local calendar days (YYYY-MM-DD), matching the existing History screen.
 * Net = food - burn. A negative net represents a calorie deficit.
 */
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';

export const GRAPH_PERIODS = [
  { value: '1', label: '1 month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '1 year' },
  { value: 'all', label: 'All history' }
];
export const GRAPH_GROUPINGS = [
  { value: 'detailed', label: 'Every recorded day' },
  { value: 'monthly', label: 'Monthly averages' }
];
export const GRAPH_METRICS = [
  { value: 'overview', label: 'Overview' },
  { value: 'food', label: 'Food' },
  { value: 'burn', label: 'Burn' },
  { value: 'net', label: 'Deficit' },
  { value: 'weight', label: 'Weight' }
];
const ONE_DAY_MS = 86400000;
function dayNumber(iso) {
  const parts = String(iso).split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) / ONE_DAY_MS;
}
function dayCount(start, end) { return Math.max(0, dayNumber(end) - dayNumber(start) + 1); }
function validDate(value) {
  const date = dateUtils.parseIso(value);
  return date && dateUtils.toIso(date) === value;
}
function localDateOf(value) {
  return typeof value === 'string' ? dateUtils.parseIso(value) : new Date(value);
}
function inclusiveStartForMonths(end, months) {
  const d = dateUtils.parseIso(end);
  return dateUtils.toIso(new Date(d.getFullYear(), d.getMonth() - months + 1, 1));
}
function chooseGranularity(months, start, end) {
  if (months === '1') return 'day';
  if (months === '3' || months === '6') return 'week';
  if (months === '12') return 'month';
  return dayCount(start, end) > 730 ? 'year' : 'month';
}
function bucketId(iso, granularity) {
  if (granularity === 'day') return iso;
  if (granularity === 'week') return dateUtils.getWeekStart(iso);
  if (granularity === 'month') return iso.slice(0, 7);
  return iso.slice(0, 4);
}
function moveBucket(date, granularity) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === 'day') d.setDate(d.getDate() + 1);
  if (granularity === 'week') d.setDate(d.getDate() + 7);
  if (granularity === 'month') d.setMonth(d.getMonth() + 1, 1);
  if (granularity === 'year') d.setFullYear(d.getFullYear() + 1, 0, 1);
  return d;
}
function bucketStartDate(iso, granularity) {
  const d = dateUtils.parseIso(iso);
  if (granularity === 'week') return dateUtils.parseIso(dateUtils.getWeekStart(iso));
  if (granularity === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (granularity === 'year') return new Date(d.getFullYear(), 0, 1);
  return d;
}
function shortLabel(start, granularity) {
  const d = dateUtils.parseIso(start);
  if (granularity === 'year') return String(d.getFullYear());
  if (granularity === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(d);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(d);
}
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function dayStatus(entries) {
  const byDay = new Map();
  entries.forEach(entry => {
    const state = byDay.get(entry.date) || { food: false, burn: false };
    if (number(entry.calories) > 0) state.food = true;
    if (number(entry.calories) < 0) state.burn = true;
    byDay.set(entry.date, state);
  });
  return {
    loggedDays: byDay.size,
    completeDays: [...byDay.values()].filter(day => day.food && day.burn).length,
    foodDays: [...byDay.values()].filter(day => day.food).length,
    burnDays: [...byDay.values()].filter(day => day.burn).length
  };
}
export function buildHistoryGraphModel({
  entries = [], weights = [], settings = {}, months = '3',
  anchor = new Date(), metric = 'overview', grouping = 'detailed'
} = {}) {
  const chosen = GRAPH_PERIODS.some(period => period.value === String(months)) ? String(months) : '3';
  const selectedMetric = GRAPH_METRICS.some(item => item.value === metric) ? metric : 'overview';
  const selectedGrouping = GRAPH_GROUPINGS.some(item => item.value === grouping) ? grouping : 'detailed';
  const now = dateUtils.toIso(new Date());
  const anchorDate = localDateOf(anchor);
  const proposedEnd = anchorDate && Number.isFinite(anchorDate.getTime()) ? dateUtils.toIso(anchorDate) : now;
  const end = proposedEnd > now ? now : proposedEnd;

  const sourceEntries = (Array.isArray(entries) ? entries : [])
    .filter(entry => entry && validDate(entry.date) && Number.isFinite(Number(entry.calories)) && entry.date <= end);
  const sourceWeights = (Array.isArray(weights) ? weights : [])
    .filter(weight => weight && validDate(weight.date) && Number.isFinite(Number(weight.value)) && number(weight.value) > 0 && weight.date <= end);
  const earliest = [...sourceEntries, ...sourceWeights].map(item => item.date).sort()[0];
  const start = chosen === 'all' ? (earliest || end) : inclusiveStartForMonths(end, Number(chosen));
  const rangeEntries = sourceEntries.filter(entry => entry.date >= start && entry.date <= end);
  const rangeWeights = sourceWeights.filter(weight => weight.date >= start && weight.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || number(a.id) - number(b.id));
  const granularity = selectedGrouping === 'monthly' ? 'month' : 'day';
  const buckets = [];
  const lookup = new Map();
  if (selectedGrouping === 'monthly') {
    let cursor = bucketStartDate(start, 'month');
    while (dateUtils.toIso(cursor) <= end) {
      const first = dateUtils.toIso(cursor);
      const next = moveBucket(cursor, 'month');
      const last = dateUtils.toIso(new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1));
      const clippedStart = first < start ? start : first;
      const clippedEnd = last > end ? end : last;
      const id = first.slice(0, 7);
      const bucket = { id, start: clippedStart, end: clippedEnd, label: shortLabel(first, 'month'),
        entries: [], weights: [], days: dayCount(clippedStart, clippedEnd) };
      buckets.push(bucket);
      lookup.set(id, bucket);
      cursor = next;
    }
  } else {
    // One plot point for every recorded calendar day; keep all underlying entries
    // separately in entryRecords so multiple meals/burns are never lost.
    const dates = [...new Set([...rangeEntries, ...rangeWeights].map(item => item.date))].sort();
    dates.forEach(iso => {
      const bucket = { id: iso, start: iso, end: iso, label: shortLabel(iso, 'day'),
        entries: [], weights: [], days: 1 };
      buckets.push(bucket);
      lookup.set(iso, bucket);
    });
  }

  rangeEntries.forEach(entry => lookup.get(bucketId(entry.date, granularity))?.entries.push(entry));
  rangeWeights.forEach(weight => lookup.get(bucketId(weight.date, granularity))?.weights.push(weight));
  buckets.forEach(bucket => {
    const totals = calc.calculateDay(bucket.entries, settings);
    const status = dayStatus(bucket.entries);
    const weightMin = bucket.weights.length
      ? bucket.weights.reduce((best, weight) => !best || number(weight.value) < number(best.value) ? weight : best, null)
      : null;
    const finalWeight = bucket.weights.length ? bucket.weights[bucket.weights.length - 1] : null;
    // An incomplete day must never become a fabricated net-balance observation.
    const completeDates = new Set();
    const dayTypes = new Map();
    bucket.entries.forEach(entry => {
      const types = dayTypes.get(entry.date) || { food: false, burn: false };
      if (number(entry.calories) > 0) types.food = true;
      if (number(entry.calories) < 0) types.burn = true;
      dayTypes.set(entry.date, types);
    });
    dayTypes.forEach((types, day) => { if (types.food && types.burn) completeDates.add(day); });
    const completeNet = calc.calculateDay(bucket.entries.filter(entry => completeDates.has(entry.date)), settings).net;
    const monthly = selectedGrouping === 'monthly';
    Object.assign(bucket, status, {
      intakeTotal: totals.intake, burnTotal: totals.burn, netTotal: totals.net,
      intake: monthly ? (status.foodDays ? totals.intake / status.foodDays : null) : (status.foodDays ? totals.intake : null),
      burn: monthly ? (status.burnDays ? totals.burn / status.burnDays : null) : (status.burnDays ? totals.burn : null),
      net: monthly ? (status.completeDays ? completeNet / status.completeDays : null)
        : (status.completeDays ? totals.net : null),
      weight: monthly ? (weightMin ? number(weightMin.value) : null) : (finalWeight ? number(finalWeight.value) : null),
      weightDate: monthly ? weightMin?.date ?? null : finalWeight?.date ?? null,
      targetFood: number(settings.dailyCalories ?? 1500) * (monthly ? 1 : bucket.days),
      targetBurn: number(settings.dailyBurnTarget ?? 2500) * (monthly ? 1 : bucket.days),
      targetNet: -Math.abs(number(settings.dailyDeficit ?? 500)) * (monthly ? 1 : bucket.days)
    });
    delete bucket.entries;
    delete bucket.weights;
  });

  const totals = calc.calculateDay(rangeEntries, settings);
  const status = dayStatus(rangeEntries);
  const periodDays = dayCount(start, end);
  const firstWeight = rangeWeights[0] || null;
  const lastWeight = rangeWeights[rangeWeights.length - 1] || null;
  return {
    months: chosen, metric: selectedMetric, grouping: selectedGrouping, start, end, granularity, buckets,
    entryRecords: rangeEntries.slice().sort((a, b) => a.date.localeCompare(b.date)),
    weightMeasurements: rangeWeights.map(w => ({ date: w.date, value: number(w.value) })),
    lowestWeight: rangeWeights.length ? {
      date: rangeWeights.reduce((best, weight) => number(weight.value) < number(best.value) ? weight : best).date,
      value: Math.min(...rangeWeights.map(w => number(w.value)))
    } : null,
    periodDays, ...status, ...totals,
    targetFood: number(settings.dailyCalories ?? 1500) * periodDays,
    targetBurn: number(settings.dailyBurnTarget ?? 2500) * periodDays,
    targetNet: -Math.abs(number(settings.dailyDeficit ?? 500)) * periodDays,
    averageFood: status.loggedDays ? Math.round(totals.intake / status.loggedDays) : null,
    averageBurn: status.loggedDays ? Math.round(totals.burn / status.loggedDays) : null,
    averageNet: status.loggedDays ? Math.round(totals.net / status.loggedDays) : null,
    weightFirst: firstWeight ? { date: firstWeight.date, value: number(firstWeight.value) } : null,
    weightLast: lastWeight ? { date: lastWeight.date, value: number(lastWeight.value) } : null,
    weightRecords: rangeWeights.length
  };
}
function reportMetric(model) {
  return GRAPH_METRICS.find(item => item.value === model.metric)?.label || 'Overview';
}
function niceNumber(num) { return Number(num).toLocaleString('en-GB', { maximumFractionDigits: 1 }); }
export function buildHistoryGraphReport(model) {
  const periodLabel = GRAPH_PERIODS.find(item => item.value === model.months)?.label || '3 months';
  const stats = [
    'ChrisFit — History Graph Report',
    'Period: ' + dateUtils.formatDisplay(model.start) + ' – ' + dateUtils.formatDisplay(model.end),
    'Range: ' + periodLabel + ' | Grouped by: ' + model.granularity + ' | View: ' + reportMetric(model),
    'Days in range: ' + model.periodDays + ' | Logged days: ' + model.loggedDays + ' | Days with both food and burn: ' + model.completeDays,
    '',
    'TOTALS',
    'Food: ' + niceNumber(model.intake) + ' kcal / ' + niceNumber(model.targetFood) + ' kcal calendar target',
    'Burn: ' + niceNumber(model.burn) + ' kcal / ' + niceNumber(model.targetBurn) + ' kcal calendar target',
    'Net (food − burn): ' + niceNumber(model.net) + ' kcal / ' + niceNumber(model.targetNet) + ' kcal calendar target',
    'Daily averages per logged day — Food: ' + (model.averageFood ?? 'n/a') +
      ' kcal; Burn: ' + (model.averageBurn ?? 'n/a') + ' kcal; Net: ' + (model.averageNet ?? 'n/a') + ' kcal'
  ];
  if (model.weightRecords) {
    stats.push('Recorded weight: ' + niceNumber(model.weightFirst.value) + ' kg (' + dateUtils.formatDisplay(model.weightFirst.date) +
      ') → ' + niceNumber(model.weightLast.value) + ' kg (' + dateUtils.formatDisplay(model.weightLast.date) + '); change ' +
      (model.weightLast.value - model.weightFirst.value >= 0 ? '+' : '') +
      niceNumber(model.weightLast.value - model.weightFirst.value) + ' kg');
  }
  stats.push('', 'PERIOD BREAKDOWN');
  model.buckets.forEach(bucket => {
    const name = dateUtils.formatDisplay(bucket.start) + ' – ' + dateUtils.formatDisplay(bucket.end);
    const data = [];
    if (model.metric === 'overview' || model.metric === 'food') data.push('Food ' + niceNumber(bucket.intake));
    if (model.metric === 'overview' || model.metric === 'burn') data.push('Burn ' + niceNumber(bucket.burn));
    if (model.metric === 'overview' || model.metric === 'net') data.push('Net ' + niceNumber(bucket.net));
    if (model.metric === 'overview' || model.metric === 'weight') {
      data.push('Weight ' + (bucket.weight === null ? 'no weigh-in' : niceNumber(bucket.weight) + ' kg'));
    }
    stats.push(name + ' | ' + data.join(' | ') + ' | Logged days ' + bucket.loggedDays);
  });
  stats.push('', 'Negative net means a calorie deficit; positive net means a surplus.',
    'Calendar targets cover every day in the selected range, including days with missing entries.',
    'A missing food or burn entry is not assumed to be a real zero.');
  return stats.join('\n');
}
