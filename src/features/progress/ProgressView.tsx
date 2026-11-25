import { useEffect, useMemo, useRef, useState } from 'react';
import { AdherenceBarChart } from '../../components/AdherenceBarChart';
import { WeightTrendChart } from '../../components/WeightTrendChart';
import {
  computeDailyAdherenceSeries,
  computeWeeklyReport,
  expectedTrajectoryWeight,
} from '../../domain/progress';
import { formatIsoDateLocal, getDayTypeForDate } from '../../domain/training';
import type { WeighInEntry } from '../../domain/types';
import {
  downloadCombinedRemindersIcs,
  downloadDailyCheckInIcs,
  downloadSaturdayWeighInIcs,
  evaluateForegroundReminders,
} from '../../services/notifications/reminderService';
import { useFitness } from '../../state/FitnessContext';
import { WeeklyReportCard } from './WeeklyReportCard';
import { WeighInModal } from './WeighInModal';

export interface ProgressViewProps {
  now?: Date;
}

export function ProgressView({ now }: ProgressViewProps = {}) {
  const {
    state,
    selectedDate,
    currentWeightKg,
    addOrUpdateWeighIn,
    deleteWeighIn,
    updateTargets,
    updateSettings,
  } = useFitness();

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<WeighInEntry | null>(null);
  const [bannerDismissedForDate, setBannerDismissedForDate] = useState<
    string | null
  >(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const isDeletingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!state.initialized || !state.settings.notificationsEnabled) {
      return;
    }
    void evaluateForegroundReminders({
      now,
      settings: state.settings,
      onUpdateSettings: updateSettings,
    });
  }, [
    now,
    state.initialized,
    state.settings,
    updateSettings,
  ]);

  const todayIso = formatIsoDateLocal(now ?? new Date());
  const progressDate = todayIso > selectedDate ? todayIso : selectedDate;

  const isSaturday = useMemo(() => {
    try {
      return getDayTypeForDate(progressDate) === 'offday_sat_lower';
    } catch {
      return false;
    }
  }, [progressDate]);

  const todayWeighIn = useMemo(
    () => state.weighIns.find((w) => w.date === progressDate) ?? null,
    [progressDate, state.weighIns],
  );

  const expected = expectedTrajectoryWeight(progressDate, state.profile);

  const report = useMemo(
    () =>
      computeWeeklyReport({
        endDate: progressDate,
        profile: state.profile,
        targets: state.targets,
        meals: state.meals,
        workouts: state.workouts,
        weighIns: state.weighIns,
      }),
    [
      progressDate,
      state.meals,
      state.profile,
      state.targets,
      state.weighIns,
      state.workouts,
    ],
  );

  const adherenceSeries = useMemo(
    () =>
      computeDailyAdherenceSeries(
        state.meals,
        state.targets,
        progressDate,
        7,
      ),
    [progressDate, state.meals, state.targets],
  );

  const sortedHistory = useMemo(
    () =>
      [...state.weighIns].sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        return dateCmp !== 0 ? dateCmp : b.createdAt.localeCompare(a.createdAt);
      }),
    [state.weighIns],
  );

  const openAddModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: WeighInEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async (entry: WeighInEntry) => {
    if (isDeletingRef.current) {
      return;
    }
    isDeletingRef.current = true;
    setIsDeletingId(entry.id);
    setHistoryFeedback(null);
    setHistoryError(null);
    try {
      await deleteWeighIn(entry.id);
      setHistoryFeedback(`Deleted weigh-in for ${entry.date}.`);
    } catch (err: unknown) {
      setHistoryError(
        err instanceof Error ? err.message : 'Failed to delete weigh-in.',
      );
    } finally {
      isDeletingRef.current = false;
      setIsDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const showSaturdayPrompt =
    isSaturday && !todayWeighIn && bannerDismissedForDate !== progressDate;

  return (
    <section className="space-y-4">
      {/* Saturday 7:00 AM Fasted Weigh-In Banner */}
      {showSaturdayPrompt && (
        <div
          role="region"
          aria-label="Saturday 7:00 AM Weigh-In Prompt"
          className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Saturday 7:00 AM Check-In
            </div>
            <p className="text-sm font-medium text-slate-100">
              Morning weigh-in &amp; weekly progress report ready.
            </p>
            <p className="text-xs text-slate-300">
              Log your fasted weight in kg to update your June 2027 trajectory
              and Week {state.targets.weekNumber + 1} targets.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAddModal}
              className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Log Weigh-In
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissedForDate(progressDate)}
              className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isSaturday && todayWeighIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-950/30 px-4 py-3">
          <div className="text-xs text-emerald-200">
            Saturday weigh-in logged:{' '}
            <strong className="tabular-nums text-emerald-300">
              {todayWeighIn.weightKg.toFixed(1)} kg
            </strong>
          </div>
          <button
            type="button"
            onClick={() => openEditModal(todayWeighIn)}
            className="min-h-[44px] rounded-xl border border-emerald-500/40 px-3 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
          >
            Edit Today&apos;s Weigh-In
          </button>
        </div>
      )}

      {/* Weight Trajectory & Trend Chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Weight Trajectory
          </h2>
          <button
            type="button"
            onClick={openAddModal}
            className="min-h-[44px] rounded-xl bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25"
          >
            Log Weigh-In
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-800/70 p-2">
            <div className="text-xs text-slate-400">Current</div>
            <div className="text-sm font-semibold tabular-nums text-slate-100">
              {currentWeightKg.toFixed(1)} kg
            </div>
          </div>
          <div className="rounded-xl bg-slate-800/70 p-2">
            <div className="text-xs text-slate-400">Trajectory</div>
            <div className="text-sm font-semibold tabular-nums text-cyan-400">
              {expected.toFixed(1)} kg
            </div>
          </div>
          <div className="rounded-xl bg-slate-800/70 p-2">
            <div className="text-xs text-slate-400">Goal</div>
            <div className="text-sm font-semibold tabular-nums text-emerald-400">
              {state.profile.targetWeightKg.toFixed(1)} kg
            </div>
          </div>
        </div>

        <WeightTrendChart
          profile={state.profile}
          weighIns={state.weighIns}
          referenceDate={progressDate}
        />
      </div>

      {/* Automated Weekly Report Card */}
      <WeeklyReportCard
        report={report}
        profile={state.profile}
        currentTargets={state.targets}
        onApplyNextWeekTargets={updateTargets}
      />

      {/* 7-Day Adherence Bar Chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            7-Day Calorie &amp; Protein Adherence
          </h2>
          <span className="text-xs tabular-nums text-slate-400">
            Target {state.targets.calories} kcal · {state.targets.proteinG}g P
          </span>
        </div>
        <AdherenceBarChart
          series={adherenceSeries}
          targets={state.targets}
        />
      </div>

      {/* Weigh-In History */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Weigh-In History
          </h2>
          <span className="text-xs tabular-nums text-slate-400">
            {sortedHistory.length}{' '}
            {sortedHistory.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {historyError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
          >
            {historyError}
          </div>
        )}

        {historyFeedback && (
          <div
            role="status"
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-200"
          >
            {historyFeedback}
          </div>
        )}

        {sortedHistory.length === 0 ? (
          <p className="text-xs text-slate-400">
            No weigh-ins recorded yet. Tap &ldquo;Log Morning Weigh-In&rdquo; to
            add your baseline weight.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedHistory.map((entry) => {
              const isConfirming = confirmDeleteId === entry.id;
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-slate-100">
                        {entry.weightKg.toFixed(1)} kg
                      </span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {entry.date}
                      </span>
                      {entry.isFasted && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          Fasted
                        </span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {entry.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Edit weigh-in ${entry.date}`}
                      onClick={() => openEditModal(entry)}
                      className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
                    >
                      Edit
                    </button>
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          disabled={isDeletingId === entry.id}
                          aria-label={`Confirm delete weigh-in ${entry.date}`}
                          onClick={() => void handleConfirmDelete(entry)}
                          className="min-h-[44px] rounded-xl bg-rose-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-rose-400 disabled:opacity-60"
                        >
                          {isDeletingId === entry.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingId === entry.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete weigh-in ${entry.date}`}
                        onClick={() => {
                          setHistoryError(null);
                          setConfirmDeleteId(entry.id);
                        }}
                        className="min-h-[44px] rounded-xl border border-rose-500/35 bg-rose-950/30 px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-950/60"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick .ics Calendar Reminders */}
      <div className="space-y-2.5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <h2 className="text-sm font-semibold text-slate-100">
          Calendar Reminders (.ics)
        </h2>
        <p className="text-xs leading-relaxed text-slate-400">
          Add recurring alarms directly to Apple or Google Calendar for reliable
          reminders on iOS and Android PWAs.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadCombinedRemindersIcs}
            className="min-h-[44px] flex-1 rounded-xl bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
          >
            Combined Reminders (.ics)
          </button>
          <button
            type="button"
            onClick={downloadDailyCheckInIcs}
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Daily 8:00 PM (.ics)
          </button>
          <button
            type="button"
            onClick={downloadSaturdayWeighInIcs}
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Saturday 7:00 AM (.ics)
          </button>
        </div>
      </div>

      <WeighInModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
        }}
        defaultDate={progressDate}
        initialWeightKg={currentWeightKg}
        existingEntry={editingEntry}
        onSave={addOrUpdateWeighIn}
      />
    </section>
  );
}
