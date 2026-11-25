import { describe, expect, it } from 'vitest';
import { sumDailyMacros } from '../domain/nutrition';
import { SEED_DATES } from '../domain/seed';
import {
  IndexedDbRepository,
  clearStoredGeminiApiKey,
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
} from '../services/storage';

describe('storage repository', () => {
  it('seeds initial Nov 24 & Nov 25 data on first launch and stays idempotent', async () => {
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_fittrack_seed_1',
    });
    const state = await repo.initializeIfNeeded();

    expect(state.initialized).toBe(true);
    expect(state.weighIns).toHaveLength(1);
    expect(state.weighIns[0].weightKg).toBe(84.0);
    expect(state.weighIns[0].date).toBe(SEED_DATES.DAY_1);

    const day1Meals = state.meals.filter((m) => m.date === SEED_DATES.DAY_1);
    expect(day1Meals).toHaveLength(6);
    expect(sumDailyMacros(day1Meals)).toEqual({
      calories: 2318,
      proteinG: 170,
      carbsG: 199,
      fatG: 92,
    });

    const day2Meals = state.meals.filter((m) => m.date === SEED_DATES.DAY_2);
    expect(day2Meals).toHaveLength(1);
    expect(sumDailyMacros(day2Meals)).toEqual({
      calories: 35,
      proteinG: 0,
      carbsG: 3,
      fatG: 2,
    });

    expect(state.workouts).toHaveLength(1);
    expect(state.workouts[0].cardio[0].durationMin).toBe(22);
    expect(state.workouts[0].cardio[0].estimatedCaloriesBurned).toBe(185);

    // Mutate state, then re-initialize -> must preserve edits
    await repo.upsertMeal({
      id: 'custom-meal-1',
      date: SEED_DATES.DAY_2,
      time: '12:00',
      name: 'Chicken breast',
      calories: 250,
      proteinG: 45,
      carbsG: 0,
      fatG: 5,
      source: 'manual',
      isCaffeinated: false,
      createdAt: '2026-11-25T04:00:00.000Z',
    });

    const reinit = await repo.initializeIfNeeded();
    expect(reinit.meals.some((m) => m.id === 'custom-meal-1')).toBe(true);
  });

  it('persists meals, workouts, weigh-ins, profile, and targets across repository instances', async () => {
    const key = 'test_fittrack_persist';
    const repo1 = new IndexedDbRepository({ localStorageKey: key });
    await repo1.initializeIfNeeded();

    await repo1.upsertMeal({
      id: 'm-persist',
      date: '2026-11-25',
      time: '19:00',
      name: 'Active Whey 1 scoop',
      calories: 124,
      proteinG: 24,
      carbsG: 3,
      fatG: 2,
      source: 'preset',
      isCaffeinated: false,
      caffeineVariant: 'caffeine-free',
      createdAt: '2026-11-25T11:00:00.000Z',
    });
    await repo1.upsertWeighIn({
      id: 'w-persist',
      date: '2026-11-28',
      weightKg: 83.2,
      isFasted: true,
      createdAt: '2026-11-28T07:00:00.000Z',
    });
    await repo1.saveTargets({
      calories: 1850,
      proteinG: 165,
      carbsG: 170,
      fatG: 55,
      weekNumber: 2,
    });

    const repo2 = new IndexedDbRepository({ localStorageKey: key });
    const loaded = await repo2.getState();

    expect(loaded.meals.some((m) => m.id === 'm-persist')).toBe(true);
    expect(
      loaded.weighIns.find((w) => w.id === 'w-persist')?.weightKg,
    ).toBe(83.2);
    expect(loaded.targets.weekNumber).toBe(2);
    expect(loaded.targets.calories).toBe(1850);
  });

  it('exports backup without geminiApiKey and validates backup imports atomically', async () => {
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_fittrack_backup',
    });
    await repo.initializeIfNeeded();

    setStoredGeminiApiKey('secret-gemini-key-123');
    expect(getStoredGeminiApiKey()).toBe('secret-gemini-key-123');

    await repo.upsertMeal({
      id: 'backup-meal',
      date: '2026-11-25',
      time: '13:00',
      name: 'Salmon bowl',
      calories: 550,
      proteinG: 40,
      carbsG: 50,
      fatG: 20,
      source: 'manual',
      isCaffeinated: false,
      createdAt: '2026-11-25T05:00:00.000Z',
    });

    const backup = await repo.exportBackup();
    expect(JSON.stringify(backup)).not.toContain('secret-gemini-key-123');
    expect(backup.schemaVersion).toBe(1);

    // Invalid import must reject without wiping existing state
    await expect(
      repo.importBackup({ schemaVersion: 99, bad: true }),
    ).rejects.toThrow(/schemaVersion/i);
    const stillPresent = await repo.getState();
    expect(stillPresent.meals.some((m) => m.id === 'backup-meal')).toBe(true);

    // Reset to seed, then restore backup
    const resetState = await repo.resetToSeed();
    expect(resetState.meals.some((m) => m.id === 'backup-meal')).toBe(false);

    const restored = await repo.importBackup(backup);
    expect(restored.meals.some((m) => m.id === 'backup-meal')).toBe(true);

    clearStoredGeminiApiKey();
    expect(getStoredGeminiApiKey()).toBe('');
  });

  it('rejects impossible calendar dates and corrupt nested backup elements atomically', async () => {
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_fittrack_backup_strict',
    });
    await repo.initializeIfNeeded();
    await repo.upsertMeal({
      id: 'existing-safe-meal',
      date: '2026-11-25',
      time: '12:00',
      name: 'Grilled chicken',
      calories: 300,
      proteinG: 45,
      carbsG: 0,
      fatG: 8,
      source: 'manual',
      isCaffeinated: false,
      createdAt: '2026-11-25T04:00:00.000Z',
    });

    const validBackup = await repo.exportBackup();

    // Impossible calendar dates in profile / meals
    await expect(
      repo.importBackup({
        ...validBackup,
        profile: { ...validBackup.profile, startDate: '2026-02-30' },
      }),
    ).rejects.toThrow(/valid YYYY-MM-DD/i);

    await expect(
      repo.importBackup({
        ...validBackup,
        meals: [{ ...validBackup.meals[0], date: '2026-13-45' }],
      }),
    ).rejects.toThrow(/valid YYYY-MM-DD/i);

    // Corrupt nested workout exercises / sets / cardio / meal aiItems
    await expect(
      repo.importBackup({
        ...validBackup,
        workouts: [
          {
            ...validBackup.workouts[0],
            exercises: [null],
          },
        ],
      }),
    ).rejects.toThrow(/exercises\[0\]/i);

    await expect(
      repo.importBackup({
        ...validBackup,
        workouts: [
          {
            ...validBackup.workouts[0],
            exercises: [{ exerciseId: 'barbell_back_squat', sets: 'invalid' }],
          },
        ],
      }),
    ).rejects.toThrow(/sets must be an array/i);

    await expect(
      repo.importBackup({
        ...validBackup,
        workouts: [
          {
            ...validBackup.workouts[0],
            cardio: [{ id: '', durationMin: 20 }],
          },
        ],
      }),
    ).rejects.toThrow(/cardio\[0\]\.id/i);

    await expect(
      repo.importBackup({
        ...validBackup,
        meals: [
          {
            ...validBackup.meals[0],
            aiItems: [{ name: 'Rice', calories: -10 }],
          },
        ],
      }),
    ).rejects.toThrow(/aiItems\[0\]\.calories/i);

    // Existing state remains completely untouched
    const current = await repo.getState();
    expect(current.meals.some((m) => m.id === 'existing-safe-meal')).toBe(true);
  });
});
