import type {
  MacroTargets,
  PlannedWorkoutDay,
  PlannedWorkoutExercise,
  UserProfile,
  WeekdayIndex,
  WeeklyWorkoutPlan,
} from '../../domain/types';
import {
  GEMINI_ENDPOINT,
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
  apiKey?: string;
  signal?: AbortSignal;
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
  input: Omit<GenerateWeeklyPlanInput, 'apiKey' | 'signal'>,
): string {
  const equipmentList =
    input.availableEquipment.length > 0
      ? input.availableEquipment.join(', ')
      : 'Bodyweight (No Equipment)';
  const userName = input.profile.name?.trim() || 'the user';
  const prefs = input.preferences?.trim();

  return [
    `Create a personalized, realistic 7-day weekly workout plan (Monday through Sunday) for ${userName}.`,
    `Profile: ${input.profile.age}y ${input.profile.sex}, ${input.profile.heightCm} cm, current weight ${input.currentWeightKg.toFixed(1)} kg, goal weight ${input.profile.targetWeightKg} kg by ${input.profile.targetDate}, activity level: ${input.profile.activityLevel}.`,
    `Daily nutrition targets: ${input.targets.calories} kcal, ${input.targets.proteinG}g protein.`,
    `AVAILABLE EQUIPMENT (ONLY prescribe exercises using these items or bodyweight): ${equipmentList}.`,
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

function inferWeekdayIndex(dayOfWeek: unknown, dayName: unknown, fallbackIdx: number): WeekdayIndex {
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
          'Add your Gemini API key below or in the Settings tab to generate a weekly plan.',
      },
    );
  }

  const prompt = buildWeeklyWorkoutPrompt(input);
  let response: Response;
  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
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
      }),
      signal: input.signal,
    });
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new MealEstimatorError(
      'NETWORK_ERROR',
      'Unable to reach Gemini to generate your workout plan.',
      { actionableHint: 'Check your internet connection and retry.' },
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
        upstreamMessage || 'Gemini rate limit exceeded.',
        {
          status: response.status,
          actionableHint: 'Wait a few seconds and try generating again.',
        },
      );
    }
    throw new MealEstimatorError(
      response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR',
      upstreamMessage || `Gemini request failed with status ${response.status}.`,
      {
        status: response.status,
        actionableHint: 'Retry generating the weekly plan shortly.',
      },
    );
  }

  const jsonPayload = (await response.json()) as unknown;
  return parseWeeklyWorkoutPlanPayload(jsonPayload, {
    equipmentUsed: input.availableEquipment,
    customNotes: input.preferences,
  });
}
