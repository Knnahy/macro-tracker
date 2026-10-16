export const ENERGY_FACTORS = Object.freeze({
  protein: 4,
  carbs: 4,
  fat: 9,
  alcohol: 7
});

export const ACTIVITY_FACTORS = Object.freeze([1.2, 1.375, 1.55, 1.725, 1.9]);
export const KCAL_PER_KG_BODYWEIGHT = 7700;

export function calculateBMR({ sex, age, heightCm, weightKg }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  if (!w || !h || !a || w <= 0 || h <= 0 || a <= 0) return 0;
  const base = 10 * w + 6.25 * h - 5 * a;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calculateTDEE(bmr, activityLevel) {
  const b = Number(bmr);
  const act = Number(activityLevel);
  if (!b || b <= 0 || !act || act <= 0) return 0;
  return b * act;
}

export function getDefaultProteinPerKg(goal) {
  if (goal === 'loss') return 1.8;
  if (goal === 'gain') return 1.8;
  return 1.6;
}

export function calculateTargets(profile) {
  if (!profile) return null;
  const weightKg = Number(profile.weightKg);
  const heightCm = Number(profile.heightCm);
  const age = Number(profile.age);
  const sex = profile.sex === 'male' ? 'male' : 'female';
  const activityLevel = Number(profile.activityLevel) || 1.2;
  const goal = profile.goal || 'maintenance';
  const rateKgPerWeek = Math.max(0, Number(profile.rateKgPerWeek) || 0);

  if (!weightKg || !heightCm || !age || weightKg <= 0 || heightCm <= 0 || age <= 0) {
    return null;
  }

  const bmr = calculateBMR({ sex, age, heightCm, weightKg });
  const tdee = calculateTDEE(bmr, activityLevel);

  const dailyDelta = (rateKgPerWeek * KCAL_PER_KG_BODYWEIGHT) / 7;
  let rawTargetKcal = tdee;
  if (goal === 'loss') rawTargetKcal = tdee - dailyDelta;
  if (goal === 'gain') rawTargetKcal = tdee + dailyDelta;

  const warnings = [];
  let targetKcal = rawTargetKcal;

  if (targetKcal < bmr) {
    targetKcal = bmr;
    warnings.push('Target kcal was raised to your BMR safety floor.');
  }

  const minThreshold = sex === 'male' ? 1500 : 1200;
  if (targetKcal < minThreshold || rawTargetKcal < minThreshold) {
    warnings.push(
      `Warning: Target is below ${minThreshold} kcal/day (${sex} general clinical threshold). Verify with a healthcare professional.`
    );
  }

  const rawProtGKg = Number(profile.proteinPerKg) || getDefaultProteinPerKg(goal);
  const proteinPerKg = Math.min(2.2, Math.max(1.2, rawProtGKg));
  const proteinG = weightKg * proteinPerKg;
  const proteinKcal = proteinG * ENERGY_FACTORS.protein;

  const fatPct = Number(profile.fatPct) > 0 ? Number(profile.fatPct) : 25;
  const fatFromPctG = (targetKcal * (fatPct / 100)) / ENERGY_FACTORS.fat;
  const minFatG = weightKg * 0.6;
  const fatG = Math.max(fatFromPctG, minFatG);
  const fatKcal = fatG * ENERGY_FACTORS.fat;

  const remainingKcal = Math.max(0, targetKcal - proteinKcal - fatKcal);
  const carbsG = remainingKcal / ENERGY_FACTORS.carbs;

  const fiberG = (targetKcal / 1000) * 14;
  const waterMlPerKg = Number(profile.waterMlPerKg) > 0 ? Number(profile.waterMlPerKg) : 35;
  const waterMl = weightKg * waterMlPerKg;

  return {
    bmr,
    tdee,
    rawTargetKcal,
    targetKcal,
    proteinG,
    fatG,
    carbsG,
    fiberG,
    waterMl,
    proteinPerKg,
    fatPct,
    waterMlPerKg,
    warnings,
    formulaText: `Mifflin-St Jeor (${sex}): 10×${weightKg} + 6.25×${heightCm} - 5×${age} ${sex === 'male' ? '+ 5' : '- 161'} = ${bmr.toFixed(2)} kcal BMR; × ${activityLevel} = ${tdee.toFixed(1)} kcal TDEE.`
  };
}

export function computeAtwaterKcal(per100) {
  if (!per100) return 0;
  const p = Number(per100.protein) || 0;
  const c = Number(per100.carbs) || 0;
  const f = Number(per100.fat) || 0;
  const alc = Number(per100.alcohol) || 0;
  return (
    p * ENERGY_FACTORS.protein +
    c * ENERGY_FACTORS.carbs +
    f * ENERGY_FACTORS.fat +
    alc * ENERGY_FACTORS.alcohol
  );
}

export function checkLabelDiscrepancy(per100) {
  const enteredKcal = Number(per100?.kcal) || 0;
  const atwaterKcal = computeAtwaterKcal(per100);
  if (enteredKcal === 0 && atwaterKcal === 0) {
    return { hasWarning: false, atwaterKcal, enteredKcal, diffRatio: 0 };
  }
  const denominator = enteredKcal > 0 ? enteredKcal : atwaterKcal;
  const diffRatio = denominator > 0 ? Math.abs(atwaterKcal - enteredKcal) / denominator : 0;
  return {
    hasWarning: diffRatio > 0.15,
    atwaterKcal,
    enteredKcal,
    diffRatio
  };
}

export function scaleMicros(micros = {}, factor = 1) {
  const result = {};
  if (!micros || typeof micros !== 'object') return result;
  for (const [key, val] of Object.entries(micros)) {
    const num = Number(val);
    if (!Number.isNaN(num)) {
      result[key] = num * factor;
    }
  }
  return result;
}

export function addMicros(target = {}, source = {}) {
  const out = { ...target };
  if (!source || typeof source !== 'object') return out;
  for (const [key, val] of Object.entries(source)) {
    const num = Number(val);
    if (!Number.isNaN(num)) {
      out[key] = (Number(out[key]) || 0) + num;
    }
  }
  return out;
}

export function scaleNutrition(per100, grams) {
  const g = Number(grams) || 0;
  const factor = g / 100;
  return {
    kcal: (Number(per100?.kcal) || 0) * factor,
    protein: (Number(per100?.protein) || 0) * factor,
    carbs: (Number(per100?.carbs) || 0) * factor,
    sugars: (Number(per100?.sugars) || 0) * factor,
    fiber: (Number(per100?.fiber) || 0) * factor,
    fat: (Number(per100?.fat) || 0) * factor,
    satFat: (Number(per100?.satFat) || 0) * factor,
    sodiumMg: (Number(per100?.sodiumMg) || 0) * factor,
    micros: scaleMicros(per100?.micros, factor)
  };
}

export function sumNutrition(items = []) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item?.kcal) || 0),
      protein: acc.protein + (Number(item?.protein) || 0),
      carbs: acc.carbs + (Number(item?.carbs) || 0),
      sugars: acc.sugars + (Number(item?.sugars) || 0),
      fiber: acc.fiber + (Number(item?.fiber) || 0),
      fat: acc.fat + (Number(item?.fat) || 0),
      satFat: acc.satFat + (Number(item?.satFat) || 0),
      sodiumMg: acc.sodiumMg + (Number(item?.sodiumMg) || 0),
      micros: addMicros(acc.micros, item?.micros)
    }),
    {
      kcal: 0,
      protein: 0,
      carbs: 0,
      sugars: 0,
      fiber: 0,
      fat: 0,
      satFat: 0,
      sodiumMg: 0,
      micros: {}
    }
  );
}

export function computeDishNutrition(dishItemsWithFood, servings = 1) {
  let totalGrams = 0;
  const scaledParts = [];

  for (const row of dishItemsWithFood) {
    const g = Number(row.grams) || 0;
    if (!row.food || g <= 0) continue;
    totalGrams += g;
    scaledParts.push(scaleNutrition(row.food.per100, g));
  }

  const total = sumNutrition(scaledParts);
  const per100Factor = totalGrams > 0 ? 100 / totalGrams : 0;
  const per100 = {
    kcal: total.kcal * per100Factor,
    protein: total.protein * per100Factor,
    carbs: total.carbs * per100Factor,
    sugars: total.sugars * per100Factor,
    fiber: total.fiber * per100Factor,
    fat: total.fat * per100Factor,
    satFat: total.satFat * per100Factor,
    sodiumMg: total.sodiumMg * per100Factor,
    micros: scaleMicros(total.micros, per100Factor)
  };

  const srv = Number(servings) > 0 ? Number(servings) : 1;
  const perServing = {
    kcal: total.kcal / srv,
    protein: total.protein / srv,
    carbs: total.carbs / srv,
    sugars: total.sugars / srv,
    fiber: total.fiber / srv,
    fat: total.fat / srv,
    satFat: total.satFat / srv,
    sodiumMg: total.sodiumMg / srv,
    micros: scaleMicros(total.micros, 1 / srv)
  };

  return { totalGrams, total, per100, perServing };
}

export function computeRemaining(totals, targets) {
  if (!targets) return null;
  return {
    kcal: targets.targetKcal - totals.kcal,
    protein: targets.proteinG - totals.protein,
    carbs: targets.carbsG - totals.carbs,
    fat: targets.fatG - totals.fat,
    fiber: targets.fiberG - totals.fiber
  };
}

export function parseRestDays(restDaysInput) {
  const weekdays = new Set();
  const dates = new Set();
  if (!restDaysInput) return { weekdays, dates };

  const tokens = Array.isArray(restDaysInput)
    ? restDaysInput
    : String(restDaysInput).split(',');

  for (const raw of tokens) {
    const t = String(raw).trim();
    if (!t) continue;
    if (/^[0-6]$/.test(t)) {
      weekdays.add(Number(t));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      dates.add(t);
    }
  }
  return { weekdays, dates };
}

export function isRestDay(dateStr, parsedRest) {
  if (parsedRest.dates.has(dateStr)) return true;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return parsedRest.weekdays.has(dt.getDay());
}

export function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeStreaks({ logsByDate, waterByDate, targets, restDaysInput, todayStr }) {
  const parsedRest = parseRestDays(restDaysInput);

  // Collect all dates from earliest activity or 28 days ago up to todayStr
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayDate = new Date(ty, tm - 1, td);

  let earliestDate = new Date(ty, tm - 1, td - 27);
  const allKnownDates = [...Object.keys(logsByDate), ...Object.keys(waterByDate)];
  for (const ds of allKnownDates) {
    const [y, m, d] = ds.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt < earliestDate) earliestDate = dt;
  }

  const timeline = [];
  const cursor = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), earliestDate.getDate());
  while (cursor <= todayDate) {
    const ds = formatLocalDate(cursor);
    const dayLogs = logsByDate[ds] || [];
    const dayWater = waterByDate[ds] || [];
    const totals = sumNutrition(dayLogs.map((l) => l.snapshot));
    const totalWaterMl = dayWater.reduce((s, w) => s + (Number(w.ml) || 0), 0);

    const logMet = dayLogs.length >= 2;
    const targetMet =
      Boolean(targets) &&
      targets.targetKcal > 0 &&
      targets.proteinG > 0 &&
      totals.kcal >= targets.targetKcal * 0.9 &&
      totals.kcal <= targets.targetKcal * 1.1 &&
      totals.protein >= targets.proteinG * 0.9;
    const waterMet =
      Boolean(targets) &&
      targets.waterMl > 0 &&
      totalWaterMl >= targets.waterMl;

    timeline.push({
      date: ds,
      isRest: isRestDay(ds, parsedRest),
      logMet,
      targetMet,
      waterMet
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  function evaluateMetric(key) {
    let best = 0;
    let running = 0;
    for (const day of timeline) {
      if (day[key]) {
        running += 1;
        if (running > best) best = running;
      } else if (!day.isRest) {
        running = 0;
      }
    }

    let current = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      const day = timeline[i];
      if (day[key]) {
        current += 1;
      } else if (day.isRest || i === timeline.length - 1) {
        // Rest days or an still-in-progress today do not break the active streak from yesterday
        continue;
      } else {
        break;
      }
    }
    return { current, best };
  }

  return {
    logging: evaluateMetric('logMet'),
    target: evaluateMetric('targetMet'),
    water: evaluateMetric('waterMet'),
    last28Days: timeline.slice(-28)
  };
}