import type { FamilyBankState } from "./schema";

export interface CelebrationEvent {
  id: string;
  kidId: string;
  kind: "payday" | "interest" | "dad-match" | "bounty" | "goal-complete" | "goal-spent" | "envelope-arrived";
  title: string;
  emoji: string;
  amount: number;
  /** Payday only: the gross allowance and the tax slice, for the tax-jar animation. */
  gross?: number;
  tax?: number;
  detail?: string;
}

// A remote snapshot with more new transactions than this is a bulk import/first
// sync, not a live event — celebrating 50 back-payments at once would be noise.
const BULK_THRESHOLD = 10;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Compares two states and returns the moments worth celebrating on a kid's screen. */
export function diffCelebrations(prev: FamilyBankState | null, next: FamilyBankState): CelebrationEvent[] {
  if (!prev || prev === next) return [];

  const prevTransactionIds = new Set(prev.transactions.map((transaction) => transaction.id));
  const newTransactions = next.transactions.filter((transaction) => !prevTransactionIds.has(transaction.id));
  if (newTransactions.length > BULK_THRESHOLD) return [];

  const events: CelebrationEvent[] = [];

  for (const kid of next.kids) {
    const mine = newTransactions.filter((transaction) => transaction.kidId === kid.id);

    const allowanceTotal = mine
      .filter((transaction) => transaction.source === "allowance")
      .reduce((total, transaction) => total + transaction.amount, 0);
    if (allowanceTotal > 0) {
      // The allowance transaction is the gross amount; the Family Tax withholding is its own
      // (negative) "tax" transaction recorded alongside it — no need to back-compute either figure.
      const taxWithheld = -mine
        .filter((transaction) => transaction.source === "tax" && transaction.amount < 0)
        .reduce((total, transaction) => total + transaction.amount, 0);
      events.push({
        id: crypto.randomUUID(),
        kidId: kid.id,
        kind: "payday",
        title: "PAYDAY!",
        emoji: "💰",
        amount: round2(allowanceTotal - taxWithheld),
        gross: allowanceTotal,
        tax: taxWithheld,
      });
    }

    const interestTotal = mine
      .filter((transaction) => transaction.source === "interest")
      .reduce((total, transaction) => total + transaction.amount, 0);
    if (interestTotal > 0) {
      events.push({
        id: crypto.randomUUID(),
        kidId: kid.id,
        kind: "interest",
        title: "Interest Day!",
        emoji: "🏦",
        amount: interestTotal,
        detail: "Your money made money — just for sitting in the bank.",
      });
    }

    for (const transaction of mine.filter((t) => t.source === "dad-match" && t.amount > 0)) {
      events.push({
        id: crypto.randomUUID(),
        kidId: kid.id,
        kind: "dad-match",
        title: "Streak bonus!",
        emoji: "🏆",
        amount: transaction.amount,
        detail: transaction.memo,
      });
    }

    for (const transaction of mine.filter((t) => t.source === "bounty" && t.amount > 0)) {
      events.push({
        id: crypto.randomUUID(),
        kidId: kid.id,
        kind: "bounty",
        title: "Bounty paid!",
        emoji: "💪",
        amount: transaction.amount,
        detail: transaction.memo,
      });
    }
  }

  const prevEnvelopeIds = new Set(prev.envelopes.map((envelope) => envelope.id));
  for (const envelope of next.envelopes) {
    if (prevEnvelopeIds.has(envelope.id)) continue;
    events.push({
      id: crypto.randomUUID(),
      kidId: envelope.kidId,
      kind: "envelope-arrived",
      title: "You got an envelope!",
      emoji: "💌",
      amount: envelope.amount,
      detail: envelope.title,
    });
  }

  const prevGoals = new Map(prev.goals.map((goal) => [goal.id, goal]));
  for (const goal of next.goals) {
    const before = prevGoals.get(goal.id);
    if (goal.completedAt && !before?.completedAt) {
      events.push({
        id: crypto.randomUUID(),
        kidId: goal.kidId,
        kind: "goal-complete",
        title: "GOAL REACHED!",
        emoji: "🎯",
        amount: goal.targetAmount,
        detail: goal.name,
      });
    }
    if (goal.spentAt && before && !before.spentAt) {
      events.push({
        id: crypto.randomUUID(),
        kidId: goal.kidId,
        kind: "goal-spent",
        title: "Enjoy it!",
        emoji: "🛍️",
        amount: before.savedAmount,
        detail: `You saved up and bought it: ${goal.name}`,
      });
    }
  }

  return events;
}
