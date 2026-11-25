import { buildTrajectorySeries } from '../domain/progress';
import { diffDaysIsoDate } from '../domain/training';
import type { IsoDate, UserProfile, WeighInEntry } from '../domain/types';

export interface WeightTrendChartProps {
  profile: UserProfile;
  weighIns: readonly WeighInEntry[];
  referenceDate?: IsoDate;
}

const SVG_WIDTH = 340;
const SVG_HEIGHT = 190;
const PAD_LEFT = 40;
const PAD_RIGHT = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

function formatShortDate(date: IsoDate): string {
  return date.length >= 10 ? date.slice(5) : date;
}

export function WeightTrendChart({
  profile,
  weighIns,
  referenceDate,
}: WeightTrendChartProps) {
  const sortedWeighIns = [...weighIns].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.createdAt.localeCompare(b.createdAt);
  });

  const trajectory = buildTrajectorySeries(profile, 7);

  const allDates: IsoDate[] = [
    profile.startDate,
    profile.targetDate,
    ...trajectory.map((pt) => pt.date),
    ...sortedWeighIns.map((w) => w.date),
  ];

  const minDate = allDates.reduce((min, d) => (d < min ? d : min));
  const maxDate = allDates.reduce((max, d) => (d > max ? d : max));

  let totalDays = 1;
  try {
    totalDays = Math.max(1, diffDaysIsoDate(minDate, maxDate));
  } catch {
    totalDays = 1;
  }

  const allWeights: number[] = [
    profile.startWeightKg,
    profile.targetWeightKg,
    ...trajectory.map((pt) => pt.expectedWeightKg),
    ...sortedWeighIns.map((w) => w.weightKg),
  ].filter((w) => Number.isFinite(w));

  const rawMin = allWeights.length > 0 ? Math.min(...allWeights) : 60;
  const rawMax = allWeights.length > 0 ? Math.max(...allWeights) : 90;
  const pad = Math.max(1, (rawMax - rawMin) * 0.12);
  const yMin = Math.floor(rawMin - pad);
  const yMax = Math.ceil(rawMax + pad);
  const ySpan = Math.max(2, yMax - yMin);

  const xForDate = (date: IsoDate): number => {
    try {
      const offset = diffDaysIsoDate(minDate, date);
      const ratio = Math.min(1, Math.max(0, offset / totalDays));
      return Number((PAD_LEFT + ratio * PLOT_WIDTH).toFixed(2));
    } catch {
      return PAD_LEFT;
    }
  };

  const yForWeight = (weightKg: number): number => {
    const safeWeight = Number.isFinite(weightKg) ? weightKg : yMin;
    const ratio = (yMax - safeWeight) / ySpan;
    const clamped = Math.min(1, Math.max(0, ratio));
    return Number((PAD_TOP + clamped * PLOT_HEIGHT).toFixed(2));
  };

  const trajectoryPointsAttr = trajectory
    .map((pt) => `${xForDate(pt.date)},${yForWeight(pt.expectedWeightKg)}`)
    .join(' ');

  const actualCoords = sortedWeighIns.map((entry) => ({
    entry,
    cx: xForDate(entry.date),
    cy: yForWeight(entry.weightKg),
  }));

  const actualPointsAttr = actualCoords
    .map((pt) => `${pt.cx},${pt.cy}`)
    .join(' ');

  const yTicks = [0, 1, 2, 3].map((idx) => {
    const value = yMin + (ySpan * idx) / 3;
    return {
      value,
      y: yForWeight(value),
      label: Number.isInteger(value) ? `${value}` : value.toFixed(1),
    };
  });

  let refX: number | null = null;
  if (referenceDate && referenceDate >= minDate && referenceDate <= maxDate) {
    refX = xForDate(referenceDate);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="w-full overflow-hidden rounded-xl bg-slate-950/60 p-1.5">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Weight trend versus target trajectory chart"
        >
          {/* Horizontal gridlines & Y labels */}
          {yTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={PAD_LEFT}
                x2={SVG_WIDTH - PAD_RIGHT}
                y1={tick.y}
                y2={tick.y}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text
                x={PAD_LEFT - 6}
                y={tick.y + 3.5}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="9.5"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* X-axis baseline */}
          <line
            x1={PAD_LEFT}
            x2={SVG_WIDTH - PAD_RIGHT}
            y1={PAD_TOP + PLOT_HEIGHT}
            y2={PAD_TOP + PLOT_HEIGHT}
            stroke="#334155"
            strokeWidth="1"
          />

          {/* Reference date marker */}
          {refX !== null && (
            <line
              x1={refX}
              x2={refX}
              y1={PAD_TOP}
              y2={PAD_TOP + PLOT_HEIGHT}
              stroke="#475569"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          )}

          {/* Target trajectory dashed line */}
          {trajectory.length >= 2 && (
            <polyline
              data-testid="trajectory-line"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeDasharray="4 4"
              points={trajectoryPointsAttr}
            />
          )}

          {/* Actual logged weigh-ins polyline */}
          {actualCoords.length >= 2 && (
            <polyline
              data-testid="actual-weight-line"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={actualPointsAttr}
            />
          )}

          {/* Actual logged weigh-in point markers */}
          {actualCoords.map(({ entry, cx, cy }) => (
            <circle
              key={entry.id}
              data-testid="weighin-point"
              aria-label={`${entry.date}: ${entry.weightKg.toFixed(1)} kg${entry.isFasted ? ' (Fasted)' : ''}`}
              cx={cx}
              cy={cy}
              r={actualCoords.length === 1 ? 5 : 3.5}
              fill="#10b981"
              stroke="#090d16"
              strokeWidth="1.5"
            />
          ))}

          {/* Single-point label */}
          {actualCoords.length === 1 && (
            <text
              x={Math.min(
                SVG_WIDTH - PAD_RIGHT - 4,
                Math.max(PAD_LEFT + 6, actualCoords[0].cx + 8),
              )}
              y={Math.max(PAD_TOP + 10, actualCoords[0].cy - 6)}
              textAnchor={
                actualCoords[0].cx > SVG_WIDTH - 90 ? 'end' : 'start'
              }
              fill="#6ee7b7"
              fontSize="10"
              fontWeight="600"
            >
              {actualCoords[0].entry.weightKg.toFixed(1)} kg
            </text>
          )}

          {/* X-axis start & target date labels */}
          <text
            x={PAD_LEFT}
            y={SVG_HEIGHT - 8}
            textAnchor="start"
            fill="#94a3b8"
            fontSize="9.5"
          >
            {formatShortDate(minDate)}
          </text>
          <text
            x={SVG_WIDTH - PAD_RIGHT}
            y={SVG_HEIGHT - 8}
            textAnchor="end"
            fill="#94a3b8"
            fontSize="9.5"
          >
            {formatShortDate(maxDate)}
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Logged Weight
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-cyan-400" />
            Target Trajectory
          </span>
        </div>
        {sortedWeighIns.length === 0 && (
          <span className="text-slate-400">No weigh-ins logged yet</span>
        )}
      </div>
    </div>
  );
}
