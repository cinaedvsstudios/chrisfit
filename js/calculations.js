/*
  Calculations keep the Android data convention:
  food/intake = positive calories; burn/BMR = negative calories.
  The displayed Deficit figure is net calories (food minus burn):
  negative means deficit/loss direction, positive means surplus/gain direction.
*/

export function calculateDay(entries, settings = {}) {
  const intake = entries.filter(entry => Number(entry.calories) > 0)
    .reduce((sum, entry) => sum + Number(entry.calories), 0);
  const burn = entries.filter(entry => Number(entry.calories) < 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.calories)), 0);
  const net = intake - burn;
  const deficitTarget = Number(settings.dailyDeficit ?? 500);
  return { intake, burn, net, deficitTarget, achieved: net <= -deficitTarget };
}

export function calculateWeek(entries, settings = {}) {
  const totals = calculateDay(entries, settings);
  return {
    ...totals,
    weeklyFoodTarget: Number(settings.dailyCalories ?? 1500) * 7,
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
