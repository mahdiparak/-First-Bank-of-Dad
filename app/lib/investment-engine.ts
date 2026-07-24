import { FALLBACK_MONTHLY_RETURNS, monthlyReturns, type MarketDataResponse } from "./market-data";
import type { AssetClass, FamilyBankState, InvestmentPosition } from "./schema";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Deterministic PRNG (mulberry32) seeded from a string, so every device replaying the same
// position + calendar month lands on the identical "random" historical return — the value is
// still authoritative synced state (see runInvestmentEngine), this just keeps any device that
// happens to compute it in agreement with any other.
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Mean and standard deviation of a set of monthly returns, converted to a per-calendar-day basis
 * (drift ÷30, volatility ÷√30) so a daily walk aggregates back to roughly the historical monthly
 * behaviour.
 */
function dailyStatsFromMonthly(monthly: number[]): { mean: number; std: number } {
  if (monthly.length === 0) return { mean: 0, std: 0 };
  const mean = monthly.reduce((sum, value) => sum + value, 0) / monthly.length;
  const variance = monthly.reduce((sum, value) => sum + (value - mean) ** 2, 0) / monthly.length;
  return { mean: mean / 30, std: Math.sqrt(variance) / Math.sqrt(30) };
}

/**
 * One calendar day's seeded return, drawn from normal(mean, std) via Box–Muller. Seeded ONLY by
 * the asset class and the absolute calendar day — never the position id — so every position of an
 * asset rides one shared market path. That's what stops a kid re-rolling a bad day by cashing out
 * and reinvesting under a fresh position: the dice for a given day are already cast, for everyone.
 */
function seededDailyReturn(assetClass: "stocks" | "crypto", date: Date, mean: number, std: number): number {
  const rand = mulberry32(hashSeed(`${assetClass}:${dayKey(date)}`));
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Keep a single day sane even for crypto — no −100% wipeouts or absurd moonshots in 24h.
  return Math.max(-0.4, Math.min(0.4, mean + std * z));
}

/** Fixed-rate compounding (Savings/CD) — pure function of elapsed time, safe to recompute anywhere. */
export function computeFixedRateValue(position: InvestmentPosition, apr: number, now: Date): number {
  const weeksElapsed = Math.max(
    0,
    (now.getTime() - new Date(position.openedAt).getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  return round2(position.principal * Math.pow(1 + apr / 52, weeksElapsed));
}

/**
 * Stocks/Crypto value as a pure function of elapsed time: a deterministic daily random walk
 * compounding from the principal at open, one seeded return per calendar day. Recomputed each run
 * (not accumulated in place), so it visibly moves day to day, every device agrees on it, and — with
 * the calendar-day, market-wide seed — cashing out and reinvesting can't shake a different outcome.
 */
export function computeMarketValue(position: InvestmentPosition, historicalReturns: number[], now: Date): number {
  const assetClass = position.assetClass === "crypto" ? "crypto" : "stocks";
  const startDay = startOfDayUTC(new Date(position.openedAt));
  const daysElapsed = Math.round((startOfDayUTC(now).getTime() - startDay.getTime()) / DAY_MS);
  if (daysElapsed <= 0) return round2(position.principal);

  const { mean, std } = dailyStatsFromMonthly(historicalReturns);
  let value = position.principal;
  for (let day = 1; day <= daysElapsed; day++) {
    const date = new Date(startDay.getTime() + day * DAY_MS);
    value *= 1 + seededDailyReturn(assetClass, date, mean, std);
    if (value < 0.01) return 0.01; // a position can crater, but never to $0 or negative
  }
  return round2(value);
}

function historicalReturnsFor(assetClass: "stocks" | "crypto", marketData: MarketDataResponse | null): number[] {
  const history = assetClass === "stocks" ? marketData?.stocks : marketData?.crypto;
  const returns = history ? monthlyReturns(history) : [];
  return returns.length > 0 ? returns : FALLBACK_MONTHLY_RETURNS[assetClass];
}

/**
 * Brings every open investment position's currentValue up to date. Returns the same state
 * reference if nothing changed, so callers can skip committing/broadcasting a no-op.
 */
export function runInvestmentEngine(
  state: FamilyBankState,
  marketData: MarketDataResponse | null,
  now: Date = new Date(),
): FamilyBankState {
  const stockReturns = historicalReturnsFor("stocks", marketData);
  const cryptoReturns = historicalReturnsFor("crypto", marketData);
  let changed = false;

  const investments = state.investments.map((position) => {
    if (position.closedAt) return position;

    if (position.assetClass === "savings" || position.assetClass === "cd") {
      const apr = position.assetClass === "savings" ? state.parentSettings.hysaApr : state.parentSettings.cdApr;
      const value = computeFixedRateValue(position, apr, now);
      if (value === position.currentValue) return position;
      changed = true;
      return { ...position, currentValue: value };
    }

    const returns = position.assetClass === "stocks" ? stockReturns : cryptoReturns;
    const value = computeMarketValue(position, returns, now);
    if (value === position.currentValue) return position;
    changed = true;
    // lastGrowthUpdateAt is now just a "last touched" marker — value is a pure function of time.
    return { ...position, currentValue: value, lastGrowthUpdateAt: now.toISOString() };
  });

  if (!changed) return state;
  return { ...state, investments };
}

export interface WhatIfResult {
  values: number[]; // ending value after each simulated month, values[0] is month 1
  endingValue: number;
  minValue: number;
  maxValue: number;
}

/**
 * The "What-If" time machine: a pure, ephemeral, non-deterministic simulation (never stored,
 * never synced) so a kid can explore possibilities without it affecting real money.
 */
export function simulateWhatIf(
  assetClass: AssetClass,
  principal: number,
  weeks: number,
  parentSettings: { hysaApr: number; cdApr: number },
  marketData: MarketDataResponse | null,
): WhatIfResult {
  const months = Math.max(1, Math.round(weeks / (52 / 12)));

  if (assetClass === "savings" || assetClass === "cd") {
    const apr = assetClass === "savings" ? parentSettings.hysaApr : parentSettings.cdApr;
    const values = Array.from({ length: months }, (_, i) => round2(principal * Math.pow(1 + apr / 12, i + 1)));
    return { values, endingValue: values[values.length - 1], minValue: Math.min(...values), maxValue: Math.max(...values) };
  }

  const returns = historicalReturnsFor(assetClass, marketData);
  let value = principal;
  const values: number[] = [];
  for (let i = 0; i < months; i++) {
    const sample = returns.length > 0 ? returns[Math.floor(Math.random() * returns.length)] : 0;
    value *= 1 + sample;
    values.push(round2(value));
  }
  return { values, endingValue: values[values.length - 1], minValue: Math.min(...values), maxValue: Math.max(...values) };
}
