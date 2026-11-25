import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  DEFAULT_TARGETS,
  createWorkoutTemplateForDayType,
} from '../domain/defaults';
import {
  buildTrajectorySeries,
  computeDailyAdherenceSeries,
  computeWeeklyReport,
  expectedTrajectoryWeight,
} from '../domain/progress';
import type { MealEntry, WeighInEntry, WorkoutSession } from '../domain/types';

describe('progress domain', () => {
  it('computes linear trajectory from 84.0 kg on 2026-11-24 to 65.0 kg on 2027-06-15', () => {
    expect(expectedTrajectoryWeight('2026-11-24', DEFAULT_PROFILE)).toBe(84.0);
    expect(expectedTrajectoryWeight('2027-06-15', DEFAULT_PROFILE)).toBe(65.0);
    expect(expectedTrajectoryWeight('2026-11-01', DEFAULT_PROFILE)).toBe(84.0);
    expect(expectedTrajectoryWeight('2027-07-01', DEFAULT_PROFILE)).toBe(65.0);

    // 203 total days -> ~0.655 kg/week loss
    const oneWeekLater = expectedTrajectoryWeight(
      '2026-12-01',
      DEFAULT_PROFILE,
    );
    expect(oneWeekLater).toBeCloseTo(83.34, 2);

    const series = buildTrajectorySeries(DEFAULT_PROFILE, 14);
    expect(series[0]).toEqual({ date: '2026-11-24', expectedWeightKg: 84 });
    expect(series[series.length - 1]).toEqual({
      date: '2027-06-15',
      expectedWeightKg: 65,
    });
  });

  it('computes weekly report card, overload suggestions, and Week N+1 recommendations', () => {
    const dates = [
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ];
    const meals: MealEntry[] = dates.map((date, idx) => ({
      id: `m-${idx}`,
      date,
      time: '12:00',
      name: 'Meal',
      calories: 1900,
      proteinG: 160,
      carbsG: 180,
      fatG: 60,
      source: 'manual',
      isCaffeinated: false,
      createdAt: `${date}T04:00:00.000Z`,
    }));

    const sat = createWorkoutTemplateForDayType(
      'offday_sat_lower',
      '2026-11-28',
      83.3,
    );
    sat.completed = true;
    sat.exercises[0].sets = sat.exercises[0].sets.map((s) => ({
      ...s,
      weightKg: 70,
      reps: 8,
      completed: true,
    }));

    const sun = createWorkoutTemplateForDayType(
      'offday_sun_upper',
      '2026-11-29',
      83.3,
    );
    sun.completed = true;
    sun.exercises[2].sets = sun.exercises[2].sets.map((s) => ({
      ...s,
      weightKg: 14,
      reps: 12,
      completed: true,
    }));

    const workouts: WorkoutSession[] = [sat, sun];
    const weighIns: WeighInEntry[] = [
      {
        id: 'w1',
        date: '2026-11-24',
        weightKg: 84.0,
        isFasted: true,
        createdAt: '2026-11-24T07:00:00.000Z',
      },
      {
        id: 'w2',
        date: '2026-12-01',
        weightKg: 83.3,
        isFasted: true,
        createdAt: '2026-12-01T07:00:00.000Z',
      },
    ];

    const adherence = computeDailyAdherenceSeries(
      meals,
      DEFAULT_TARGETS,
      '2026-12-01',
      7,
    );
    expect(adherence).toHaveLength(7);
    expect(adherence.every((d) => d.calorieAdherencePct === 100)).toBe(true);

    const report = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: DEFAULT_TARGETS,
      meals,
      workouts,
      weighIns,
    });

    expect(report.currentWeightKg).toBe(83.3);
    expect(report.weeklyLossRateKg).toBe(-0.7);
    expect(report.calorieAdherencePct).toBe(100);
    expect(report.proteinAdherencePct).toBe(100);
    expect(report.daysWithinCalorieTarget).toBe(7);
    expect(report.daysHitProteinTarget).toBe(7);
    expect(report.completedStrengthSplitsCount).toBe(2);
    expect(report.plannedStrengthSplitsCount).toBe(3);

    expect(report.overloadSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exerciseId: 'barbell_back_squat',
          currentWeightKg: 70,
          suggestedWeightKg: 72.5,
          incrementKg: 2.5,
        }),
        expect.objectContaining({
          exerciseId: 'db_shoulder_press',
          currentWeightKg: 14,
          suggestedWeightKg: 16,
          incrementKg: 2.0,
        }),
      ]),
    );
    expect(report.nextWeekRecommendation.action).toBe('maintain');
    expect(report.nextWeekRecommendation.suggestedTargets.weekNumber).toBe(2);

    // Plateau scenario -> decrease_calories
    const plateauReport = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: DEFAULT_TARGETS,
      meals,
      workouts,
      weighIns: [
        {
          id: 'w1',
          date: '2026-11-24',
          weightKg: 84.0,
          isFasted: true,
          createdAt: '2026-11-24T07:00:00.000Z',
        },
        {
          id: 'w2',
          date: '2026-12-01',
          weightKg: 84.2,
          isFasted: true,
          createdAt: '2026-12-01T07:00:00.000Z',
        },
      ],
    });
    expect(plateauReport.nextWeekRecommendation.action).toBe(
      'decrease_calories',
    );
    expect(
      plateauReport.nextWeekRecommendation.suggestedTargets.calories,
    ).toBe(1800);

    // Low-logging guard (< 4 logged days)
    const lowLoggingReport = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: DEFAULT_TARGETS,
      meals: meals.slice(0, 2),
      workouts: [],
      weighIns,
    });
    expect(lowLoggingReport.loggedDaysCount).toBe(2);
    expect(lowLoggingReport.nextWeekRecommendation.action).toBe('maintain');
  });
});
