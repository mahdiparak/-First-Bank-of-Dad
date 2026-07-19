"use client";

import { useMemo, useState } from "react";
import { buildMoneyTimeline, type SimKind, type TimelinePoint } from "@/lib/timeline";
import { FALLBACK_MONTHLY_RETURNS, monthlyReturns, type MarketDataResponse } from "@/lib/market-data";
import { kidColor, type FamilyBankState, type KidProfile } from "@/lib/schema";

const WIDTH = 640;
const HEIGHT = 300;
const MARGIN = { top: 30, right: 16, bottom: 28, left: 46 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SIM_STYLES: Record<SimKind, { color: string; emoji: string; label: string }> = {
  withdraw: { color: "#ef4444", emoji: "💸", label: "Take out" },
  add: { color: "#22c55e", emoji: "💰", label: "Add" },
  invest: { color: "#8b5cf6", emoji: "🎢", label: "Invest" },
};

export function MoneyTimeline({
  state,
  kid,
  marketData,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  marketData: MarketDataResponse | null;
}) {
  const [amountInput, setAmountInput] = useState("");
  const [simKind, setSimKind] = useState<SimKind>("withdraw");
  const [activeSim, setActiveSim] = useState<{ kind: SimKind; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Average weekly stock return from real market history (fallback distribution offline).
  const investWeeklyRate = useMemo(() => {
    const returns = marketData?.stocks ? monthlyReturns(marketData.stocks) : [];
    const usable = returns.length > 0 ? returns : FALLBACK_MONTHLY_RETURNS.stocks;
    const meanMonthly = usable.reduce((sum, r) => sum + r, 0) / usable.length;
    return Math.pow(1 + meanMonthly, 12 / 52) - 1;
  }, [marketData]);

  const timeline = useMemo(
    () =>
      buildMoneyTimeline(state, kid, {
        simAmount: activeSim?.amount,
        simKind: activeSim?.kind,
        investWeeklyRate,
      }),
    [state, kid, activeSim, investWeeklyRate],
  );
  const color = kidColor(kid);
  const balance = timeline.past[timeline.past.length - 1].value;

  const allPoints = [...timeline.past, ...timeline.future, ...(timeline.sim ?? [])];
  const tMin = timeline.past[0].t;
  const tMax = allPoints[allPoints.length - 1].t;
  const vMax = Math.max(...allPoints.map((p) => p.value), 1);

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
    if (simKind !== "add" && amount > balance) {
      setError("That's more than they have right now.");
      return;
    }
    setError(null);
    setActiveSim({ kind: simKind, amount });
  }

  function handleClear() {
    setActiveSim(null);
    setAmountInput("");
    setError(null);
  }

  const simStyle = timeline.simKind ? SIM_STYLES[timeline.simKind] : null;

  const summary = (() => {
    if (!activeSim || !timeline.sim) return null;
    const amountText = formatCurrency(activeSim.amount);
    if (timeline.simKind === "withdraw") {
      if (timeline.recoveryWeeks == null) {
        return `Taking out ${amountText} today: at the current allowance and rate, it would take more than 5 years to climb back to ${formatCurrency(balance)}.`;
      }
      const months = Math.round((timeline.recoveryWeeks / 52) * 12);
      const when = new Date(timeline.recoveryAt ?? 0);
      return `Taking out ${amountText} today: back to ${formatCurrency(balance)} in about ${timeline.recoveryWeeks} week${
        timeline.recoveryWeeks === 1 ? "" : "s"
      }${months >= 2 ? ` (~${months} months)` : ""} — around ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}. 🟢`;
    }
    if (timeline.simKind === "add") {
      const gain = (timeline.oneYearSim ?? 0) - timeline.oneYearBaseline;
      return `Adding ${amountText} today: in a year you'd have about ${formatCurrency(timeline.oneYearSim ?? 0)} instead of ${formatCurrency(timeline.oneYearBaseline)} — ${formatCurrency(gain)} more, and growing.`;
    }
    const diff = (timeline.oneYearSim ?? 0) - timeline.oneYearBaseline;
    return `Investing ${amountText} in stocks (going by real market history): in a year, about ${formatCurrency(
      timeline.oneYearSim ?? 0,
    )} vs ${formatCurrency(timeline.oneYearBaseline)} in savings — ${diff >= 0 ? `${formatCurrency(diff)} more on average` : `${formatCurrency(-diff)} less`}. But stocks swing: some years way more, some years down.`;
  })();

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">📈 My Money Story</h2>
      <p className="text-xs opacity-60">
        Every deposit, chore, spend, and investment lands on this line. Solid: since Jan 2025 (starting near{" "}
        {formatCurrency(timeline.startingBalance)}). Dotted: where you&apos;re headed.
      </p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[480px] w-full" aria-label="Balance over time">
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

          {timeline.simKind === "withdraw" && timeline.preWithdrawalLevel !== undefined && (
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

          <path d={path(timeline.past)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          <path
            d={path(timeline.future)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeOpacity="0.8"
          />

          {timeline.sim && simStyle && (
            <path d={path(timeline.sim)} fill="none" stroke={simStyle.color} strokeWidth="2" strokeDasharray="5 5" />
          )}

          {timeline.simKind === "withdraw" && timeline.recoveryAt && timeline.preWithdrawalLevel !== undefined && (
            <circle cx={x(timeline.recoveryAt)} cy={y(timeline.preWithdrawalLevel)} r="4.5" fill="#22c55e" />
          )}

          {/* real money events, annotated with their emoji (same-day events stack upward) */}
          {timeline.events.map((event, i) => {
            const overlapping = timeline.events.slice(0, i).filter((other) => Math.abs(x(other.t) - x(event.t)) < 10).length;
            return (
              <g key={`${event.t}-${i}`}>
                <circle cx={x(event.t)} cy={y(event.value)} r="2.5" fill={color} />
                <text x={x(event.t)} y={y(event.value) - 8 - overlapping * 15} textAnchor="middle" fontSize="13">
                  <title>{event.label}</title>
                  {event.emoji}
                </text>
              </g>
            );
          })}

          {/* sim start marker */}
          {timeline.sim && simStyle && (
            <text x={x(timeline.todayT) + 10} y={y(timeline.sim[0].value) - 8} fontSize="14">
              {simStyle.emoji}
            </text>
          )}

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
            y={MARGIN.top - 10}
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
        <span className="text-sm opacity-70">What if I</span>
        <div className="flex overflow-hidden rounded-md border border-black/20 dark:border-white/20">
          {(Object.keys(SIM_STYLES) as SimKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setSimKind(kind)}
              className={`px-2.5 py-2 text-sm ${
                simKind === kind ? "bg-black text-white dark:bg-white dark:text-black" : ""
              }`}
            >
              {SIM_STYLES[kind].emoji} {SIM_STYLES[kind].label}
            </button>
          ))}
        </div>
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
        {activeSim && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
          >
            Clear
          </button>
        )}
      </form>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {summary && <p className="text-sm">{summary}</p>}
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
