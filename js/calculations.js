/*
  Calculation utilities.

  Reproduces the daily and weekly calculations used by the Android app.
  Intake is the sum of positive calories, burn is the sum of negative
  calories (absolute value), and net is intake minus burn.  Colours are
  determined by comparing net against the daily or weekly deficit target.
*/

export function calculateDay(entries, settings) {
  const intake = entries.filter(e => e.calories > 0).reduce((sum, e) => sum + e.calories, 0);
  const burn = entries.filter(e => e.calories < 0).reduce((sum, e) => sum + Math.abs(e.calories), 0);
  const net = intake - burn;
  const deficitTarget = settings?.dailyDeficit ?? 500;
  const color = net <= -deficitTarget ? 'green' : 'red';
  return { intake, burn, net, color };
}

export function calculateWeek(entries, settings, daysSoFar) {
  // daysSoFar: number of days in week considered (Mon to current day)
  const intake = entries.filter(e => e.calories > 0).reduce((sum, e) => sum + e.calories, 0);
  const burn = entries.filter(e => e.calories < 0).reduce((sum, e) => sum + Math.abs(e.calories), 0);
  const net = intake - burn;
  const dailyTarget = settings?.dailyCalories ?? 1500;
  const deficitTarget = settings?.dailyDeficit ?? 500;
  const weeklyTarget = dailyTarget * daysSoFar;
  const weeklyDeficitTarget = deficitTarget * daysSoFar;
  const color = net <= -weeklyDeficitTarget ? 'green' : 'red';
  return { intake, burn, net, weeklyTarget, weeklyDeficitTarget, color };
}

export function calculateBMI(weightKg, heightM = 1.8) {
  if (!weightKg) return null;
  return weightKg / (heightM * heightM);
}