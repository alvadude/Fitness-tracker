import type {
  CardioMode,
  ExerciseSetLog,
  IsoDate,
  TreadmillBurnInput,
  WorkoutDayType,
  WorkoutSession,
} from './types';

function parseIsoParts(dateStr: IsoDate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid ISO date "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(
      `Invalid calendar date "${dateStr}". Expected valid YYYY-MM-DD.`,
    );
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(
      `Invalid calendar date "${dateStr}". Date does not exist in calendar.`,
    );
  }
  return [year, month, day];
}

export function parseIsoDateLocal(dateStr: IsoDate): Date {
  const [year, month, day] = parseIsoParts(dateStr);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatIsoDateLocal(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIsoDate(dateStr: IsoDate, deltaDays: number): IsoDate {
  const d = parseIsoDateLocal(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return formatIsoDateLocal(d);
}

export function diffDaysIsoDate(fromDate: IsoDate, toDate: IsoDate): number {
  const [y1, m1, d1] = parseIsoParts(fromDate);
  const [y2, m2, d2] = parseIsoParts(toDate);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / 86_400_000);
}

export function getDayTypeForDate(dateStr: IsoDate): WorkoutDayType {
  const day = parseIsoDateLocal(dateStr).getDay();
  if (day === 6) return 'offday_sat_lower';
  if (day === 0) return 'offday_sun_upper';
  if (day === 1) return 'offday_mon_full';
  return 'workday_recovery';
}

export function isWorkday(dayType: WorkoutDayType): boolean {
  return dayType === 'workday_recovery';
}

function singleSpeedVo2(speedKph: number, inclinePct: number): number {
  const safeSpeed = Number.isFinite(speedKph) ? Math.max(0, speedKph) : 0;
  const safeIncline = Number.isFinite(inclinePct) ? Math.max(0, inclinePct) : 0;
  const v = safeSpeed * (1000 / 60);
  const grade = safeIncline / 100;
  return safeSpeed > 6.0
    ? 3.5 + 0.2 * v + 0.9 * v * grade
    : 3.5 + 0.1 * v + 1.8 * v * grade;
}

export function estimateTreadmillKcalPerMin(
  bodyWeightKg: number,
  inclinePct: number,
  speedKph: number,
  mode: CardioMode = 'incline_walk',
  jogSpeedKph?: number,
  walkSpeedKph?: number,
): number {
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    return 0;
  }

  const safeIncline = Number.isFinite(inclinePct) ? Math.max(0, inclinePct) : 0;

  let vo2: number;
  if (
    mode === 'interval_run' &&
    jogSpeedKph !== undefined &&
    walkSpeedKph !== undefined &&
    Number.isFinite(jogSpeedKph) &&
    Number.isFinite(walkSpeedKph) &&
    jogSpeedKph > 0 &&
    walkSpeedKph > 0
  ) {
    // 1 min jog / 2 min walk cycle
    vo2 =
      (singleSpeedVo2(jogSpeedKph, safeIncline) +
        2 * singleSpeedVo2(walkSpeedKph, safeIncline)) /
      3;
  } else {
    if (!Number.isFinite(speedKph) || speedKph <= 0) {
      return 0;
    }
    vo2 = singleSpeedVo2(speedKph, safeIncline);
  }

  const kcalPerMin = (0.92 * vo2 * bodyWeightKg) / 200;
  if (!Number.isFinite(kcalPerMin) || kcalPerMin <= 0) {
    return 0;
  }
  return kcalPerMin;
}

export function estimateTreadmillCalories(input: TreadmillBurnInput): number {
  if (
    !Number.isFinite(input.durationMin) ||
    input.durationMin <= 0 ||
    !Number.isFinite(input.bodyWeightKg) ||
    input.bodyWeightKg <= 0
  ) {
    return 0;
  }

  const kcalPerMin = estimateTreadmillKcalPerMin(
    input.bodyWeightKg,
    input.inclinePct,
    input.speedKph,
    input.mode ?? 'incline_walk',
    input.jogSpeedKph,
    input.walkSpeedKph,
  );

  if (!Number.isFinite(kcalPerMin) || kcalPerMin <= 0) {
    return 0;
  }

  const total = Math.round(kcalPerMin * input.durationMin);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

export function getPreviousExercisePerformance(
  exerciseId: string,
  beforeDate: IsoDate,
  workouts: readonly WorkoutSession[],
): ExerciseSetLog[] | null {
  const candidates = workouts
    .filter((w) => w.date < beforeDate)
    .map((w) => ({
      date: w.date,
      exercise: w.exercises.find((e) => e.exerciseId === exerciseId),
    }))
    .filter(
      (
        item,
      ): item is {
        date: IsoDate;
        exercise: NonNullable<typeof item.exercise>;
      } =>
        item.exercise !== undefined &&
        item.exercise.sets.some(
          (s) => s.completed || (s.weightKg !== null && s.reps !== null),
        ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0].exercise.sets.map((s) => ({ ...s }));
}
