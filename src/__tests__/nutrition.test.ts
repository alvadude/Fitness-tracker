import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGETS } from '../domain/defaults';
import {
  computeRemainingMacros,
  generateEveningAdvice,
  shouldWarnCaffeine,
  sumDailyMacros,
} from '../domain/nutrition';
import { SEED_DATES, createInitialSeedState } from '../domain/seed';

describe('nutrition domain', () => {
  it('sums Nov 24, Nov 25, and Nov 26 seed meals accurately', () => {
    const seed = createInitialSeedState();
    const nov24Meals = seed.meals.filter((m) => m.date === SEED_DATES.DAY_1);
    const nov25Meals = seed.meals.filter((m) => m.date === SEED_DATES.DAY_2);
    const nov26Meals = seed.meals.filter((m) => m.date === SEED_DATES.DAY_3);

    expect(nov24Meals).toHaveLength(6);
    expect(sumDailyMacros(nov24Meals)).toEqual({
      calories: 2318,
      proteinG: 170,
      carbsG: 199,
      fatG: 92,
    });

    expect(nov25Meals).toHaveLength(9);
    expect(sumDailyMacros(nov25Meals)).toEqual({
      calories: 2630,
      proteinG: 165,
      carbsG: 259,
      fatG: 102,
    });

    expect(nov26Meals).toHaveLength(1);
    expect(sumDailyMacros(nov26Meals)).toEqual({
      calories: 560,
      proteinG: 15,
      carbsG: 56,
      fatG: 29,
    });
  });

  it('computes remaining macros accurately against Week 1 targets', () => {
    const seed = createInitialSeedState();
    const nov24Totals = sumDailyMacros(
      seed.meals.filter((m) => m.date === SEED_DATES.DAY_1),
    );
    expect(computeRemainingMacros(DEFAULT_TARGETS, nov24Totals)).toEqual({
      calories: -418,
      proteinG: -10,
      carbsG: -19,
      fatG: -32,
    });

    const nov26Totals = sumDailyMacros(
      seed.meals.filter((m) => m.date === SEED_DATES.DAY_3),
    );
    expect(computeRemainingMacros(DEFAULT_TARGETS, nov26Totals)).toEqual({
      calories: 1340,
      proteinG: 145,
      carbsG: 124,
      fatG: 31,
    });
  });

  it('enforces the after-6:00 PM caffeine warning rules', () => {
    expect(shouldWarnCaffeine('17:59', true)).toBe(false);
    expect(shouldWarnCaffeine('18:00', true)).toBe(true);
    expect(shouldWarnCaffeine('21:30', true)).toBe(true);
    expect(shouldWarnCaffeine('02:00', true)).toBe(true);
    expect(shouldWarnCaffeine('04:00', true)).toBe(false);
    expect(shouldWarnCaffeine('20:00', false)).toBe(false);
    expect(shouldWarnCaffeine('16:00', true, 16)).toBe(true);
    expect(shouldWarnCaffeine('invalid', true)).toBe(false);
  });

  it('generates Smart Evening Advisor recommendations for all rule branches', () => {
    // 1. Over calories -> cardio_offset
    const surplusAdvice = generateEveningAdvice({
      remainingKcal: -300,
      remainingProteinG: 0,
      loggedFatG: 80,
      targetFatG: 60,
      cardioBurnToday: 0,
      currentHour: 20,
      currentWeightKg: 84.0,
    });
    expect(surplusAdvice.type).toBe('cardio_offset');
    expect(surplusAdvice.suggestedWalkMinutes).toBeGreaterThanOrEqual(15);
    expect(surplusAdvice.recommendedAction?.type).toBe('log_incline_walk');

    // Cardio burn offsets the surplus so advisor does not suggest extra walk
    const offsetByCardioAdvice = generateEveningAdvice({
      remainingKcal: -150,
      remainingProteinG: 5,
      loggedFatG: 55,
      targetFatG: 60,
      cardioBurnToday: 185,
      currentHour: 20,
      currentWeightKg: 84.0,
    });
    expect(offsetByCardioAdvice.type).toBe('on_track');

    // 2. Large protein gap + calorie headroom -> 2 scoops caffeine-free whey
    const twoScoopsAdvice = generateEveningAdvice({
      remainingKcal: 320,
      remainingProteinG: 45,
      loggedFatG: 40,
      targetFatG: 60,
      cardioBurnToday: 0,
      currentHour: 19,
      currentWeightKg: 84.0,
    });
    expect(twoScoopsAdvice.type).toBe('whey_two_scoops');
    expect(twoScoopsAdvice.message).toContain('caffeine-free');
    expect(twoScoopsAdvice.recommendedAction?.type).toBe(
      'add_whey_2_caffeine_free',
    );

    // 3. Moderate protein gap + headroom -> 1 scoop caffeine-free whey
    const oneScoopAdvice = generateEveningAdvice({
      remainingKcal: 160,
      remainingProteinG: 22,
      loggedFatG: 45,
      targetFatG: 60,
      cardioBurnToday: 0,
      currentHour: 17,
      currentWeightKg: 84.0,
    });
    expect(oneScoopAdvice.type).toBe('whey_one_scoop');
    expect(oneScoopAdvice.recommendedAction?.type).toBe(
      'add_whey_1_caffeine_free',
    );

    // 4. Protein needed + tight calories -> whey + walk
    const wheyPlusWalkAdvice = generateEveningAdvice({
      remainingKcal: 60,
      remainingProteinG: 20,
      loggedFatG: 50,
      targetFatG: 60,
      cardioBurnToday: 0,
      currentHour: 20,
      currentWeightKg: 84.0,
    });
    expect(wheyPlusWalkAdvice.type).toBe('whey_plus_walk');
    expect(wheyPlusWalkAdvice.suggestedWalkMinutes).toBe(15);

    // 5. On track
    const onTrackAdvice = generateEveningAdvice({
      remainingKcal: 40,
      remainingProteinG: 5,
      loggedFatG: 55,
      targetFatG: 60,
      cardioBurnToday: 0,
      currentHour: 21,
      currentWeightKg: 84.0,
    });
    expect(onTrackAdvice.type).toBe('on_track');

    // 6. Fat-surplus-only with positive remaining calories avoids "0 kcal over net target"
    const fatSurplusOnlyAdvice = generateEveningAdvice({
      remainingKcal: 40,
      remainingProteinG: 0,
      loggedFatG: 80,
      targetFatG: 60,
      cardioBurnToday: 0,
      currentHour: 20,
      currentWeightKg: 84.0,
    });
    expect(fatSurplusOnlyAdvice.type).toBe('cardio_offset');
    expect(fatSurplusOnlyAdvice.message).not.toContain('0 kcal over net target');
    expect(fatSurplusOnlyAdvice.message).toContain('High fat intake');
    expect(fatSurplusOnlyAdvice.suggestedWalkMinutes).toBeGreaterThanOrEqual(15);
  });
});
