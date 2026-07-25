"use client";

// Hand-rolled SVG charts — no chart library, keeps the static export lean.

export function Sparkline({
  values,
  color = "#22c55e",
  baseline,
}: {
  values: number[];
  color?: string;
  /** Optional dashed reference (e.g. what was put in) so the line reads as above/below it. */
  baseline?: number;
}) {
  if (values.length < 2) return null;

  const width = 240;
  const height = 48;
  const all = baseline === undefined ? values : [...values, baseline];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 4 - ((v - min) / range) * (height - 8);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      {baseline !== undefined && (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeDasharray="4 4"
        />
      )}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3" fill={color} />
    </svg>
  );
}

const BEST_COLOR = "#16a34a";
const WORST_COLOR = "#dc2626";

/**
 * The What-If chart: three real runs of the same choice — the best one, the middle one and the
 * worst one — over a dashed reference at the amount put in. One line would look like a promise;
 * three lines from identical inputs are the actual lesson, and the shaded gap between them is how
 * much of the outcome nobody gets to pick.
 */
export function SimulationChart({
  typical,
  best,
  worst,
  principal,
  guaranteed = false,
}: {
  typical: number[];
  best: number[];
  worst: number[];
  principal: number;
  /** Savings/CD: one certain line, so the band and the best/worst labels are dropped. */
  guaranteed?: boolean;
}) {
  if (typical.length < 2) return null;

  const width = 320;
  const height = 140;
  const margin = { top: 10, right: 44, bottom: 14, left: 8 };
  const all = [...typical, ...best, ...worst, principal];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const x = (i: number) => margin.left + (i / (typical.length - 1)) * (width - margin.left - margin.right);
  const y = (v: number) => height - margin.bottom - ((v - min) / range) * (height - margin.top - margin.bottom);
  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const band = `${path(best)} ${[...worst]
    .reverse()
    .map((v, i) => `L${x(worst.length - 1 - i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ")} Z`;
  const endedUp = typical[typical.length - 1] >= principal;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-label="Simulated outcomes over time">
      {!guaranteed && <path d={band} fill="currentColor" fillOpacity="0.08" stroke="none" />}

      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={y(principal)}
        y2={y(principal)}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeDasharray="4 4"
        strokeWidth="1"
      />

      {!guaranteed && (
        <>
          <path d={path(best)} fill="none" stroke={BEST_COLOR} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path(worst)} fill="none" stroke={WORST_COLOR} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
        </>
      )}
      <path
        d={path(typical)}
        fill="none"
        stroke={endedUp ? BEST_COLOR : WORST_COLOR}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Direct labels instead of a legend box: the line you're looking at says what it is. */}
      {!guaranteed && (
        <>
          <text x={width - margin.right + 4} y={y(best[best.length - 1]) + 3} fontSize="10" fontWeight="700" fill={BEST_COLOR}>
            Best
          </text>
          <text x={width - margin.right + 4} y={y(worst[worst.length - 1]) + 3} fontSize="10" fontWeight="700" fill={WORST_COLOR}>
            Worst
          </text>
        </>
      )}
      <text
        x={width - margin.right + 4}
        y={y(typical[typical.length - 1]) + 3}
        fontSize="10"
        fontWeight="700"
        fill="currentColor"
        fillOpacity="0.75"
      >
        {guaranteed ? "You" : "Typical"}
      </text>
    </svg>
  );
}

/** Cumulative balance after each of a kid's transactions, oldest first, capped to the last `limit` points. */
export function balanceHistory(
  transactions: { amount: number; createdAt: string }[],
  limit = 40,
): number[] {
  const ordered = transactions.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let balance = 0;
  const history = ordered.map((transaction) => {
    balance += transaction.amount;
    return Math.round(balance * 100) / 100;
  });
  return history.slice(-limit);
}
