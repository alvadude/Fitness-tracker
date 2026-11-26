import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Dumbbell,
  KeyRound,
  ListChecks,
  Loader2,
  MinusCircle,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AVAILABLE_EQUIPMENT_OPTIONS,
  DEFAULT_EQUIPMENT,
} from '../../domain/defaults';
import {
  addDaysIsoDate,
  getDayTypeForDate,
  parseIsoDateLocal,
} from '../../domain/training';
import type {
  ExerciseLog,
  IsoDate,
  PlannedWorkoutDay,
  WeekdayIndex,
  WorkoutCompletionStatus,
} from '../../domain/types';
import { MealEstimatorError } from '../../services/ai/mealEstimator';
import {
  buildOfflineSmartWeeklyPlan,
  generateWeeklyWorkoutPlan,
} from '../../services/ai/workoutPlanner';
import { useFitness } from '../../state/FitnessContext';

export interface WeeklyPlannerPanelProps {
  onJumpToDailyLog?: () => void;
}

function getMondayStartForDate(isoDate: IsoDate): IsoDate {
  const date = parseIsoDateLocal(isoDate);
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDaysIsoDate(isoDate, diffToMonday);
}

function parseRepRange(repsRaw: string): [number, number] {
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

function mapEquipmentType(
  equipmentLabel: string,
): 'barbell' | 'dumbbell' | 'bodyweight' {
  const lower = equipmentLabel.toLowerCase();
  if (lower.includes('barbell')) return 'barbell';
  if (lower.includes('dumbbell') || lower.includes('kettlebell')) {
    return 'dumbbell';
  }
  return 'bodyweight';
}

function slugifyExerciseId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `planned_ex_${index + 1}`;
}

export function WeeklyPlannerPanel({
  onJumpToDailyLog,
}: WeeklyPlannerPanelProps) {
  const {
    state,
    selectedDate,
    setSelectedDate,
    currentWeightKg,
    geminiApiKey,
    saveGeminiApiKey,
    updateSettings,
    saveWeeklyPlan,
    setDailyPlanStatus,
    getOrCreateWorkoutForDate,
    saveWorkout,
  } = useFitness();

  const selectedEquipment = useMemo(
    () =>
      state.settings.availableEquipment &&
      state.settings.availableEquipment.length > 0
        ? state.settings.availableEquipment
        : [...DEFAULT_EQUIPMENT],
    [state.settings.availableEquipment],
  );

  const allEquipmentOptions = useMemo(() => {
    const merged = new Set<string>([
      ...AVAILABLE_EQUIPMENT_OPTIONS,
      ...selectedEquipment,
    ]);
    return Array.from(merged);
  }, [selectedEquipment]);

  const [customEquipmentInput, setCustomEquipmentInput] = useState('');
  const [preferences, setPreferences] = useState(
    state.weeklyPlan?.customNotes ?? '',
  );
  const [inlineApiKey, setInlineApiKey] = useState('');
  const [showKeyRecovery, setShowKeyRecovery] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);

  const mondayDate = useMemo(
    () => getMondayStartForDate(selectedDate),
    [selectedDate],
  );

  const weekDateMap = useMemo(() => {
    const map = new Map<WeekdayIndex, IsoDate>();
    const monFirstOrder: WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];
    monFirstOrder.forEach((wd, offset) => {
      map.set(wd, addDaysIsoDate(mondayDate, offset));
    });
    return map;
  }, [mondayDate]);

  const handleToggleEquipment = (item: string) => {
    const exists = selectedEquipment.includes(item);
    const next = exists
      ? selectedEquipment.filter((eq) => eq !== item)
      : [...selectedEquipment, item];
    void updateSettings({
      availableEquipment:
        next.length > 0 ? next : ['Bodyweight (No Equipment)'],
    });
  };

  const handleAddCustomEquipment = () => {
    const trimmed = customEquipmentInput.trim();
    if (!trimmed) return;
    if (!selectedEquipment.includes(trimmed)) {
      void updateSettings({
        availableEquipment: [...selectedEquipment, trimmed],
      });
    }
    setCustomEquipmentInput('');
  };

  const runGeneratePlan = async (explicitKey?: string) => {
    setPlanError(null);
    setPlanStatus(null);
    setIsGenerating(true);
    try {
      const generated = await generateWeeklyWorkoutPlan({
        profile: state.profile,
        targets: state.targets,
        currentWeightKg,
        availableEquipment: selectedEquipment,
        preferences,
        modelPreference: state.settings.geminiModelPreference,
        apiKey: explicitKey ?? (geminiApiKey || undefined),
      });

      // Preserve any previously ticked completion statuses across regenerations
      const preservedStatuses = state.weeklyPlan?.dailyStatusByDate ?? {};
      await saveWeeklyPlan({
        ...generated,
        dailyStatusByDate: { ...preservedStatuses },
      });
      setShowKeyRecovery(false);
      setPlanStatus(
        `Weekly workout plan generated with ${generated.modelUsed ?? 'Gemini'}.`,
      );
    } catch (err: unknown) {
      if (
        err instanceof MealEstimatorError &&
        (err.code === 'MISSING_API_KEY' || err.code === 'AUTH_ERROR')
      ) {
        setShowKeyRecovery(true);
      }
      setPlanError(
        err instanceof Error
          ? err.message
          : 'Failed to generate weekly workout plan.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateOfflinePlan = async () => {
    setPlanError(null);
    setPlanStatus(null);
    const offlinePlan = buildOfflineSmartWeeklyPlan({
      profile: state.profile,
      targets: state.targets,
      currentWeightKg,
      availableEquipment: selectedEquipment,
      preferences,
    });
    const preservedStatuses = state.weeklyPlan?.dailyStatusByDate ?? {};
    await saveWeeklyPlan({
      ...offlinePlan,
      dailyStatusByDate: { ...preservedStatuses },
    });
    setShowKeyRecovery(false);
    setPlanStatus(
      'Instant Smart Plan generated locally using your checked equipment.',
    );
  };

  const handleSaveKeyAndGenerate = () => {
    const trimmed = inlineApiKey.trim();
    if (!trimmed) {
      setPlanError('Enter your Gemini API key first.');
      return;
    }
    saveGeminiApiKey(trimmed);
    setInlineApiKey('');
    void runGeneratePlan(trimmed);
  };

  const resolveStatusForDate = (date: IsoDate): WorkoutCompletionStatus => {
    const fromPlan = state.weeklyPlan?.dailyStatusByDate[date];
    if (fromPlan) return fromPlan;
    const workout = state.workouts.find((w) => w.date === date);
    if (workout?.completionStatus) return workout.completionStatus;
    if (workout?.completed) return 'completed';
    return 'not_completed';
  };

  const handleLoadDayIntoDailyLog = async (
    day: PlannedWorkoutDay,
    date: IsoDate,
  ) => {
    const existing = getOrCreateWorkoutForDate(date);
    const convertedExercises: ExerciseLog[] = day.exercises.map((ex, idx) => {
      const [minReps, maxReps] = parseRepRange(ex.reps);
      return {
        exerciseId: slugifyExerciseId(ex.name, idx),
        name: ex.name,
        equipment: mapEquipmentType(ex.equipment),
        defaultRestSec: 90,
        sets: Array.from({ length: Math.max(1, ex.sets) }, (_, sIdx) => ({
          setNumber: sIdx + 1,
          targetRepsMin: minReps,
          targetRepsMax: maxReps,
          weightKg: null,
          reps: null,
          completed: false,
        })),
      };
    });

    await saveWorkout({
      ...existing,
      dayType: getDayTypeForDate(date),
      title: `${day.dayName} — ${day.focus}`,
      exercises: convertedExercises,
      notes: [day.cardioNote, day.coachingTip].filter(Boolean).join(' · ') || existing.notes,
    });
    setSelectedDate(date);
    onJumpToDailyLog?.();
  };

  const plan = state.weeklyPlan;
  const weekCounts = useMemo(() => {
    let completed = 0;
    let partial = 0;
    let notCompleted = 0;
    if (!plan) return { completed, partial, notCompleted };
    for (const day of plan.days) {
      const date = weekDateMap.get(day.dayOfWeek);
      if (!date) continue;
      const st = resolveStatusForDate(date);
      if (st === 'completed') completed += 1;
      else if (st === 'partial') partial += 1;
      else notCompleted += 1;
    }
    return { completed, partial, notCompleted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, weekDateMap, state.workouts]);

  return (
    <div className="space-y-4">
      {/* 1. Available Equipment Checklist */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Available Equipment Checklist
              </h3>
              <p className="text-[11px] text-slate-400">
                Gemini only prescribes exercises using what you check below
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
            {selectedEquipment.length} selected
          </span>
        </div>

        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Available equipment checklist"
        >
          {allEquipmentOptions.map((item) => {
            const checked = selectedEquipment.includes(item);
            return (
              <label
                key={item}
                className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors ${
                  checked
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleEquipment(item)}
                  className="h-4 w-4 shrink-0 rounded border-slate-600 accent-emerald-500"
                />
                <span className="leading-snug">{item}</span>
              </label>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            aria-label="Add custom equipment"
            placeholder="Add other equipment (e.g. Pilates Ring, Cable Machine)"
            value={customEquipmentInput}
            onChange={(e) => setCustomEquipmentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomEquipment();
              }
            }}
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddCustomEquipment}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* 2. Gemini Weekly Plan Generator */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              AI Weekly Workout Planner (Gemini)
            </h3>
            <p className="text-[11px] text-slate-400">
              Tailored for {state.profile.name || 'you'} ·{' '}
              {currentWeightKg.toFixed(1)} kg → {state.profile.targetWeightKg}{' '}
              kg
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="planner-preferences"
            className="block text-xs text-slate-400"
          >
            Schedule &amp; Focus Preferences (optional)
          </label>
          <textarea
            id="planner-preferences"
            rows={2}
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder="e.g. 4 days/week, 35 min workouts, Sat/Sun/Mon strength, light recovery on workdays"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {planError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
          >
            {planError}
          </div>
        )}

        {planStatus && (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
          >
            {planStatus}
          </div>
        )}

        {showKeyRecovery && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Add Gemini API Key to Generate Plan</span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                aria-label="Gemini API key for planner"
                placeholder="AIza..."
                value={inlineApiKey}
                onChange={(e) => setInlineApiKey(e.target.value)}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleSaveKeyAndGenerate}
                className="min-h-[44px] shrink-0 rounded-xl bg-amber-400 px-3 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
              >
                Save &amp; Generate
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void runGeneratePlan()}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating 7-Day Plan...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>
                  {plan
                    ? 'Regenerate Weekly Plan'
                    : 'Generate Weekly Plan with Gemini'}
                </span>
              </>
            )}
          </button>

          {plan && (
            <button
              type="button"
              aria-label="Clear weekly plan"
              onClick={() => {
                void saveWeeklyPlan(undefined);
                setPlanStatus('Cleared saved weekly plan.');
              }}
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => void handleGenerateOfflinePlan()}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-4 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-60"
        >
          <Dumbbell className="h-3.5 w-3.5 text-emerald-400" />
          <span>Instant Smart Plan (Offline — No API Needed)</span>
        </button>
      </div>

      {/* 3. 7-Day Plan & Daily Completion Tracker */}
      {plan ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                This Week&apos;s Plan (Week of {mondayDate})
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              {plan.goalSummary}
            </p>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
                {weekCounts.completed} Completed
              </span>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
                {weekCounts.partial} Partial
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-400">
                {weekCounts.notCompleted} Not Completed
              </span>
            </div>
          </div>

          {plan.days.map((day) => {
            const dateForDay = weekDateMap.get(day.dayOfWeek) ?? selectedDate;
            const status = resolveStatusForDate(dateForDay);
            const isSelectedDay = dateForDay === selectedDate;

            return (
              <article
                key={`${day.dayOfWeek}-${dateForDay}`}
                className={`rounded-2xl border p-4 space-y-3 ${
                  status === 'completed'
                    ? 'border-emerald-500/40 bg-emerald-950/20'
                    : status === 'partial'
                      ? 'border-amber-500/40 bg-amber-950/20'
                      : isSelectedDay
                        ? 'border-cyan-500/40 bg-slate-900/90'
                        : 'border-slate-800 bg-slate-900/80'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-100">
                        {day.dayName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {dateForDay}
                      </span>
                      {isSelectedDay && (
                        <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                          Selected
                        </span>
                      )}
                      {day.estimatedDurationMin > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                          <Clock className="h-2.5 w-2.5" />
                          {day.estimatedDurationMin} min
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100">
                      {day.focus}
                    </h4>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : status === 'partial'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {status === 'completed'
                      ? 'Completed'
                      : status === 'partial'
                        ? 'Partially Completed'
                        : 'Not Completed'}
                  </span>
                </div>

                {/* Daily Completion 3-State Tick Buttons */}
                <div
                  className="grid grid-cols-3 gap-1.5"
                  role="group"
                  aria-label={`Completion status for ${day.dayName}`}
                >
                  <button
                    type="button"
                    aria-pressed={status === 'completed'}
                    onClick={() => void setDailyPlanStatus(dateForDay, 'completed')}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold transition-colors ${
                      status === 'completed'
                        ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-emerald-500/40'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Completed</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={status === 'partial'}
                    onClick={() => void setDailyPlanStatus(dateForDay, 'partial')}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold transition-colors ${
                      status === 'partial'
                        ? 'border-amber-400 bg-amber-400 text-slate-950'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-amber-500/40'
                    }`}
                  >
                    <MinusCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Partial</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={status === 'not_completed'}
                    onClick={() =>
                      void setDailyPlanStatus(dateForDay, 'not_completed')
                    }
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold transition-colors ${
                      status === 'not_completed'
                        ? 'border-slate-500 bg-slate-700 text-slate-100'
                        : 'border-slate-700 bg-slate-950/70 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                    <span>Not Done</span>
                  </button>
                </div>

                {day.exercises.length > 0 && (
                  <ul className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                    {day.exercises.map((ex, idx) => (
                      <li
                        key={`${ex.name}-${idx}`}
                        className="flex items-start justify-between gap-2 rounded-xl bg-slate-950/60 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-100">
                            {ex.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {ex.equipment}
                            {ex.notes ? ` · ${ex.notes}` : ''}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 font-semibold text-emerald-300">
                          {ex.sets}×{ex.reps}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {day.cardioNote && (
                  <p className="text-xs text-cyan-300">
                    <strong>Cardio:</strong> {day.cardioNote}
                  </p>
                )}

                {day.coachingTip && (
                  <p className="text-[11px] text-slate-400">
                    {day.coachingTip}
                  </p>
                )}

                {!day.isRestDay && day.exercises.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleLoadDayIntoDailyLog(day, dateForDay)}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                  >
                    <Dumbbell className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Load {day.dayName} Exercises into Daily Log</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center space-y-1.5">
          <Check className="mx-auto h-6 w-6 text-slate-500" />
          <p className="text-sm font-medium text-slate-300">
            No AI Weekly Plan yet
          </p>
          <p className="text-xs text-slate-400">
            Check off the equipment you have available above and tap{' '}
            <strong className="text-cyan-300">
              Generate Weekly Plan with Gemini
            </strong>{' '}
            to create your 7-day schedule.
          </p>
        </div>
      )}
    </div>
  );
}
