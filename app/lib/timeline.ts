import { virtualBalanceForKid } from "./mutations";
import type { FamilyBankState, KidProfile } from "./schema";

export interface TimelinePoint {
  t: number; // ms since epoch
  value: number;
}

export interface MoneyTimeline {
  /** Modeled weekly balance from Jan 2025 up to today (solid line). */
  past: TimelinePoint[];
  /** Projection from today forward at current allowance + interest (dotted line). */
  future: TimelinePoint[];
  /** Same projection but starting after a simulated withdrawal (second dotted line). */
  sim?: TimelinePoint[];
  /** The pre-withdrawal balance the sim line is trying to climb back to. */
  preWithdrawalLevel?: number;
  /** Weeks until the sim line reaches preWithdrawalLevel again; null = not within the 5-year cap. */
  recoveryWeeks?: number | null;
  /** Timestamp of the recovery point, when one exists. */
  recoveryAt?: number;
  todayT: number;
  /** The back-calculated Jan 2025 starting balance. */
  startingBalance: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_START = Date.UTC(2025, 0, 1);
const DEFAULT_PROJECTION_WEEKS = 52;
const MAX_PROJECTION_WEEKS = 260; // 5 years

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds the kid's money-over-time picture. The past segment is a model, not a replay of app
 * transactions: the app only started recording recently, but the kid's real account has been
 * growing since before that. So we back-calculate what they must have started with in Jan 2025
 * for steady weekly allowance deposits plus weekly HYSA interest to land exactly on today's
 * balance, then draw that growth path. The future segment continues the same model forward.
 */
export function buildMoneyTimeline(
  state: FamilyBankState,
  kid: KidProfile,
  withdrawal = 0,
  now: Date = new Date(),
): MoneyTimeline {
  const balance = round2(virtualBalanceForKid(state, kid.id));
  const weeklyRate = state.parentSettings.hysaApr / 52;
  const netAllowance = kid.weeklyAllowance * (1 - state.parentSettings.taxRate);

  const weeksSinceStart = Math.max(1, Math.round((now.getTime() - HISTORY_START) / WEEK_MS));
  const todayT = HISTORY_START + weeksSinceStart * WEEK_MS;

  const growthAt = (weeks: number) => Math.pow(1 + weeklyRate, weeks);
  const annuityAt = (weeks: number) => (weeklyRate > 0 ? (growthAt(weeks) - 1) / weeklyRate : weeks);

  // Solve B_today = P·(1+i)^n + A·annuity(n) for P. If the allowance alone would have
  // overshot today's balance (P < 0), pin P at 0 and scale the allowance contribution
  // down instead, so the curve still lands exactly on today's number.
  let startingBalance = (balance - netAllowance * annuityAt(weeksSinceStart)) / growthAt(weeksSinceStart);
  let allowanceScale = 1;
  if (startingBalance < 0) {
    startingBalance = 0;
    const annuity = netAllowance * annuityAt(weeksSinceStart);
    allowanceScale = annuity > 0 ? balance / annuity : 0;
  }
  startingBalance = round2(startingBalance);

  const past: TimelinePoint[] = [];
  for (let w = 0; w <= weeksSinceStart; w++) {
    const value = startingBalance * growthAt(w) + netAllowance * allowanceScale * annuityAt(w);
    past.push({ t: HISTORY_START + w * WEEK_MS, value: round2(value) });
  }
  past[past.length - 1] = { t: todayT, value: balance };

  // Withdrawal sim: step forward until the post-withdrawal path climbs back to today's level.
  const effectiveWithdrawal = Math.min(Math.max(withdrawal, 0), balance);
  let recoveryWeeks: number | null | undefined;
  if (effectiveWithdrawal > 0) {
    recoveryWeeks = null;
    let value = balance - effectiveWithdrawal;
    for (let w = 1; w <= MAX_PROJECTION_WEEKS; w++) {
      value = value * (1 + weeklyRate) + netAllowance;
      if (value >= balance) {
        recoveryWeeks = w;
        break;
      }
    }
  }

  const horizon = Math.min(
    MAX_PROJECTION_WEEKS,
    Math.max(DEFAULT_PROJECTION_WEEKS, recoveryWeeks ? recoveryWeeks + 8 : 0),
  );

  const project = (from: number): TimelinePoint[] => {
    const points: TimelinePoint[] = [{ t: todayT, value: round2(from) }];
    let value = from;
    for (let w = 1; w <= horizon; w++) {
      value = value * (1 + weeklyRate) + netAllowance;
      points.push({ t: todayT + w * WEEK_MS, value: round2(value) });
    }
    return points;
  };

  const future = project(balance);
  const result: MoneyTimeline = { past, future, todayT, startingBalance };

  if (effectiveWithdrawal > 0) {
    result.sim = project(balance - effectiveWithdrawal);
    result.preWithdrawalLevel = balance;
    result.recoveryWeeks = recoveryWeeks;
    if (recoveryWeeks) result.recoveryAt = todayT + recoveryWeeks * WEEK_MS;
  }

  return result;
}
