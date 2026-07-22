import { nextPaydayFor } from "./allowance";
import type { KidProfile } from "./schema";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WEEKS = 260; // 5 years — beyond this, a calendar projection isn't useful

export interface GoalSchedule {
  weeksToGo: number;
  completionDate: Date;
  /** Every payday between now and completion (inclusive), for marking on the calendar. */
  paydays: Date[];
}

/**
 * Projects how many paydays it'll take to fill the remaining amount at this goal's weekly
 * auto-save rate, and the calendar date that lands on. Returns null when there's nothing left to
 * project (already there, or no auto-save configured) or the projection would be absurdly far out.
 */
export function estimateGoalSchedule(
  kid: KidProfile,
  remaining: number,
  weeklyContribution: number,
): GoalSchedule | null {
  if (remaining <= 0 || weeklyContribution <= 0) return null;
  const weeksToGo = Math.ceil(remaining / weeklyContribution);
  if (weeksToGo > MAX_WEEKS) return null;

  const paydays: Date[] = [];
  let next = nextPaydayFor(kid);
  for (let i = 0; i < weeksToGo; i++) {
    paydays.push(next);
    next = new Date(next.getTime() + WEEK_MS);
  }

  return { weeksToGo, completionDate: paydays[paydays.length - 1], paydays };
}
