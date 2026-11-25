import { sumDailyMacros } from './nutrition';
import { addDaysIsoDate, diffDaysIsoDate } from './training';
import type {
  DailyAdherencePoint,
  IsoDate,
  MacroTargets,
  MealEntry,
  OverloadSuggestion,
  UserProfile,
  WeeklyReportSummary,
  WeighInEntry,
  WorkoutSession,
} from './types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function expectedTrajectoryWeight(
  date: IsoDate,
  profile: UserProfile,
): number {
  const totalDays = diffDaysIsoDate(profile.startDate, profile.targetDate);
  if (totalDays <= 0) {
    return profile.targetWeightKg;
  }
  const elapsed = diffDaysIsoDate(profile.startDate, date);
  const ratio = Math.min(1, Math.max(0, elapsed / totalDays));
  const weight =
    profile.startWeightKg +
    (profile.targetWeightKg - profile.startWeightKg) * ratio;
  return round2(weight);
}

export function buildTrajectorySeries(
  profile: UserProfile,
  stepDays = 7,
): { date: IsoDate; expectedWeightKg: number }[] {
  const step = Math.max(1, Math.round(stepDays));
  const totalDays = diffDaysIsoDate(profile.startDate, profile.targetDate);
  if (totalDays <= 0) {
    return [
      {
        date: profile.targetDate,
        expectedWeightKg: profile.targetWeightKg,
      },
    ];
  }

  const series: { date: IsoDate; expectedWeightKg: number }[] = [];
  for (let offset = 0; offset < totalDays; offset += step) {
    const date = addDaysIsoDate(profile.startDate, offset);
    series.push({
      date,
      expectedWeightKg: expectedTrajectoryWeight(date, profile),
    });
  }

  series.push({
    date: profile.targetDate,
    expectedWeightKg: expectedTrajectoryWeight(profile.targetDate, profile),
  });

  return series;
}

export function computeDailyAdherenceSeries(
  meals: readonly MealEntry[],
  targets: MacroTargets,
  endDate: IsoDate,
  days = 7,
): DailyAdherencePoint[] {
  const safeDays = Math.max(1, Math.round(days));
  const points: DailyAdherencePoint[] = [];

  for (let i = safeDays - 1; i >= 0; i--) {
    const date = addDaysIsoDate(endDate, -i);
    const dayMeals = meals.filter((m) => m.date === date);
    const hasLogs = dayMeals.length > 0;
    const totals = sumDailyMacros(dayMeals);

    points.push({
      date,
      calories: totals.calories,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
      hasLogs,
      calorieAdherencePct:
        targets.calories > 0
          ? Math.round((totals.calories / targets.calories) * 100)
          : 0,
      proteinAdherencePct:
        targets.proteinG > 0
          ? Math.round((totals.proteinG / targets.proteinG) * 100)
          : 0,
    });
  }

  return points;
}

export function computeWeeklyReport(params: {
  endDate: IsoDate;
  profile: UserProfile;
  targets: MacroTargets;
  meals: readonly MealEntry[];
  workouts: readonly WorkoutSession[];
  weighIns: readonly WeighInEntry[];
}): WeeklyReportSummary {
  const { endDate, profile, targets, meals, workouts, weighIns } = params;
  const startDate = addDaysIsoDate(endDate, -6);

  const sortedWeighIns = [...weighIns]
    .filter((w) => w.date <= endDate)
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      return dateCmp !== 0 ? dateCmp : a.createdAt.localeCompare(b.createdAt);
    });

  const latestWeighIn =
    sortedWeighIns.length > 0
      ? sortedWeighIns[sortedWeighIns.length - 1]
      : null;

  const currentWeightKg = latestWeighIn
    ? latestWeighIn.weightKg
    : profile.startWeightKg;

  const expectedWeightKg = expectedTrajectoryWeight(endDate, profile);
  const deltaVsTrajectoryKg = round2(currentWeightKg - expectedWeightKg);

  let weeklyLossRateKg: number | null = null;
  if (latestWeighIn) {
    const baseline =
      sortedWeighIns.length >= 2
        ? sortedWeighIns[0]
        : { date: profile.startDate, weightKg: profile.startWeightKg };
    const spanDays = diffDaysIsoDate(baseline.date, latestWeighIn.date);
    if (spanDays >= 7) {
      weeklyLossRateKg = round2(
        (latestWeighIn.weightKg - baseline.weightKg) / (spanDays / 7),
      );
    }
  }

  const adherenceSeries = computeDailyAdherenceSeries(meals, targets, endDate, 7);
  const loggedDays = adherenceSeries.filter((d) => d.hasLogs);
  const loggedDaysCount = loggedDays.length;

  const avgCalories =
    loggedDaysCount > 0
      ? Math.round(
          loggedDays.reduce((sum, d) => sum + d.calories, 0) / loggedDaysCount,
        )
      : 0;
  const avgProteinG =
    loggedDaysCount > 0
      ? Math.round(
          (loggedDays.reduce((sum, d) => sum + d.proteinG, 0) /
            loggedDaysCount) *
            10,
        ) / 10
      : 0;

  const calorieAdherencePct =
    targets.calories > 0 && loggedDaysCount > 0
      ? Math.round((avgCalories / targets.calories) * 100)
      : 0;
  const proteinAdherencePct =
    targets.proteinG > 0 && loggedDaysCount > 0
      ? Math.round((avgProteinG / targets.proteinG) * 100)
      : 0;

  const daysWithinCalorieTarget = loggedDays.filter(
    (d) =>
      targets.calories > 0 &&
      Math.abs(d.calories - targets.calories) <= targets.calories * 0.1,
  ).length;

  const daysHitProteinTarget = loggedDays.filter(
    (d) => targets.proteinG > 0 && d.proteinG >= targets.proteinG * 0.9,
  ).length;

  const completedWindowWorkouts = workouts
    .filter((w) => w.date >= startDate && w.date <= endDate && w.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  const completedWorkoutsCount = completedWindowWorkouts.length;
  const completedStrengthSplitsCount = completedWindowWorkouts.filter(
    (w) => w.dayType !== 'workday_recovery',
  ).length;
  const plannedStrengthSplitsCount = 3;

  const seenExercises = new Set<string>();
  const overloadSuggestions: OverloadSuggestion[] = [];

  for (const workout of completedWindowWorkouts) {
    for (const ex of workout.exercises) {
      if (seenExercises.has(ex.exerciseId) || ex.sets.length === 0) {
        continue;
      }
      const allSetsHitTop = ex.sets.every(
        (s) =>
          s.completed &&
          s.weightKg !== null &&
          s.weightKg > 0 &&
          s.reps !== null &&
          s.reps >= s.targetRepsMax,
      );
      if (allSetsHitTop) {
        seenExercises.add(ex.exerciseId);
        const maxWeight = Math.max(...ex.sets.map((s) => s.weightKg ?? 0));
        const incrementKg = ex.equipment === 'barbell' ? 2.5 : 2.0;
        overloadSuggestions.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          currentWeightKg: maxWeight,
          suggestedWeightKg: round2(maxWeight + incrementKg),
          incrementKg,
          reason: `Completed all ${ex.sets.length} sets at ${ex.sets[0].targetRepsMax}+ reps.`,
        });
      }
    }
  }

  let nextWeekRecommendation: WeeklyReportSummary['nextWeekRecommendation'];

  if (loggedDaysCount < 4) {
    nextWeekRecommendation = {
      action: 'maintain',
      summary:
        'Keep Week ' +
        (targets.weekNumber + 1) +
        ' targets steady and aim for at least 4–7 days of consistent meal logging before adjusting calories.',
      suggestedTargets: {
        ...targets,
        weekNumber: targets.weekNumber + 1,
      },
    };
  } else if (deltaVsTrajectoryKg > 0.5 && calorieAdherencePct >= 95) {
    const newCalories = Math.max(1500, targets.calories - 100);
    const newCarbs = Math.max(80, targets.carbsG - 25);
    nextWeekRecommendation = {
      action: 'decrease_calories',
      summary: `Weight is ${deltaVsTrajectoryKg.toFixed(2)} kg above trajectory despite strong adherence. Trim 100 kcal (-25g carbs) for Week ${targets.weekNumber + 1}.`,
      suggestedTargets: {
        ...targets,
        calories: newCalories,
        carbsG: newCarbs,
        weekNumber: targets.weekNumber + 1,
      },
    };
  } else if (deltaVsTrajectoryKg < -0.7) {
    const newCalories = targets.calories + 100;
    const newCarbs = targets.carbsG + 25;
    nextWeekRecommendation = {
      action: 'increase_calories',
      summary: `Losing faster than planned (${deltaVsTrajectoryKg.toFixed(2)} kg ahead of trajectory). Add 100 kcal (+25g carbs) to protect muscle and recovery.`,
      suggestedTargets: {
        ...targets,
        calories: newCalories,
        carbsG: newCarbs,
        weekNumber: targets.weekNumber + 1,
      },
    };
  } else {
    nextWeekRecommendation = {
      action: 'maintain',
      summary: `Tracking well with the 84.0 -> 65.0 kg trajectory. Hold calories at ${targets.calories} kcal and progress lifts where suggested.`,
      suggestedTargets: {
        ...targets,
        weekNumber: targets.weekNumber + 1,
      },
    };
  }

  return {
    startDate,
    endDate,
    currentWeightKg,
    expectedWeightKg,
    deltaVsTrajectoryKg,
    weeklyLossRateKg,
    loggedDaysCount,
    avgCalories,
    avgProteinG,
    calorieAdherencePct,
    proteinAdherencePct,
    daysWithinCalorieTarget,
    daysHitProteinTarget,
    completedWorkoutsCount,
    completedStrengthSplitsCount,
    plannedStrengthSplitsCount,
    overloadSuggestions,
    nextWeekRecommendation,
  };
}
