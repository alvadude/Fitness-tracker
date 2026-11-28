import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildMonthComplianceCalendar,
  type CalendarDayCompliance,
} from '../domain/compliance';
import { formatIsoDateLocal, parseIsoDateLocal } from '../domain/training';
import type { IsoDate, WorkoutCompletionStatus } from '../domain/types';
import { useFitness } from '../state/FitnessContext';

export interface WorkoutComplianceCalendarProps {
  todayIso?: IsoDate;
  activeDate?: IsoDate;
  onSelectDate?: (date: IsoDate) => void;
  title?: string;
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function getStatusBadgeInfo(day: CalendarDayCompliance): {
  label: string;
  className: string;
} {
  switch (day.status) {
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    case 'rest_complied':
      return {
        label: 'Rest Day · Complied',
        className: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      };
    case 'partial':
      return {
        label: 'Partially Completed',
        className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    case 'missed':
      return {
        label: 'Not Completed',
        className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    case 'pending_today':
      return {
        label: 'Scheduled Today',
        className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
      };
    case 'upcoming':
      return {
        label: day.isRestDay ? 'Upcoming Rest Day' : 'Upcoming Workout',
        className: 'bg-slate-800 text-slate-300 border-slate-700',
      };
    case 'before_start':
    default:
      return {
        label: 'Before Plan Start',
        className: 'bg-slate-900 text-slate-500 border-slate-800',
      };
  }
}

export function WorkoutComplianceCalendar({
  todayIso: todayIsoProp,
  activeDate,
  onSelectDate,
  title = 'Workout Compliance Calendar',
}: WorkoutComplianceCalendarProps) {
  const { state, selectedDate, setDailyPlanStatus } = useFitness();

  const todayIso = todayIsoProp ?? formatIsoDateLocal(new Date());
  const initialFocusDate = activeDate ?? selectedDate ?? todayIso;
  const parsedFocus = parseIsoDateLocal(initialFocusDate);

  const [viewYear, setViewYear] = useState<number>(parsedFocus.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedFocus.getMonth());
  const [inspectedDate, setInspectedDate] = useState<IsoDate>(initialFocusDate);

  useEffect(() => {
    const target = activeDate ?? selectedDate;
    if (!target) return;
    setInspectedDate(target);
    const parsed = parseIsoDateLocal(target);
    setViewYear(parsed.getFullYear());
    setViewMonth(parsed.getMonth());
  }, [activeDate, selectedDate]);

  const monthSummary = useMemo(
    () =>
      buildMonthComplianceCalendar({
        year: viewYear,
        monthIndex: viewMonth,
        todayIso,
        startDate: state.profile.startDate,
        weeklyPlan: state.weeklyPlan,
        workouts: state.workouts,
      }),
    [
      viewYear,
      viewMonth,
      todayIso,
      state.profile.startDate,
      state.weeklyPlan,
      state.workouts,
    ],
  );

  const inspectedDay = useMemo(
    () =>
      monthSummary.days.find((d) => d.date === inspectedDate) ??
      monthSummary.days.find((d) => d.date === todayIso) ??
      monthSummary.days.find((d) => d.inCurrentMonth),
    [monthSummary.days, inspectedDate, todayIso],
  );

  const handleStepMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1, 12, 0, 0, 0);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const handleDayClick = (day: CalendarDayCompliance) => {
    setInspectedDate(day.date);
    if (!day.inCurrentMonth) {
      const parsed = parseIsoDateLocal(day.date);
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
    onSelectDate?.(day.date);
  };

  const handleSetInspectedStatus = (status: WorkoutCompletionStatus) => {
    if (!inspectedDay) return;
    void setDailyPlanStatus(inspectedDay.date, status);
  };

  return (
    <div
      className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
      role="region"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
            <p className="text-[11px] text-slate-400">
              {state.weeklyPlan
                ? 'Synced with your AI Weekly Plan · Rest days complied'
                : 'Default split · Rest days complied by default'}
            </p>
          </div>
        </div>

        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-300">
          {monthSummary.compliancePct}% Complied
        </span>
      </div>

      {/* Month Switcher */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => handleStepMonth(-1)}
          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="text-center text-xs font-semibold text-slate-100">
          {monthSummary.monthLabel}
        </div>

        <button
          type="button"
          aria-label="Next month"
          onClick={() => handleStepMonth(1)}
          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Monthly Summary Pills */}
      <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
          {monthSummary.completedCount} Done
        </span>
        <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-teal-300">
          {monthSummary.restCompliedCount} Rest ✓
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
          {monthSummary.partialCount} Partial
        </span>
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
          {monthSummary.missedCount} Missed
        </span>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAY_HEADERS.map((wd) => (
          <div key={wd} className="py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {monthSummary.days.map((day) => {
          const isSelected = day.date === inspectedDate;
          const isToday = day.date === todayIso;

          let cellStyle =
            'border-slate-800/80 bg-slate-950/40 text-slate-400 hover:border-slate-700';
          if (day.status === 'completed') {
            cellStyle =
              'border-emerald-500/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30';
          } else if (day.status === 'rest_complied') {
            cellStyle =
              'border-teal-500/35 bg-teal-500/12 text-teal-200 hover:bg-teal-500/20';
          } else if (day.status === 'partial') {
            cellStyle =
              'border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30';
          } else if (day.status === 'missed') {
            cellStyle =
              'border-rose-500/45 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25';
          } else if (day.status === 'pending_today') {
            cellStyle =
              'border-cyan-500/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20';
          } else if (day.status === 'before_start') {
            cellStyle = 'border-slate-900 bg-slate-950/20 text-slate-600';
          }

          const statusText = getStatusBadgeInfo(day).label;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => handleDayClick(day)}
              aria-label={`${day.date} — ${statusText}`}
              aria-pressed={isSelected}
              className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-xl border p-1 text-xs transition-colors ${cellStyle} ${
                !day.inCurrentMonth ? 'opacity-40' : ''
              } ${
                isSelected
                  ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900'
                  : isToday
                    ? 'ring-1 ring-cyan-400/70'
                    : ''
              }`}
            >
              <span className="font-semibold tabular-nums leading-none">
                {day.dayOfMonth}
              </span>
              <span className="mt-1 flex h-3 items-center justify-center">
                {day.status === 'completed' && (
                  <Check className="h-3 w-3 text-emerald-300" aria-hidden="true" />
                )}
                {day.status === 'rest_complied' && (
                  <span className="text-[9px] font-bold text-teal-300">R✓</span>
                )}
                {day.status === 'partial' && (
                  <Minus className="h-3 w-3 text-amber-300" aria-hidden="true" />
                )}
                {day.status === 'missed' && (
                  <X className="h-3 w-3 text-rose-300" aria-hidden="true" />
                )}
                {day.status === 'pending_today' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                )}
                {day.status === 'upcoming' && (
                  <span
                    className={`h-1 w-1 rounded-full ${
                      day.isRestDay ? 'bg-slate-600' : 'bg-slate-400'
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Day Detail & Quick Compliance Tick */}
      {inspectedDay && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-100">
                {inspectedDay.date} · {inspectedDay.focusLabel}
              </div>
            </div>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                getStatusBadgeInfo(inspectedDay).className
              }`}
            >
              {getStatusBadgeInfo(inspectedDay).label}
            </span>
          </div>

          <div
            className="grid grid-cols-3 gap-1.5"
            role="group"
            aria-label={`Quick compliance for ${inspectedDay.date}`}
          >
            <button
              type="button"
              aria-label="Calendar status: Completed"
              onClick={() => handleSetInspectedStatus('completed')}
              className={`min-h-[36px] rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
                inspectedDay.status === 'completed'
                  ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500/40'
              }`}
            >
              Done
            </button>
            <button
              type="button"
              aria-label="Calendar status: Partially Completed"
              onClick={() => handleSetInspectedStatus('partial')}
              className={`min-h-[36px] rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
                inspectedDay.status === 'partial'
                  ? 'border-amber-400 bg-amber-400 text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-500/40'
              }`}
            >
              Partial
            </button>
            <button
              type="button"
              aria-label="Calendar status: Not Completed"
              onClick={() => handleSetInspectedStatus('not_completed')}
              className={`min-h-[36px] rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
                inspectedDay.status === 'missed'
                  ? 'border-rose-500 bg-rose-500/25 text-rose-200'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-rose-500/40'
              }`}
            >
              Not Done
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Completed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-teal-400" />
          Rest (Complied)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Partial
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          Not Done
        </span>
      </div>
    </div>
  );
}
