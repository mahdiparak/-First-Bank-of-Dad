import { recordTransaction } from "./mutations";
import type { FamilyBankState, KidProfile } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MAX_CATCH_UP_PAYMENTS = 52; // don't pay out more than a year of back-allowance if offline a long time

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function firstPaydayOnOrAfter(date: Date, paydayWeekday: number): Date {
  const day = startOfDay(date);
  const diff = (paydayWeekday - day.getDay() + 7) % 7;
  day.setDate(day.getDate() + diff);
  return day;
}

/** The next date this kid's allowance is due (may be today). Never mutates state. */
export function nextPaydayFor(kid: KidProfile): Date {
  if (!kid.lastAllowancePaidAt) {
    return firstPaydayOnOrAfter(new Date(kid.createdAt), kid.paydayWeekday);
  }
  return new Date(new Date(kid.lastAllowancePaidAt).getTime() + WEEK_MS);
}

export function daysUntilPayday(kid: KidProfile, now: Date = new Date()): number {
  const next = nextPaydayFor(kid);
  return Math.max(0, Math.ceil((startOfDay(next).getTime() - startOfDay(now).getTime()) / DAY_MS));
}

/** Pays out every allowance due since the kid's last payment, withholding the Family Tax into their tax pot. */
function processAllowanceForKid(state: FamilyBankState, kid: KidProfile, now: Date): FamilyBankState {
  let working = state;
  let due = nextPaydayFor(kid);
  let payments = 0;

  while (due.getTime() <= now.getTime() && payments < MAX_CATCH_UP_PAYMENTS) {
    const taxRate = working.parentSettings.taxRate;
    const taxAmount = round2(kid.weeklyAllowance * taxRate);
    const netAmount = round2(kid.weeklyAllowance - taxAmount);
    const paidAt = due.toISOString();

    working = recordTransaction(working, kid.id, netAmount, "💰", "allowance", "Weekly allowance", paidAt);
    working = {
      ...working,
      taxPots: working.taxPots.map((pot) =>
        pot.kidId === kid.id ? { ...pot, balance: round2(pot.balance + taxAmount) } : pot,
      ),
      kids: working.kids.map((candidate) =>
        candidate.id === kid.id ? { ...candidate, lastAllowancePaidAt: paidAt } : candidate,
      ),
    };

    due = new Date(due.getTime() + WEEK_MS);
    payments++;
  }

  return working;
}

function currentStreakWeeks(state: FamilyBankState, kidId: string, now: Date): number {
  const kid = state.kids.find((candidate) => candidate.id === kidId);
  const streak = state.streaks.find((candidate) => candidate.kidId === kidId);
  if (!kid) return 0;
  const since = streak?.lastWithdrawalAt ?? kid.createdAt;
  return Math.floor((now.getTime() - new Date(since).getTime()) / WEEK_MS);
}

/** Pays any newly-reached Dad Match milestone bonus, once per milestone per kid. */
function processDadMatchForKid(state: FamilyBankState, kid: KidProfile, now: Date): FamilyBankState {
  const streak = state.streaks.find((candidate) => candidate.kidId === kid.id);
  const weeks = currentStreakWeeks(state, kid.id, now);
  const alreadyPaidThrough = streak?.lastMilestonePaidWeeks ?? 0;

  const newlyReached = state.parentSettings.dadMatchMilestones
    .filter((milestone) => milestone.weeks > alreadyPaidThrough && milestone.weeks <= weeks)
    .sort((a, b) => a.weeks - b.weeks);

  if (newlyReached.length === 0) return state;

  let working = state;
  for (const milestone of newlyReached) {
    working = recordTransaction(
      working,
      kid.id,
      milestone.bonus,
      "🏆",
      "dad-match",
      `Dad Match bonus — ${milestone.weeks} week streak`,
    );
  }

  const highestPaid = newlyReached[newlyReached.length - 1].weeks;
  return {
    ...working,
    streaks: working.streaks.map((candidate) =>
      candidate.kidId === kid.id ? { ...candidate, lastMilestonePaidWeeks: highestPaid } : candidate,
    ),
  };
}

/**
 * Runs the allowance + Dad Match engines for every kid. Returns the same
 * object reference if nothing was due, so callers can skip committing/
 * broadcasting a no-op state.
 */
export function runScheduledEngines(state: FamilyBankState, now: Date = new Date()): FamilyBankState {
  let working = state;
  for (const kid of state.kids) {
    working = processAllowanceForKid(working, kid, now);
    working = processDadMatchForKid(working, working.kids.find((k) => k.id === kid.id) ?? kid, now);
  }
  return working;
}

export function weeksWithoutWithdrawalFor(state: FamilyBankState, kidId: string, now: Date = new Date()): number {
  return currentStreakWeeks(state, kidId, now);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
