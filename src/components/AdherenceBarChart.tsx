import type { DailyAdherencePoint, MacroTargets } from '../domain/types';

export interface AdherenceBarChartProps {
  series: readonly DailyAdherencePoint[];
  targets: MacroTargets;
}

const SVG_WIDTH = 340;
const SVG_HEIGHT = 224;
const PAD_LEFT = 10;
const PAD_RIGHT = 10;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;

const CAL_TOP = 20;
const CAL_HEIGHT = 70;
const CAL_BOTTOM = CAL_TOP + CAL_HEIGHT;

const PROT_TOP = 122;
const PROT_HEIGHT = 70;
const PROT_BOTTOM = PROT_TOP + PROT_HEIGHT;

function formatAxisDate(isoDate: string): string {
  return isoDate.length >= 10 ? isoDate.slice(5) : isoDate;
}

export function AdherenceBarChart({ series, targets }: AdherenceBarChartProps) {
  const count = Math.max(1, series.length);
  const slotWidth = PLOT_WIDTH / count;
  const barWidth = Math.min(22, Math.max(10, slotWidth * 0.46));

  const safeCalTarget = Number.isFinite(targets.calories)
    ? Math.max(0, targets.calories)
    : 0;
  const safeProtTarget = Number.isFinite(targets.proteinG)
    ? Math.max(0, targets.proteinG)
    : 0;

  const calMax = Math.max(
    safeCalTarget * 1.25,
    ...series.map((d) => (Number.isFinite(d.calories) ? d.calories : 0)),
    100,
  );
  const protMax = Math.max(
    safeProtTarget * 1.25,
    ...series.map((d) => (Number.isFinite(d.proteinG) ? d.proteinG : 0)),
    20,
  );

  const calTargetY =
    safeCalTarget > 0
      ? Number(
          (CAL_BOTTOM - (safeCalTarget / calMax) * CAL_HEIGHT).toFixed(2),
        )
      : CAL_BOTTOM;

  const protTargetY =
    safeProtTarget > 0
      ? Number(
          (PROT_BOTTOM - (safeProtTarget / protMax) * PROT_HEIGHT).toFixed(2),
        )
      : PROT_BOTTOM;

  return (
    <div className="mt-3 space-y-2">
      <div className="w-full overflow-hidden rounded-xl bg-slate-950/60 p-1.5">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label="7-day calorie and protein adherence chart"
        >
          {/* Band 1: Calories */}
          <text
            x={PAD_LEFT}
            y={12}
            fill="#94a3b8"
            fontSize="9.5"
            fontWeight="600"
          >
            Calories (kcal)
          </text>
          <text
            x={SVG_WIDTH - PAD_RIGHT}
            y={12}
            textAnchor="end"
            fill="#34d399"
            fontSize="9.5"
          >
            Target {safeCalTarget} kcal
          </text>

          <line
            x1={PAD_LEFT}
            x2={SVG_WIDTH - PAD_RIGHT}
            y1={CAL_BOTTOM}
            y2={CAL_BOTTOM}
            stroke="#334155"
            strokeWidth="1"
          />

          {safeCalTarget > 0 && (
            <line
              data-testid="calories-target-line"
              x1={PAD_LEFT}
              x2={SVG_WIDTH - PAD_RIGHT}
              y1={calTargetY}
              y2={calTargetY}
              stroke="#10b981"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          )}

          {/* Band 2: Protein */}
          <text
            x={PAD_LEFT}
            y={114}
            fill="#94a3b8"
            fontSize="9.5"
            fontWeight="600"
          >
            Protein (g)
          </text>
          <text
            x={SVG_WIDTH - PAD_RIGHT}
            y={114}
            textAnchor="end"
            fill="#22d3ee"
            fontSize="9.5"
          >
            Target {safeProtTarget}g
          </text>

          <line
            x1={PAD_LEFT}
            x2={SVG_WIDTH - PAD_RIGHT}
            y1={PROT_BOTTOM}
            y2={PROT_BOTTOM}
            stroke="#334155"
            strokeWidth="1"
          />

          {safeProtTarget > 0 && (
            <line
              data-testid="protein-target-line"
              x1={PAD_LEFT}
              x2={SVG_WIDTH - PAD_RIGHT}
              y1={protTargetY}
              y2={protTargetY}
              stroke="#06b6d4"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          )}

          {/* Bars & X-axis labels */}
          {series.map((point, idx) => {
            const slotCenter = PAD_LEFT + slotWidth * (idx + 0.5);
            const x = Number((slotCenter - barWidth / 2).toFixed(2));

            const calVal = Number.isFinite(point.calories)
              ? Math.max(0, point.calories)
              : 0;
            const rawCalH = point.hasLogs
              ? Math.max(3, (calVal / calMax) * CAL_HEIGHT)
              : 3;
            const calH = Number(Math.min(CAL_HEIGHT, rawCalH).toFixed(2));
            const calY = Number((CAL_BOTTOM - calH).toFixed(2));

            const calColor = !point.hasLogs
              ? '#334155'
              : safeCalTarget > 0 && calVal > safeCalTarget * 1.1
                ? '#f59e0b'
                : '#10b981';

            const protVal = Number.isFinite(point.proteinG)
              ? Math.max(0, point.proteinG)
              : 0;
            const rawProtH = point.hasLogs
              ? Math.max(3, (protVal / protMax) * PROT_HEIGHT)
              : 3;
            const protH = Number(Math.min(PROT_HEIGHT, rawProtH).toFixed(2));
            const protY = Number((PROT_BOTTOM - protH).toFixed(2));

            const protColor = !point.hasLogs
              ? '#334155'
              : safeProtTarget > 0 && protVal >= safeProtTarget * 0.9
                ? '#06b6d4'
                : '#64748b';

            return (
              <g key={point.date}>
                <rect
                  data-testid="cal-adherence-bar"
                  aria-label={`${point.date}: ${point.calories} kcal (${point.calorieAdherencePct}%)`}
                  x={x}
                  y={calY}
                  width={barWidth}
                  height={calH}
                  rx="2.5"
                  fill={calColor}
                />
                <rect
                  data-testid="protein-adherence-bar"
                  aria-label={`${point.date}: ${point.proteinG}g protein (${point.proteinAdherencePct}%)`}
                  x={x}
                  y={protY}
                  width={barWidth}
                  height={protH}
                  rx="2.5"
                  fill={protColor}
                />
                <text
                  x={Number(slotCenter.toFixed(2))}
                  y={SVG_HEIGHT - 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                >
                  {formatAxisDate(point.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Calories On/Under
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
          Over +10%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-cyan-500" />
          Protein ≥90%
        </span>
      </div>
    </div>
  );
}
