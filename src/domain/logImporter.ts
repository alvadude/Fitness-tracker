import { getDayTypeForDate, parseIsoDateLocal } from './training';
import type {
  CardioLog,
  FitnessAppState,
  IsoDate,
  MealEntry,
  WeighInEntry,
  WorkoutSession,
} from './types';

export interface ParsedSeedAppendPayload {
  meals: MealEntry[];
  workouts: WorkoutSession[];
  weighIns: WeighInEntry[];
}

export interface MergeImportSummary {
  nextState: FitnessAppState;
  addedMeals: number;
  skippedMeals: number;
  addedWorkouts: number;
  addedWeighIns: number;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function toIsoDate(year: number, month: number, day: number): IsoDate | null {
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  try {
    parseIsoDateLocal(iso);
    return iso;
  } catch {
    return null;
  }
}

function extractDateFromHeading(line: string): IsoDate | null {
  const isoMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(line);
  if (isoMatch) {
    try {
      parseIsoDateLocal(isoMatch[1]);
      return isoMatch[1];
    } catch {
      return null;
    }
  }

  const humanMatch =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(
      line,
    );
  if (humanMatch) {
    const month = MONTHS[humanMatch[1].toLowerCase()];
    const day = Number(humanMatch[2]);
    const year = Number(humanMatch[3]);
    if (month) {
      return toIsoDate(year, month, day);
    }
  }

  return null;
}

function inferMealTime(name: string, indexOnDay: number): string {
  const lower = name.toLowerCase();
  if (lower.includes('breakfast')) return '08:00';
  if (lower.includes('morning')) return '10:30';
  if (lower.includes('round 2') || lower.includes('second helping')) {
    return '13:15';
  }
  if (lower.includes('lunch')) return '12:30';
  if (lower.includes('afternoon')) return '15:30';
  if (lower.includes('dinner') || lower.includes('post-game')) return '19:30';
  if (lower.includes('late')) return '21:00';
  const baseMinutes = 8 * 60 + Math.min(13, indexOnDay) * 60;
  const hh = String(Math.floor(baseMinutes / 60)).padStart(2, '0');
  const mm = String(baseMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function inferCaffeinated(name: string): {
  isCaffeinated: boolean;
  caffeineVariant?: 'caffeinated' | 'caffeine-free';
} {
  const lower = name.toLowerCase();
  if (lower.includes('caffeine-free') || lower.includes('decaf')) {
    return { isCaffeinated: false, caffeineVariant: 'caffeine-free' };
  }
  if (
    /\b(coffee|espresso|latte|macchiato|cappuccino|americano|cold brew|matcha)\b/i.test(
      lower,
    )
  ) {
    return { isCaffeinated: true, caffeineVariant: 'caffeinated' };
  }
  return { isCaffeinated: false };
}

function parseWorkoutLine(
  date: IsoDate,
  rawText: string,
  bodyWeightKg: number,
): WorkoutSession | null {
  const text = rawText.trim();
  if (!text) return null;

  const burnMatch = /~?\s*(\d{2,4})\s*kcal/i.exec(text);
  const estimatedBurn = burnMatch ? Number(burnMatch[1]) : 0;

  let durationMin = 0;
  const hrMatch = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i.exec(text);
  const minMatch = /(\d+)\s*(?:-|\s)?(?:minutes?|mins?|min)\b/i.exec(text);
  if (hrMatch) {
    durationMin = Math.round(Number(hrMatch[1]) * 60);
  } else if (minMatch) {
    durationMin = Number(minMatch[1]);
  }

  if (durationMin <= 0 && estimatedBurn <= 0) {
    return null;
  }

  const isTreadmill = /treadmill|walk/i.test(text);
  const inclineMatch = /(\d+(?:\.\d+)?)\s*%\s*incline/i.exec(text);
  const speedMatch = /(\d+(?:\.\d+)?)\s*(?:km\/h|kph)/i.exec(text);

  const cardio: CardioLog = isTreadmill
    ? {
        id: `import-cardio-${date}`,
        mode: inclineMatch && Number(inclineMatch[1]) >= 4 ? 'incline_walk' : 'easy_walk',
        durationMin: durationMin || 20,
        inclinePct: inclineMatch ? Number(inclineMatch[1]) : 0,
        speedKph: speedMatch ? Number(speedMatch[1]) : 4.5,
        bodyWeightKgUsed: bodyWeightKg,
        estimatedCaloriesBurned: estimatedBurn,
        notes: text,
      }
    : {
        id: `import-cardio-${date}`,
        mode: 'sport',
        activityLabel: /pickleball/i.test(text) ? 'Pickleball' : 'Activity',
        durationMin: durationMin || 60,
        inclinePct: 0,
        speedKph: 0,
        bodyWeightKgUsed: bodyWeightKg,
        estimatedCaloriesBurned: estimatedBurn,
        notes: text,
      };

  return {
    id: `import-workout-${date}`,
    date,
    dayType: getDayTypeForDate(date),
    title: `${date} — ${cardio.activityLabel ?? 'Recorded Activity'}`,
    exercises: [],
    cardio: [cardio],
    completed: true,
    completedAt: `${date}T20:00:00.000Z`,
    notes: text,
  };
}

/**
 * Parses either a JSON append object/array or a Markdown daily log handoff
 * into normalized meals, workouts, and weigh-ins ready for deduplicated merge.
 */
export function parseSeedHandoffInput(
  rawText: string,
  bodyWeightKg = 84.0,
): ParsedSeedAppendPayload {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Paste JSON or Markdown log entries to import.');
  }

  // 1. JSON mode
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Invalid JSON log input. Check syntax and try again.');
    }

    const meals: MealEntry[] = [];
    const workouts: WorkoutSession[] = [];
    const weighIns: WeighInEntry[] = [];

    const rawMeals: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as Record<string, unknown>).meals)
        ? ((parsed as Record<string, unknown>).meals as unknown[])
        : [];

    for (let i = 0; i < rawMeals.length; i++) {
      const m = rawMeals[i];
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const rec = m as Record<string, unknown>;
      const date = typeof rec.date === 'string' ? rec.date.trim() : '';
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!date || !name) continue;
      parseIsoDateLocal(date);
      const calories = Number(rec.calories ?? 0);
      const proteinG = Number(rec.proteinG ?? 0);
      const carbsG = Number(rec.carbsG ?? 0);
      const fatG = Number(rec.fatG ?? 0);
      if (
        ![calories, proteinG, carbsG, fatG].every(
          (n) => Number.isFinite(n) && n >= 0,
        )
      ) {
        continue;
      }
      const caff = inferCaffeinated(name);
      meals.push({
        id:
          typeof rec.id === 'string' && rec.id.trim()
            ? rec.id.trim()
            : `import-meal-${date}-${i + 1}`,
        date,
        time:
          typeof rec.time === 'string' && /^\d{2}:\d{2}$/.test(rec.time)
            ? rec.time
            : inferMealTime(name, i),
        name,
        calories: Math.round(calories),
        proteinG: Math.round(proteinG * 10) / 10,
        carbsG: Math.round(carbsG * 10) / 10,
        fatG: Math.round(fatG * 10) / 10,
        source: 'seed',
        isCaffeinated:
          typeof rec.isCaffeinated === 'boolean'
            ? rec.isCaffeinated
            : caff.isCaffeinated,
        caffeineVariant: caff.caffeineVariant,
        notes: typeof rec.notes === 'string' ? rec.notes : undefined,
        photoUrl: typeof rec.photoUrl === 'string' ? rec.photoUrl : undefined,
        createdAt:
          typeof rec.createdAt === 'string'
            ? rec.createdAt
            : `${date}T12:00:00.000Z`,
      });
    }

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.workouts)) {
        for (const w of obj.workouts) {
          if (w && typeof w === 'object' && typeof (w as WorkoutSession).date === 'string') {
            parseIsoDateLocal((w as WorkoutSession).date);
            workouts.push(w as WorkoutSession);
          }
        }
      }
      if (Array.isArray(obj.weighIns)) {
        for (const wi of obj.weighIns) {
          if (
            wi &&
            typeof wi === 'object' &&
            typeof (wi as WeighInEntry).date === 'string' &&
            typeof (wi as WeighInEntry).weightKg === 'number' &&
            (wi as WeighInEntry).weightKg > 0
          ) {
            parseIsoDateLocal((wi as WeighInEntry).date);
            weighIns.push(wi as WeighInEntry);
          }
        }
      }
    }

    if (meals.length === 0 && workouts.length === 0 && weighIns.length === 0) {
      throw new Error('No valid meals, workouts, or weigh-ins found in JSON.');
    }
    return { meals, workouts, weighIns };
  }

  // 2. Markdown Data Seed Handoff mode
  const meals: MealEntry[] = [];
  const workouts: WorkoutSession[] = [];
  const weighIns: WeighInEntry[] = [];

  let currentDate: IsoDate | null = null;
  let dayMealIndex = 0;

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#{1,3}\s+/.test(line)) {
      const headingDate = extractDateFromHeading(line);
      if (headingDate) {
        currentDate = headingDate;
        dayMealIndex = 0;
      }
      continue;
    }

    if (!currentDate) continue;

    // Match workout / activity line: "- **Workout / Activity:** ..."
    const workoutMatch =
      /^[-*]\s*\*\*Workout(?:\s*\/\s*Activity)?:\*\*\s*(.+)$/i.exec(line);
    if (workoutMatch) {
      const parsedWorkout = parseWorkoutLine(
        currentDate,
        workoutMatch[1],
        bodyWeightKg,
      );
      if (parsedWorkout) {
        workouts.push(parsedWorkout);
      }
      continue;
    }

    // Match meal entry line: "1. **Name:** 560 kcal | 15g P | 56g C | 29g F"
    const mealMatch =
      /^(?:\d+\.|[-*])\s*\*\*(.+?):?\*\*:?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*kcal\s*\|\s*(\d+(?:\.\d+)?)\s*g?\s*P\s*\|\s*(\d+(?:\.\d+)?)\s*g?\s*C\s*\|\s*(\d+(?:\.\d+)?)\s*g?\s*F/i.exec(
        line,
      );
    if (mealMatch) {
      const name = mealMatch[1].replace(/:$/, '').trim();
      const calories = Math.round(Number(mealMatch[2].replace(/,/g, '')));
      const proteinG = Math.round(Number(mealMatch[3]) * 10) / 10;
      const carbsG = Math.round(Number(mealMatch[4]) * 10) / 10;
      const fatG = Math.round(Number(mealMatch[5]) * 10) / 10;
      const caff = inferCaffeinated(name);
      dayMealIndex += 1;

      meals.push({
        id: `import-meal-${currentDate}-${dayMealIndex}`,
        date: currentDate,
        time: inferMealTime(name, dayMealIndex - 1),
        name,
        calories,
        proteinG,
        carbsG,
        fatG,
        source: 'seed',
        isCaffeinated: caff.isCaffeinated,
        caffeineVariant: caff.caffeineVariant,
        createdAt: `${currentDate}T${String(Math.min(23, 7 + dayMealIndex)).padStart(2, '0')}:00:00.000Z`,
      });
    }
  }

  if (meals.length === 0 && workouts.length === 0 && weighIns.length === 0) {
    throw new Error(
      'No dated meal or workout lines were recognized. Include a date heading (e.g. "## Thursday, Nov 26, 2026") and meal lines like "1. **Meal:** 560 kcal | 15g P | 56g C | 29g F".',
    );
  }

  return { meals, workouts, weighIns };
}

function mealSignature(date: string, name: string, calories: number): string {
  const normalizedName = name
    .replace(
      /^(breakfast|lunch|dinner|morning snack|afternoon snack|snack|late bite|post-game meal)\s*[—–-]\s*/i,
      '',
    )
    .trim()
    .toLowerCase();
  return `${date}|${normalizedName}|${Math.round(calories)}`;
}

export function mergeImportedLogsIntoState(
  existing: FitnessAppState,
  incoming: ParsedSeedAppendPayload,
): MergeImportSummary {
  const existingIds = new Set(existing.meals.map((m) => m.id));
  const existingSigs = new Set(
    existing.meals.map((m) => mealSignature(m.date, m.name, m.calories)),
  );

  const nextMeals = [...existing.meals];
  let addedMeals = 0;
  let skippedMeals = 0;

  for (const meal of incoming.meals) {
    const sig = mealSignature(meal.date, meal.name, meal.calories);
    if (existingIds.has(meal.id) || existingSigs.has(sig)) {
      skippedMeals += 1;
      continue;
    }
    nextMeals.push({ ...meal });
    existingIds.add(meal.id);
    existingSigs.add(sig);
    addedMeals += 1;
  }

  const nextWorkouts = existing.workouts.map((w) => ({
    ...w,
    cardio: [...w.cardio],
    exercises: [...w.exercises],
  }));
  let addedWorkouts = 0;
  for (const workout of incoming.workouts) {
    const match = nextWorkouts.find(
      (w) => w.id === workout.id || w.date === workout.date,
    );
    if (!match) {
      nextWorkouts.push({ ...workout });
      addedWorkouts += 1;
    }
  }

  const existingWeighInDates = new Set(existing.weighIns.map((w) => w.date));
  const nextWeighIns = [...existing.weighIns];
  let addedWeighIns = 0;
  for (const wi of incoming.weighIns) {
    if (!existingWeighInDates.has(wi.date)) {
      nextWeighIns.push({ ...wi });
      existingWeighInDates.add(wi.date);
      addedWeighIns += 1;
    }
  }

  return {
    nextState: {
      ...existing,
      meals: nextMeals,
      workouts: nextWorkouts,
      weighIns: nextWeighIns,
    },
    addedMeals,
    skippedMeals,
    addedWorkouts,
    addedWeighIns,
  };
}
