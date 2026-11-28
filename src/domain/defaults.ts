import {
  estimateTreadmillCalories,
  getDayTypeForDate,
  parseIsoDateLocal,
} from './training';
import type {
  AppSettings,
  ExerciseLog,
  ExerciseSetLog,
  FoodPreset,
  IsoDate,
  MacroTargets,
  PlannedWorkoutDay,
  UserProfile,
  WeeklyWorkoutPlan,
  WorkoutDayType,
  WorkoutSession,
} from './types';

export const DEFAULT_PROFILE: UserProfile = {
  name: 'AJ',
  age: 29,
  sex: 'male',
  heightCm: 175,
  activityLevel: 'desk',
  startWeightKg: 84.0,
  startDate: '2026-11-24',
  targetWeightKg: 65.0,
  targetDate: '2027-06-15',
  caffeineCutoffHour: 18,
};

export const DEFAULT_TARGETS: MacroTargets = {
  calories: 1900,
  proteinG: 160,
  carbsG: 180,
  fatG: 60,
  weekNumber: 1,
};

export const AVAILABLE_EQUIPMENT_OPTIONS = [
  'Bodyweight (No Equipment)',
  'Adjustable Dumbbells',
  'Barbell & Plates',
  'Squat Rack',
  'Weight Bench',
  'Treadmill',
  'Resistance Bands',
  'Kettlebell',
  'Pull-Up Bar',
  'Yoga / Exercise Mat',
  'Jump Rope',
  'Stationary Bike',
] as const;

export const DEFAULT_EQUIPMENT: string[] = [
  'Bodyweight (No Equipment)',
  'Adjustable Dumbbells',
  'Barbell & Plates',
  'Squat Rack',
  'Weight Bench',
  'Treadmill',
];

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiEndpointMode: 'direct',
  geminiModelPreference: 'auto',
  notificationsEnabled: false,
  availableEquipment: [...DEFAULT_EQUIPMENT],
};

export const DEFAULT_FOOD_PRESETS: FoodPreset[] = [
  {
    id: 'preset-black-coffee',
    name: 'Black Coffee',
    servingLabel: '1 cup (240ml)',
    calories: 5,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    isCaffeinated: true,
    category: 'drink',
  },
  {
    id: 'preset-active-whey-1',
    name: 'Active Whey Protein (1 scoop)',
    servingLabel: '1 scoop (32.4g)',
    calories: 124,
    proteinG: 24,
    carbsG: 3,
    fatG: 2,
    isCaffeinated: true,
    supportsCaffeineToggle: true,
    caffeinatedVariantLabel: 'Caramel Macchiato',
    caffeineFreeVariantLabel: 'Caffeine-Free',
    caffeineFreeAlternativeName: 'Active Whey Protein (1 scoop, Caffeine-Free)',
    category: 'protein',
  },
  {
    id: 'preset-active-whey-2',
    name: 'Active Whey Protein (2 scoops)',
    servingLabel: '2 scoops (64.8g)',
    calories: 248,
    proteinG: 48,
    carbsG: 6,
    fatG: 4,
    isCaffeinated: true,
    supportsCaffeineToggle: true,
    caffeinatedVariantLabel: 'Caramel Macchiato',
    caffeineFreeVariantLabel: 'Caffeine-Free',
    caffeineFreeAlternativeName: 'Active Whey Protein (2 scoops, Caffeine-Free)',
    category: 'protein',
  },
  {
    id: 'preset-white-rice-2tbsp',
    name: 'White Rice (2 tbsp)',
    servingLabel: '2 tbsp (~30g)',
    calories: 35,
    proteinG: 0.7,
    carbsG: 8,
    fatG: 0,
    isCaffeinated: false,
    category: 'carb',
  },
  {
    id: 'preset-white-rice-half-cup',
    name: 'White Rice (1/2 cup cooked)',
    servingLabel: '1/2 cup (~80g)',
    calories: 104,
    proteinG: 2,
    carbsG: 22,
    fatG: 0,
    isCaffeinated: false,
    category: 'carb',
  },
  {
    id: 'preset-white-rice-one-cup',
    name: 'White Rice (1 cup cooked)',
    servingLabel: '1 cup (~160g)',
    calories: 208,
    proteinG: 4,
    carbsG: 45,
    fatG: 0.4,
    isCaffeinated: false,
    category: 'carb',
  },
];

function makeEmptySets(
  count: number,
  targetRepsMin: number,
  targetRepsMax: number,
): ExerciseSetLog[] {
  return Array.from({ length: count }, (_, idx) => ({
    setNumber: idx + 1,
    targetRepsMin,
    targetRepsMax,
    weightKg: null,
    reps: null,
    completed: false,
  }));
}

export function createWorkoutTemplateForDayType(
  dayType: WorkoutDayType,
  date: IsoDate,
  bodyWeightKg: number,
): WorkoutSession {
  const safeWeight = bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_PROFILE.startWeightKg;

  switch (dayType) {
    case 'offday_sat_lower': {
      const durationMin = 30;
      const inclinePct = 8;
      const speedKph = 4.5;
      return {
        id: `workout-${date}`,
        date,
        dayType,
        title: 'Saturday — Lower & Incline Walk',
        exercises: [
          {
            exerciseId: 'barbell_back_squat',
            name: 'Barbell Back Squat',
            equipment: 'barbell',
            defaultRestSec: 180,
            sets: makeEmptySets(4, 6, 8),
          },
          {
            exerciseId: 'barbell_rdl',
            name: 'Barbell Romanian Deadlift',
            equipment: 'barbell',
            defaultRestSec: 120,
            sets: makeEmptySets(3, 8, 10),
          },
        ],
        cardio: [
          {
            id: `cardio-${date}`,
            mode: 'incline_walk',
            durationMin,
            inclinePct,
            speedKph,
            bodyWeightKgUsed: safeWeight,
            estimatedCaloriesBurned: estimateTreadmillCalories({
              durationMin,
              inclinePct,
              speedKph,
              bodyWeightKg: safeWeight,
              mode: 'incline_walk',
            }),
            notes: '30 min @ 6–10% incline',
          },
        ],
        completed: false,
      };
    }

    case 'offday_sun_upper':
      return {
        id: `workout-${date}`,
        date,
        dayType,
        title: 'Sunday — Upper Push/Pull',
        exercises: [
          {
            exerciseId: 'barbell_bench_press',
            name: 'Barbell Bench Press',
            equipment: 'barbell',
            defaultRestSec: 180,
            sets: makeEmptySets(4, 6, 8),
          },
          {
            exerciseId: 'barbell_bent_over_row',
            name: 'Barbell Bent-Over Row',
            equipment: 'barbell',
            defaultRestSec: 120,
            sets: makeEmptySets(4, 8, 10),
          },
          {
            exerciseId: 'db_shoulder_press',
            name: 'Dumbbell Shoulder Press',
            equipment: 'dumbbell',
            defaultRestSec: 90,
            sets: makeEmptySets(3, 10, 12),
          },
        ],
        cardio: [],
        completed: false,
      };

    case 'offday_mon_full': {
      const durationMin = 20;
      const inclinePct = 1;
      const jogSpeedKph = 8.0;
      const walkSpeedKph = 4.8;
      const avgSpeedKph = 5.9;
      return {
        id: `workout-${date}`,
        date,
        dayType,
        title: 'Monday — Full Body & Interval Run',
        exercises: [
          {
            exerciseId: 'db_goblet_squat',
            name: 'Dumbbell Goblet Squat',
            equipment: 'dumbbell',
            defaultRestSec: 90,
            sets: makeEmptySets(3, 10, 12),
          },
          {
            exerciseId: 'incline_db_press',
            name: 'Incline Dumbbell Press',
            equipment: 'dumbbell',
            defaultRestSec: 90,
            sets: makeEmptySets(3, 10, 12),
          },
        ],
        cardio: [
          {
            id: `cardio-${date}`,
            mode: 'interval_run',
            durationMin,
            inclinePct,
            speedKph: avgSpeedKph,
            jogSpeedKph,
            walkSpeedKph,
            bodyWeightKgUsed: safeWeight,
            estimatedCaloriesBurned: estimateTreadmillCalories({
              durationMin,
              inclinePct,
              speedKph: avgSpeedKph,
              bodyWeightKg: safeWeight,
              mode: 'interval_run',
              jogSpeedKph,
              walkSpeedKph,
            }),
            notes: '1 min jog / 2 min walk',
          },
        ],
        completed: false,
      };
    }

    case 'workday_recovery':
    default:
      return {
        id: `workout-${date}`,
        date,
        dayType: 'workday_recovery',
        title: 'Workday — Active Recovery & Sleep',
        exercises: [],
        cardio: [],
        completed: false,
        notes:
          'Workday (7:30 AM – 8:00 PM): Prioritize 7+ hrs sleep & optional 15–20 min easy treadmill walk.',
      };
  }
}

function parsePlannedRepRange(repsRaw: string): [number, number] {
  const rangeMatch = /(\d+)\s*[-–]\s*(\d+)/.exec(repsRaw);
  if (rangeMatch) {
    return [Number(rangeMatch[1]), Number(rangeMatch[2])];
  }
  const singleMatch = /(\d+)/.exec(repsRaw);
  if (singleMatch) {
    const n = Number(singleMatch[1]);
    return [n, n];
  }
  return [8, 12];
}

function mapPlannedEquipment(
  equipmentLabel: string,
): 'barbell' | 'dumbbell' | 'bodyweight' {
  const lower = equipmentLabel.toLowerCase();
  if (lower.includes('barbell')) return 'barbell';
  if (lower.includes('dumbbell') || lower.includes('kettlebell')) {
    return 'dumbbell';
  }
  return 'bodyweight';
}

function slugifyPlannedExerciseId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `planned_ex_${index + 1}`;
}

export function convertPlannedDayToExercises(
  day: PlannedWorkoutDay,
): ExerciseLog[] {
  return day.exercises.map((ex, idx) => {
    const [minReps, maxReps] = parsePlannedRepRange(ex.reps);
    return {
      exerciseId: slugifyPlannedExerciseId(ex.name, idx),
      name: ex.name,
      equipment: mapPlannedEquipment(ex.equipment),
      defaultRestSec: 90,
      ...(typeof ex.targetWeightKg === 'number' && ex.targetWeightKg > 0
        ? { suggestedWeightKg: ex.targetWeightKg }
        : {}),
      ...(ex.notes ? { notes: ex.notes } : {}),
      sets: makeEmptySets(Math.max(1, ex.sets), minReps, maxReps),
    };
  });
}

/**
 * Builds a WorkoutSession aligned with the user's active AI Weekly Plan for a given date.
 */
export function createWorkoutSessionFromWeeklyPlan(
  weeklyPlan: WeeklyWorkoutPlan,
  date: IsoDate,
): WorkoutSession {
  const weekday = parseIsoDateLocal(date).getDay();
  const plannedDay = weeklyPlan.days.find((d) => d.dayOfWeek === weekday);
  const fallbackDayType = getDayTypeForDate(date);

  if (!plannedDay) {
    return createWorkoutTemplateForDayType(
      fallbackDayType,
      date,
      DEFAULT_PROFILE.startWeightKg,
    );
  }

  const exercises = plannedDay.isRestDay
    ? []
    : convertPlannedDayToExercises(plannedDay);
  const noteParts = [plannedDay.cardioNote, plannedDay.coachingTip].filter(
    Boolean,
  );
  const existingTick = weeklyPlan.dailyStatusByDate[date];

  return {
    id: `workout-${date}`,
    date,
    dayType: plannedDay.isRestDay ? 'workday_recovery' : fallbackDayType,
    title: `${plannedDay.dayName} — ${plannedDay.focus}`,
    exercises,
    cardio: [],
    completed: existingTick === 'completed',
    ...(existingTick ? { completionStatus: existingTick } : {}),
    ...(noteParts.length > 0 ? { notes: noteParts.join(' · ') } : {}),
  };
}
