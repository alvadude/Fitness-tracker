import { estimateTreadmillKcalPerMin } from './training';
import type {
  EveningAdviceInput,
  EveningAdviceResult,
  MacroTargets,
  MacroTotals,
  MealEntry,
} from './types';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sumDailyMacros(meals: readonly MealEntry[]): MacroTotals {
  let calories = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;

  for (const meal of meals) {
    calories += meal.calories;
    proteinG += meal.proteinG;
    carbsG += meal.carbsG;
    fatG += meal.fatG;
  }

  return {
    calories: round1(calories),
    proteinG: round1(proteinG),
    carbsG: round1(carbsG),
    fatG: round1(fatG),
  };
}

export function computeRemainingMacros(
  targets: MacroTargets,
  logged: MacroTotals,
): MacroTotals {
  return {
    calories: round1(targets.calories - logged.calories),
    proteinG: round1(targets.proteinG - logged.proteinG),
    carbsG: round1(targets.carbsG - logged.carbsG),
    fatG: round1(targets.fatG - logged.fatG),
  };
}

export function shouldWarnCaffeine(
  timeHHmm: string,
  isCaffeinated: boolean,
  cutoffHour = 18,
): boolean {
  if (!isCaffeinated) {
    return false;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeHHmm.trim());
  if (!match) {
    return false;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return false;
  }
  return hour >= cutoffHour || hour < 4;
}

export function generateEveningAdvice(
  input: EveningAdviceInput,
): EveningAdviceResult {
  const effectiveRemainingKcal =
    input.remainingKcal + Math.max(0, input.cardioBurnToday);
  const isEveningOrNight = input.currentHour >= 18 || input.currentHour < 4;
  const sleepSuffix = isEveningOrNight
    ? ' Choose caffeine-free after 6:00 PM to protect sleep.'
    : '';

  // 1. Over calorie budget or high-fat meal offset
  if (
    effectiveRemainingKcal < -100 ||
    (input.loggedFatG > input.targetFatG + 15 && effectiveRemainingKcal < 100)
  ) {
    const excessKcal = Math.max(0, -effectiveRemainingKcal);
    const targetBurn =
      excessKcal > 0
        ? excessKcal
        : Math.max(120, Math.round((input.loggedFatG - input.targetFatG) * 9));

    const computedRate = estimateTreadmillKcalPerMin(
      input.currentWeightKg,
      8,
      4.5,
      'incline_walk',
    );
    const rate = computedRate > 0 ? computedRate : 8.42;
    const suggestedWalkMinutes = Math.min(
      45,
      Math.max(15, Math.ceil(targetBurn / rate)),
    );
    const suggestedWalkBurnKcal = Math.round(suggestedWalkMinutes * rate);

    const roundedExcessKcal = Math.round(excessKcal);
    const leadMessage =
      roundedExcessKcal > 0
        ? `You are ${roundedExcessKcal} kcal over net target${input.loggedFatG > input.targetFatG + 15 ? ` with ${round1(input.loggedFatG)}g fat logged` : ''}.`
        : `High fat intake (${Math.round(input.loggedFatG)}g vs ${Math.round(input.targetFatG)}g target) with limited calorie room (${Math.round(effectiveRemainingKcal)} kcal left).`;

    return {
      type: 'cardio_offset',
      title: 'Offset Surplus with Incline Walk',
      message: `${leadMessage} A ${suggestedWalkMinutes}-min treadmill walk at 8% incline (4.5 kph) burns ~${suggestedWalkBurnKcal} kcal.`,
      suggestedWalkMinutes,
      suggestedWalkBurnKcal,
      recommendedAction: {
        type: 'log_incline_walk',
        label: `Log ${suggestedWalkMinutes}m Incline Walk (~${suggestedWalkBurnKcal} kcal)`,
      },
    };
  }

  // 2. Large protein gap with plenty of calorie headroom -> 2 scoops caffeine-free whey
  if (input.remainingProteinG >= 35 && effectiveRemainingKcal >= 220) {
    return {
      type: 'whey_two_scoops',
      title: '2 Scoops Caffeine-Free Active Whey',
      message: `You still need ${round1(input.remainingProteinG)}g protein with ${Math.round(effectiveRemainingKcal)} kcal left. Take 2 scoops of caffeine-free Active Whey (248 kcal, 48g protein).${sleepSuffix}`,
      recommendedAction: {
        type: 'add_whey_2_caffeine_free',
        label: 'Add 2 Scoops Caffeine-Free Whey',
      },
    };
  }

  // 3. Moderate protein gap with room -> 1 scoop caffeine-free whey
  if (input.remainingProteinG >= 15 && effectiveRemainingKcal >= 100) {
    return {
      type: 'whey_one_scoop',
      title: '1 Scoop Caffeine-Free Active Whey',
      message: `You need ${round1(input.remainingProteinG)}g more protein and have ${Math.round(effectiveRemainingKcal)} kcal remaining. Add 1 scoop of caffeine-free Active Whey (124 kcal, 24g protein).${sleepSuffix}`,
      recommendedAction: {
        type: 'add_whey_1_caffeine_free',
        label: 'Add 1 Scoop Caffeine-Free Whey',
      },
    };
  }

  // 4. Protein needed, tight calories -> 1 scoop whey + short walk
  if (input.remainingProteinG >= 15 && effectiveRemainingKcal < 100) {
    const computedRate = estimateTreadmillKcalPerMin(
      input.currentWeightKg,
      8,
      4.5,
      'incline_walk',
    );
    const rate = computedRate > 0 ? computedRate : 8.42;
    const suggestedWalkMinutes = 15;
    const suggestedWalkBurnKcal = Math.round(suggestedWalkMinutes * rate);

    return {
      type: 'whey_plus_walk',
      title: '1 Scoop Whey + 15m Easy Incline Walk',
      message: `You need ${round1(input.remainingProteinG)}g protein with tight calories (${Math.round(effectiveRemainingKcal)} kcal left). Pair 1 scoop caffeine-free Active Whey (124 kcal) with a ${suggestedWalkMinutes}-min incline walk (~${suggestedWalkBurnKcal} kcal burn).${sleepSuffix}`,
      suggestedWalkMinutes,
      suggestedWalkBurnKcal,
      recommendedAction: {
        type: 'add_whey_1_caffeine_free',
        label: 'Add 1 Scoop Caffeine-Free Whey',
      },
    };
  }

  // 5. On track
  return {
    type: 'on_track',
    title: 'Macros On Track for Today',
    message:
      'Your calories and protein are right on target. Stay hydrated and aim for 7+ hours of sleep.',
    recommendedAction: {
      type: 'none',
      label: 'On Track',
    },
  };
}
