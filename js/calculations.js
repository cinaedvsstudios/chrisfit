/*
  ChrisFit calculation rules.
  Food/intake is stored positive; burn and BMR are stored negative.
  Displayed Deficit is the net result (food minus burn): a negative value is
  a calorie deficit and a positive value is a surplus.
*/

export function calculateDay(entries = [], settings = {}) {
  const safeSettings = settings || {};
  const intake = entries.filter(entry => Number(entry.calories) > 0)
    .reduce((sum, entry) => sum + Number(entry.calories), 0);
  const burn = entries.filter(entry => Number(entry.calories) < 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.calories)), 0);
  const net = intake - burn;
  const deficitTarget = Number(safeSettings.dailyDeficit ?? 500);
  return { intake, burn, net, deficitTarget, achieved: net <= -deficitTarget };
}

export function calculateWeek(entries = [], settings = {}) {
  const safeSettings = settings || {};
  const totals = calculateDay(entries, safeSettings);
  return {
    ...totals,
    weeklyFoodTarget: Number(safeSettings.dailyCalories ?? 1500) * 7,
    weeklyDeficitTarget: Number(safeSettings.dailyDeficit ?? 500) * 7
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

/** Estimate the full-day total burn by adding only remaining BMR-paced burn. */
export function estimateBurnToMidnight(currentTotalBurn, bmr, now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  const remainingHours = Math.max(0, (tomorrow.getTime() - now.getTime()) / 3600000);
  const remainingBaseline = (Number(bmr) / 24) * remainingHours;
  return {
    remainingHours,
    remainingBaseline: Math.round(remainingBaseline),
    total: Math.round(Number(currentTotalBurn) + remainingBaseline)
  };
}
