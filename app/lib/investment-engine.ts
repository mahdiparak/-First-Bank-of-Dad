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

function seededSample(seedKey: string, historicalReturns: number[]): number {
  if (historicalReturns.length === 0) return 0;
  const rand = mulberry32(hashSeed(seedKey))();
  const index = Math.min(Math.floor(rand * historicalReturns.length), historicalReturns.length - 1);
  return historicalReturns[index];
}

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUTC(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Fixed-rate compounding (Savings/CD) — pure function of elapsed time, safe to recompute anywhere. */
export function computeFixedRateValue(position: InvestmentPosition, apr: number, now: Date): number {
  const weeksElapsed = Math.max(
    0,
    (now.getTime() - new Date(position.openedAt).getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  return round2(position.principal * Math.pow(1 + apr / 52, weeksElapsed));
}

/** Advances a Stocks/Crypto position by one seeded historical return per fully-completed calendar month. */
export function applyInvestmentGrowth(
  position: InvestmentPosition,
  historicalReturns: number[],
  now: Date,
): InvestmentPosition {
  let value = position.currentValue;
  let appliedThrough = startOfMonthUTC(new Date(position.lastGrowthUpdateAt));
  let nextMonthStart = addMonthsUTC(appliedThrough, 1);
  let changed = false;

  while (addMonthsUTC(nextMonthStart, 1) <= now) {
    const monthReturn = seededSample(`${position.id}:${monthKey(nextMonthStart)}`, historicalReturns);
    value = value * (1 + monthReturn);
    appliedThrough = nextMonthStart;
    nextMonthStart = addMonthsUTC(nextMonthStart, 1);
    changed = true;
  }

  if (!changed) return position;
  return { ...position, currentValue: round2(value), lastGrowthUpdateAt: appliedThrough.toISOString() };
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
    const updated = applyInvestmentGrowth(position, returns, now);
    if (updated !== position) changed = true;
    return updated;
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
