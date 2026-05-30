/* Food is stored positive; burn/BMR/estimated burn are stored negative. */
export function calculateDay(entries = [], settings = {}) {
  const intake = entries.filter(entry => Number(entry.calories) > 0).reduce((sum, entry) => sum + Number(entry.calories), 0);
  const burn = entries.filter(entry => Number(entry.calories) < 0).reduce((sum, entry) => sum + Math.abs(Number(entry.calories)), 0);
  const net = intake - burn;
  const deficitTarget = Number(settings.dailyDeficit ?? 500);
  return { intake, burn, net, deficitTarget, achieved: net <= -deficitTarget };
}

export function calculateWeek(entries = [], settings = {}) {
  const totals = calculateDay(entries, settings);
  return {
    ...totals,
    weeklyFoodTarget: Number(settings.dailyCalories ?? 1500) * 7,
    weeklyBurnTarget: Number(settings.dailyBurnTarget ?? 2500) * 7,
    weeklyDeficitTarget: Number(settings.dailyDeficit ?? 500) * 7
  };
}

export function calculateBMI(weightKg, heightM = 1.8) {
  if (!weightKg) return null;
  return Number(weightKg) / (heightM * heightM);
}

export function estimateWeightText(netCalories) {
  const net = Number(netCalories);
  if (net === 0) return 'This week is approximately weight-neutral.';
  const grams = Math.round((Math.abs(net) / 7700) * 1000);
  if (net < 0) return `This week should help you lose approximately ${grams} g.`;
  return `This week may cause you to gain approximately ${grams} g.`;
}

/** Estimate total burn by adding remaining hours only at BMR pace. */
export function estimateBurnToMidnight(currentTotalBurn, bmr, now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  const remainingHours = Math.max(0, (tomorrow.getTime() - now.getTime()) / 3600000);
  const remainingBaseline = (Number(bmr) / 24) * remainingHours;
  return { remainingHours, remainingBaseline: Math.round(remainingBaseline), total: Math.round(Number(currentTotalBurn) + remainingBaseline) };
}


/**
 * Return the most recent weigh-in available on or before the selected date.
 * Future weights are never carried backward when reviewing earlier dates.
 */
export function getWeightForDate(weights = [], selectedIso) {
  return weights
    .filter(weight => String(weight.date) <= String(selectedIso))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}
