import { describe, expect, it } from 'vitest';
import { createWorkoutTemplateForDayType } from '../domain/defaults';
import {
  addDaysIsoDate,
  diffDaysIsoDate,
  estimateTreadmillCalories,
  getDayTypeForDate,
  getPreviousExercisePerformance,
  isWorkday,
  parseIsoDateLocal,
} from '../domain/training';
import type { WorkoutSession } from '../domain/types';

describe('training domain', () => {
  it('resolves schedule day types reliably in local calendar', () => {
    expect(parseIsoDateLocal('2026-11-24').getDay()).toBe(2); // Tuesday
    expect(getDayTypeForDate('2026-11-24')).toBe('workday_recovery');
    expect(getDayTypeForDate('2026-11-25')).toBe('workday_recovery');
    expect(getDayTypeForDate('2026-11-26')).toBe('workday_recovery');
    expect(getDayTypeForDate('2026-11-27')).toBe('workday_recovery');
    expect(isWorkday('workday_recovery')).toBe(true);

    expect(getDayTypeForDate('2026-11-28')).toBe('offday_sat_lower');
    expect(getDayTypeForDate('2026-11-29')).toBe('offday_sun_upper');
    expect(getDayTypeForDate('2026-11-30')).toBe('offday_mon_full');
    expect(isWorkday('offday_sat_lower')).toBe(false);

    expect(addDaysIsoDate('2026-11-24', 7)).toBe('2026-12-01');
    expect(diffDaysIsoDate('2026-11-24', '2027-06-15')).toBe(203);
  });

  it('creates exact Sat/Sun/Mon pre-populated splits (including 4x8-10 Bent-Over Row)', () => {
    const sat = createWorkoutTemplateForDayType(
      'offday_sat_lower',
      '2026-11-28',
      84.0,
    );
    expect(sat.exercises).toHaveLength(2);
    expect(sat.exercises[0].name).toBe('Barbell Back Squat');
    expect(sat.exercises[0].sets).toHaveLength(4);
    expect(sat.exercises[0].sets[0].targetRepsMin).toBe(6);
    expect(sat.exercises[0].sets[0].targetRepsMax).toBe(8);
    expect(sat.exercises[1].name).toBe('Barbell Romanian Deadlift');
    expect(sat.exercises[1].sets).toHaveLength(3);
    expect(sat.cardio).toHaveLength(1);
    expect(sat.cardio[0].durationMin).toBe(30);

    const sun = createWorkoutTemplateForDayType(
      'offday_sun_upper',
      '2026-11-29',
      84.0,
    );
    expect(sun.exercises).toHaveLength(3);
    expect(sun.exercises[0].name).toBe('Barbell Bench Press');
    expect(sun.exercises[0].sets).toHaveLength(4);
    expect(sun.exercises[1].name).toBe('Barbell Bent-Over Row');
    expect(sun.exercises[1].sets).toHaveLength(4);
    expect(sun.exercises[1].sets[0].targetRepsMin).toBe(8);
    expect(sun.exercises[1].sets[0].targetRepsMax).toBe(10);
    expect(sun.exercises[2].name).toBe('Dumbbell Shoulder Press');
    expect(sun.exercises[2].sets).toHaveLength(3);

    const mon = createWorkoutTemplateForDayType(
      'offday_mon_full',
      '2026-11-30',
      84.0,
    );
    expect(mon.exercises).toHaveLength(2);
    expect(mon.exercises[0].name).toBe('Dumbbell Goblet Squat');
    expect(mon.exercises[0].sets).toHaveLength(3);
    expect(mon.exercises[1].name).toBe('Incline Dumbbell Press');
    expect(mon.exercises[1].sets).toHaveLength(3);
    expect(mon.cardio).toHaveLength(1);
    expect(mon.cardio[0].mode).toBe('interval_run');
    expect(mon.cardio[0].durationMin).toBe(20);
  });

  it('calculates treadmill calories accurately with body weight, incline, and speed', () => {
    expect(
      estimateTreadmillCalories({
        durationMin: 22,
        inclinePct: 8,
        speedKph: 4.5,
        bodyWeightKg: 84.0,
      }),
    ).toBe(185);

    expect(
      estimateTreadmillCalories({
        durationMin: 0,
        inclinePct: 8,
        speedKph: 4.5,
        bodyWeightKg: 84.0,
      }),
    ).toBe(0);

    expect(
      estimateTreadmillCalories({
        durationMin: 22,
        inclinePct: 8,
        speedKph: 0,
        bodyWeightKg: 84.0,
      }),
    ).toBe(0);

    const lighterBurn = estimateTreadmillCalories({
      durationMin: 30,
      inclinePct: 8,
      speedKph: 4.5,
      bodyWeightKg: 70.0,
    });
    const heavierBurn = estimateTreadmillCalories({
      durationMin: 30,
      inclinePct: 8,
      speedKph: 4.5,
      bodyWeightKg: 84.0,
    });
    expect(heavierBurn).toBeGreaterThan(lighterBurn);

    const intervalRunBurn = estimateTreadmillCalories({
      durationMin: 20,
      inclinePct: 1,
      speedKph: 5.9,
      bodyWeightKg: 84.0,
      mode: 'interval_run',
      jogSpeedKph: 8.0,
      walkSpeedKph: 4.8,
    });
    expect(intervalRunBurn).toBeGreaterThan(100);
  });

  it('finds most recent logged previous exercise performance before a date', () => {
    const older = createWorkoutTemplateForDayType(
      'offday_sat_lower',
      '2026-11-28',
      84.0,
    );
    older.exercises[0].sets[0] = {
      ...older.exercises[0].sets[0],
      weightKg: 60,
      reps: 8,
      completed: true,
    };

    const newerUnlogged = createWorkoutTemplateForDayType(
      'offday_sat_lower',
      '2026-12-05',
      83.2,
    );

    const future = createWorkoutTemplateForDayType(
      'offday_sat_lower',
      '2026-12-19',
      82.0,
    );
    future.exercises[0].sets[0] = {
      ...future.exercises[0].sets[0],
      weightKg: 80,
      reps: 8,
      completed: true,
    };

    const workouts: WorkoutSession[] = [older, newerUnlogged, future];

    const prev = getPreviousExercisePerformance(
      'barbell_back_squat',
      '2026-12-12',
      workouts,
    );
    expect(prev).not.toBeNull();
    expect(prev?.[0].weightKg).toBe(60);
    expect(prev?.[0].reps).toBe(8);

    expect(
      getPreviousExercisePerformance(
        'barbell_back_squat',
        '2026-11-28',
        workouts,
      ),
    ).toBeNull();
  });

  it('guards NaN and Infinity inputs in treadmill calorie estimation', () => {
    const nanIncline = estimateTreadmillCalories({
      durationMin: 20,
      inclinePct: Number.NaN,
      speedKph: 4.5,
      bodyWeightKg: 84.0,
    });
    expect(Number.isFinite(nanIncline)).toBe(true);
    expect(nanIncline).toBeGreaterThanOrEqual(0);

    const infIncline = estimateTreadmillCalories({
      durationMin: 20,
      inclinePct: Number.POSITIVE_INFINITY,
      speedKph: 4.5,
      bodyWeightKg: 84.0,
    });
    expect(Number.isFinite(infIncline)).toBe(true);
    expect(infIncline).toBeGreaterThanOrEqual(0);

    const intervalNanIncline = estimateTreadmillCalories({
      durationMin: 20,
      inclinePct: Number.NaN,
      speedKph: 5.9,
      bodyWeightKg: 84.0,
      mode: 'interval_run',
      jogSpeedKph: 8.0,
      walkSpeedKph: 4.8,
    });
    expect(Number.isFinite(intervalNanIncline)).toBe(true);
    expect(intervalNanIncline).toBeGreaterThanOrEqual(0);

    expect(
      estimateTreadmillCalories({
        durationMin: 20,
        inclinePct: 8,
        speedKph: Number.NaN,
        bodyWeightKg: 84.0,
      }),
    ).toBe(0);

    expect(
      estimateTreadmillCalories({
        durationMin: Number.POSITIVE_INFINITY,
        inclinePct: 8,
        speedKph: 4.5,
        bodyWeightKg: 84.0,
      }),
    ).toBe(0);
  });

  it('rejects impossible calendar dates while allowing valid leap days', () => {
    expect(() => parseIsoDateLocal('2026-02-30')).toThrow(/Invalid calendar date/i);
    expect(() => parseIsoDateLocal('2026-13-45')).toThrow(/Invalid calendar date/i);
    expect(() => parseIsoDateLocal('2027-02-29')).toThrow(/Invalid calendar date/i);
    expect(() => diffDaysIsoDate('2026-02-30', '2026-03-01')).toThrow();
    expect(() => getDayTypeForDate('2026-13-01')).toThrow();
    expect(parseIsoDateLocal('2028-02-29').getDate()).toBe(29);
  });
});
