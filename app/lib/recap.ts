import { weeksWithoutWithdrawalFor } from "./allowance";
import type { FamilyBankState, KidProfile } from "./schema";

export interface WeeklyRecap {
  totalIn: number;
  totalOut: number;
  inBySource: { label: string; amount: number }[];
  streakWeeks: number;
  investedValue: number;
  investedGain: number; // unrealized: current value minus principal across open positions
  goals: { name: string; savedAmount: number; targetAmount: number }[];
  prompt: string;
}

// One conversation starter per week — the app's job is to spark the money talk,
// not replace it. Deterministic per week+kid so every device shows the same one.
const PROMPTS = [
  "If you had $100 right now, what would you do with it?",
  "What's something you almost bought this week but didn't? How does it feel now?",
  "Would you rather have $10 today or $15 next month? Why?",
  "What's the difference between wanting something and needing it?",
  "Why do you think money in the bank earns interest?",
  "What would you do if your stocks dropped by half? Sell or wait?",
  "If you could invent a bounty for the board, what would it be worth?",
  "Why does a little tax come out of every allowance?",
  "What's the best thing you've ever spent money on? Was it worth it?",
  "If your allowance doubled, would you save more or spend more?",
];

const SOURCE_LABELS: Record<string, string> = {
  allowance: "Allowance",
  bounty: "Bounties",
  "dad-match": "Streak bonus",
  interest: "Interest",
  tax: "Tax refund",
  "manual-deposit": "Cash in",
  investment: "Investments cashed out",
};

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function weeklyRecapForKid(state: FamilyBankState, kid: KidProfile, now: Date = new Date()): WeeklyRecap {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeek = state.transactions.filter(
    (transaction) => transaction.kidId === kid.id && transaction.createdAt >= since,
  );

  const inBySourceMap = new Map<string, number>();
  let totalIn = 0;
  let totalOut = 0;
  for (const transaction of thisWeek) {
    if (transaction.amount > 0) {
      totalIn += transaction.amount;
      const label = SOURCE_LABELS[transaction.source] ?? transaction.source;
      inBySourceMap.set(label, (inBySourceMap.get(label) ?? 0) + transaction.amount);
    } else {
      totalOut += -transaction.amount;
    }
  }

  const openPositions = state.investments.filter((position) => position.kidId === kid.id && !position.closedAt);
  const investedValue = openPositions.reduce((total, position) => total + position.currentValue, 0);
  const investedGain = openPositions.reduce((total, position) => total + (position.currentValue - position.principal), 0);

  const kidIndex = Math.max(0, state.kids.findIndex((candidate) => candidate.id === kid.id));

  return {
    totalIn,
    totalOut,
    inBySource: Array.from(inBySourceMap.entries()).map(([label, amount]) => ({ label, amount })),
    streakWeeks: weeksWithoutWithdrawalFor(state, kid.id, now),
    investedValue,
    investedGain,
    goals: state.goals
      .filter((goal) => goal.kidId === kid.id && !goal.spentAt)
      .map((goal) => ({ name: goal.name, savedAmount: goal.savedAmount, targetAmount: goal.targetAmount })),
    prompt: PROMPTS[(isoWeekNumber(now) + kidIndex) % PROMPTS.length],
  };
}
