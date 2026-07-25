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

const WEEK_MS = 7 * DAY_MS;

/** Fixed-rate compounding (Savings/CD) — pure function of elapsed time, safe to recompute anywhere. */
export function computeFixedRateValue(position: InvestmentPosition, apr: number, now: Date): number {
  const weeksElapsed = Math.max(0, (now.getTime() - new Date(position.openedAt).getTime()) / WEEK_MS);
  return round2(position.principal * Math.pow(1 + apr / 52, weeksElapsed));
}

/**
 * The whole daily walk, day 0 (the principal) through `days`. Everything about a market position's
 * worth — today's number, yesterday's, the line on the chart — comes out of this one function, so
 * the chart can never disagree with the balance it's drawn under.
 */
function marketDailyWalk(
  assetClass: "stocks" | "crypto",
  principal: number,
  startDay: Date,
  days: number,
  historicalReturns: number[],
): number[] {
  const { mean, std } = dailyStatsFromMonthly(historicalReturns);
  const values = [round2(principal)];
  let value = principal;
  for (let day = 1; day <= days; day++) {
    const date = new Date(startDay.getTime() + day * DAY_MS);
    value *= 1 + seededDailyReturn(assetClass, date, mean, std);
    value = Math.max(0.01, value); // a position can crater, but never to $0 or negative
    values.push(round2(value));
  }
  return values;
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
  const walk = marketDailyWalk(assetClass, position.principal, startDay, daysElapsed, historicalReturns);
  return walk[walk.length - 1];
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

export interface ValuePoint {
  t: number; // ms since epoch
  value: number;
}

export interface AssetRates {
  hysaApr: number;
  cdApr: number;
}

interface PositionDays {
  position: InvestmentPosition;
  openedT: number;
  closedT?: number;
  /** UTC midnight of the day the position opened — index 0 of `values`. */
  startDayT: number;
  /** values[d] = what the position was worth on day startDayT + d (values[0] = the principal). */
  values: number[];
  /** The instant the series ends: now, or when the position was cashed out. */
  endT: number;
  /**
   * The value AT endT rather than at that day's midnight. Savings/CD compound continuously, so
   * midnight-today is a fraction below what the engine has stored for right now — using the day
   * value would leave a chart ending a cent under the balance printed above it.
   */
  endValue: number;
}

/**
 * Replays one position day by day, from the day it opened through today (or the day it closed).
 * Savings/CD compound smoothly; stocks/crypto ride the same seeded daily walk that decides their
 * stored value, so a chart drawn from this lands exactly on the number in the balance.
 */
function positionDays(
  position: InvestmentPosition,
  rates: AssetRates,
  marketData: MarketDataResponse | null,
  now: Date,
): PositionDays {
  const openedT = new Date(position.openedAt).getTime();
  const closedT = position.closedAt ? new Date(position.closedAt).getTime() : undefined;
  const startDay = startOfDayUTC(new Date(openedT));
  const startDayT = startDay.getTime();
  const endT = Math.max(openedT, Math.min(now.getTime(), closedT ?? now.getTime()));
  const days = Math.max(0, Math.round((startOfDayUTC(new Date(endT)).getTime() - startDayT) / DAY_MS));

  // A closed position ends on the payout it actually paid out — an early-cashed CD forfeits its
  // gains, and the chart has to show that rather than the value it would have had.
  const closedValue = position.closedAt ? position.currentValue : undefined;

  if (position.assetClass === "savings" || position.assetClass === "cd") {
    const apr = position.assetClass === "savings" ? rates.hysaApr : rates.cdApr;
    const values = Array.from({ length: days + 1 }, (_, day) => {
      const weeks = Math.max(0, (startDayT + day * DAY_MS - openedT) / WEEK_MS);
      return round2(position.principal * Math.pow(1 + apr / 52, weeks));
    });
    const endValue = closedValue ?? computeFixedRateValue(position, apr, new Date(endT));
    return { position, openedT, closedT, startDayT, values, endT, endValue };
  }

  const assetClass = position.assetClass === "crypto" ? "crypto" : "stocks";
  const values = marketDailyWalk(
    assetClass,
    position.principal,
    startDay,
    days,
    historicalReturnsFor(assetClass, marketData),
  );
  // A market position only moves once a calendar day, so today's day value IS its value now.
  return { position, openedT, closedT, startDayT, values, endT, endValue: closedValue ?? values[values.length - 1] };
}

/** The daily line for a single position: every day it has existed, ending at what it's worth now. */
export function positionValueSeries(
  position: InvestmentPosition,
  rates: AssetRates,
  marketData: MarketDataResponse | null,
  now: Date = new Date(),
): ValuePoint[] {
  const days = positionDays(position, rates, marketData, now);
  const points: ValuePoint[] = days.values.map((value, day) => ({ t: days.startDayT + day * DAY_MS, value }));
  // The first day starts the moment the money went in, not at that day's midnight.
  points[0] = { t: days.openedT, value: round2(position.principal) };
  const end = { t: days.endT, value: days.endValue };
  if (end.t > points[points.length - 1].t) points.push(end);
  else points[points.length - 1] = end;
  return points;
}

/**
 * Drops positions whose timestamps aren't real dates. One unparseable `openedAt` would otherwise
 * turn every min/max in the chart maths into NaN and blank the whole picture — better to leave one
 * broken row out of the drawing (it still shows in the list, with its balance intact) than to lose
 * every other position's line with it.
 */
function datedPositions(positions: InvestmentPosition[]): InvestmentPosition[] {
  return positions.filter((position) => {
    const openedT = new Date(position.openedAt).getTime();
    const closedT = position.closedAt ? new Date(position.closedAt).getTime() : 0;
    return Number.isFinite(openedT) && Number.isFinite(closedT) && Number.isFinite(position.principal);
  });
}

export interface InvestedValueSampler {
  /** What this kid's open positions were worth, all together, at a given moment. */
  valueAt: (tMs: number) => number;
  /** Every UTC midnight on which at least one position was open — the days worth plotting. */
  days: number[];
}

/**
 * Prepares every position's daily walk once, then answers "what were the investments worth at
 * time t" cheaply. A position counts from the moment it opened (before that its money is still
 * cash) until the moment it closed (after that the payout is back in cash) — so a timeline built
 * on this never double-counts a dollar on the day it moves.
 */
export function sampleInvestedValues(
  positions: InvestmentPosition[],
  rates: AssetRates,
  marketData: MarketDataResponse | null,
  now: Date = new Date(),
): InvestedValueSampler {
  const prepared = datedPositions(positions).map((position) => positionDays(position, rates, marketData, now));
  const days = new Set<number>();
  for (const entry of prepared) {
    for (let day = 0; day < entry.values.length; day++) days.add(entry.startDayT + day * DAY_MS);
  }

  return {
    days: Array.from(days).sort((a, b) => a - b),
    valueAt: (tMs: number) => {
      const dayT = startOfDayUTC(new Date(tMs)).getTime();
      let total = 0;
      for (const entry of prepared) {
        if (entry.openedT > tMs) continue;
        if (entry.closedT !== undefined && entry.closedT <= tMs) continue;
        // At (or past) the end of the series, use the exact end value rather than that day's
        // midnight figure, so "right now" agrees to the cent with the stored balance.
        if (tMs >= entry.endT) {
          total += entry.endValue;
          continue;
        }
        const index = Math.min(Math.max(Math.round((dayT - entry.startDayT) / DAY_MS), 0), entry.values.length - 1);
        total += entry.values[index];
      }
      return round2(total);
    },
  };
}

export interface InvestmentHistory {
  /** What the positions were worth, day by day. */
  value: ValuePoint[];
  /** What had been put into them at that same moment — the line the value is measured against. */
  invested: ValuePoint[];
}

/**
 * The two lines behind every "how is my investment doing" chart: what it's worth each day, and
 * what was put in. Samples every day plus the exact moments money moved in or out, so opening a
 * second position or cashing one out shows up as the step it actually is.
 */
export function investmentHistory(
  positions: InvestmentPosition[],
  rates: AssetRates,
  marketData: MarketDataResponse | null,
  now: Date = new Date(),
): InvestmentHistory {
  const dated = datedPositions(positions);
  if (dated.length === 0) return { value: [], invested: [] };

  const nowT = now.getTime();
  const sampler = sampleInvestedValues(dated, rates, marketData, now);
  const moments = dated.flatMap((position) => [
    new Date(position.openedAt).getTime(),
    ...(position.closedAt ? [new Date(position.closedAt).getTime()] : []),
  ]);
  const firstT = Math.min(...moments);
  const times = Array.from(new Set([...moments, ...sampler.days, nowT]))
    .filter((t) => t >= firstT && t <= nowT)
    .sort((a, b) => a - b);

  const investedAt = (tMs: number) =>
    round2(
      dated.reduce((sum, position) => {
        const openedT = new Date(position.openedAt).getTime();
        const closedT = position.closedAt ? new Date(position.closedAt).getTime() : undefined;
        const held = openedT <= tMs && (closedT === undefined || closedT > tMs);
        return sum + (held ? position.principal : 0);
      }, 0),
    );

  return {
    value: times.map((t) => ({ t, value: sampler.valueAt(t) })),
    invested: times.map((t) => ({ t, value: investedAt(t) })),
  };
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

export interface WhatIfBand {
  /** Three real runs, each starting at the principal (index 0 = today, then one point per month). */
  typical: number[];
  best: number[];
  worst: number[];
  /** True for Savings/CD, where the rate is fixed and all three runs are the same line. */
  guaranteed: boolean;
  /** Share of runs that ended below what was put in, 0–1. */
  chanceOfLoss: number;
  runs: number;
}

const WHAT_IF_RUNS = 250;

/**
 * Runs the same what-if many times over and keeps three of the actual runs — the worst, the
 * middle, and the best. One random line invites "so that's what happens"; three lines from the
 * same choice are the honest answer: nobody knows which one you get.
 */
export function simulateWhatIfBand(
  assetClass: AssetClass,
  principal: number,
  weeks: number,
  parentSettings: AssetRates,
  marketData: MarketDataResponse | null,
): WhatIfBand {
  const single = () => [round2(principal), ...simulateWhatIf(assetClass, principal, weeks, parentSettings, marketData).values];

  if (assetClass === "savings" || assetClass === "cd") {
    const path = single();
    return { typical: path, best: path, worst: path, guaranteed: true, chanceOfLoss: 0, runs: 1 };
  }

  const paths = Array.from({ length: WHAT_IF_RUNS }, single).sort(
    (a, b) => a[a.length - 1] - b[b.length - 1],
  );
  const losses = paths.filter((path) => path[path.length - 1] < principal).length;
  return {
    worst: paths[0],
    typical: paths[Math.floor(paths.length / 2)],
    best: paths[paths.length - 1],
    guaranteed: false,
    chanceOfLoss: losses / paths.length,
    runs: paths.length,
  };
}
