"use client";

import { useMemo, useState } from "react";
import { buildMoneyTimeline, type TimelinePoint } from "@/lib/timeline";
import { kidColor, type FamilyBankState, type KidProfile } from "@/lib/schema";

const WIDTH = 640;
const HEIGHT = 280;
const MARGIN = { top: 24, right: 16, bottom: 28, left: 46 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MoneyTimeline({
  state,
  kid,
}: {
  state: FamilyBankState;
  kid: KidProfile;
}) {
  const [amountInput, setAmountInput] = useState("");
  const [simAmount, setSimAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const timeline = useMemo(() => buildMoneyTimeline(state, kid, simAmount), [state, kid, simAmount]);
  const color = kidColor(kid);

  const allPoints = [...timeline.past, ...timeline.future, ...(timeline.sim ?? [])];
  const tMin = timeline.past[0].t;
  const tMax = allPoints[allPoints.length - 1].t;
  const vMax = Math.max(...allPoints.map((p) => p.value), 1);

  // Round the top of the y-axis up to a "nice" number and derive ~4 gridlines from it.
  const rawStep = vMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const yTop = Math.ceil(vMax / step) * step;

  const x = (t: number) => MARGIN.left + ((t - tMin) / (tMax - tMin)) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (v: number) => HEIGHT - MARGIN.bottom - (v / yTop) * (HEIGHT - MARGIN.top - MARGIN.bottom);
  const path = (points: TimelinePoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const yTicks: number[] = [];
  for (let v = 0; v <= yTop + 1e-9; v += step) yTicks.push(v);

  // X ticks every 6 months starting Jan 2025.
  const xTicks: { t: number; label: string }[] = [];
  const start = new Date(tMin);
  for (let m = 0; ; m += 6) {
    const tick = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1);
    if (tick > tMax) break;
    const d = new Date(tick);
    xTicks.push({ t: tick, label: `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` });
  }

  function handleSimulate(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(amountInput);
    if (!amount || amount <= 0) return;
    const balance = timeline.past[timeline.past.length - 1].value;
    if (amount > balance) {
      setError("That's more than they have right now.");
      return;
    }
    setError(null);
    setSimAmount(amount);
  }

  function handleClear() {
    setSimAmount(0);
    setAmountInput("");
    setError(null);
  }

  const recoveryText = (() => {
    if (!timeline.sim) return null;
    if (timeline.recoveryWeeks == null) {
      return `Taking out ${formatCurrency(simAmount)} today: at the current allowance and rate, it would take more than 5 years to get back to ${formatCurrency(timeline.preWithdrawalLevel ?? 0)}.`;
    }
    const months = Math.round((timeline.recoveryWeeks / 52) * 12);
    const when = new Date(timeline.recoveryAt ?? 0);
    return `Taking out ${formatCurrency(simAmount)} today: back to ${formatCurrency(timeline.preWithdrawalLevel ?? 0)} in about ${
      timeline.recoveryWeeks
    } week${timeline.recoveryWeeks === 1 ? "" : "s"}${months >= 2 ? ` (~${months} months)` : ""} — around ${
      MONTHS[when.getUTCMonth()]
    } ${when.getUTCFullYear()}.`;
  })();

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">📉 Money Over Time</h2>
      <p className="text-xs opacity-60">
        Solid line: the climb since Jan 2025 (starting from about {formatCurrency(timeline.startingBalance)}). Dotted:
        where the current allowance + interest takes it next.
      </p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[480px] w-full" aria-label="Balance over time">
          {/* y gridlines + labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                strokeOpacity={v === 0 ? 0.35 : 0.12}
              />
              <text x={MARGIN.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">
                {formatAxis(v)}
              </text>
            </g>
          ))}

          {/* x ticks */}
          {xTicks.map((tick) => (
            <g key={tick.t}>
              <line
                x1={x(tick.t)}
                x2={x(tick.t)}
                y1={HEIGHT - MARGIN.bottom}
                y2={HEIGHT - MARGIN.bottom + 4}
                stroke="currentColor"
                strokeOpacity="0.4"
              />
              <text
                x={x(tick.t)}
                y={HEIGHT - MARGIN.bottom + 16}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.6"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* pre-withdrawal reference level */}
          {timeline.sim && timeline.preWithdrawalLevel !== undefined && (
            <line
              x1={x(timeline.todayT)}
              x2={WIDTH - MARGIN.right}
              y1={y(timeline.preWithdrawalLevel)}
              y2={y(timeline.preWithdrawalLevel)}
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeDasharray="2 4"
            />
          )}

          {/* past (solid) */}
          <path d={path(timeline.past)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />

          {/* future baseline (dotted) */}
          <path
            d={path(timeline.future)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeOpacity="0.8"
          />

          {/* withdrawal sim (dotted red) */}
          {timeline.sim && (
            <path d={path(timeline.sim)} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 5" />
          )}

          {/* recovery marker */}
          {timeline.sim && timeline.recoveryAt && timeline.preWithdrawalLevel !== undefined && (
            <circle cx={x(timeline.recoveryAt)} cy={y(timeline.preWithdrawalLevel)} r="4.5" fill="#22c55e" />
          )}

          {/* today line */}
          <line
            x1={x(timeline.todayT)}
            x2={x(timeline.todayT)}
            y1={MARGIN.top - 4}
            y2={HEIGHT - MARGIN.bottom}
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeDasharray="3 3"
          />
          <text
            x={x(timeline.todayT)}
            y={MARGIN.top - 8}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="currentColor"
            fillOpacity="0.8"
          >
            Today
          </text>
        </svg>
      </div>

      <form onSubmit={handleSimulate} className="flex flex-wrap items-center gap-2">
        <span className="text-sm opacity-70">What if I take out</span>
        <input
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          type="number"
          min={0.01}
          step="0.01"
          placeholder="$"
          className="w-24 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
          Show me
        </button>
        {timeline.sim && (
          <button type="button" onClick={handleClear} className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            Clear
          </button>
        )}
      </form>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {recoveryText && <p className="text-sm">{recoveryText} 🟢</p>}
    </section>
  );
}

function formatAxis(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `$${value.toFixed(0)}`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
