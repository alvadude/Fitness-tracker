import { useEffect, useRef, useState } from 'react';
import {
  BedDouble,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Moon,
} from 'lucide-react';
import {
  addDaysIsoDate,
  formatIsoDateLocal,
  getDayTypeForDate,
  isWorkday,
} from '../../domain/training';
import type {
  CardioLog,
  ExerciseLog,
  IsoDate,
  WorkoutSession,
} from '../../domain/types';
import { useFitness } from '../../state/FitnessContext';
import {
  RestTimer,
  type RestPresetSec,
  type RestTimerExternalStart,
} from './RestTimer';
import { TreadmillLogger } from './TreadmillLogger';
import { WorkoutLogger } from './WorkoutLogger';

const HOME_GYM_EQUIPMENT = [
  'Barbell',
  'Adjustable Dumbbells',
  'Weight Bench',
  'Squat Rack',
  'Treadmill',
] as const;

export function TrainingView() {
  const {
    state,
    selectedDate,
    setSelectedDate,
    getOrCreateWorkoutForDate,
    saveWorkout,
    logCardioForDate,
  } = useFitness();

  const storedSession = state.workouts.find((w) => w.date === selectedDate);
  const baseSession = storedSession ?? getOrCreateWorkoutForDate(selectedDate);
  const dayType = getDayTypeForDate(selectedDate);
  const workday = isWorkday(dayType);

  const latestByDateRef = useRef<Map<IsoDate, WorkoutSession>>(new Map());
  const pendingOpsByDateRef = useRef<Map<IsoDate, number>>(new Map());
  const selectedDateRef = useRef<IsoDate>(selectedDate);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isSleepFocusedRef = useRef<boolean>(false);

  const hasPendingForSelectedDate =
    (pendingOpsByDateRef.current.get(selectedDate) ?? 0) > 0;
  const session =
    hasPendingForSelectedDate && latestByDateRef.current.has(selectedDate)
      ? latestByDateRef.current.get(selectedDate)!
      : baseSession;

  const latestSessionRef = useRef<WorkoutSession>(session);
  const lastSyncedSleepRef = useRef<{
    date: IsoDate;
    sleepHours: number | undefined;
  }>({
    date: selectedDate,
    sleepHours: session.sleepHours,
  });

  const [sleepInput, setSleepInput] = useState<string>(() =>
    session.sleepHours !== undefined ? String(session.sleepHours) : '',
  );
  const [sleepError, setSleepError] = useState<string | null>(null);
  const [timerTrigger, setTimerTrigger] =
    useState<RestTimerExternalStart | null>(null);
  const timerKeyRef = useRef<number>(1);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
    isSleepFocusedRef.current = false;
    const pending = pendingOpsByDateRef.current.get(selectedDate) ?? 0;
    if (pending === 0) {
      latestByDateRef.current.set(selectedDate, baseSession);
    }
    const activeSession =
      latestByDateRef.current.get(selectedDate) ?? baseSession;
    latestSessionRef.current = activeSession;
    lastSyncedSleepRef.current = {
      date: selectedDate,
      sleepHours: activeSession.sleepHours,
    };
    setSleepInput(
      activeSession.sleepHours !== undefined
        ? String(activeSession.sleepHours)
        : '',
    );
    setSleepError(null);
    setTimerTrigger(null);
    // Sync draft session ref, sleep field, and clear stale timer trigger when switching dates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    const pending = pendingOpsByDateRef.current.get(selectedDate) ?? 0;
    if (pending === 0) {
      latestSessionRef.current = baseSession;
      latestByDateRef.current.set(selectedDate, baseSession);
      const nextSleep = storedSession?.sleepHours;
      if (
        !isSleepFocusedRef.current &&
        lastSyncedSleepRef.current.date === selectedDate &&
        lastSyncedSleepRef.current.sleepHours !== nextSleep
      ) {
        lastSyncedSleepRef.current = {
          date: selectedDate,
          sleepHours: nextSleep,
        };
        setSleepInput(nextSleep !== undefined ? String(nextSleep) : '');
      }
    } else {
      latestSessionRef.current =
        latestByDateRef.current.get(selectedDate) ?? baseSession;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, storedSession]);

  const incrementPendingForDate = (targetDate: IsoDate) => {
    pendingOpsByDateRef.current.set(
      targetDate,
      (pendingOpsByDateRef.current.get(targetDate) ?? 0) + 1,
    );
  };

  const decrementPendingForDate = (targetDate: IsoDate) => {
    const nextPending = Math.max(
      0,
      (pendingOpsByDateRef.current.get(targetDate) ?? 1) - 1,
    );
    if (nextPending === 0) {
      pendingOpsByDateRef.current.delete(targetDate);
    } else {
      pendingOpsByDateRef.current.set(targetDate, nextPending);
    }
  };

  const enqueueQueuedOp = (op: () => Promise<void>): Promise<void> => {
    const next = saveQueueRef.current.then(op, op);
    saveQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const runSessionSave = (
    updater: (base: WorkoutSession) => WorkoutSession,
  ): Promise<void> => {
    const targetDate = selectedDate;
    const fallbackBase = latestSessionRef.current;
    incrementPendingForDate(targetDate);

    return enqueueQueuedOp(async () => {
      try {
        const base = latestByDateRef.current.get(targetDate) ?? fallbackBase;
        const next = updater(base);
        if (next === base) {
          return;
        }
        latestByDateRef.current.set(targetDate, next);
        if (selectedDateRef.current === targetDate) {
          latestSessionRef.current = next;
        }
        await saveWorkout(next);
      } finally {
        decrementPendingForDate(targetDate);
      }
    });
  };

  const handleStepDate = (deltaDays: number) => {
    setSelectedDate(addDaysIsoDate(selectedDate, deltaDays));
  };

  const handleDateInputChange = (raw: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
    try {
      getDayTypeForDate(raw);
      setSelectedDate(raw);
    } catch {
      // Ignore invalid or incomplete calendar dates
    }
  };

  const handleJumpToday = () => {
    setSelectedDate(formatIsoDateLocal(new Date()));
  };

  const handleToggleWorkoutCompleted = () => {
    return runSessionSave((latest) => {
      const nextCompleted = !latest.completed;
      return {
        ...latest,
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : undefined,
      };
    });
  };

  const persistSleepValue = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setSleepError(null);
      return runSessionSave((latest) => {
        if (latest.sleepHours === undefined) return latest;
        return {
          ...latest,
          sleepHours: undefined,
        };
      });
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
      setSleepError('Enter sleep hours between 0 and 24.');
      return undefined;
    }
    setSleepError(null);
    const rounded = Math.round(parsed * 10) / 10;
    setSleepInput(String(rounded));
    return runSessionSave((latest) => {
      if (latest.sleepHours === rounded) return latest;
      return {
        ...latest,
        sleepHours: rounded,
      };
    });
  };

  const handleSaveExercises = (updatedExercises: ExerciseLog[]) => {
    return runSessionSave((latest) => ({
      ...latest,
      exercises: updatedExercises,
    }));
  };

  const handleAddCardio = (cardio: Omit<CardioLog, 'id'>): Promise<void> => {
    const targetDate = selectedDate;
    incrementPendingForDate(targetDate);

    return enqueueQueuedOp(async () => {
      try {
        const updated = await logCardioForDate(targetDate, cardio);
        latestByDateRef.current.set(targetDate, updated);
        if (selectedDateRef.current === targetDate) {
          latestSessionRef.current = updated;
        }
      } finally {
        decrementPendingForDate(targetDate);
      }
    });
  };

  const handleEditCardio = (id: string, payload: Omit<CardioLog, 'id'>) => {
    return runSessionSave((latest) => {
      if (!latest.cardio.some((c) => c.id === id)) {
        return latest;
      }
      return {
        ...latest,
        cardio: latest.cardio.map((c) =>
          c.id === id ? { ...payload, id } : c,
        ),
      };
    });
  };

  const handleRemoveCardio = (id: string) => {
    return runSessionSave((latest) => {
      if (!latest.cardio.some((c) => c.id === id)) {
        return latest;
      }
      return {
        ...latest,
        cardio: latest.cardio.filter((c) => c.id !== id),
      };
    });
  };

  const handleStartRestTimer = (durationSec: RestPresetSec) => {
    timerKeyRef.current += 1;
    setTimerTrigger({
      durationSec,
      key: timerKeyRef.current,
    });
  };

  const sleepStatusBadge =
    session.sleepHours !== undefined
      ? session.sleepHours >= 7
        ? {
            label: `${session.sleepHours}h logged · >=7h goal met`,
            className:
              'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
          }
        : {
            label: `${session.sleepHours}h logged · <7h (prioritize 7+ hrs)`,
            className: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
          }
      : {
          label: 'Target: 7+ hrs sleep',
          className: 'border-slate-700 bg-slate-800/80 text-slate-300',
        };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStepDate(-1)}
              aria-label="Previous day"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <label className="relative flex min-w-0 flex-1 items-center">
              <Calendar
                className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="date"
                aria-label="Training date"
                value={selectedDate}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-2 text-xs font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={() => handleStepDate(1)}
              aria-label="Next day"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleJumpToday}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
          >
            Today
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                workday
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {workday ? 'Workday · Active Recovery' : 'Off Day · Training Split'}
            </span>
            <span className="text-xs text-slate-400">{selectedDate}</span>
          </div>

          <h2 className="text-base font-semibold text-slate-100">
            {session.title}
          </h2>
        </div>
      </div>

      {workday ? (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                  <BedDouble className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Active Recovery &amp; Sleep Priority
                  </h3>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Workday hours: 7:30 AM – 8:00 PM</span>
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${sleepStatusBadge.className}`}
              >
                <Moon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{sleepStatusBadge.label}</span>
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Prioritize 7+ hours sleep on Tue–Fri workdays. Keep movement light
              with an optional 15–20 min easy treadmill walk.
            </p>

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void persistSleepValue(sleepInput);
              }}
              className="space-y-2"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <label className="block min-w-0">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">
                    Sleep (hours)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="24"
                    step="0.5"
                    placeholder="7.5"
                    aria-invalid={sleepError ? true : undefined}
                    value={sleepInput}
                    onFocus={() => {
                      isSleepFocusedRef.current = true;
                    }}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setSleepInput(nextVal);
                      const trimmed = nextVal.trim();
                      if (trimmed === '') {
                        setSleepError(null);
                      } else {
                        const parsed = Number(trimmed);
                        if (
                          Number.isFinite(parsed) &&
                          parsed >= 0 &&
                          parsed <= 24
                        ) {
                          setSleepError(null);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      isSleepFocusedRef.current = false;
                      void persistSleepValue(e.target.value);
                    }}
                    className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/25"
                >
                  Save Sleep
                </button>
              </div>

              {sleepError && (
                <p role="alert" className="text-xs font-medium text-rose-400">
                  {sleepError}
                </p>
              )}
            </form>
          </div>

          <TreadmillLogger
            date={selectedDate}
            dayType={dayType}
            cardioLogs={session.cardio}
            weighIns={state.weighIns}
            startWeightKg={state.profile.startWeightKg}
            onAddCardio={handleAddCardio}
            onEditCardio={handleEditCardio}
            onRemoveCardio={handleRemoveCardio}
          />
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Dumbbell className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>Home Gym Equipment</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {HOME_GYM_EQUIPMENT.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <RestTimer externalStart={timerTrigger} />

          <WorkoutLogger
            exercises={session.exercises}
            selectedDate={selectedDate}
            workouts={state.workouts}
            onSaveExercises={handleSaveExercises}
            onSetCompleted={handleStartRestTimer}
          />

          <TreadmillLogger
            date={selectedDate}
            dayType={dayType}
            cardioLogs={session.cardio}
            weighIns={state.weighIns}
            startWeightKg={state.profile.startWeightKg}
            onAddCardio={handleAddCardio}
            onEditCardio={handleEditCardio}
            onRemoveCardio={handleRemoveCardio}
          />
        </>
      )}

      <button
        type="button"
        aria-pressed={session.completed}
        onClick={() => void handleToggleWorkoutCompleted()}
        className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors ${
          session.completed
            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
            : 'border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-800'
        }`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {session.completed ? 'Workout Completed' : 'Complete Workout'}
        </span>
      </button>
    </section>
  );
}
