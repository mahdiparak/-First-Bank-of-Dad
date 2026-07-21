"use client";

// Hand-rolled SVG charts — no chart library, keeps the static export lean.

export function Sparkline({ values, color = "#22c55e" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;

  const width = 240;
  const height = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 4 - ((v - min) / range) * (height - 8);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3" fill={color} />
    </svg>
  );
}

/**
 * The What-If chart: a monthly value line with a dashed reference at the starting amount,
 * green when it ends above where it started, red when below — the jagged line IS the lesson.
 */
export function WhatIfChart({ values, principal }: { values: number[]; principal: number }) {
  if (values.length < 2) return null;

  const width = 320;
  const height = 120;
  const all = [...values, principal];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const x = (i: number) => 8 + (i / (values.length - 1)) * (width - 16);
  const y = (v: number) => height - 10 - ((v - min) / range) * (height - 20);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const endedUp = values[values.length - 1] >= principal;
  const color = endedUp ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" preserveAspectRatio="none" aria-hidden>
      <line
        x1="8"
        x2={width - 8}
        y1={y(principal)}
        y2={y(principal)}
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(0)} cy={y(values[0])} r="3" fill="currentColor" fillOpacity="0.5" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="4" fill={color} />
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
