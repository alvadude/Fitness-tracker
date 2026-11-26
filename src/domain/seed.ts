import {
  DEFAULT_FOOD_PRESETS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_TARGETS,
} from './defaults';
import { estimateTreadmillCalories } from './training';
import type { FitnessAppState } from './types';

export const CURRENT_SEED_REVISION = 2;

export const SEED_DATES = {
  DAY_1: '2026-11-24',
  DAY_2: '2026-11-25',
  DAY_3: '2026-11-26',
} as const;

export function createInitialSeedState(): FitnessAppState {
  const day1WalkBurn = estimateTreadmillCalories({
    durationMin: 22,
    inclinePct: 8,
    speedKph: 4.5,
    bodyWeightKg: DEFAULT_PROFILE.startWeightKg,
    mode: 'incline_walk',
  });

  return {
    initialized: true,
    seedRevision: CURRENT_SEED_REVISION,
    profile: { ...DEFAULT_PROFILE },
    targets: { ...DEFAULT_TARGETS },
    presets: DEFAULT_FOOD_PRESETS.map((preset) => ({ ...preset })),
    settings: { ...DEFAULT_SETTINGS },
    weighIns: [
      {
        id: 'seed-weighin-2026-11-24',
        date: SEED_DATES.DAY_1,
        weightKg: 84.0,
        isFasted: true,
        notes: 'Starting baseline',
        createdAt: '2026-11-24T07:00:00.000Z',
      },
    ],
    meals: [
      // Tuesday, Nov 24, 2026 — Finalized (2,318 kcal | 170g P | 199g C | 92g F)
      {
        id: 'seed-meal-2026-11-24-1',
        date: SEED_DATES.DAY_1,
        time: '08:30',
        name: 'Pancit sotanghon + toast',
        calories: 360,
        proteinG: 10,
        carbsG: 59,
        fatG: 9,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-24T00:30:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-24-2',
        date: SEED_DATES.DAY_1,
        time: '12:30',
        name: 'Buffet lunch — braised beef, sweet & sour pork, rice, fried chicken, lumpia',
        calories: 990,
        proteinG: 60,
        carbsG: 84,
        fatG: 45,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-24T04:30:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-24-3',
        date: SEED_DATES.DAY_1,
        time: '13:15',
        name: 'Second helping — braised beef + skinless fried chicken',
        calories: 380,
        proteinG: 40,
        carbsG: 7,
        fatG: 21,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-24T05:15:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-24-4',
        date: SEED_DATES.DAY_1,
        time: '16:00',
        name: 'Afternoon snack — homemade fries + bread',
        calories: 230,
        proteinG: 5,
        carbsG: 35,
        fatG: 8,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-24T08:00:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-24-5',
        date: SEED_DATES.DAY_1,
        time: '19:00',
        name: 'Dinner — 2 scoops caffeine-free Active Whey',
        calories: 248,
        proteinG: 48,
        carbsG: 6,
        fatG: 4,
        source: 'seed',
        isCaffeinated: false,
        caffeineVariant: 'caffeine-free',
        createdAt: '2026-11-24T11:00:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-24-6',
        date: SEED_DATES.DAY_1,
        time: '21:00',
        name: 'Late bite — 2 tbsp rice + 2 tbsp corned beef',
        calories: 110,
        proteinG: 7,
        carbsG: 8,
        fatG: 5,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-24T13:00:00.000Z',
      },

      // Wednesday, Nov 25, 2026 — Finalized (2,630 kcal | 165g P | 259g C | 102g F)
      {
        id: 'seed-meal-2026-11-25-1',
        date: SEED_DATES.DAY_2,
        time: '08:00',
        name: 'Black coffee + 1 mini Meiji matcha chocolate',
        calories: 35,
        proteinG: 0,
        carbsG: 3,
        fatG: 2,
        source: 'seed',
        isCaffeinated: true,
        createdAt: '2026-11-25T00:00:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-2',
        date: SEED_DATES.DAY_2,
        time: '10:30',
        name: 'Morning Snack — Crustless white bread sandwich (1 whole / 2 triangles) + thick-cut potato fries (~10–12 pcs)',
        calories: 340,
        proteinG: 8,
        carbsG: 43,
        fatG: 15,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T02:30:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-3',
        date: SEED_DATES.DAY_2,
        time: '12:30',
        name: 'Lunch (Buffet Round 1) — Steamed dory, chicken with savory sauce, beef and broccoli, steamed white rice (~3/4 cup)',
        calories: 750,
        proteinG: 70,
        carbsG: 50,
        fatG: 29,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T04:30:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-4',
        date: SEED_DATES.DAY_2,
        time: '13:15',
        name: 'Lunch (Buffet Round 2) — Beef and broccoli, steamed dory, steamed white rice (~1/2 cup), small chicken scrap',
        calories: 505,
        proteinG: 50,
        carbsG: 32,
        fatG: 19,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T05:15:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-5',
        date: SEED_DATES.DAY_2,
        time: '14:00',
        name: 'Snack — 1 cubic inch brownie (square 1)',
        calories: 75,
        proteinG: 1,
        carbsG: 10,
        fatG: 4,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T06:00:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-6',
        date: SEED_DATES.DAY_2,
        time: '14:10',
        name: 'Snack — 1 cubic inch brownie (square 2)',
        calories: 75,
        proteinG: 1,
        carbsG: 10,
        fatG: 4,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T06:10:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-7',
        date: SEED_DATES.DAY_2,
        time: '15:00',
        name: 'Afternoon — Creamy potato salad with carrots (~1/2 to 3/4 cup in mug)',
        calories: 180,
        proteinG: 2,
        carbsG: 18,
        fatG: 11,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T07:00:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-8',
        date: SEED_DATES.DAY_2,
        time: '16:15',
        name: 'Afternoon/Meal — Wide-noodle soup with meat/filling (~3/4–1 cup) + 1 slice white bread',
        calories: 320,
        proteinG: 15,
        carbsG: 45,
        fatG: 9,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T08:15:00.000Z',
      },
      {
        id: 'seed-meal-2026-11-25-9',
        date: SEED_DATES.DAY_2,
        time: '20:30',
        name: 'Post-Game Meal — Chicken pastil (1 serving)',
        calories: 350,
        proteinG: 18,
        carbsG: 48,
        fatG: 9,
        source: 'seed',
        isCaffeinated: false,
        createdAt: '2026-11-25T12:30:00.000Z',
      },

      // Thursday, Nov 26, 2026 — In Progress (560 kcal | 15g P | 56g C | 29g F)
      {
        id: 'seed-meal-2026-11-26-1',
        date: SEED_DATES.DAY_3,
        time: '08:00',
        name: 'Breakfast — Grande Starbucks Café Latte + butter croissant + strawberry jam & butter pats',
        calories: 560,
        proteinG: 15,
        carbsG: 56,
        fatG: 29,
        source: 'seed',
        isCaffeinated: true,
        createdAt: '2026-11-26T00:00:00.000Z',
      },
    ],
    workouts: [
      {
        id: 'seed-workout-2026-11-24',
        date: SEED_DATES.DAY_1,
        dayType: 'workday_recovery',
        title: 'Tuesday — Active Recovery Walk',
        exercises: [],
        cardio: [
          {
            id: 'seed-cardio-2026-11-24',
            mode: 'incline_walk',
            durationMin: 22,
            inclinePct: 8,
            speedKph: 4.5,
            bodyWeightKgUsed: DEFAULT_PROFILE.startWeightKg,
            estimatedCaloriesBurned: day1WalkBurn,
            notes: '22-minute treadmill walk (170–200 kcal range)',
          },
        ],
        completed: true,
        completedAt: '2026-11-24T21:30:00.000Z',
      },
      {
        id: 'seed-workout-2026-11-25',
        date: SEED_DATES.DAY_2,
        dayType: 'workday_recovery',
        title: 'Wednesday — Pickleball Session',
        exercises: [],
        cardio: [
          {
            id: 'seed-cardio-2026-11-25',
            mode: 'sport',
            activityLabel: 'Pickleball',
            durationMin: 120,
            inclinePct: 0,
            speedKph: 0,
            bodyWeightKgUsed: DEFAULT_PROFILE.startWeightKg,
            estimatedCaloriesBurned: 575,
            notes:
              '2 hours of pickleball (after early 4:00 PM work wrap-up; 500–650 kcal range)',
          },
        ],
        completed: true,
        completedAt: '2026-11-25T19:30:00.000Z',
        notes: 'Early 4:00 PM work wrap-up + 2 hours of pickleball.',
      },
    ],
  };
}

function normalizeMealSignature(
  date: string,
  name: string,
  calories: number,
): string {
  return `${date}|${name.trim().toLowerCase()}|${Math.round(calories)}`;
}

/**
 * Idempotently merges newer seed records into an existing persisted state
 * without overwriting user edits or duplicating existing entries.
 */
export function mergeSeedEntriesIntoState(
  existing: FitnessAppState,
  seed: FitnessAppState = createInitialSeedState(),
): FitnessAppState {
  const existingMealIds = new Set(existing.meals.map((m) => m.id));
  const existingMealSigs = new Set(
    existing.meals.map((m) =>
      normalizeMealSignature(m.date, m.name, m.calories),
    ),
  );

  const mergedMeals = [...existing.meals];
  for (const seedMeal of seed.meals) {
    const sig = normalizeMealSignature(
      seedMeal.date,
      seedMeal.name,
      seedMeal.calories,
    );
    if (!existingMealIds.has(seedMeal.id) && !existingMealSigs.has(sig)) {
      mergedMeals.push({ ...seedMeal });
      existingMealIds.add(seedMeal.id);
      existingMealSigs.add(sig);
    }
  }

  const mergedWorkouts = existing.workouts.map((w) => ({
    ...w,
    cardio: [...w.cardio],
    exercises: [...w.exercises],
  }));
  for (const seedWorkout of seed.workouts) {
    const byIdOrDate = mergedWorkouts.find(
      (w) => w.id === seedWorkout.id || w.date === seedWorkout.date,
    );
    if (!byIdOrDate) {
      mergedWorkouts.push({
        ...seedWorkout,
        cardio: seedWorkout.cardio.map((c) => ({ ...c })),
        exercises: seedWorkout.exercises.map((e) => ({ ...e })),
      });
    } else {
      const existingCardioIds = new Set(byIdOrDate.cardio.map((c) => c.id));
      for (const seedCardio of seedWorkout.cardio) {
        if (!existingCardioIds.has(seedCardio.id)) {
          byIdOrDate.cardio.push({ ...seedCardio });
          existingCardioIds.add(seedCardio.id);
        }
      }
      if (seedWorkout.completed && !byIdOrDate.completed) {
        byIdOrDate.completed = true;
        byIdOrDate.completedAt =
          byIdOrDate.completedAt ?? seedWorkout.completedAt;
      }
    }
  }

  const existingWeighInIds = new Set(existing.weighIns.map((w) => w.id));
  const existingWeighInDates = new Set(existing.weighIns.map((w) => w.date));
  const mergedWeighIns = [...existing.weighIns];
  for (const seedWeighIn of seed.weighIns) {
    if (
      !existingWeighInIds.has(seedWeighIn.id) &&
      !existingWeighInDates.has(seedWeighIn.date)
    ) {
      mergedWeighIns.push({ ...seedWeighIn });
      existingWeighInIds.add(seedWeighIn.id);
      existingWeighInDates.add(seedWeighIn.date);
    }
  }

  return {
    ...existing,
    initialized: true,
    seedRevision: CURRENT_SEED_REVISION,
    meals: mergedMeals,
    workouts: mergedWorkouts,
    weighIns: mergedWeighIns,
  };
}
