import { useEffect, useRef, useState } from 'react';
import type {
  MacroTargets,
  UserProfile,
  WeeklyReportSummary,
} from '../../domain/types';

export interface WeeklyReportCardProps {
  report: WeeklyReportSummary;
  profile: UserProfile;
  currentTargets: MacroTargets;
  onApplyNextWeekTargets: (targets: MacroTargets) => Promise<void>;
}

const ACTION_BADGES: Record<
  WeeklyReportSummary['nextWeekRecommendation']['action'],
  { label: string; className: string }
> = {
  maintain: {
    label: 'Maintain',
    className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  decrease_calories: {
    label: 'Trim 100 kcal',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  increase_calories: {
    label: 'Add 100 kcal',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
};

export function WeeklyReportCard({
  report,
  profile,
  currentTargets,
  onApplyNextWeekTargets,
}: WeeklyReportCardProps) {
  const [appliedCycle, setAppliedCycle] = useState<{
    weekNumber: number;
    calories: number;
    endDate: string;
  } | null>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const isApplyingRef = useRef<boolean>(false);
  const prevWeekNumberRef = useRef<number>(currentTargets.weekNumber);
  const prevCaloriesRef = useRef<number>(currentTargets.calories);

  useEffect(() => {
    const weekChanged = currentTargets.weekNumber !== prevWeekNumberRef.current;
    const caloriesChanged = currentTargets.calories !== prevCaloriesRef.current;
    prevWeekNumberRef.current = currentTargets.weekNumber;
    prevCaloriesRef.current = currentTargets.calories;
    if (
      appliedCycle &&
      (appliedCycle.endDate !== report.endDate ||
        (weekChanged && currentTargets.weekNumber !== appliedCycle.weekNumber) ||
        (caloriesChanged &&
          (currentTargets.weekNumber !== appliedCycle.weekNumber ||
            currentTargets.calories !== appliedCycle.calories)))
    ) {
      setAppliedCycle(null);
    }
  }, [
    appliedCycle,
    currentTargets.calories,
    currentTargets.weekNumber,
    report.endDate,
  ]);

  const recommendation = report.nextWeekRecommendation;
  const suggestedTargets: MacroTargets | null =
    recommendation?.suggestedTargets ?? null;
  const actionBadge = ACTION_BADGES[recommendation.action];

  const isAlreadyAppliedForCycle =
    appliedCycle !== null && appliedCycle.endDate === report.endDate;

  const deltaSign = report.deltaVsTrajectoryKg > 0 ? '+' : '';
  const deltaStatusClass =
    report.deltaVsTrajectoryKg <= 0
      ? 'text-emerald-400'
      : report.deltaVsTrajectoryKg <= 0.5
        ? 'text-cyan-400'
        : 'text-amber-400';

  const handleApplyTargets = async () => {
    if (
      !suggestedTargets ||
      isApplyingRef.current ||
      isApplying ||
      isAlreadyAppliedForCycle
    ) {
      return;
    }
    isApplyingRef.current = true;
    setApplyError(null);
    setIsApplying(true);
    try {
      await onApplyNextWeekTargets(suggestedTargets);
      setAppliedCycle({
        weekNumber: suggestedTargets.weekNumber,
        calories: suggestedTargets.calories,
        endDate: report.endDate,
      });
    } catch (err: unknown) {
      setApplyError(
        err instanceof Error ? err.message : 'Could not apply Week targets.',
      );
    } finally {
      isApplyingRef.current = false;
      setIsApplying(false);
    }
  };

  return (
    <article className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Weekly Report</h2>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs tabular-nums text-slate-300">
          {report.startDate} – {report.endDate}
        </span>
      </div>

      {/* Trajectory & Rate */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-slate-800/70 p-3">
          <div className="text-xs text-slate-400">Trajectory Delta</div>
          <div
            className={`mt-0.5 text-sm font-semibold tabular-nums ${deltaStatusClass}`}
          >
            {deltaSign}
            {report.deltaVsTrajectoryKg.toFixed(2)} kg
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
            {report.currentWeightKg.toFixed(1)} vs{' '}
            {report.expectedWeightKg.toFixed(1)} kg (start{' '}
            {profile.startWeightKg.toFixed(1)} kg)
          </div>
        </div>

        <div className="rounded-xl bg-slate-800/70 p-3">
          <div className="text-xs text-slate-400">Weekly Loss Rate</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">
            {report.weeklyLossRateKg !== null
              ? `${report.weeklyLossRateKg.toFixed(2)} kg/wk`
              : 'Pending (≥7d)'}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
            Target ~0.6–0.7 kg/wk
          </div>
        </div>
      </div>

      {/* 7-Day Adherence & Workouts */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-slate-800/70 p-3">
          <div className="text-xs text-slate-400">7-Day Calorie Adherence</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-400">
            {report.calorieAdherencePct}%
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
            {report.avgCalories} kcal avg · {report.daysWithinCalorieTarget}/
            {report.loggedDaysCount} on target
          </div>
        </div>

        <div className="rounded-xl bg-slate-800/70 p-3">
          <div className="text-xs text-slate-400">7-Day Protein Adherence</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-cyan-400">
            {report.proteinAdherencePct}%
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
            {report.avgProteinG}g avg · {report.daysHitProteinTarget}/
            {report.loggedDaysCount} hit ≥90%
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-800/50 px-3 py-2.5 text-xs">
        <span className="text-slate-300">
          Workouts:{' '}
          <strong className="tabular-nums text-slate-100">
            {report.completedStrengthSplitsCount}/
            {report.plannedStrengthSplitsCount}
          </strong>{' '}
          strength splits ·{' '}
          <span className="tabular-nums text-slate-400">
            {report.completedWorkoutsCount} total completed
          </span>
        </span>
        <span className="tabular-nums text-slate-400">
          {report.loggedDaysCount}/7 days logged
        </span>
      </div>

      {/* Progressive Overload Suggestions */}
      <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div className="text-xs font-semibold text-slate-200">
          Progressive Overload Suggestions
        </div>
        {report.overloadSuggestions.length > 0 ? (
          <ul className="space-y-1.5 text-xs">
            {report.overloadSuggestions.map((item) => (
              <li
                key={item.exerciseId}
                className="flex flex-wrap items-baseline justify-between gap-1 text-slate-300"
              >
                <span className="font-medium text-slate-100">
                  {item.exerciseName}
                </span>
                <span className="tabular-nums text-emerald-400">
                  {item.currentWeightKg} kg → {item.suggestedWeightKg} kg (+
                  {item.incrementKg} kg)
                </span>
                <span className="w-full text-[11px] text-slate-400">
                  {item.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">
            Hit the top of your rep range across all working sets to unlock
            weight increases.
          </p>
        )}
      </div>

      {/* Week N+1 Recommendation */}
      <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-800/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-100">
            Week {suggestedTargets ? suggestedTargets.weekNumber : currentTargets.weekNumber + 1}{' '}
            Recommendation
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${actionBadge.className}`}
          >
            {actionBadge.label}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-slate-300">
          {recommendation.summary}
        </p>

        {suggestedTargets && (
          <div className="text-xs tabular-nums text-slate-300">
            Suggested:{' '}
            <strong className="text-slate-100">
              {suggestedTargets.calories} kcal
            </strong>{' '}
            · {suggestedTargets.proteinG}g P / {suggestedTargets.carbsG}g C /{' '}
            {suggestedTargets.fatG}g F
          </div>
        )}

        {applyError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-2 text-xs text-rose-200"
          >
            {applyError}
          </div>
        )}

        {isAlreadyAppliedForCycle && appliedCycle && (
          <div
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-2 text-xs text-emerald-200"
          >
            Applied Week {appliedCycle.weekNumber} targets (
            {appliedCycle.calories} kcal).
          </div>
        )}

        {suggestedTargets !== null && (
          <button
            type="button"
            disabled={isApplying || isAlreadyAppliedForCycle}
            onClick={handleApplyTargets}
            className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          >
            {isApplying
              ? 'Applying Targets...'
              : isAlreadyAppliedForCycle && appliedCycle
                ? `Applied Week ${appliedCycle.weekNumber} Targets`
                : `Apply Week ${suggestedTargets.weekNumber} Targets`}
          </button>
        )}
      </div>
    </article>
  );
}
