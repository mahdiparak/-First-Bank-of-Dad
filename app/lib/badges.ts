import { weeksWithoutWithdrawalFor } from "./allowance";
import type { FamilyBankState } from "./schema";

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
  /** True when a parent hid this badge (it would otherwise be earned) — lets the UI offer "restore" instead of a plain locked tile. */
  revoked: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The highest balance this kid has ever held, replayed from their transaction history. */
function runningMaxBalance(state: FamilyBankState, kidId: string): number {
  const ordered = state.transactions
    .filter((transaction) => transaction.kidId === kidId)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let balance = 0;
  let max = 0;
  for (const transaction of ordered) {
    balance += transaction.amount;
    if (balance > max) max = balance;
  }
  return max;
}

/** All badges for one kid, earned or not — recomputed from state, nothing stored except a
 *  per-kid list of ids a parent has manually hidden (e.g. a badge awarded by a data mistake). */
export function badgesForKid(state: FamilyBankState, kidId: string): Badge[] {
  const mine = (source: string) =>
    state.transactions.some((transaction) => transaction.kidId === kidId && transaction.source === source);
  const maxBalance = runningMaxBalance(state, kidId);
  const myGoals = state.goals.filter((goal) => goal.kidId === kidId);
  const myPositions = state.investments.filter((position) => position.kidId === kidId);
  const streakWeeks = weeksWithoutWithdrawalFor(state, kidId);
  const now = Date.now();
  const hiddenIds = new Set(state.kids.find((kid) => kid.id === kidId)?.hiddenBadgeIds ?? []);

  const rawBadges: Omit<Badge, "revoked">[] = [
    {
      id: "first-paycheck",
      emoji: "🪙",
      title: "First Paycheck",
      description: "Got your first allowance.",
      earned: mine("allowance"),
    },
    {
      id: "ten-club",
      emoji: "💵",
      title: "The $10 Club",
      description: "Your balance reached $10.",
      earned: maxBalance >= 10,
    },
    {
      id: "hundredaire",
      emoji: "💰",
      title: "Hundredaire",
      description: "Your balance reached $100.",
      earned: maxBalance >= 100,
    },
    {
      id: "goal-getter",
      emoji: "🎯",
      title: "Goal Getter",
      description: "Filled up a savings goal all the way.",
      earned: myGoals.some((goal) => goal.completedAt),
    },
    {
      id: "smart-spender",
      emoji: "🛍️",
      title: "Smart Spender",
      description: "Saved up for something and bought it.",
      earned: myGoals.some((goal) => goal.spentAt),
    },
    {
      id: "bounty-hunter",
      emoji: "🗺️",
      title: "Quest Hunter",
      description: "Earned extra money from the Quest Board.",
      earned: mine("bounty"),
    },
    {
      id: "first-investor",
      emoji: "📈",
      title: "First Investor",
      description: "Put money into an investment.",
      earned: myPositions.length > 0,
    },
    {
      id: "diamond-hands",
      emoji: "💎",
      title: "Diamond Hands",
      description: "Held a stocks or crypto investment for 8 weeks.",
      earned: myPositions.some(
        (position) =>
          (position.assetClass === "stocks" || position.assetClass === "crypto") &&
          !position.closedAt &&
          now - new Date(position.openedAt).getTime() >= 8 * WEEK_MS,
      ),
    },
    {
      id: "on-fire",
      emoji: "🔥",
      title: "On Fire",
      description: "4 weeks without an impulse withdrawal.",
      earned: streakWeeks >= 4,
    },
    {
      id: "interest-earned",
      emoji: "🏦",
      title: "Money Makes Money",
      description: "Earned your first interest.",
      earned: mine("interest"),
    },
    {
      id: "tax-refund",
      emoji: "🧾",
      title: "Tax Return",
      description: "Got a Tax Refund payout.",
      earned: state.transactions.some(
        (transaction) => transaction.kidId === kidId && transaction.source === "tax" && transaction.amount > 0,
      ),
    },
  ];

  return rawBadges.map((badge) => {
    const revoked = badge.earned && hiddenIds.has(badge.id);
    return { ...badge, earned: badge.earned && !revoked, revoked };
  });
}
