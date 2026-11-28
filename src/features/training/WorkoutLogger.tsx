import { useEffect, useRef, useState } from 'react';
import { Check, Dumbbell, Plus, Timer } from 'lucide-react';
import { getPreviousExercisePerformance } from '../../domain/training';
import type {
  ExerciseLog,
  ExerciseSetLog,
  IsoDate,
  WorkoutSession,
} from '../../domain/types';

export interface WorkoutLoggerProps {
  exercises: ExerciseLog[];
  selectedDate: IsoDate;
  workouts: readonly WorkoutSession[];
  onSaveExercises: (updatedExercises: ExerciseLog[]) => void | Promise<void>;
  onSetCompleted?: (restSec: 90 | 120 | 180) => void;
}

function formatRestLabel(restSec: 90 | 120 | 180): string {
  if (restSec === 90) return '90s';
  return `${restSec / 60}m`;
}

function parseNullableNonNegative(
  raw: string,
  integerOnly: boolean,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return integerOnly ? Math.round(parsed) : Math.round(parsed * 100) / 100;
}

function formatPrevSetLabel(prevSet: ExerciseSetLog | undefined): string | null {
  if (!prevSet) return null;
  if (prevSet.weightKg !== null && prevSet.reps !== null) {
    return `Prev: ${prevSet.weightKg} kg × ${prevSet.reps}`;
  }
  if (prevSet.weightKg !== null) {
    return `Prev: ${prevSet.weightKg} kg`;
  }
  if (prevSet.reps !== null) {
    return `Prev: ${prevSet.reps} reps`;
  }
  return null;
}

export function WorkoutLogger({
  exercises,
  selectedDate,
  workouts,
  onSaveExercises,
  onSetCompleted,
}: WorkoutLoggerProps) {
  const [draftExercises, setDraftExercises] =
    useState<ExerciseLog[]>(exercises);
  const draftByDateRef = useRef<Map<IsoDate, ExerciseLog[]>>(new Map());
  const pendingSavesByDateRef = useRef<Map<IsoDate, number>>(new Map());
  const draftRef = useRef<ExerciseLog[]>(exercises);

  useEffect(() => {
    const pending = pendingSavesByDateRef.current.get(selectedDate) ?? 0;
    if (pending === 0) {
      draftByDateRef.current.set(selectedDate, exercises);
    }
    const activeDraft = draftByDateRef.current.get(selectedDate) ?? exercises;
    draftRef.current = activeDraft;
    setDraftExercises(activeDraft);
  }, [selectedDate, exercises]);

  if (draftExercises.length === 0) {
    return null;
  }

  const commitExercises = (nextExercises: ExerciseLog[]) => {
    const targetDate = selectedDate;
    draftByDateRef.current.set(targetDate, nextExercises);
    draftRef.current = nextExercises;
    setDraftExercises(nextExercises);
    pendingSavesByDateRef.current.set(
      targetDate,
      (pendingSavesByDateRef.current.get(targetDate) ?? 0) + 1,
    );
    void Promise.resolve(onSaveExercises(nextExercises)).finally(() => {
      const nextPending = Math.max(
        0,
        (pendingSavesByDateRef.current.get(targetDate) ?? 1) - 1,
      );
      if (nextPending === 0) {
        pendingSavesByDateRef.current.delete(targetDate);
      } else {
        pendingSavesByDateRef.current.set(targetDate, nextPending);
      }
    });
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    updater: (set: ExerciseSetLog) => ExerciseSetLog,
  ) => {
    const nextExercises = draftRef.current.map((ex, eIdx) => {
      if (eIdx !== exerciseIndex) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, sIdx) => (sIdx === setIndex ? updater(s) : s)),
      };
    });
    commitExercises(nextExercises);
  };

  const handleAddSet = (exerciseIndex: number) => {
    const nextExercises = draftRef.current.map((ex, eIdx) => {
      if (eIdx !== exerciseIndex) return ex;
      const template = ex.sets[ex.sets.length - 1];
      const nextSet: ExerciseSetLog = {
        setNumber: ex.sets.length + 1,
        targetRepsMin: template?.targetRepsMin ?? 8,
        targetRepsMax: template?.targetRepsMax ?? 10,
        weightKg: null,
        reps: null,
        completed: false,
      };
      return {
        ...ex,
        sets: [...ex.sets, nextSet],
      };
    });
    commitExercises(nextExercises);
  };

  return (
    <div className="space-y-3">
      {draftExercises.map((exercise, exerciseIndex) => {
        const previousSets = getPreviousExercisePerformance(
          exercise.exerciseId,
          selectedDate,
          workouts,
        );
        const completedSetsCount = exercise.sets.filter((s) => s.completed).length;

        return (
          <article
            key={exercise.exerciseId}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <h3 className="min-w-0 text-sm font-semibold text-slate-100">
                    {exercise.name}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span className="rounded-full border border-slate-700/80 bg-slate-800/80 px-2 py-0.5 capitalize text-slate-300">
                    {exercise.equipment}
                  </span>
                  {exercise.sets[0] && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                      {exercise.sets.length}×{exercise.sets[0].targetRepsMin}–
                      {exercise.sets[0].targetRepsMax}
                    </span>
                  )}
                  {typeof exercise.suggestedWeightKg === 'number' &&
                    exercise.suggestedWeightKg > 0 && (
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 font-semibold text-cyan-300">
                        Target: {exercise.suggestedWeightKg} kg
                      </span>
                    )}
                  <span>
                    {completedSetsCount}/{exercise.sets.length} sets done
                  </span>
                  {previousSets === null && (
                    <span className="text-slate-500">· No prior log</span>
                  )}
                </div>
                {exercise.notes && (
                  <p className="text-[11px] text-cyan-200/90">
                    {exercise.notes}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSetCompleted?.(exercise.defaultRestSec)}
                aria-label={`Start ${formatRestLabel(exercise.defaultRestSec)} rest timer`}
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
              >
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Rest {formatRestLabel(exercise.defaultRestSec)}</span>
              </button>
            </div>

            <div className="space-y-2">
              {exercise.sets.map((set, setIndex) => {
                const prevLabel = formatPrevSetLabel(previousSets?.[setIndex]);

                return (
                  <div
                    key={set.setNumber}
                    className={`rounded-xl border p-2.5 space-y-2 transition-colors ${
                      set.completed
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-slate-800 bg-slate-800/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-xs font-semibold text-slate-200">
                        Set {set.setNumber}{' '}
                        <span className="font-normal text-slate-400">
                          · Target {set.targetRepsMin}–{set.targetRepsMax} reps
                        </span>
                      </span>
                      {prevLabel && (
                        <span className="text-xs font-medium text-cyan-300">
                          {prevLabel}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-end gap-2">
                      <label className="block min-w-0">
                        <span className="mb-1 block text-[11px] font-medium text-slate-400">
                          Weight (kg)
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.5"
                          placeholder="0"
                          aria-label={`${exercise.name} Set ${set.setNumber} weight (kg)`}
                          value={set.weightKg ?? ''}
                          onChange={(e) => {
                            const nextWeight = parseNullableNonNegative(
                              e.target.value,
                              false,
                            );
                            updateSet(exerciseIndex, setIndex, (prev) => ({
                              ...prev,
                              weightKg: nextWeight,
                            }));
                          }}
                          className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                        />
                      </label>

                      <label className="block min-w-0">
                        <span className="mb-1 block text-[11px] font-medium text-slate-400">
                          Reps
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          placeholder={`${set.targetRepsMin}-${set.targetRepsMax}`}
                          aria-label={`${exercise.name} Set ${set.setNumber} reps`}
                          value={set.reps ?? ''}
                          onChange={(e) => {
                            const nextReps = parseNullableNonNegative(
                              e.target.value,
                              true,
                            );
                            updateSet(exerciseIndex, setIndex, (prev) => ({
                              ...prev,
                              reps: nextReps,
                            }));
                          }}
                          className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                        />
                      </label>

                      <button
                        type="button"
                        aria-pressed={set.completed}
                        aria-label={`Complete Set ${set.setNumber} — ${exercise.name}`}
                        onClick={() => {
                          const nextCompleted = !set.completed;
                          updateSet(exerciseIndex, setIndex, (prev) => ({
                            ...prev,
                            completed: nextCompleted,
                          }));
                          if (nextCompleted) {
                            onSetCompleted?.(exercise.defaultRestSec);
                          }
                        }}
                        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors ${
                          set.completed
                            ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                            : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                        }`}
                      >
                        <Check className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleAddSet(exerciseIndex)}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-3 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800/70"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Set</span>
            </button>
          </article>
        );
      })}
    </div>
  );
}
