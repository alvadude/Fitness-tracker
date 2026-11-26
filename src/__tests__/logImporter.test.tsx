import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import {
  mergeImportedLogsIntoState,
  parseSeedHandoffInput,
} from '../domain/logImporter';
import { createInitialSeedState } from '../domain/seed';
import { IndexedDbRepository } from '../services/storage';

const SAMPLE_HANDOFF_MARKDOWN = `
## 1. Tuesday, Nov 24, 2026 — Status: Finalized
- **Workout / Activity:** 22-minute treadmill walk (8% incline, 4.5 km/h) — ~185 kcal estimated burn
1. **Breakfast — Pancit sotanghon & toast:** 360 kcal | 10g P | 59g C | 9g F

## 2. Wednesday, Nov 25, 2026 — Status: Finalized
- **Workout / Activity:** 2 hours of pickleball — ~575 kcal estimated burn
1. **Breakfast — Black coffee + 1 mini Meiji matcha chocolate:** 35 kcal | 0g P | 3g C | 2g F
2. **Post-Game Meal — Chicken pastil (1 serving):** 350 kcal | 18g P | 48g C | 9g F

## 3. Friday, Nov 27, 2026 — Status: In Progress
- **Workout / Activity:** 45-minute basketball pickup game — ~420 kcal estimated burn
1. **Breakfast — Eggs & whole wheat toast:** 410 kcal | 28g P | 36g C | 16g F
2. **Lunch — Grilled chicken breast & rice:** 540 kcal | 52g P | 58g C | 10g F
`;

describe('Markdown / JSON Seed Importer', () => {
  it('parses Markdown handoff and appends only new days without duplicating existing seed meals/workouts', () => {
    const seed = createInitialSeedState();
    const parsed = parseSeedHandoffInput(SAMPLE_HANDOFF_MARKDOWN, 84);

    expect(parsed.meals).toHaveLength(5);
    expect(parsed.workouts).toHaveLength(3);
    expect(parsed.workouts[1].cardio[0].mode).toBe('sport');
    expect(parsed.workouts[1].cardio[0].activityLabel).toBe('Pickleball');
    expect(parsed.workouts[1].cardio[0].durationMin).toBe(120);
    expect(parsed.workouts[1].cardio[0].estimatedCaloriesBurned).toBe(575);

    const summary = mergeImportedLogsIntoState(seed, parsed);
    // Nov 25 breakfast & chicken pastil already exist in seed; Nov 24 breakfast name differs slightly ("&" vs "+") so check Nov 27 additions & Nov 25 skips
    expect(summary.skippedMeals).toBeGreaterThanOrEqual(2);
    expect(summary.addedWorkouts).toBe(1); // Only Nov 27 workout is new (Nov 24 & 25 already exist)
    expect(
      summary.nextState.meals.filter((m) => m.date === '2026-11-27'),
    ).toHaveLength(2);
    expect(
      summary.nextState.workouts.find((w) => w.date === '2026-11-27')?.cardio[0]
        ?.estimatedCaloriesBurned,
    ).toBe(420);

    // Re-importing the exact same payload is completely idempotent
    const secondRun = mergeImportedLogsIntoState(summary.nextState, parsed);
    expect(secondRun.addedMeals).toBe(0);
    expect(secondRun.addedWorkouts).toBe(0);
    expect(secondRun.skippedMeals).toBe(5);
  });

  it('parses JSON append payloads with optional photoUrl', () => {
    const jsonInput = JSON.stringify({
      meals: [
        {
          date: '2026-11-27',
          time: '12:30',
          name: 'Tuna Poke Bowl',
          calories: 520,
          proteinG: 42,
          carbsG: 54,
          fatG: 14,
          photoUrl: 'https://example.com/poke.jpg',
        },
      ],
    });

    const parsed = parseSeedHandoffInput(jsonInput, 84);
    expect(parsed.meals).toHaveLength(1);
    expect(parsed.meals[0].photoUrl).toBe('https://example.com/poke.jpg');
  });

  it('appends Markdown logs through SettingsView UI and persists them', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_settings_append_logs',
    });

    render(
      <App
        repository={repo}
        initialTab="settings"
        initialDate="2026-11-26"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Append Logs (Markdown / JSON)'),
      ).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText('Markdown or JSON Log Payload');
    await user.type(
      textarea,
      '## Friday, Nov 27, 2026\n1. **Breakfast — Oatmeal & whey:** 430 kcal | 34g P | 52g C | 9g F',
    );
    await user.click(screen.getByRole('button', { name: 'Append Logs' }));

    await waitFor(() => {
      expect(screen.getByText(/Added 1 meal\./i)).toBeInTheDocument();
    });

    const persisted = await repo.getState();
    const nov27Meals = persisted.meals.filter((m) => m.date === '2026-11-27');
    expect(nov27Meals).toHaveLength(1);
    expect(nov27Meals[0].calories).toBe(430);
    expect(nov27Meals[0].proteinG).toBe(34);
  });
});
