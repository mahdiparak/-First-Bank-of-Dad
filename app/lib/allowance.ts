import { allocateToGoal, availableBalanceForKid, recordTransaction } from "./mutations";
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
        pot.kidId === kid.id
          ? { ...pot, balance: round2(pot.balance + taxAmount), totalPaid: round2(pot.totalPaid + taxAmount) }
          : pot,
      ),
      kids: working.kids.map((candidate) =>
        candidate.id === kid.id ? { ...candidate, lastAllowancePaidAt: paidAt } : candidate,
      ),
    };
    working = autoSaveTowardGoals(working, kid.id, paidAt);

    due = new Date(due.getTime() + WEEK_MS);
    payments++;
  }

  return working;
}

/**
 * Sets aside each goal's configured weekly amount from this payday's allowance, in the order the
 * goals were created — capped by whatever's actually available so one goal's auto-save never
 * overdraws another's.
 */
function autoSaveTowardGoals(state: FamilyBankState, kidId: string, at: string): FamilyBankState {
  let working = state;
  const goals = working.goals
    .filter((goal) => goal.kidId === kidId && !goal.completedAt && (goal.weeklyContribution ?? 0) > 0)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  for (const goal of goals) {
    const remaining = goal.targetAmount - goal.savedAmount;
    const available = availableBalanceForKid(working, kidId);
    const amount = round2(Math.min(goal.weeklyContribution ?? 0, remaining, available));
    if (amount > 0) working = allocateToGoal(working, goal.id, amount, at);
  }

  return working;
}

function balanceAt(state: FamilyBankState, kidId: string, at: Date): number {
  const atIso = at.toISOString();
  return state.transactions
    .filter((transaction) => transaction.kidId === kidId && transaction.createdAt <= atIso)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

/**
 * Pays weekly interest on the kid's whole cash balance at the parent-set HYSA rate — mirroring
 * how a real HYSA pays on everything you hold, so interest is something that visibly *happens*
 * to the kid rather than an opt-in menu item.
 */
function processInterestForKid(state: FamilyBankState, kid: KidProfile, now: Date): FamilyBankState {
  let working = state;
  let due = kid.lastInterestPaidAt
    ? new Date(new Date(kid.lastInterestPaidAt).getTime() + WEEK_MS)
    : new Date(startOfDay(new Date(kid.createdAt)).getTime() + WEEK_MS);
  let payments = 0;

  while (due.getTime() <= now.getTime() && payments < MAX_CATCH_UP_PAYMENTS) {
    const balance = balanceAt(working, kid.id, due);
    const interest = round2(balance * (working.parentSettings.hysaApr / 52));
    if (interest > 0) {
      working = recordTransaction(working, kid.id, interest, "🏦", "interest", "Interest Day", due.toISOString());
    }
    working = {
      ...working,
      kids: working.kids.map((candidate) =>
        candidate.id === kid.id ? { ...candidate, lastInterestPaidAt: due.toISOString() } : candidate,
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
 * Runs the allowance + interest + Dad Match engines for every kid. Returns the
 * same object reference if nothing was due, so callers can skip committing/
 * broadcasting a no-op state.
 */
export function runScheduledEngines(state: FamilyBankState, now: Date = new Date()): FamilyBankState {
  let working = state;
  for (const kid of state.kids) {
    working = processAllowanceForKid(working, kid, now);
    const afterAllowance = working.kids.find((k) => k.id === kid.id) ?? kid;
    working = processInterestForKid(working, afterAllowance, now);
    working = processDadMatchForKid(working, working.kids.find((k) => k.id === kid.id) ?? kid, now);
  }
  return working;
}

export function weeksWithoutWithdrawalFor(state: FamilyBankState, kidId: string, now: Date = new Date()): number {
  return currentStreakWeeks(state, kidId, now);
}

/** Every date in the given month that's a payday — a fixed weekday, so this is just every date
 *  in the month matching kid.paydayWeekday, past or future. */
export function paydaysInMonth(kid: KidProfile, year: number, month: number): Date[] {
  const days: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === kid.paydayWeekday) days.push(date);
  }
  return days;
}

/** The calendar date a given streak week completes, counted from the kid's streak anchor (their
 *  last withdrawal, or account creation if they've never withdrawn) — week 1 lands 7 days after
 *  the anchor, week 2 lands 14 days after, matching how weeksWithoutWithdrawalFor counts elapsed
 *  weeks. Used to plot streak progress and projected milestone paydays on a calendar. */
export function streakWeekDate(state: FamilyBankState, kidId: string, week: number): Date {
  const kid = state.kids.find((candidate) => candidate.id === kidId);
  const streak = state.streaks.find((candidate) => candidate.kidId === kidId);
  const since = streak?.lastWithdrawalAt ?? kid?.createdAt ?? new Date().toISOString();
  return new Date(new Date(since).getTime() + week * WEEK_MS);
}

/**
 * The calendar day the *currently counted* streak's day-by-day progress begins: the day after a
 * broken streak's last withdrawal (so the break itself can be marked on its own day, and "day 1"
 * of the fresh streak reads as a clean restart), or account creation day if this kid has never
 * broken a streak. Lines up exactly with streakWeekDate — day 7*N of this streak always lands on
 * the same calendar day as `streakWeekDate(state, kidId, N)`.
 */
export function streakDisplayStartDate(state: FamilyBankState, kidId: string): Date {
  const kid = state.kids.find((candidate) => candidate.id === kidId);
  const streak = state.streaks.find((candidate) => candidate.kidId === kidId);
  const anchorDay = startOfDay(new Date(streak?.lastWithdrawalAt ?? kid?.createdAt ?? new Date().toISOString()));
  return streak?.lastWithdrawalAt ? new Date(anchorDay.getTime() + DAY_MS) : anchorDay;
}

/** Every calendar day, from the start of the currently counted streak through today, that counts
 *  toward it — for marking daily progress on a calendar rather than only whole-week milestones. */
export function streakProgressDays(state: FamilyBankState, kidId: string, now: Date = new Date()): Date[] {
  const start = streakDisplayStartDate(state, kidId);
  const today = startOfDay(now);
  const totalDays = Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
  const days: Date[] = [];
  for (let i = 0; i < totalDays && i < MAX_CATCH_UP_PAYMENTS * 7; i++) {
    days.push(new Date(start.getTime() + i * DAY_MS));
  }
  return days;
}

/** Every date this kid broke a Dad Match streak (an approved withdrawal that wasn't spending a
 *  finished goal) — the whole history, so navigating to a past month still shows why a streak
 *  reset there. */
export function streakBreakDates(state: FamilyBankState, kidId: string): Date[] {
  return state.withdrawalRequests
    .filter((request) => request.kidId === kidId && request.status === "approved" && !request.goalId && request.resolvedAt)
    .map((request) => new Date(request.resolvedAt as string));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
