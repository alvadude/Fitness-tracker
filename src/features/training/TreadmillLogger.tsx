import { useEffect, useState, type FormEvent } from 'react';
import { Flame, Footprints, Pencil, Plus, Trash2 } from 'lucide-react';
import { estimateTreadmillCalories } from '../../domain/training';
import type {
  CardioLog,
  CardioMode,
  IsoDate,
  WeighInEntry,
  WorkoutDayType,
} from '../../domain/types';

export interface TreadmillLoggerProps {
  date: IsoDate;
  dayType: WorkoutDayType;
  cardioLogs: CardioLog[];
  weighIns: readonly WeighInEntry[];
  startWeightKg: number;
  onAddCardio: (cardio: Omit<CardioLog, 'id'>) => void | Promise<void>;
  onEditCardio: (
    id: string,
    payload: Omit<CardioLog, 'id'>,
  ) => void | Promise<void>;
  onRemoveCardio: (id: string) => void | Promise<void>;
}

interface CardioFormState {
  mode: CardioMode;
  activityLabel: string;
  durationMin: string;
  inclinePct: string;
  speedKph: string;
  jogSpeedKph: string;
  walkSpeedKph: string;
  manualCalories: string;
  notes: string;
}

export function resolveEffectiveWeightKg(
  date: IsoDate,
  weighIns: readonly WeighInEntry[],
  startWeightKg: number,
): number {
  const safeStartWeightKg =
    Number.isFinite(startWeightKg) && startWeightKg > 0 ? startWeightKg : 84;
  const eligible = weighIns
    .filter(
      (w) => w.date <= date && Number.isFinite(w.weightKg) && w.weightKg > 0,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    );
  return eligible.length > 0
    ? eligible[eligible.length - 1].weightKg
    : safeStartWeightKg;
}

function getDefaultFormState(dayType: WorkoutDayType): CardioFormState {
  switch (dayType) {
    case 'offday_sat_lower':
      return {
        mode: 'incline_walk',
        activityLabel: 'Pickleball',
        durationMin: '30',
        inclinePct: '8',
        speedKph: '4.5',
        jogSpeedKph: '8.0',
        walkSpeedKph: '4.8',
        manualCalories: '300',
        notes: '30 min @ 6–10% incline',
      };
    case 'offday_mon_full':
      return {
        mode: 'interval_run',
        activityLabel: 'Pickleball',
        durationMin: '20',
        inclinePct: '1',
        speedKph: '5.9',
        jogSpeedKph: '8.0',
        walkSpeedKph: '4.8',
        manualCalories: '300',
        notes: '1 min jog / 2 min walk',
      };
    case 'offday_sun_upper':
      return {
        mode: 'incline_walk',
        activityLabel: 'Pickleball',
        durationMin: '20',
        inclinePct: '6',
        speedKph: '4.5',
        jogSpeedKph: '8.0',
        walkSpeedKph: '4.8',
        manualCalories: '300',
        notes: '',
      };
    case 'workday_recovery':
    default:
      return {
        mode: 'easy_walk',
        activityLabel: 'Pickleball',
        durationMin: '15',
        inclinePct: '3',
        speedKph: '4.2',
        jogSpeedKph: '8.0',
        walkSpeedKph: '4.8',
        manualCalories: '300',
        notes: 'Optional 15–20 min easy treadmill walk',
      };
  }
}

function formFromCardioLog(log: CardioLog): CardioFormState {
  return {
    mode: log.mode,
    activityLabel: log.activityLabel ?? 'Sport / Activity',
    durationMin: String(log.durationMin),
    inclinePct: String(log.inclinePct),
    speedKph: String(log.speedKph),
    jogSpeedKph: String(log.jogSpeedKph ?? 8.0),
    walkSpeedKph: String(log.walkSpeedKph ?? 4.8),
    manualCalories: String(log.estimatedCaloriesBurned),
    notes: log.notes ?? '',
  };
}

function parseNonNegNumber(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function formatModeLabel(mode: CardioMode): string {
  switch (mode) {
    case 'incline_walk':
      return 'Incline Treadmill Walk';
    case 'interval_run':
      return 'Treadmill Interval Running';
    case 'sport':
      return 'Sport / Activity';
    case 'easy_walk':
    default:
      return 'Easy Treadmill Walk';
  }
}

function buildCardioPayload(
  form: CardioFormState,
  effectiveWeightKg: number,
): { payload: Omit<CardioLog, 'id'>; isValid: boolean } {
  const durationMin = Math.round(parseNonNegNumber(form.durationMin));
  const inclinePct = Math.round(parseNonNegNumber(form.inclinePct) * 10) / 10;

  if (form.mode === 'sport') {
    const estimatedCaloriesBurned = Math.round(
      parseNonNegNumber(form.manualCalories),
    );
    const activityLabel = form.activityLabel.trim() || 'Sport / Activity';
    const isValid = durationMin > 0 && estimatedCaloriesBurned > 0;
    return {
      isValid,
      payload: {
        mode: 'sport',
        activityLabel,
        durationMin,
        inclinePct: 0,
        speedKph: 0,
        bodyWeightKgUsed: effectiveWeightKg,
        estimatedCaloriesBurned,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      },
    };
  }

  if (form.mode === 'interval_run') {
    const jogSpeedKph =
      Math.round(parseNonNegNumber(form.jogSpeedKph) * 10) / 10;
    const walkSpeedKph =
      Math.round(parseNonNegNumber(form.walkSpeedKph) * 10) / 10;
    const avgSpeedKph =
      jogSpeedKph > 0 && walkSpeedKph > 0
        ? Math.round(((jogSpeedKph + 2 * walkSpeedKph) / 3) * 10) / 10
        : 0;
    const estimatedCaloriesBurned = estimateTreadmillCalories({
      durationMin,
      inclinePct,
      speedKph: avgSpeedKph,
      bodyWeightKg: effectiveWeightKg,
      mode: 'interval_run',
      jogSpeedKph,
      walkSpeedKph,
    });

    const isValid = durationMin > 0 && jogSpeedKph > 0 && walkSpeedKph > 0;
    return {
      isValid,
      payload: {
        mode: 'interval_run',
        durationMin,
        inclinePct,
        speedKph: avgSpeedKph,
        jogSpeedKph,
        walkSpeedKph,
        bodyWeightKgUsed: effectiveWeightKg,
        estimatedCaloriesBurned,
        notes: form.notes.trim() || '1 min jog / 2 min walk',
      },
    };
  }

  const speedKph = Math.round(parseNonNegNumber(form.speedKph) * 10) / 10;
  const estimatedCaloriesBurned = estimateTreadmillCalories({
    durationMin,
    inclinePct,
    speedKph,
    bodyWeightKg: effectiveWeightKg,
    mode: form.mode,
  });

  const isValid = durationMin > 0 && speedKph > 0;
  return {
    isValid,
    payload: {
      mode: form.mode,
      durationMin,
      inclinePct,
      speedKph,
      bodyWeightKgUsed: effectiveWeightKg,
      estimatedCaloriesBurned,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    },
  };
}

export function TreadmillLogger({
  date,
  dayType,
  cardioLogs,
  weighIns,
  startWeightKg,
  onAddCardio,
  onEditCardio,
  onRemoveCardio,
}: TreadmillLoggerProps) {
  const effectiveWeightKg = resolveEffectiveWeightKg(
    date,
    weighIns,
    startWeightKg,
  );

  const [form, setForm] = useState<CardioFormState>(() =>
    getDefaultFormState(dayType),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setEditingId(null);
    setFormError(null);
    setForm(getDefaultFormState(dayType));
  }, [date, dayType]);

  const { payload, isValid } = buildCardioPayload(form, effectiveWeightKg);

  const handleModeChange = (nextMode: CardioMode) => {
    setFormError(null);
    setForm((prev) => ({
      ...prev,
      mode: nextMode,
      notes:
        nextMode === 'interval_run' && !prev.notes.trim()
          ? '1 min jog / 2 min walk'
          : prev.notes,
    }));
  };

  const handleStartEdit = (log: CardioLog) => {
    setFormError(null);
    setEditingId(log.id);
    setForm(formFromCardioLog(log));
  };

  const handleCancelEdit = () => {
    setFormError(null);
    setEditingId(null);
    setForm(getDefaultFormState(dayType));
  };

  const handleRemove = (id: string) => {
    if (editingId === id) {
      handleCancelEdit();
    }
    void onRemoveCardio(id);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setFormError(
        form.mode === 'interval_run'
          ? 'Enter duration, jog speed, and walk speed greater than 0.'
          : form.mode === 'sport'
            ? 'Enter duration and estimated burn greater than 0.'
            : 'Enter duration and speed greater than 0.',
      );
      return;
    }
    setFormError(null);

    if (editingId !== null) {
      const targetId = editingId;
      setEditingId(null);
      setForm(getDefaultFormState(dayType));
      void onEditCardio(targetId, payload);
      return;
    }

    void onAddCardio(payload);
    setForm(getDefaultFormState(dayType));
  };

  const isWorkdayMode = dayType === 'workday_recovery';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
            <Footprints className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">
              {isWorkdayMode
                ? 'Optional Easy Treadmill Walk'
                : 'Treadmill Cardio'}
            </h3>
            <p className="text-xs text-slate-400">
              {isWorkdayMode
                ? '15–20 min easy pace · calibrated to '
                : 'Calibrated to '}
              <span className="font-medium text-cyan-300">
                {effectiveWeightKg.toFixed(1)} kg
              </span>
            </p>
          </div>
        </div>
      </div>

      {cardioLogs.length > 0 && (
        <div className="space-y-2">
          {cardioLogs.map((log, index) => (
            <div
              key={log.id}
              className={`rounded-xl border p-3 space-y-2 ${
                editingId === log.id
                  ? 'border-cyan-500/60 bg-cyan-500/10'
                  : 'border-slate-800 bg-slate-800/60'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                      {log.mode === 'sport'
                        ? log.activityLabel || formatModeLabel(log.mode)
                        : formatModeLabel(log.mode)}
                    </span>
                    <span className="text-xs font-semibold text-slate-100">
                      {log.mode === 'sport'
                        ? `${log.durationMin} min = ${log.estimatedCaloriesBurned} kcal`
                        : `${log.durationMin} min @ ${log.inclinePct}%, ${log.speedKph} kph = ${log.estimatedCaloriesBurned} kcal`}
                    </span>
                  </div>
                  {log.mode === 'interval_run' &&
                    log.jogSpeedKph !== undefined &&
                    log.walkSpeedKph !== undefined && (
                      <p className="text-xs text-slate-300">
                        Jog {log.jogSpeedKph} kph / Walk {log.walkSpeedKph} kph
                      </p>
                    )}
                  {log.notes && (
                    <p className="text-xs text-slate-400">{log.notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(log)}
                    aria-label={`Edit cardio ${index + 1}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(log.id)}
                    aria-label={`Remove cardio ${index + 1}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">
            {editingId !== null ? 'Edit Cardio Entry' : 'Log Treadmill Session'}
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cardio mode">
            {(
              [
                { value: 'easy_walk', label: 'Easy Walk' },
                { value: 'incline_walk', label: 'Incline Walk' },
                { value: 'interval_run', label: 'Interval Run' },
                { value: 'sport', label: 'Sport / Activity' },
              ] as const
            ).map((opt) => {
              const active = form.mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleModeChange(opt.value)}
                  className={`min-h-[44px] rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-slate-400">
              Duration (min)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={form.durationMin}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, durationMin: e.target.value }))
              }
              className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
          </label>

          {form.mode === 'sport' ? (
            <>
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">
                  Estimated Burn (kcal)
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="5"
                  value={form.manualCalories}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      manualCalories: e.target.value,
                    }))
                  }
                  className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </label>

              <label className="col-span-2 block min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">
                  Activity Name
                </span>
                <input
                  type="text"
                  placeholder="Pickleball, Cycling, Basketball..."
                  value={form.activityLabel}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      activityLabel: e.target.value,
                    }))
                  }
                  className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">
                  Incline (%)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={form.inclinePct}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, inclinePct: e.target.value }))
                  }
                  className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </label>

              {form.mode === 'interval_run' ? (
                <>
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[11px] font-medium text-slate-400">
                      Jog Speed (kph)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={form.jogSpeedKph}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          jogSpeedKph: e.target.value,
                        }))
                      }
                      className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block text-[11px] font-medium text-slate-400">
                      Walk Speed (kph)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={form.walkSpeedKph}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          walkSpeedKph: e.target.value,
                        }))
                      }
                      className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                  </label>
                </>
              ) : (
                <label className="col-span-2 block min-w-0">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">
                    Speed (kph)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={form.speedKph}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, speedKph: e.target.value }))
                    }
                    className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                  />
                </label>
              )}
            </>
          )}
        </div>

        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-slate-400">
            Notes
          </span>
          <input
            type="text"
            placeholder={
              form.mode === 'interval_run'
                ? '1 min jog / 2 min walk'
                : 'Optional pace or incline note'
            }
            value={form.notes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-cyan-200">
            <Flame className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
            <span>
              Estimated burn:{' '}
              <strong className="text-sm text-cyan-300">
                {payload.estimatedCaloriesBurned} kcal
              </strong>{' '}
              <span className="text-slate-300">
                (at {effectiveWeightKg.toFixed(1)} kg)
              </span>
            </span>
          </div>
          {form.mode === 'interval_run' && payload.speedKph > 0 && (
            <span className="text-[11px] text-slate-300">
              Avg {payload.speedKph} kph
            </span>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-xs font-medium text-rose-400">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{editingId !== null ? 'Save Cardio' : 'Add Cardio'}</span>
          </button>

          {editingId !== null && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
