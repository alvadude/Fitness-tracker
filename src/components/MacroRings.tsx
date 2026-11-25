import type { MacroTargets, MacroTotals } from '../domain/types';

export interface MacroRingsProps {
  targets: MacroTargets;
  logged: MacroTotals;
  remaining: MacroTotals;
  cardioBurnToday?: number;
}

interface MacroBarRowProps {
  label: string;
  logged: number;
  target: number;
  remaining: number;
  fillClass: string;
  overFillClass?: string;
  textClass: string;
  allowOverHighlight?: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function MacroBarRow({
  label,
  logged,
  target,
  remaining,
  fillClass,
  overFillClass = 'bg-rose-500',
  textClass,
  allowOverHighlight = true,
}: MacroBarRowProps) {
  const ratio = target > 0 ? Math.min(1, Math.max(0, logged / target)) : 0;
  const isOver = remaining < 0;
  const barColor = allowOverHighlight && isOver ? overFillClass : fillClass;

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-300">{label}</span>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={`font-semibold ${textClass}`}>{logged}g</span>
          <span className="text-slate-500">/ {target}g</span>
          <span
            className={`text-[11px] font-medium ${
              isOver
                ? allowOverHighlight
                  ? 'text-rose-400'
                  : 'text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            {remaining >= 0
              ? `${remaining}g left`
              : `${Math.abs(remaining)}g over`}
          </span>
        </div>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuenow={Math.round(logged)}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round(target))}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function MacroRings({
  targets,
  logged,
  remaining,
  cardioBurnToday = 0,
}: MacroRingsProps) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const calorieRatio =
    targets.calories > 0
      ? Math.min(1, Math.max(0, logged.calories / targets.calories))
      : 0;
  const dashOffset = circumference * (1 - calorieRatio);
  const isOverCalories = remaining.calories < 0;
  const safeBurn = Math.max(0, Math.round(cardioBurnToday));
  const netCalories = round1(logged.calories - safeBurn);
  const netRemaining = round1(remaining.calories + safeBurn);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 120 120"
            className="h-28 w-28 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#1e293b"
              strokeWidth="10"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={isOverCalories ? '#f43f5e' : '#10b981'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-bold leading-tight text-slate-50">
              {logged.calories}
            </span>
            <span className="text-[11px] text-slate-400">
              / {targets.calories}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              kcal
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Calorie Budget
            </div>
            <div
              className={`mt-0.5 text-base font-bold ${
                isOverCalories ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {remaining.calories >= 0
                ? `${remaining.calories} kcal left`
                : `${Math.abs(remaining.calories)} kcal over`}
            </div>
          </div>

          {safeBurn > 0 && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-300">
              <div className="font-semibold">
                Burned {safeBurn} kcal · Net {netCalories} kcal
              </div>
              <div className="text-[11px] text-cyan-200/80">
                {netRemaining >= 0
                  ? `${netRemaining} net kcal left`
                  : `${Math.abs(netRemaining)} net kcal over`}
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-400">
            Week {targets.weekNumber} Target
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <MacroBarRow
          label="Protein"
          logged={logged.proteinG}
          target={targets.proteinG}
          remaining={remaining.proteinG}
          fillClass="bg-emerald-500"
          overFillClass="bg-emerald-400"
          textClass="text-emerald-400"
          allowOverHighlight={false}
        />
        <MacroBarRow
          label="Carbs"
          logged={logged.carbsG}
          target={targets.carbsG}
          remaining={remaining.carbsG}
          fillClass="bg-cyan-500"
          textClass="text-cyan-400"
        />
        <MacroBarRow
          label="Fat"
          logged={logged.fatG}
          target={targets.fatG}
          remaining={remaining.fatG}
          fillClass="bg-amber-500"
          textClass="text-amber-400"
        />
      </div>
    </div>
  );
}
