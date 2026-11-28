import {
  addDaysIsoDate,
  formatIsoDateLocal,
  getDayTypeForDate,
  parseIsoDateLocal,
} from './training';
import type {
  IsoDate,
  PlannedWorkoutDay,
  WeeklyWorkoutPlan,
  WorkoutCompletionStatus,
  WorkoutSession,
} from './types';

export type DayComplianceStatus =
  | 'completed'
  | 'rest_complied'
  | 'partial'
  | 'missed'
  | 'pending_today'
  | 'upcoming'
  | 'before_start';

export interface CalendarDayCompliance {
  date: IsoDate;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isRestDay: boolean;
  status: DayComplianceStatus;
  explicitStatus?: WorkoutCompletionStatus;
  focusLabel: string;
}

export interface MonthComplianceSummary {
  year: number;
  monthIndex: number; // 0-11
  monthLabel: string;
  days: CalendarDayCompliance[];
  compliedCount: number;
  completedCount: number;
  restCompliedCount: number;
  partialCount: number;
  missedCount: number;
  evaluatedDaysCount: number;
  compliancePct: number;
}

export function getPlannedDayForDate(
  weeklyPlan: WeeklyWorkoutPlan | undefined,
  date: IsoDate,
): PlannedWorkoutDay | undefined {
  if (!weeklyPlan) return undefined;
  const weekday = parseIsoDateLocal(date).getDay();
  return weeklyPlan.days.find((d) => d.dayOfWeek === weekday);
}

export function isRestDayForDate(
  date: IsoDate,
  weeklyPlan: WeeklyWorkoutPlan | undefined,
): boolean {
  const planned = getPlannedDayForDate(weeklyPlan, date);
  if (planned) {
    return planned.isRestDay;
  }
  return getDayTypeForDate(date) === 'workday_recovery';
}

export function resolveDayCompliance(params: {
  date: IsoDate;
  todayIso: IsoDate;
  startDate: IsoDate;
  weeklyPlan?: WeeklyWorkoutPlan;
  workouts: readonly WorkoutSession[];
}): Omit<CalendarDayCompliance, 'dayOfMonth' | 'inCurrentMonth'> {
  const { date, todayIso, startDate, weeklyPlan, workouts } = params;
  const planned = getPlannedDayForDate(weeklyPlan, date);
  const isRestDay = planned
    ? planned.isRestDay
    : getDayTypeForDate(date) === 'workday_recovery';

  const workout = workouts.find((w) => w.date === date);
  const focusLabel =
    planned?.focus ??
    workout?.title ??
    (isRestDay ? 'Rest / Active Recovery' : 'Scheduled Workout');

  const planTick = weeklyPlan?.dailyStatusByDate[date];
  const workoutTick =
    workout?.completionStatus ?? (workout?.completed ? 'completed' : undefined);
  const explicitStatus = planTick ?? workoutTick;

  // 1. Explicit status overrides always respected when completed or partial
  if (explicitStatus === 'completed') {
    return {
      date,
      isRestDay,
      status: 'completed',
      explicitStatus,
      focusLabel,
    };
  }
  if (explicitStatus === 'partial') {
    return {
      date,
      isRestDay,
      status: 'partial',
      explicitStatus,
      focusLabel,
    };
  }

  // 2. Dates before tracking started (with no logged workout)
  if (date < startDate) {
    return {
      date,
      isRestDay,
      status: 'before_start',
      explicitStatus,
      focusLabel,
    };
  }

  // 3. Future dates
  if (date > todayIso) {
    return {
      date,
      isRestDay,
      status: 'upcoming',
      explicitStatus,
      focusLabel,
    };
  }

  // 4. Rest days default to complied (unless user explicitly ticked "not_completed" on the plan)
  if (isRestDay) {
    if (planTick === 'not_completed') {
      return {
        date,
        isRestDay,
        status: 'missed',
        explicitStatus,
        focusLabel,
      };
    }
    return {
      date,
      isRestDay,
      status: 'rest_complied',
      explicitStatus,
      focusLabel,
    };
  }

  // 5. Scheduled training day on or before today with no completion yet
  if (date === todayIso && explicitStatus !== 'not_completed') {
    return {
      date,
      isRestDay,
      status: 'pending_today',
      explicitStatus,
      focusLabel,
    };
  }

  return {
    date,
    isRestDay,
    status: 'missed',
    explicitStatus,
    focusLabel,
  };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function buildMonthComplianceCalendar(params: {
  year: number;
  monthIndex: number; // 0-11
  todayIso: IsoDate;
  startDate: IsoDate;
  weeklyPlan?: WeeklyWorkoutPlan;
  workouts: readonly WorkoutSession[];
}): MonthComplianceSummary {
  const { year, monthIndex, todayIso, startDate, weeklyPlan, workouts } =
    params;

  const firstOfMonth = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const firstIso = formatIsoDateLocal(firstOfMonth);
  const firstWeekday = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
  const gridStartIso = addDaysIsoDate(firstIso, mondayOffset);

  const daysInMonth = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
  const totalCells = Math.ceil((Math.abs(mondayOffset) + daysInMonth) / 7) * 7;

  const days: CalendarDayCompliance[] = [];
  let completedCount = 0;
  let restCompliedCount = 0;
  let partialCount = 0;
  let missedCount = 0;
  let evaluatedDaysCount = 0;

  for (let i = 0; i < totalCells; i++) {
    const cellIso = addDaysIsoDate(gridStartIso, i);
    const cellDate = parseIsoDateLocal(cellIso);
    const inCurrentMonth =
      cellDate.getFullYear() === year && cellDate.getMonth() === monthIndex;

    const resolved = resolveDayCompliance({
      date: cellIso,
      todayIso,
      startDate,
      weeklyPlan,
      workouts,
    });

    if (inCurrentMonth) {
      if (resolved.status === 'completed') {
        completedCount += 1;
        evaluatedDaysCount += 1;
      } else if (resolved.status === 'rest_complied') {
        restCompliedCount += 1;
        evaluatedDaysCount += 1;
      } else if (resolved.status === 'partial') {
        partialCount += 1;
        evaluatedDaysCount += 1;
      } else if (resolved.status === 'missed') {
        missedCount += 1;
        evaluatedDaysCount += 1;
      }
    }

    days.push({
      ...resolved,
      dayOfMonth: cellDate.getDate(),
      inCurrentMonth,
    });
  }

  const compliedCount = completedCount + restCompliedCount;
  const weightedScore = compliedCount + partialCount * 0.5;
  const compliancePct =
    evaluatedDaysCount > 0
      ? Math.round((weightedScore / evaluatedDaysCount) * 100)
      : 100;

  return {
    year,
    monthIndex,
    monthLabel: `${MONTH_NAMES[monthIndex]} ${year}`,
    days,
    compliedCount,
    completedCount,
    restCompliedCount,
    partialCount,
    missedCount,
    evaluatedDaysCount,
    compliancePct,
  };
}
