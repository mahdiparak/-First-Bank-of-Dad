import { virtualBalanceForKid } from "./mutations";
import type { FamilyBankState, KidProfile } from "./schema";

export interface TimelinePoint {
  t: number; // ms since epoch
  value: number;
}

export interface TimelineEvent {
  t: number;
  value: number;
  emoji: string;
  label: string;
}

export type SimKind = "withdraw" | "add" | "invest";

export interface MoneyTimeline {
  /** Balance from Jan 2025 to today: modeled before the app's records begin, real afterward. */
  past: TimelinePoint[];
  /** Projection from today forward at current allowance + interest (dotted line). */
  future: TimelinePoint[];
  /** Real money events (deposits, spends, bounties, investments…) annotated on the past line. */
  events: TimelineEvent[];
  /** The what-if projection, when a simulation is active. */
  sim?: TimelinePoint[];
  simKind?: SimKind;
  /** Withdraw sim only: the level the sim line climbs back to, and when. */
  preWithdrawalLevel?: number;
  recoveryWeeks?: number | null;
  recoveryAt?: number;
  /** Baseline and sim values one year out, for "in a year you'd have X vs Y" messaging. */
  oneYearBaseline: number;
  oneYearSim?: number;
  todayT: number;
  /** The back-calculated Jan 2025 starting balance. */
  startingBalance: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_START = Date.UTC(2025, 0, 1);
const DEFAULT_PROJECTION_WEEKS = 52;
const MAX_PROJECTION_WEEKS = 260; // 5 years
const MAX_EVENT_MARKERS = 24;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface TimelineOptions {
  simAmount?: number;
  simKind?: SimKind;
  /** Weekly growth rate used for the invest sim (derived from real market history). */
  investWeeklyRate?: number;
  now?: Date;
}

/**
 * Builds the kid's money-over-time picture.
 *
 * From the app's first recorded transaction onward, the line is REAL: cumulative cash plus the
 * principal of open investment positions, stepping at every event (each non-routine event also
 * becomes an emoji annotation). Before that first record, the line is a model: we back-calculate
 * what the kid must have held in Jan 2025 for weekly allowance + interest to land exactly on the
 * first recorded balance. The future continues the model forward from today's actual balance.
 */
export function buildMoneyTimeline(
  state: FamilyBankState,
  kid: KidProfile,
  options: TimelineOptions = {},
): MoneyTimeline {
  const now = options.now ?? new Date();
  const todayT = now.getTime();
  const balance = round2(virtualBalanceForKid(state, kid.id));
  const weeklyRate = state.parentSettings.hysaApr / 52;
  const netAllowance = kid.weeklyAllowance * (1 - state.parentSettings.taxRate);

  // --- Real segment: replay this kid's actual transactions ---
  const transactions = state.transactions
    .filter((transaction) => transaction.kidId === kid.id)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const positions = state.investments.filter((position) => position.kidId === kid.id);

  const principalAt = (tMs: number) =>
    positions.reduce((sum, position) => {
      const opened = new Date(position.openedAt).getTime() <= tMs;
      const closed = position.closedAt && new Date(position.closedAt).getTime() <= tMs;
      return sum + (opened && !closed ? position.principal : 0);
    }, 0);

  const real: TimelinePoint[] = [];
  const events: TimelineEvent[] = [];
  let cash = 0;
  for (const transaction of transactions) {
    cash += transaction.amount;
    const tMs = Math.min(new Date(transaction.createdAt).getTime(), todayT);
    const value = round2(cash + principalAt(tMs));
    if (real.length > 0 && real[real.length - 1].t === tMs) {
      real[real.length - 1] = { t: tMs, value };
    } else {
      real.push({ t: tMs, value });
    }
    // Allowance and interest are the line's slope, not standout moments — annotating
    // every week would bury the events kids should actually notice.
    if (transaction.source !== "allowance" && transaction.source !== "interest") {
      events.push({ t: tMs, value, emoji: transaction.category, label: transaction.memo ?? transaction.source });
    }
  }

  // --- Modeled segment: Jan 2025 up to the first real record ---
  const anchorT = real.length > 0 ? real[0].t : todayT;
  const anchorValue = real.length > 0 ? real[0].value : balance;
  const weeksToAnchor = (anchorT - HISTORY_START) / WEEK_MS;

  const growthAt = (weeks: number) => Math.pow(1 + weeklyRate, weeks);
  const annuityAt = (weeks: number) => (weeklyRate > 0 ? (growthAt(weeks) - 1) / weeklyRate : weeks);

  const modeled: TimelinePoint[] = [];
  let startingBalance = anchorValue;
  if (weeksToAnchor >= 2) {
    // Solve anchorValue = P·(1+i)^n + A·annuity(n) for P; if the allowance alone would have
    // overshot (P < 0), pin P at 0 and scale the allowance contribution to land exactly.
    startingBalance = (anchorValue - netAllowance * annuityAt(weeksToAnchor)) / growthAt(weeksToAnchor);
    let allowanceScale = 1;
    if (startingBalance < 0) {
      startingBalance = 0;
      const annuity = netAllowance * annuityAt(weeksToAnchor);
      allowanceScale = annuity > 0 ? anchorValue / annuity : 0;
    }
    for (let w = 0; w < Math.floor(weeksToAnchor); w++) {
      const value = startingBalance * growthAt(w) + netAllowance * allowanceScale * annuityAt(w);
      modeled.push({ t: HISTORY_START + w * WEEK_MS, value: round2(value) });
    }
    modeled.push({ t: anchorT, value: anchorValue });
  }
  startingBalance = round2(startingBalance);

  const past: TimelinePoint[] = [...modeled];
  for (const point of real) {
    if (past.length === 0 || point.t > past[past.length - 1].t) past.push(point);
    else if (point.t === past[past.length - 1].t) past[past.length - 1] = point;
  }
  if (past.length === 0 || past[past.length - 1].t < todayT) past.push({ t: todayT, value: balance });
  else past[past.length - 1] = { t: past[past.length - 1].t, value: balance };

  // --- Simulation ---
  const simKind = options.simKind;
  const simAmount = Math.min(Math.max(options.simAmount ?? 0, 0), simKind === "add" ? Infinity : balance);
  const active = simKind !== undefined && simAmount > 0;

  // Anything currently sitting in an open investment keeps compounding at the market/CD rate,
  // not the HYSA rate — a projection that lumps it in with cash understates (or overstates) what
  // an actual held position is worth by the time the projection matters.
  const investRate = options.investWeeklyRate ?? weeklyRate;
  const investedNow = positions.filter((position) => !position.closedAt).reduce((sum, p) => sum + p.currentValue, 0);
  const cashNow = balance - investedNow;

  let recoveryWeeks: number | null | undefined;
  if (active && simKind === "withdraw") {
    recoveryWeeks = null;
    let cash = cashNow - simAmount;
    let invested = investedNow;
    for (let w = 1; w <= MAX_PROJECTION_WEEKS; w++) {
      cash = cash * (1 + weeklyRate) + netAllowance;
      invested = invested * (1 + investRate);
      if (cash + invested >= balance) {
        recoveryWeeks = w;
        break;
      }
    }
  }

  const horizon = Math.min(
    MAX_PROJECTION_WEEKS,
    Math.max(DEFAULT_PROJECTION_WEEKS, recoveryWeeks ? recoveryWeeks + 8 : 0),
  );

  // Cash (plus future allowance) grows at the HYSA rate; whatever's actually invested keeps
  // growing at the market rate — a sim only ever moves money into/out of the cash bucket.
  const project = (cashFrom: number, investedFrom: number): TimelinePoint[] => {
    const points: TimelinePoint[] = [{ t: todayT, value: round2(cashFrom + investedFrom) }];
    let cash = cashFrom;
    let invested = investedFrom;
    for (let w = 1; w <= horizon; w++) {
      cash = cash * (1 + weeklyRate) + netAllowance;
      invested = invested * (1 + investRate);
      points.push({ t: todayT + w * WEEK_MS, value: round2(cash + invested) });
    }
    return points;
  };

  const future = project(cashNow, investedNow);
  const oneYearBaseline = future[Math.min(DEFAULT_PROJECTION_WEEKS, future.length - 1)].value;

  const result: MoneyTimeline = {
    past,
    future,
    events: events.slice(-MAX_EVENT_MARKERS),
    oneYearBaseline,
    todayT,
    startingBalance,
  };

  if (active) {
    result.simKind = simKind;
    if (simKind === "withdraw") {
      result.sim = project(cashNow - simAmount, investedNow);
      result.preWithdrawalLevel = balance;
      result.recoveryWeeks = recoveryWeeks;
      if (recoveryWeeks) result.recoveryAt = todayT + recoveryWeeks * WEEK_MS;
    } else if (simKind === "add") {
      result.sim = project(cashNow + simAmount, investedNow);
    } else {
      // Invest: the new slice moves from cash into the invested bucket and grows at the
      // market-history rate; whatever's already invested keeps compounding right alongside it.
      result.sim = project(cashNow - simAmount, investedNow + simAmount);
    }
    result.oneYearSim = result.sim[Math.min(DEFAULT_PROJECTION_WEEKS, result.sim.length - 1)].value;
  }

  return result;
}
