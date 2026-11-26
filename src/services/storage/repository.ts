import type {
  AppSettings,
  CardioLog,
  ExerciseLog,
  ExerciseSetLog,
  FitnessAppState,
  FitnessBackupPayload,
  FoodPreset,
  MacroTargets,
  MealEntry,
  MealItemBreakdown,
  PlannedWorkoutDay,
  UserProfile,
  WeekdayIndex,
  WeeklyWorkoutPlan,
  WeighInEntry,
  WorkoutCompletionStatus,
  WorkoutSession,
} from '../../domain/types';

export interface FitnessStorageAdapter {
  initializeIfNeeded(): Promise<FitnessAppState>;
  getState(): Promise<FitnessAppState>;
  saveProfile(profile: UserProfile): Promise<void>;
  saveTargets(targets: MacroTargets): Promise<void>;
  savePresets(presets: FoodPreset[]): Promise<void>;
  upsertMeal(meal: MealEntry): Promise<void>;
  deleteMeal(mealId: string): Promise<void>;
  upsertWorkout(workout: WorkoutSession): Promise<void>;
  upsertWeighIn(weighIn: WeighInEntry): Promise<void>;
  deleteWeighIn(weighInId: string): Promise<void>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveWeeklyPlan?(plan: WeeklyWorkoutPlan | undefined): Promise<void>;
  exportBackup(): Promise<FitnessBackupPayload>;
  importBackup(rawPayload: unknown): Promise<FitnessAppState>;
  resetToSeed(): Promise<FitnessAppState>;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPositiveFinite(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid backup: "${fieldName}" must be a positive number.`);
  }
  return value;
}

function assertNonNegativeFinite(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid backup: "${fieldName}" must be a non-negative number.`,
    );
  }
  return value;
}

function assertIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !isValidIsoDate(value)) {
    throw new Error(
      `Invalid backup: "${fieldName}" must be a valid YYYY-MM-DD calendar date string.`,
    );
  }
  return value;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Invalid backup: "${fieldName}" must be a non-empty string.`,
    );
  }
  return value;
}

export function validateBackupPayload(raw: unknown): FitnessBackupPayload {
  if (!isRecord(raw)) {
    throw new Error('Invalid backup: payload must be a JSON object.');
  }

  if (raw.schemaVersion !== 1) {
    throw new Error(
      `Invalid backup: unsupported schemaVersion "${String(raw.schemaVersion)}". Expected 1.`,
    );
  }

  const exportedAt = assertNonEmptyString(raw.exportedAt, 'exportedAt');

  if (!isRecord(raw.profile)) {
    throw new Error('Invalid backup: missing "profile" object.');
  }
  const p = raw.profile;
  if (p.sex !== 'male' && p.sex !== 'female') {
    throw new Error('Invalid backup: "profile.sex" must be "male" or "female".');
  }
  if (
    p.activityLevel !== 'desk' &&
    p.activityLevel !== 'light' &&
    p.activityLevel !== 'moderate' &&
    p.activityLevel !== 'active'
  ) {
    throw new Error('Invalid backup: invalid "profile.activityLevel".');
  }
  if (
    typeof p.caffeineCutoffHour !== 'number' ||
    !Number.isFinite(p.caffeineCutoffHour) ||
    p.caffeineCutoffHour < 0 ||
    p.caffeineCutoffHour > 23
  ) {
    throw new Error(
      'Invalid backup: "profile.caffeineCutoffHour" must be between 0 and 23.',
    );
  }

  const profile: UserProfile = {
    ...(typeof p.name === 'string' && p.name.trim().length > 0
      ? { name: p.name.trim() }
      : {}),
    age: assertPositiveFinite(p.age, 'profile.age'),
    sex: p.sex,
    heightCm: assertPositiveFinite(p.heightCm, 'profile.heightCm'),
    activityLevel: p.activityLevel,
    startWeightKg: assertPositiveFinite(p.startWeightKg, 'profile.startWeightKg'),
    startDate: assertIsoDate(p.startDate, 'profile.startDate'),
    targetWeightKg: assertPositiveFinite(
      p.targetWeightKg,
      'profile.targetWeightKg',
    ),
    targetDate: assertIsoDate(p.targetDate, 'profile.targetDate'),
    caffeineCutoffHour: p.caffeineCutoffHour,
  };

  if (!isRecord(raw.targets)) {
    throw new Error('Invalid backup: missing "targets" object.');
  }
  const t = raw.targets;
  const weekNumber = assertPositiveFinite(t.weekNumber, 'targets.weekNumber');
  if (weekNumber < 1) {
    throw new Error('Invalid backup: "targets.weekNumber" must be >= 1.');
  }
  const targets: MacroTargets = {
    calories: assertPositiveFinite(t.calories, 'targets.calories'),
    proteinG: assertNonNegativeFinite(t.proteinG, 'targets.proteinG'),
    carbsG: assertNonNegativeFinite(t.carbsG, 'targets.carbsG'),
    fatG: assertNonNegativeFinite(t.fatG, 'targets.fatG'),
    weekNumber,
  };

  if (!Array.isArray(raw.presets)) {
    throw new Error('Invalid backup: "presets" must be an array.');
  }
  const presets: FoodPreset[] = raw.presets.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid backup: presets[${idx}] must be an object.`);
    }
    return {
      id: assertNonEmptyString(item.id, `presets[${idx}].id`),
      name: assertNonEmptyString(item.name, `presets[${idx}].name`),
      servingLabel: assertNonEmptyString(
        item.servingLabel,
        `presets[${idx}].servingLabel`,
      ),
      calories: assertNonNegativeFinite(
        item.calories,
        `presets[${idx}].calories`,
      ),
      proteinG: assertNonNegativeFinite(
        item.proteinG,
        `presets[${idx}].proteinG`,
      ),
      carbsG: assertNonNegativeFinite(item.carbsG, `presets[${idx}].carbsG`),
      fatG: assertNonNegativeFinite(item.fatG, `presets[${idx}].fatG`),
      isCaffeinated: Boolean(item.isCaffeinated),
      supportsCaffeineToggle:
        item.supportsCaffeineToggle !== undefined
          ? Boolean(item.supportsCaffeineToggle)
          : undefined,
      caffeinatedVariantLabel:
        typeof item.caffeinatedVariantLabel === 'string'
          ? item.caffeinatedVariantLabel
          : undefined,
      caffeineFreeVariantLabel:
        typeof item.caffeineFreeVariantLabel === 'string'
          ? item.caffeineFreeVariantLabel
          : undefined,
      caffeineFreeAlternativeName:
        typeof item.caffeineFreeAlternativeName === 'string'
          ? item.caffeineFreeAlternativeName
          : undefined,
      category:
        item.category === 'drink' ||
        item.category === 'protein' ||
        item.category === 'carb' ||
        item.category === 'meal' ||
        item.category === 'custom'
          ? item.category
          : 'custom',
    };
  });

  if (!Array.isArray(raw.meals)) {
    throw new Error('Invalid backup: "meals" must be an array.');
  }
  const meals: MealEntry[] = raw.meals.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid backup: meals[${idx}] must be an object.`);
    }
    let aiItems: MealItemBreakdown[] | undefined;
    if (item.aiItems !== undefined) {
      if (!Array.isArray(item.aiItems)) {
        throw new Error(
          `Invalid backup: meals[${idx}].aiItems must be an array.`,
        );
      }
      aiItems = item.aiItems.map((aiItem, aiIdx) => {
        if (!isRecord(aiItem)) {
          throw new Error(
            `Invalid backup: meals[${idx}].aiItems[${aiIdx}] must be an object.`,
          );
        }
        return {
          name: assertNonEmptyString(
            aiItem.name,
            `meals[${idx}].aiItems[${aiIdx}].name`,
          ),
          portion: typeof aiItem.portion === 'string' ? aiItem.portion : '',
          calories: assertNonNegativeFinite(
            aiItem.calories,
            `meals[${idx}].aiItems[${aiIdx}].calories`,
          ),
          proteinG:
            aiItem.proteinG !== undefined
              ? assertNonNegativeFinite(
                  aiItem.proteinG,
                  `meals[${idx}].aiItems[${aiIdx}].proteinG`,
                )
              : 0,
          carbsG:
            aiItem.carbsG !== undefined
              ? assertNonNegativeFinite(
                  aiItem.carbsG,
                  `meals[${idx}].aiItems[${aiIdx}].carbsG`,
                )
              : 0,
          fatG:
            aiItem.fatG !== undefined
              ? assertNonNegativeFinite(
                  aiItem.fatG,
                  `meals[${idx}].aiItems[${aiIdx}].fatG`,
                )
              : 0,
        };
      });
    }
    return {
      id: assertNonEmptyString(item.id, `meals[${idx}].id`),
      date: assertIsoDate(item.date, `meals[${idx}].date`),
      time: assertNonEmptyString(item.time, `meals[${idx}].time`),
      name: assertNonEmptyString(item.name, `meals[${idx}].name`),
      calories: assertNonNegativeFinite(item.calories, `meals[${idx}].calories`),
      proteinG: assertNonNegativeFinite(item.proteinG, `meals[${idx}].proteinG`),
      carbsG: assertNonNegativeFinite(item.carbsG, `meals[${idx}].carbsG`),
      fatG: assertNonNegativeFinite(item.fatG, `meals[${idx}].fatG`),
      source:
        item.source === 'preset' ||
        item.source === 'manual' ||
        item.source === 'ai_photo' ||
        item.source === 'seed'
          ? item.source
          : 'manual',
      isCaffeinated: Boolean(item.isCaffeinated),
      caffeineVariant:
        item.caffeineVariant === 'caffeinated' ||
        item.caffeineVariant === 'caffeine-free'
          ? item.caffeineVariant
          : undefined,
      notes: typeof item.notes === 'string' ? item.notes : undefined,
      photoUrl: typeof item.photoUrl === 'string' ? item.photoUrl : undefined,
      aiItems,
      createdAt:
        typeof item.createdAt === 'string'
          ? item.createdAt
          : new Date().toISOString(),
    };
  });

  if (!Array.isArray(raw.workouts)) {
    throw new Error('Invalid backup: "workouts" must be an array.');
  }
  const workouts: WorkoutSession[] = raw.workouts.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid backup: workouts[${idx}] must be an object.`);
    }
    if (!Array.isArray(item.exercises) || !Array.isArray(item.cardio)) {
      throw new Error(
        `Invalid backup: workouts[${idx}] must include exercises and cardio arrays.`,
      );
    }
    const dayType = item.dayType;
    if (
      dayType !== 'workday_recovery' &&
      dayType !== 'offday_sat_lower' &&
      dayType !== 'offday_sun_upper' &&
      dayType !== 'offday_mon_full'
    ) {
      throw new Error(`Invalid backup: workouts[${idx}].dayType is invalid.`);
    }

    const exercises: ExerciseLog[] = item.exercises.map((ex, exIdx) => {
      if (!isRecord(ex)) {
        throw new Error(
          `Invalid backup: workouts[${idx}].exercises[${exIdx}] must be an object.`,
        );
      }
      const exerciseId = assertNonEmptyString(
        ex.exerciseId,
        `workouts[${idx}].exercises[${exIdx}].exerciseId`,
      );
      if (!Array.isArray(ex.sets)) {
        throw new Error(
          `Invalid backup: workouts[${idx}].exercises[${exIdx}].sets must be an array.`,
        );
      }
      const sets: ExerciseSetLog[] = ex.sets.map((s, sIdx) => {
        if (!isRecord(s)) {
          throw new Error(
            `Invalid backup: workouts[${idx}].exercises[${exIdx}].sets[${sIdx}] must be an object.`,
          );
        }
        if (
          s.weightKg !== null &&
          s.weightKg !== undefined &&
          (typeof s.weightKg !== 'number' ||
            !Number.isFinite(s.weightKg) ||
            s.weightKg < 0)
        ) {
          throw new Error(
            `Invalid backup: workouts[${idx}].exercises[${exIdx}].sets[${sIdx}].weightKg is invalid.`,
          );
        }
        if (
          s.reps !== null &&
          s.reps !== undefined &&
          (typeof s.reps !== 'number' ||
            !Number.isFinite(s.reps) ||
            s.reps < 0)
        ) {
          throw new Error(
            `Invalid backup: workouts[${idx}].exercises[${exIdx}].sets[${sIdx}].reps is invalid.`,
          );
        }
        return {
          setNumber:
            typeof s.setNumber === 'number' &&
            Number.isFinite(s.setNumber) &&
            s.setNumber > 0
              ? s.setNumber
              : sIdx + 1,
          targetRepsMin:
            typeof s.targetRepsMin === 'number' &&
            Number.isFinite(s.targetRepsMin) &&
            s.targetRepsMin >= 0
              ? s.targetRepsMin
              : 0,
          targetRepsMax:
            typeof s.targetRepsMax === 'number' &&
            Number.isFinite(s.targetRepsMax) &&
            s.targetRepsMax >= 0
              ? s.targetRepsMax
              : 0,
          weightKg: s.weightKg ?? null,
          reps: s.reps ?? null,
          completed: Boolean(s.completed),
        };
      });
      return {
        exerciseId,
        name:
          typeof ex.name === 'string' && ex.name.trim().length > 0
            ? ex.name
            : exerciseId,
        equipment:
          ex.equipment === 'barbell' ||
          ex.equipment === 'dumbbell' ||
          ex.equipment === 'bodyweight'
            ? ex.equipment
            : 'barbell',
        defaultRestSec:
          ex.defaultRestSec === 90 ||
          ex.defaultRestSec === 120 ||
          ex.defaultRestSec === 180
            ? ex.defaultRestSec
            : 90,
        sets,
      };
    });

    const cardio: CardioLog[] = item.cardio.map((c, cIdx) => {
      if (!isRecord(c)) {
        throw new Error(
          `Invalid backup: workouts[${idx}].cardio[${cIdx}] must be an object.`,
        );
      }
      return {
        id: assertNonEmptyString(c.id, `workouts[${idx}].cardio[${cIdx}].id`),
        mode:
          c.mode === 'incline_walk' ||
          c.mode === 'interval_run' ||
          c.mode === 'easy_walk' ||
          c.mode === 'sport'
            ? c.mode
            : 'incline_walk',
        activityLabel:
          typeof c.activityLabel === 'string' && c.activityLabel.trim()
            ? c.activityLabel.trim()
            : undefined,
        durationMin: assertNonNegativeFinite(
          c.durationMin,
          `workouts[${idx}].cardio[${cIdx}].durationMin`,
        ),
        inclinePct:
          c.inclinePct !== undefined
            ? assertNonNegativeFinite(
                c.inclinePct,
                `workouts[${idx}].cardio[${cIdx}].inclinePct`,
              )
            : 0,
        speedKph:
          c.speedKph !== undefined
            ? assertNonNegativeFinite(
                c.speedKph,
                `workouts[${idx}].cardio[${cIdx}].speedKph`,
              )
            : 0,
        jogSpeedKph:
          c.jogSpeedKph !== undefined
            ? assertNonNegativeFinite(
                c.jogSpeedKph,
                `workouts[${idx}].cardio[${cIdx}].jogSpeedKph`,
              )
            : undefined,
        walkSpeedKph:
          c.walkSpeedKph !== undefined
            ? assertNonNegativeFinite(
                c.walkSpeedKph,
                `workouts[${idx}].cardio[${cIdx}].walkSpeedKph`,
              )
            : undefined,
        bodyWeightKgUsed:
          c.bodyWeightKgUsed !== undefined
            ? assertPositiveFinite(
                c.bodyWeightKgUsed,
                `workouts[${idx}].cardio[${cIdx}].bodyWeightKgUsed`,
              )
            : profile.startWeightKg,
        estimatedCaloriesBurned:
          c.estimatedCaloriesBurned !== undefined
            ? assertNonNegativeFinite(
                c.estimatedCaloriesBurned,
                `workouts[${idx}].cardio[${cIdx}].estimatedCaloriesBurned`,
              )
            : 0,
        notes: typeof c.notes === 'string' ? c.notes : undefined,
      };
    });

    return {
      id: assertNonEmptyString(item.id, `workouts[${idx}].id`),
      date: assertIsoDate(item.date, `workouts[${idx}].date`),
      dayType,
      title: assertNonEmptyString(item.title, `workouts[${idx}].title`),
      exercises,
      cardio,
      completed: Boolean(item.completed),
      completionStatus:
        item.completionStatus === 'completed' ||
        item.completionStatus === 'partial' ||
        item.completionStatus === 'not_completed'
          ? item.completionStatus
          : undefined,
      sleepHours:
        typeof item.sleepHours === 'number' && Number.isFinite(item.sleepHours)
          ? item.sleepHours
          : undefined,
      notes: typeof item.notes === 'string' ? item.notes : undefined,
      completedAt:
        typeof item.completedAt === 'string' ? item.completedAt : undefined,
    };
  });

  if (!Array.isArray(raw.weighIns)) {
    throw new Error('Invalid backup: "weighIns" must be an array.');
  }
  const weighIns: WeighInEntry[] = raw.weighIns.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid backup: weighIns[${idx}] must be an object.`);
    }
    return {
      id: assertNonEmptyString(item.id, `weighIns[${idx}].id`),
      date: assertIsoDate(item.date, `weighIns[${idx}].date`),
      weightKg: assertPositiveFinite(
        item.weightKg,
        `weighIns[${idx}].weightKg`,
      ),
      isFasted: Boolean(item.isFasted),
      notes: typeof item.notes === 'string' ? item.notes : undefined,
      createdAt:
        typeof item.createdAt === 'string'
          ? item.createdAt
          : new Date().toISOString(),
    };
  });

  if (!isRecord(raw.settings)) {
    throw new Error('Invalid backup: missing "settings" object.');
  }
  const s = raw.settings;
  const settings: AppSettings = {
    geminiApiEndpointMode:
      s.geminiApiEndpointMode === 'proxy' ? 'proxy' : 'direct',
    notificationsEnabled: Boolean(s.notificationsEnabled),
    lastDailyReminderDate:
      typeof s.lastDailyReminderDate === 'string' &&
      isValidIsoDate(s.lastDailyReminderDate)
        ? s.lastDailyReminderDate
        : undefined,
    lastWeeklyReminderDate:
      typeof s.lastWeeklyReminderDate === 'string' &&
      isValidIsoDate(s.lastWeeklyReminderDate)
        ? s.lastWeeklyReminderDate
        : undefined,
    availableEquipment: Array.isArray(s.availableEquipment)
      ? s.availableEquipment.filter(
          (eq): eq is string => typeof eq === 'string' && eq.trim().length > 0,
        )
      : undefined,
  };

  let weeklyPlan: WeeklyWorkoutPlan | undefined;
  if (isRecord(raw.weeklyPlan) && Array.isArray(raw.weeklyPlan.days)) {
    const wp = raw.weeklyPlan;
    const rawDays: unknown[] = raw.weeklyPlan.days;
    const dailyStatusByDate: Record<string, WorkoutCompletionStatus> = {};
    if (isRecord(wp.dailyStatusByDate)) {
      for (const [k, v] of Object.entries(wp.dailyStatusByDate)) {
        if (
          isValidIsoDate(k) &&
          (v === 'completed' || v === 'partial' || v === 'not_completed')
        ) {
          dailyStatusByDate[k] = v;
        }
      }
    }
    const days: PlannedWorkoutDay[] = rawDays
      .filter((d): d is Record<string, unknown> => isRecord(d))
      .map((d, idx) => ({
        dayOfWeek:
          typeof d.dayOfWeek === 'number' &&
          Number.isInteger(d.dayOfWeek) &&
          d.dayOfWeek >= 0 &&
          d.dayOfWeek <= 6
            ? (d.dayOfWeek as WeekdayIndex)
            : ((idx % 7) as WeekdayIndex),
        dayName: typeof d.dayName === 'string' ? d.dayName : 'Day',
        focus: typeof d.focus === 'string' ? d.focus : 'Workout',
        isRestDay: Boolean(d.isRestDay),
        estimatedDurationMin:
          typeof d.estimatedDurationMin === 'number' &&
          Number.isFinite(d.estimatedDurationMin)
            ? Math.max(0, Math.round(d.estimatedDurationMin))
            : 0,
        exercises: Array.isArray(d.exercises)
          ? (d.exercises as unknown[])
              .filter((ex): ex is Record<string, unknown> => isRecord(ex))
              .map((ex) => ({
                name: typeof ex.name === 'string' ? ex.name : 'Exercise',
                equipment:
                  typeof ex.equipment === 'string' ? ex.equipment : 'Bodyweight',
                sets:
                  typeof ex.sets === 'number' && ex.sets >= 1
                    ? Math.round(ex.sets)
                    : 3,
                reps: typeof ex.reps === 'string' ? ex.reps : '8-12',
                notes: typeof ex.notes === 'string' ? ex.notes : undefined,
              }))
          : [],
        cardioNote:
          typeof d.cardioNote === 'string' ? d.cardioNote : undefined,
        coachingTip:
          typeof d.coachingTip === 'string' ? d.coachingTip : undefined,
      }));

    if (days.length > 0) {
      weeklyPlan = {
        id:
          typeof wp.id === 'string' && wp.id.trim()
            ? wp.id.trim()
            : `plan-restored`,
        generatedAt:
          typeof wp.generatedAt === 'string'
            ? wp.generatedAt
            : new Date().toISOString(),
        goalSummary:
          typeof wp.goalSummary === 'string' ? wp.goalSummary : 'Weekly plan',
        equipmentUsed: Array.isArray(wp.equipmentUsed)
          ? wp.equipmentUsed.filter((e): e is string => typeof e === 'string')
          : [],
        customNotes:
          typeof wp.customNotes === 'string' ? wp.customNotes : undefined,
        days,
        dailyStatusByDate,
      };
    }
  }

  return {
    schemaVersion: 1,
    exportedAt,
    profile,
    targets,
    presets,
    meals,
    workouts,
    weighIns,
    settings,
    ...(weeklyPlan ? { weeklyPlan } : {}),
  };
}
