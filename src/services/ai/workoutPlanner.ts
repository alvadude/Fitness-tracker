import {
  addDaysIsoDate,
  diffDaysIsoDate,
  formatIsoDateLocal,
  parseIsoDateLocal,
} from '../../domain/training';
import type {
  GeminiModelPreference,
  IsoDate,
  MacroTargets,
  PlannedWorkoutDay,
  PlannedWorkoutExercise,
  UserProfile,
  WeekdayIndex,
  WeeklyWorkoutPlan,
  WorkoutSession,
} from '../../domain/types';
import { fetchGeminiWithFallback } from './geminiClient';
import {
  isAbortError,
  MealEstimatorError,
  resolveGeminiApiKey,
} from './mealEstimator';

export interface GenerateWeeklyPlanInput {
  profile: UserProfile;
  targets: MacroTargets;
  currentWeightKg: number;
  availableEquipment: readonly string[];
  preferences?: string;
  workouts?: readonly WorkoutSession[];
  referenceDate?: IsoDate;
  modelPreference?: GeminiModelPreference;
  apiKey?: string;
  signal?: AbortSignal;
}

export type MuscleGroupTag =
  | 'Legs'
  | 'Back'
  | 'Chest'
  | 'Shoulders'
  | 'Arms'
  | 'Core'
  | 'Cardio';

export interface ExerciseOverloadHistory {
  exerciseId: string;
  name: string;
  equipment: 'barbell' | 'dumbbell' | 'bodyweight';
  lastDate: IsoDate;
  lastWeightKg: number | null;
  lastMaxReps: number | null;
  targetRepsMin: number;
  targetRepsMax: number;
  readyForLoadIncrease: boolean;
  suggestedWeightKg: number | null;
  recommendation: string;
}

export interface RecentWorkoutDigest {
  date: IsoDate;
  dayName: string;
  daysAgo: number;
  title: string;
  status: string;
  muscles: MuscleGroupTag[];
  summaryLine: string;
}

export interface WorkoutHistoryContextSummary {
  referenceDate: IsoDate;
  referenceDayName: string;
  tomorrowDate: IsoDate;
  tomorrowDayName: string;
  recentSessions: RecentWorkoutDigest[];
  musclesWorkedToday: MuscleGroupTag[];
  musclesWorkedLast48h: MuscleGroupTag[];
  overloadEntries: ExerciseOverloadHistory[];
}

const WEEKDAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function classifyMuscleGroups(text: string): MuscleGroupTag[] {
  const lower = text.toLowerCase();
  const tags = new Set<MuscleGroupTag>();

  if (
    /\b(squat|deadlift|rdl|lunge|glute|hip thrust|leg|calf|hamstring|quad|lower)\b/.test(
      lower,
    )
  ) {
    tags.add('Legs');
  }
  if (
    /\b(row|pull-?up|chin-?up|lat|pulldown|deadlift|rdl|back|pull-apart|face pull|superman)\b/.test(
      lower,
    )
  ) {
    tags.add('Back');
  }
  if (/\b(bench|chest|push-?up|fly|dip|incline.*press|floor press)\b/.test(lower)) {
    tags.add('Chest');
  }
  if (/\b(shoulder|overhead press|ohp|lateral raise|arnold|delt)\b/.test(lower)) {
    tags.add('Shoulders');
  }
  if (/\b(curl|tricep|bicep|extension|skullcrusher)\b/.test(lower)) {
    tags.add('Arms');
  }
  if (/\b(plank|dead bug|bird-?dog|crunch|ab|core|russian twist)\b/.test(lower)) {
    tags.add('Core');
  }
  if (/\b(treadmill|walk|run|jog|pickleball|bike|cycling|jump rope|cardio)\b/.test(lower)) {
    tags.add('Cardio');
  }

  return Array.from(tags);
}

function workoutHasMeaningfulActivity(w: WorkoutSession): boolean {
  if (w.completed || w.completionStatus === 'partial') return true;
  if (w.cardio.length > 0) return true;
  return w.exercises.some((ex) =>
    ex.sets.some((s) => s.completed || s.weightKg !== null || s.reps !== null),
  );
}

/**
 * Summarizes recent workout history (last 14 days for fatigue/recovery and last 28 days
 * for per-exercise progressive overload) relative to `referenceDate` (defaults to today).
 */
export function summarizeWorkoutHistoryForPlanner(
  workouts: readonly WorkoutSession[] = [],
  referenceDateInput?: IsoDate,
): WorkoutHistoryContextSummary {
  const referenceDate = referenceDateInput ?? formatIsoDateLocal(new Date());
  const referenceDayName =
    WEEKDAY_NAMES[parseIsoDateLocal(referenceDate).getDay()];
  const tomorrowDate = addDaysIsoDate(referenceDate, 1);
  const tomorrowDayName =
    WEEKDAY_NAMES[parseIsoDateLocal(tomorrowDate).getDay()];

  const eligible = [...workouts]
    .filter((w) => w.date <= referenceDate && workoutHasMeaningfulActivity(w))
    .sort((a, b) => b.date.localeCompare(a.date));

  const recentSessions: RecentWorkoutDigest[] = [];
  const musclesTodaySet = new Set<MuscleGroupTag>();
  const muscles48hSet = new Set<MuscleGroupTag>();

  for (const w of eligible) {
    let daysAgo = 999;
    try {
      daysAgo = diffDaysIsoDate(w.date, referenceDate);
    } catch {
      continue;
    }
    if (daysAgo < 0 || daysAgo > 14) continue;

    const dayName = WEEKDAY_NAMES[parseIsoDateLocal(w.date).getDay()];
    const activeExercises = w.exercises.filter((ex) =>
      ex.sets.some(
        (s) => s.completed || s.weightKg !== null || s.reps !== null,
      ),
    );

    const muscleSet = new Set<MuscleGroupTag>();
    for (const ex of activeExercises) {
      for (const tag of classifyMuscleGroups(ex.name)) {
        muscleSet.add(tag);
      }
    }
    if (activeExercises.length === 0 && (w.completed || w.completionStatus === 'partial')) {
      for (const tag of classifyMuscleGroups(w.title)) {
        muscleSet.add(tag);
      }
    }
    if (w.cardio.length > 0) {
      muscleSet.add('Cardio');
    }

    const muscles = Array.from(muscleSet);
    if (daysAgo === 0) {
      for (const m of muscles) {
        if (m !== 'Cardio') musclesTodaySet.add(m);
      }
    }
    if (daysAgo <= 1) {
      for (const m of muscles) {
        if (m !== 'Cardio') muscles48hSet.add(m);
      }
    }

    const exSummaries = activeExercises.map((ex) => {
      const doneSets = ex.sets.filter(
        (s) => s.completed || s.weightKg !== null || s.reps !== null,
      );
      const weights = doneSets
        .map((s) => s.weightKg)
        .filter((v): v is number => v !== null && v > 0);
      const reps = doneSets
        .map((s) => s.reps)
        .filter((v): v is number => v !== null && v > 0);
      const maxW = weights.length > 0 ? Math.max(...weights) : null;
      const avgReps =
        reps.length > 0
          ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length)
          : null;
      const loadStr =
        maxW !== null && avgReps !== null
          ? `${maxW}kg×${avgReps}`
          : maxW !== null
            ? `${maxW}kg`
            : avgReps !== null
              ? `${avgReps} reps`
              : 'logged';
      return `${ex.name} (${doneSets.length} sets @ ${loadStr})`;
    });

    const cardioSummaries = w.cardio.map((c) => {
      const label =
        c.mode === 'sport'
          ? c.activityLabel || 'Sport'
          : c.mode.replace('_', ' ');
      return `${label} ${c.durationMin}m (~${c.estimatedCaloriesBurned} kcal)`;
    });

    const parts = [...exSummaries, ...cardioSummaries];
    const relTag =
      daysAgo === 0
        ? 'TODAY'
        : daysAgo === 1
          ? 'YESTERDAY'
          : `${daysAgo}d ago`;
    const status =
      w.completionStatus === 'partial'
        ? 'partial'
        : w.completed
          ? 'completed'
          : 'logged';

    recentSessions.push({
      date: w.date,
      dayName,
      daysAgo,
      title: w.title,
      status,
      muscles,
      summaryLine: `${w.date} (${dayName}, ${relTag}, ${status}) — ${w.title}${parts.length > 0 ? ': ' + parts.join('; ') : ''}`,
    });

    if (recentSessions.length >= 7) break;
  }

  // Per-exercise progressive overload analysis across last 28 days
  const seenExercises = new Set<string>();
  const overloadEntries: ExerciseOverloadHistory[] = [];

  for (const w of eligible) {
    let daysAgo = 999;
    try {
      daysAgo = diffDaysIsoDate(w.date, referenceDate);
    } catch {
      continue;
    }
    if (daysAgo < 0 || daysAgo > 28) continue;

    for (const ex of w.exercises) {
      const key = ex.exerciseId || ex.name.trim().toLowerCase();
      if (seenExercises.has(key)) continue;

      const loggedSets = ex.sets.filter(
        (s) => s.completed || s.weightKg !== null || s.reps !== null,
      );
      if (loggedSets.length === 0) continue;
      seenExercises.add(key);

      const weights = loggedSets
        .map((s) => s.weightKg)
        .filter((v): v is number => v !== null && v > 0);
      const reps = loggedSets
        .map((s) => s.reps)
        .filter((v): v is number => v !== null && v > 0);
      const lastWeightKg = weights.length > 0 ? Math.max(...weights) : null;
      const lastMaxReps = reps.length > 0 ? Math.max(...reps) : null;
      const targetRepsMin = ex.sets[0]?.targetRepsMin ?? 8;
      const targetRepsMax = ex.sets[0]?.targetRepsMax ?? 10;

      const allSetsHitTop =
        ex.sets.length > 0 &&
        ex.sets.every(
          (s) =>
            (s.completed || s.reps !== null) &&
            s.reps !== null &&
            s.reps >= s.targetRepsMax,
        );

      const increment = ex.equipment === 'barbell' ? 2.5 : 2.0;
      const readyForLoadIncrease = allSetsHitTop && lastWeightKg !== null;
      const suggestedWeightKg =
        lastWeightKg !== null
          ? readyForLoadIncrease
            ? roundHalf(lastWeightKg + increment)
            : lastWeightKg
          : null;

      let recommendation: string;
      if (readyForLoadIncrease && suggestedWeightKg !== null) {
        recommendation = `Increase load from ${lastWeightKg} kg to ${suggestedWeightKg} kg (+${increment} kg; hit ${targetRepsMax}+ reps on all sets on ${w.date})`;
      } else if (lastWeightKg !== null) {
        recommendation = `Hold ${lastWeightKg} kg and aim for +1–2 reps toward ${targetRepsMax} reps (last ${lastMaxReps ?? targetRepsMin} reps on ${w.date})`;
      } else {
        recommendation = `Progress reps or tempo from last session (${lastMaxReps ?? targetRepsMin} reps on ${w.date})`;
      }

      overloadEntries.push({
        exerciseId: ex.exerciseId,
        name: ex.name,
        equipment: ex.equipment,
        lastDate: w.date,
        lastWeightKg,
        lastMaxReps,
        targetRepsMin,
        targetRepsMax,
        readyForLoadIncrease,
        suggestedWeightKg,
        recommendation,
      });
    }
  }

  return {
    referenceDate,
    referenceDayName,
    tomorrowDate,
    tomorrowDayName,
    recentSessions,
    musclesWorkedToday: Array.from(musclesTodaySet),
    musclesWorkedLast48h: Array.from(muscles48hSet),
    overloadEntries,
  };
}

export const GEMINI_WORKOUT_PLAN_SCHEMA = {
  type: 'OBJECT',
  required: ['goalSummary', 'days'],
  properties: {
    goalSummary: {
      type: 'STRING',
      description: 'Concise 1-2 sentence overview of the 7-day plan.',
    },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: [
          'dayOfWeek',
          'dayName',
          'focus',
          'isRestDay',
          'estimatedDurationMin',
          'exercises',
        ],
        properties: {
          dayOfWeek: {
            type: 'INTEGER',
            description: '0=Sunday, 1=Monday, ..., 6=Saturday',
          },
          dayName: { type: 'STRING' },
          focus: { type: 'STRING' },
          isRestDay: { type: 'BOOLEAN' },
          estimatedDurationMin: { type: 'INTEGER' },
          cardioNote: { type: 'STRING' },
          coachingTip: { type: 'STRING' },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['name', 'equipment', 'sets', 'reps'],
              properties: {
                name: { type: 'STRING' },
                equipment: { type: 'STRING' },
                sets: { type: 'INTEGER' },
                reps: { type: 'STRING' },
                targetWeightKg: {
                  type: 'NUMBER',
                  description:
                    'Optional progressive overload target weight in kg based on workout history.',
                },
                notes: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function buildWeeklyWorkoutPrompt(
  input: Omit<GenerateWeeklyPlanInput, 'apiKey' | 'signal' | 'modelPreference'>,
): string {
  const equipmentList =
    input.availableEquipment.length > 0
      ? input.availableEquipment.join(', ')
      : 'Bodyweight (No Equipment)';
  const userName = input.profile.name?.trim() || 'the user';
  const prefs = input.preferences?.trim();
  const history = summarizeWorkoutHistoryForPlanner(
    input.workouts,
    input.referenceDate,
  );

  const historyLines: string[] = [];
  historyLines.push(
    `TIMING CONTEXT: Today is ${history.referenceDayName} (${history.referenceDate}). The next upcoming day is ${history.tomorrowDayName} (${history.tomorrowDate}).`,
  );

  if (history.recentSessions.length > 0) {
    historyLines.push(
      `RECENT WORKOUT HISTORY (most recent first): ${history.recentSessions.map((s) => s.summaryLine).join(' | ')}.`,
    );
  }
  if (history.musclesWorkedLast48h.length > 0) {
    const todayNote =
      history.musclesWorkedToday.length > 0
        ? `Muscles trained TODAY (${history.referenceDayName}): ${history.musclesWorkedToday.join(', ')}.`
        : '';
    historyLines.push(
      `MUSCLE RECOVERY RULE: ${todayNote} Muscles trained in the last 48h: ${history.musclesWorkedLast48h.join(', ')}. Do NOT schedule heavy work for those same muscle groups on ${history.tomorrowDayName} (${history.tomorrowDate}) — schedule complementary fresh muscle groups (e.g. Upper Push/Core/Cardio if Legs/Back were done today) or a Rest/Active Recovery day tomorrow, giving worked muscles at least 48 hours to recover before training them again.`,
    );
  }
  if (history.overloadEntries.length > 0) {
    const overloadText = history.overloadEntries
      .slice(0, 10)
      .map((e) => `${e.name}: ${e.recommendation}`)
      .join(' | ');
    historyLines.push(
      `PROGRESSIVE OVERLOAD TARGETS (apply these weights in targetWeightKg and mention overload progression in exercise notes): ${overloadText}.`,
    );
  }

  return [
    `Create a personalized, realistic 7-day weekly workout plan (Monday through Sunday) for ${userName}.`,
    `Profile: ${input.profile.age}y ${input.profile.sex}, ${input.profile.heightCm} cm, current weight ${input.currentWeightKg.toFixed(1)} kg, goal weight ${input.profile.targetWeightKg} kg by ${input.profile.targetDate}, activity level: ${input.profile.activityLevel}.`,
    `Daily nutrition targets: ${input.targets.calories} kcal, ${input.targets.proteinG}g protein.`,
    `AVAILABLE EQUIPMENT (ONLY prescribe exercises using these items or bodyweight): ${equipmentList}.`,
    ...historyLines,
    prefs ? `User schedule & preferences: ${prefs}` : '',
    'Return exactly 7 days covering dayOfWeek 1 (Monday), 2 (Tuesday), 3 (Wednesday), 4 (Thursday), 5 (Friday), 6 (Saturday), and 0 (Sunday).',
    'Include appropriate rest or active recovery days with isRestDay: true and empty exercises array when resting. Keep exercises practical (3–6 exercises per training day). Return valid JSON matching the schema.',
  ]
    .filter(Boolean)
    .join(' ');
}

function stripJsonCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function inferWeekdayIndex(
  dayOfWeek: unknown,
  dayName: unknown,
  fallbackIdx: number,
): WeekdayIndex {
  if (
    typeof dayOfWeek === 'number' &&
    Number.isInteger(dayOfWeek) &&
    dayOfWeek >= 0 &&
    dayOfWeek <= 6
  ) {
    return dayOfWeek as WeekdayIndex;
  }
  if (typeof dayName === 'string') {
    const lower = dayName.trim().toLowerCase();
    const matched = WEEKDAY_NAMES.findIndex((d) =>
      lower.startsWith(d.slice(0, 3).toLowerCase()),
    );
    if (matched >= 0) {
      return matched as WeekdayIndex;
    }
  }
  const monFirstOrder: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];
  return monFirstOrder[fallbackIdx % 7];
}

export function parseWeeklyWorkoutPlanPayload(
  rawJson: unknown,
  meta: { equipmentUsed: readonly string[]; customNotes?: string },
): WeeklyWorkoutPlan {
  if (typeof rawJson === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonCodeFences(rawJson));
    } catch {
      throw new MealEstimatorError(
        'MALFORMED_RESPONSE',
        'Failed to parse AI workout plan JSON.',
        { actionableHint: 'Retry generating the weekly plan.' },
      );
    }
    return parseWeeklyWorkoutPlanPayload(parsed, meta);
  }

  if (rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson)) {
    const obj = rawJson as Record<string, unknown>;
    if (Array.isArray(obj.candidates)) {
      const firstCandidate = obj.candidates[0] as
        | { content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }
        | undefined;
      const parts = firstCandidate?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new MealEstimatorError(
          'MALFORMED_RESPONSE',
          'Gemini returned an empty workout plan candidate.',
          { actionableHint: 'Retry generating the weekly plan.' },
        );
      }
      const joinedText = parts
        .filter((p) => p?.thought !== true)
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();
      if (!joinedText) {
        throw new MealEstimatorError(
          'MALFORMED_RESPONSE',
          'Gemini candidate did not contain JSON text.',
          { actionableHint: 'Retry generating the weekly plan.' },
        );
      }
      return parseWeeklyWorkoutPlanPayload(joinedText, meta);
    }

    if (!Array.isArray(obj.days) || obj.days.length === 0) {
      throw new MealEstimatorError(
        'MALFORMED_RESPONSE',
        'AI workout plan is missing the weekly days array.',
        { actionableHint: 'Retry generating the weekly plan.' },
      );
    }

    const daysByWeekday = new Map<WeekdayIndex, PlannedWorkoutDay>();
    obj.days.forEach((rawDay, idx) => {
      if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay)) {
        return;
      }
      const d = rawDay as Record<string, unknown>;
      const dayOfWeek = inferWeekdayIndex(d.dayOfWeek, d.dayName, idx);
      const dayName =
        typeof d.dayName === 'string' && d.dayName.trim()
          ? d.dayName.trim()
          : WEEKDAY_NAMES[dayOfWeek];
      const focus =
        typeof d.focus === 'string' && d.focus.trim()
          ? d.focus.trim()
          : d.isRestDay
            ? 'Active Recovery / Rest'
            : 'Workout Session';
      const isRestDay = Boolean(d.isRestDay);
      const estimatedDurationMin =
        typeof d.estimatedDurationMin === 'number' &&
        Number.isFinite(d.estimatedDurationMin) &&
        d.estimatedDurationMin >= 0
          ? Math.round(d.estimatedDurationMin)
          : isRestDay
            ? 0
            : 40;

      const exercises: PlannedWorkoutExercise[] = Array.isArray(d.exercises)
        ? d.exercises
            .filter(
              (ex): ex is Record<string, unknown> =>
                Boolean(ex) && typeof ex === 'object' && !Array.isArray(ex),
            )
            .map((ex) => ({
              name:
                typeof ex.name === 'string' && ex.name.trim()
                  ? ex.name.trim()
                  : 'Exercise',
              equipment:
                typeof ex.equipment === 'string' && ex.equipment.trim()
                  ? ex.equipment.trim()
                  : 'Bodyweight',
              sets:
                typeof ex.sets === 'number' &&
                Number.isFinite(ex.sets) &&
                ex.sets >= 1
                  ? Math.round(ex.sets)
                  : 3,
              reps:
                typeof ex.reps === 'string' && ex.reps.trim()
                  ? ex.reps.trim()
                  : typeof ex.reps === 'number'
                    ? String(ex.reps)
                    : '8-12',
              ...(typeof ex.targetWeightKg === 'number' &&
              Number.isFinite(ex.targetWeightKg) &&
              ex.targetWeightKg > 0
                ? { targetWeightKg: roundHalf(ex.targetWeightKg) }
                : {}),
              ...(typeof ex.notes === 'string' && ex.notes.trim()
                ? { notes: ex.notes.trim() }
                : {}),
            }))
        : [];

      daysByWeekday.set(dayOfWeek, {
        dayOfWeek,
        dayName,
        focus,
        isRestDay,
        estimatedDurationMin,
        exercises,
        ...(typeof d.cardioNote === 'string' && d.cardioNote.trim()
          ? { cardioNote: d.cardioNote.trim() }
          : {}),
        ...(typeof d.coachingTip === 'string' && d.coachingTip.trim()
          ? { coachingTip: d.coachingTip.trim() }
          : {}),
      });
    });

    const orderedWeekdays: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];
    const normalizedDays: PlannedWorkoutDay[] = orderedWeekdays.map((wd) => {
      return (
        daysByWeekday.get(wd) ?? {
          dayOfWeek: wd,
          dayName: WEEKDAY_NAMES[wd],
          focus: 'Rest / Active Recovery',
          isRestDay: true,
          estimatedDurationMin: 0,
          exercises: [],
        }
      );
    });

    const goalSummary =
      typeof obj.goalSummary === 'string' && obj.goalSummary.trim()
        ? obj.goalSummary.trim()
        : 'Personalized 7-day workout schedule tailored to your goal and equipment.';

    return {
      id: `plan-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      goalSummary,
      equipmentUsed: [...meta.equipmentUsed],
      ...(meta.customNotes?.trim()
        ? { customNotes: meta.customNotes.trim() }
        : {}),
      days: normalizedDays,
      dailyStatusByDate: {},
    };
  }

  throw new MealEstimatorError(
    'MALFORMED_RESPONSE',
    'Unexpected response structure from AI workout planner.',
    { actionableHint: 'Retry generating the weekly plan.' },
  );
}

export async function generateWeeklyWorkoutPlan(
  input: GenerateWeeklyPlanInput,
): Promise<WeeklyWorkoutPlan> {
  const apiKey = resolveGeminiApiKey(input.apiKey);
  if (!apiKey) {
    throw new MealEstimatorError(
      'MISSING_API_KEY',
      'No Gemini API key is configured.',
      {
        actionableHint:
          'Add your Gemini API key below or in the Settings tab, or use Instant Smart Plan (Offline).',
      },
    );
  }

  const prompt = buildWeeklyWorkoutPrompt(input);
  let response: Response;
  let modelUsed: string;
  try {
    const result = await fetchGeminiWithFallback({
      apiKey,
      modelPreference: input.modelPreference,
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_WORKOUT_PLAN_SCHEMA,
      },
      signal: input.signal,
    });
    response = result.response;
    modelUsed = result.modelUsed;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new MealEstimatorError(
      'NETWORK_ERROR',
      'Unable to reach Gemini to generate your workout plan.',
      {
        actionableHint:
          'Check your internet connection and retry, or tap Instant Smart Plan (Offline).',
      },
    );
  }

  if (!response.ok) {
    let upstreamMessage: string | null = null;
    try {
      const text = await response.text();
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      if (typeof parsed.error === 'string') {
        upstreamMessage = parsed.error;
      } else if (typeof parsed.error?.message === 'string') {
        upstreamMessage = parsed.error.message;
      }
    } catch {
      // Ignore parse failure
    }
    if (response.status === 401 || response.status === 403) {
      throw new MealEstimatorError(
        'AUTH_ERROR',
        upstreamMessage || 'Gemini API key was rejected.',
        {
          status: response.status,
          actionableHint: 'Verify or update your Gemini API key below or in Settings.',
        },
      );
    }
    if (response.status === 429) {
      throw new MealEstimatorError(
        'RATE_LIMITED',
        upstreamMessage || 'Gemini rate limit exceeded across fallback models.',
        {
          status: response.status,
          actionableHint:
            'Wait a moment and retry, or use Instant Smart Plan (Offline) below.',
        },
      );
    }
    throw new MealEstimatorError(
      response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR',
      upstreamMessage || `Gemini request failed with status ${response.status}.`,
      {
        status: response.status,
        actionableHint:
          'Gemini is currently busy — tap Instant Smart Plan (Offline) below to build your week immediately.',
      },
    );
  }

  const jsonPayload = (await response.json()) as unknown;
  const parsed = parseWeeklyWorkoutPlanPayload(jsonPayload, {
    equipmentUsed: input.availableEquipment,
    customNotes: input.preferences,
  });
  return {
    ...parsed,
    modelUsed,
  };
}

function attachOverloadToExercises(
  exercises: PlannedWorkoutExercise[],
  overloadEntries: readonly ExerciseOverloadHistory[],
): PlannedWorkoutExercise[] {
  if (overloadEntries.length === 0) return exercises;
  return exercises.map((ex) => {
    const lowerName = ex.name.toLowerCase();
    const match = overloadEntries.find((o) => {
      const oLower = o.name.toLowerCase();
      return (
        oLower === lowerName ||
        oLower.includes(lowerName) ||
        lowerName.includes(oLower)
      );
    });
    if (!match || match.suggestedWeightKg === null) {
      return ex;
    }
    return {
      ...ex,
      targetWeightKg: match.suggestedWeightKg,
      notes: match.recommendation,
    };
  });
}

/**
 * Generates an instant, equipment-aware AND history-aware 7-day workout plan locally
 * when Gemini is unavailable. Accounts for muscles trained today/yesterday (48h recovery)
 * and applies progressive overload from logged workout history.
 */
export function buildOfflineSmartWeeklyPlan(
  input: Omit<GenerateWeeklyPlanInput, 'apiKey' | 'signal' | 'modelPreference'>,
): WeeklyWorkoutPlan {
  const history = summarizeWorkoutHistoryForPlanner(
    input.workouts,
    input.referenceDate,
  );
  const eqLower = input.availableEquipment.map((e) => e.toLowerCase());
  const has = (kw: string) => eqLower.some((e) => e.includes(kw));

  const hasBarbell = has('barbell');
  const hasRack = has('rack');
  const hasBench = has('bench');
  const hasDumbbells = has('dumbbell');
  const hasKettlebell = has('kettlebell');
  const hasBands = has('band');
  const hasPullUp = has('pull-up') || has('pullup');
  const hasTreadmill = has('treadmill');
  const hasBike = has('bike');
  const hasJumpRope = has('jump rope');
  const hasMat = has('mat');

  const cardioEquipmentNote = hasTreadmill
    ? '20–30 min incline treadmill walk (6–8% incline, 4.5 kph)'
    : hasBike
      ? '20–25 min moderate stationary bike ride'
      : hasJumpRope
        ? '12–15 min jump rope intervals (30s work / 30s rest)'
        : '20–30 min brisk outdoor walk';

  const lightRecoveryNote = hasTreadmill
    ? '15–20 min easy treadmill walk (2–4% incline)'
    : hasBike
      ? '15 min easy recovery spin'
      : '15–20 min easy walk + gentle stretching';

  const lowerExercises: PlannedWorkoutExercise[] = [];
  if (hasBarbell && hasRack) {
    lowerExercises.push(
      { name: 'Barbell Back Squat', equipment: 'Barbell & Plates', sets: 4, reps: '6-8' },
      { name: 'Barbell Romanian Deadlift', equipment: 'Barbell & Plates', sets: 3, reps: '8-10' },
    );
  } else if (hasDumbbells) {
    lowerExercises.push(
      { name: 'Dumbbell Goblet Squat', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12' },
      { name: 'Dumbbell Romanian Deadlift', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12' },
      { name: 'Dumbbell Reverse Lunges', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10/leg' },
    );
  } else if (hasKettlebell) {
    lowerExercises.push(
      { name: 'Kettlebell Goblet Squat', equipment: 'Kettlebell', sets: 3, reps: '12' },
      { name: 'Kettlebell Swings', equipment: 'Kettlebell', sets: 4, reps: '15' },
    );
  } else {
    lowerExercises.push(
      { name: 'Bodyweight Tempo Squats', equipment: 'Bodyweight', sets: 3, reps: '15' },
      { name: 'Alternating Reverse Lunges', equipment: 'Bodyweight', sets: 3, reps: '12/leg' },
    );
  }
  if (hasBands) {
    lowerExercises.push({
      name: 'Banded Glute Bridges',
      equipment: 'Resistance Bands',
      sets: 3,
      reps: '15-20',
    });
  } else {
    lowerExercises.push({
      name: 'Glute Bridges',
      equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
      sets: 3,
      reps: '15',
    });
  }

  const upperPushExercises: PlannedWorkoutExercise[] = [];
  if (hasBarbell && hasBench) {
    upperPushExercises.push({
      name: 'Barbell Bench Press',
      equipment: 'Barbell & Plates',
      sets: 4,
      reps: '6-8',
    });
  } else if (hasDumbbells) {
    upperPushExercises.push({
      name: hasBench ? 'Dumbbell Bench Press' : 'Dumbbell Floor Press',
      equipment: 'Adjustable Dumbbells',
      sets: 3,
      reps: '10-12',
    });
  } else {
    upperPushExercises.push({
      name: 'Incline or Standard Push-Ups',
      equipment: 'Bodyweight',
      sets: 3,
      reps: '10-15',
    });
  }
  if (hasDumbbells) {
    upperPushExercises.push(
      { name: 'Dumbbell Shoulder Press', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12' },
      { name: 'Dumbbell Lateral Raises', equipment: 'Adjustable Dumbbells', sets: 3, reps: '12-15' },
    );
  } else {
    upperPushExercises.push({
      name: 'Pike Push-Ups',
      equipment: 'Bodyweight',
      sets: 3,
      reps: '8-12',
    });
  }
  upperPushExercises.push({
    name: 'Forearm Plank',
    equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
    sets: 3,
    reps: '30-45 sec',
  });

  const upperPushPullExercises: PlannedWorkoutExercise[] = [];
  if (hasBarbell && hasBench) {
    upperPushPullExercises.push(
      { name: 'Barbell Bench Press', equipment: 'Barbell & Plates', sets: 4, reps: '6-8' },
      { name: 'Barbell Bent-Over Row', equipment: 'Barbell & Plates', sets: 4, reps: '8-10' },
    );
  } else if (hasDumbbells) {
    upperPushPullExercises.push(
      {
        name: hasBench ? 'Dumbbell Bench Press' : 'Dumbbell Floor Press',
        equipment: 'Adjustable Dumbbells',
        sets: 3,
        reps: '10-12',
      },
      { name: 'One-Arm Dumbbell Row', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12/side' },
      { name: 'Dumbbell Shoulder Press', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12' },
    );
  } else {
    upperPushPullExercises.push(
      { name: 'Incline or Standard Push-Ups', equipment: 'Bodyweight', sets: 3, reps: '8-15' },
      {
        name: hasBands ? 'Banded Seated Rows' : 'Superman Back Extensions',
        equipment: hasBands ? 'Resistance Bands' : hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
        sets: 3,
        reps: '12-15',
      },
    );
  }
  if (hasPullUp) {
    upperPushPullExercises.push({
      name: 'Pull-Ups / Assisted Dead Hangs',
      equipment: 'Pull-Up Bar',
      sets: 3,
      reps: '5-8',
    });
  } else if (hasBands) {
    upperPushPullExercises.push({
      name: 'Band Pull-Aparts',
      equipment: 'Resistance Bands',
      sets: 3,
      reps: '15',
    });
  }

  const fullBodyExercises: PlannedWorkoutExercise[] = [
    hasDumbbells
      ? { name: 'Dumbbell Goblet Squat', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12' }
      : hasKettlebell
        ? { name: 'Kettlebell Deadlifts', equipment: 'Kettlebell', sets: 3, reps: '12' }
        : { name: 'Split Squats', equipment: 'Bodyweight', sets: 3, reps: '10/leg' },
    hasDumbbells
      ? {
          name: hasBench ? 'Incline Dumbbell Press' : 'Dumbbell Shoulder Press',
          equipment: 'Adjustable Dumbbells',
          sets: 3,
          reps: '10-12',
        }
      : { name: 'Push-Ups', equipment: 'Bodyweight', sets: 3, reps: '10-15' },
    hasBands
      ? { name: 'Banded Lat Pulldowns', equipment: 'Resistance Bands', sets: 3, reps: '12-15' }
      : hasDumbbells
        ? { name: 'Dumbbell Bent-Over Rows', equipment: 'Adjustable Dumbbells', sets: 3, reps: '10-12' }
        : { name: 'Plank Shoulder Taps', equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight', sets: 3, reps: '16' },
    {
      name: 'Forearm Plank',
      equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
      sets: 3,
      reps: '30-45 sec',
    },
  ];

  const coreExercises: PlannedWorkoutExercise[] = [
    {
      name: 'Dead Bugs',
      equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
      sets: 3,
      reps: '10/side',
    },
    {
      name: 'Side Plank',
      equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
      sets: 2,
      reps: '30 sec/side',
    },
    {
      name: 'Bird-Dog Core Holds',
      equipment: hasMat ? 'Yoga / Exercise Mat' : 'Bodyweight',
      sets: 3,
      reps: '10/side',
    },
  ];

  // Apply progressive overload from workout history
  const lowerWithOverload = attachOverloadToExercises(
    lowerExercises,
    history.overloadEntries,
  );
  const pushWithOverload = attachOverloadToExercises(
    upperPushExercises,
    history.overloadEntries,
  );
  const upperWithOverload = attachOverloadToExercises(
    upperPushPullExercises,
    history.overloadEntries,
  );
  const fullBodyWithOverload = attachOverloadToExercises(
    fullBodyExercises,
    history.overloadEntries,
  );

  // Build baseline 7-day map, then adapt tomorrow's session if worked muscles overlap!
  const dayMap = new Map<WeekdayIndex, PlannedWorkoutDay>([
    [
      1,
      {
        dayOfWeek: 1,
        dayName: 'Monday',
        focus: 'Full Body Strength & Conditioning',
        isRestDay: false,
        estimatedDurationMin: 40,
        exercises: fullBodyWithOverload,
        cardioNote: cardioEquipmentNote,
        coachingTip: 'Focus on crisp form and progressive overload.',
      },
    ],
    [
      2,
      {
        dayOfWeek: 2,
        dayName: 'Tuesday',
        focus: 'Active Recovery & Steps',
        isRestDay: true,
        estimatedDurationMin: 20,
        exercises: [],
        cardioNote: lightRecoveryNote,
        coachingTip: 'Prioritize 7+ hours sleep and daily protein target.',
      },
    ],
    [
      3,
      {
        dayOfWeek: 3,
        dayName: 'Wednesday',
        focus: 'Core Stability & Cardio',
        isRestDay: false,
        estimatedDurationMin: 30,
        exercises: coreExercises,
        cardioNote: cardioEquipmentNote,
        coachingTip: 'Keep core braced and breathing steady.',
      },
    ],
    [
      4,
      {
        dayOfWeek: 4,
        dayName: 'Thursday',
        focus: 'Rest & Mobility',
        isRestDay: true,
        estimatedDurationMin: 15,
        exercises: [],
        cardioNote: lightRecoveryNote,
        coachingTip: 'Light mobility or walking only.',
      },
    ],
    [
      5,
      {
        dayOfWeek: 5,
        dayName: 'Friday',
        focus: 'Active Recovery',
        isRestDay: true,
        estimatedDurationMin: 15,
        exercises: [],
        cardioNote: lightRecoveryNote,
        coachingTip: 'Rest up ahead of weekend strength sessions.',
      },
    ],
    [
      6,
      {
        dayOfWeek: 6,
        dayName: 'Saturday',
        focus: 'Lower Body Strength + Cardio',
        isRestDay: false,
        estimatedDurationMin: 45,
        exercises: lowerWithOverload,
        cardioNote: cardioEquipmentNote,
        coachingTip: 'Rest 90–120s between heavy lower-body sets.',
      },
    ],
    [
      0,
      {
        dayOfWeek: 0,
        dayName: 'Sunday',
        focus: 'Upper Body Push & Pull',
        isRestDay: false,
        estimatedDurationMin: 40,
        exercises: upperWithOverload,
        coachingTip: 'Track weights so you can progress reps or load next week.',
      },
    ],
  ]);

  // Smart Recovery Adjustment for Tomorrow:
  // If muscles trained today/last 48h overlap with tomorrow's scheduled exercises,
  // automatically swap tomorrow to fresh muscles (e.g., Upper Push + Core if Legs & Back were trained today!).
  const tomorrowWeekday = parseIsoDateLocal(history.tomorrowDate).getDay() as WeekdayIndex;
  const tomorrowPlan = dayMap.get(tomorrowWeekday);
  let recoveryAdjustmentNote = '';
  if (
    tomorrowPlan &&
    !tomorrowPlan.isRestDay &&
    history.musclesWorkedLast48h.length > 0
  ) {
    const tomorrowMuscles = new Set<MuscleGroupTag>();
    for (const ex of tomorrowPlan.exercises) {
      for (const m of classifyMuscleGroups(ex.name)) {
        tomorrowMuscles.add(m);
      }
    }
    const overlapping = history.musclesWorkedLast48h.filter((m) =>
      tomorrowMuscles.has(m),
    );
    if (overlapping.length > 0) {
      const legsOrBackFatigued =
        history.musclesWorkedLast48h.includes('Legs') ||
        history.musclesWorkedLast48h.includes('Back');
      const chestOrShouldersFatigued =
        history.musclesWorkedLast48h.includes('Chest') ||
        history.musclesWorkedLast48h.includes('Shoulders');

      if (legsOrBackFatigued && !chestOrShouldersFatigued) {
        dayMap.set(tomorrowWeekday, {
          dayOfWeek: tomorrowWeekday,
          dayName: WEEKDAY_NAMES[tomorrowWeekday],
          focus: 'Upper Body Push & Core (Fresh Muscles)',
          isRestDay: false,
          estimatedDurationMin: 35,
          exercises: pushWithOverload,
          cardioNote: lightRecoveryNote,
          coachingTip: `Adjusted automatically because ${overlapping.join(' & ')} were worked recently — gives them 48h to recover.`,
        });
        recoveryAdjustmentNote = ` Adjusted ${WEEKDAY_NAMES[tomorrowWeekday]} to Upper Push & Core so ${overlapping.join(' & ')} can recover.`;
      } else {
        dayMap.set(tomorrowWeekday, {
          dayOfWeek: tomorrowWeekday,
          dayName: WEEKDAY_NAMES[tomorrowWeekday],
          focus: 'Core Stability & Active Recovery',
          isRestDay: false,
          estimatedDurationMin: 25,
          exercises: coreExercises,
          cardioNote: lightRecoveryNote,
          coachingTip: `Adjusted automatically for 48h recovery after recent ${overlapping.join(' & ')} work.`,
        });
        recoveryAdjustmentNote = ` Adjusted ${WEEKDAY_NAMES[tomorrowWeekday]} to Core & Recovery for 48h muscle recovery.`;
      }
    }
  }

  const orderedWeekdays: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];
  const days = orderedWeekdays.map((wd) => dayMap.get(wd)!);

  const goalDirection =
    input.profile.targetWeightKg < input.currentWeightKg
      ? 'fat loss & muscle retention'
      : input.profile.targetWeightKg > input.currentWeightKg
        ? 'lean strength & muscle building'
        : 'fitness & body recomposition';

  const overloadCount = history.overloadEntries.filter(
    (e) => e.readyForLoadIncrease,
  ).length;
  const overloadNote =
    overloadCount > 0
      ? ` Applied progressive overload on ${overloadCount} exercise${overloadCount === 1 ? '' : 's'} from your logged history.`
      : '';

  return {
    id: `plan-offline-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    goalSummary: `Balanced 4-day ${goalDirection} plan built from your checked equipment.${recoveryAdjustmentNote}${overloadNote}`,
    equipmentUsed: [...input.availableEquipment],
    ...(input.preferences?.trim()
      ? { customNotes: input.preferences.trim() }
      : {}),
    modelUsed: 'offline-smart-planner',
    days,
    dailyStatusByDate: {},
  };
}
