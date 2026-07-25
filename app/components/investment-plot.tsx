"use client";

import { useState } from "react";
import type { ValuePoint } from "@/lib/investment-engine";
import type { AssetClass } from "@/lib/schema";

/** One fixed color per asset class (defined in globals.css, with their own dark-mode steps) so a
 *  line means the same thing everywhere it's drawn. */
export const ASSET_COLORS: Record<AssetClass, string> = {
  savings: "var(--asset-savings)",
  cd: "var(--asset-cd)",
  stocks: "var(--asset-stocks)",
  crypto: "var(--asset-crypto)",
};

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 26, left: 48 };
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type RangeId = "7d" | "30d" | "3m" | "all";
const RANGES: { id: RangeId; label: string; days?: number }[] = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "all", label: "All" },
];

/** Carries the last point before the window forward, so a zoomed-in view still draws from its left edge. */
function clipToWindow(points: ValuePoint[], from: number): ValuePoint[] {
  const before = points.filter((point) => point.t < from).at(-1);
  const inWindow = points.filter((point) => point.t >= from);
  return before ? [{ t: from, value: before.value }, ...inWindow] : inWindow;
}

/**
 * The "how is it actually doing" chart for money a kid has really invested: what the positions are
 * worth each day (solid, in the asset's color) against what was put into them (dashed, neutral).
 * The gap between the two lines is the whole point — it's the gain or the loss, and unlike a
 * single number it shows the bumpy road that got there.
 */
export function InvestmentPlot({
  value,
  invested,
  color,
  label,
}: {
  value: ValuePoint[];
  invested: ValuePoint[];
  /** Any CSS color — the asset-class variables from globals.css are what callers pass. */
  color: string;
  /** What the solid line is, e.g. "Stocks" — used in the legend and for screen readers. */
  label: string;
}) {
  const [range, setRange] = useState<RangeId>("30d");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (value.length < 2) return null;

  const lastT = value[value.length - 1].t;
  const selected = RANGES.find((entry) => entry.id === range);
  const tMin = selected?.days ? Math.max(value[0].t, lastT - selected.days * DAY_MS) : value[0].t;
  const visibleValue = clipToWindow(value, tMin);
  const visibleInvested = clipToWindow(invested, tMin);
  if (visibleValue.length < 2) return null;

  const tMax = lastT;
  const all = [...visibleValue, ...visibleInvested].map((point) => point.value);
  const dataMax = Math.max(...all);
  const dataMin = Math.min(...all);

  // A nice round step, and an axis zoomed to the values actually on screen — against a $0-based
  // axis a real 3% swing would look like a flat line.
  const span = Math.max(dataMax - dataMin, Math.max(dataMax * 0.02, 1));
  const magnitude = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const normalized = span / 4 / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const yTop = Math.ceil(dataMax / step) * step;
  const yBottom = Math.max(0, Math.floor(dataMin / step) * step);

  const x = (t: number) => MARGIN.left + ((t - tMin) / (tMax - tMin || 1)) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (v: number) =>
    HEIGHT - MARGIN.bottom - ((v - yBottom) / (yTop - yBottom || 1)) * (HEIGHT - MARGIN.top - MARGIN.bottom);
  const path = (points: ValuePoint[]) =>
    points.map((point, i) => `${i === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");

  const yTicks: number[] = [];
  for (let v = yBottom; v <= yTop + 1e-9; v += step) yTicks.push(v);

  const rangeDays = (tMax - tMin) / DAY_MS;
  const tickStepDays = rangeDays <= 10 ? 2 : rangeDays <= 35 ? 7 : rangeDays <= 120 ? 14 : 30;
  const xTicks: number[] = [];
  for (let t = tMax; t >= tMin; t -= tickStepDays * DAY_MS) xTicks.unshift(t);

  // The readout follows the finger; with nothing hovered it shows today — so there is always a
  // number on screen and the chart never depends on hovering to be readable.
  const readIndex = hoverIndex ?? visibleValue.length - 1;
  const readValue = visibleValue[Math.min(readIndex, visibleValue.length - 1)];
  const readInvested =
    visibleInvested.filter((point) => point.t <= readValue.t).at(-1) ?? visibleInvested[0] ?? readValue;
  const change = readValue.value - readInvested.value;
  const changePct = readInvested.value > 0 ? (change / readInvested.value) * 100 : 0;

  function handlePointer(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const t = tMin + ((svgX - MARGIN.left) / (WIDTH - MARGIN.left - MARGIN.right)) * (tMax - tMin);
    let nearest = 0;
    for (let i = 1; i < visibleValue.length; i++) {
      if (Math.abs(visibleValue[i].t - t) < Math.abs(visibleValue[nearest].t - t)) nearest = i;
    }
    setHoverIndex(nearest);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-md border border-black/20 dark:border-white/20">
          {RANGES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setRange(entry.id)}
              className={`px-2.5 py-1 text-xs ${
                range === entry.id ? "bg-black text-white dark:bg-white dark:text-black" : ""
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" stroke={color} strokeWidth="3" strokeLinecap="round" />
            </svg>
            {label}
          </span>
          <span className="flex items-center gap-1.5 opacity-70">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Money you put in
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${label} value over time, now ${formatCurrency(readValue.value)}`}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity="0.12"
            />
            <text x={MARGIN.left - 6} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">
              {formatAxis(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={HEIGHT - MARGIN.bottom + 15}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {formatDay(tick)}
          </text>
        ))}

        <path d={path(visibleInvested)} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="5 4" />
        <path d={path(visibleValue)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {hoverIndex !== null && (
          <line
            x1={x(readValue.t)}
            x2={x(readValue.t)}
            y1={MARGIN.top}
            y2={HEIGHT - MARGIN.bottom}
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeDasharray="3 3"
          />
        )}
        <circle cx={x(readValue.t)} cy={y(readValue.value)} r="4.5" fill={color} stroke="var(--background)" strokeWidth="2" />
      </svg>

      <p className="text-sm">
        <span className="opacity-60">{formatDate(readValue.t)}: </span>
        <span className="font-semibold tabular-nums">{formatCurrency(readValue.value)}</span>{" "}
        <span
          className={
            change > 0.004 ? "text-green-600 dark:text-green-400" : change < -0.004 ? "text-red-500" : "opacity-60"
          }
        >
          {change > 0.004 ? "▲" : change < -0.004 ? "▼" : "▬"} {change >= 0 ? "+" : "−"}
          {formatCurrency(Math.abs(change))} ({change >= 0 ? "+" : "−"}
          {Math.abs(changePct).toFixed(1)}%)
        </span>
      </p>
    </div>
  );
}

function formatAxis(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `$${value.toFixed(0)}`;
}

function formatDay(t: number): string {
  const date = new Date(t);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
