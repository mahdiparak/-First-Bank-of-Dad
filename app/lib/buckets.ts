import { pendingWithdrawalsForKid, savedTowardGoalsForKid, totalBalanceForKid } from "./mutations";
import { ASSET_CLASSES, type AssetClass, type FamilyBankState } from "./schema";

export type BucketId = "cash" | "pending" | "goals" | AssetClass;

export interface MoneyBucket {
  id: BucketId;
  label: string;
  emoji: string;
  amount: number;
  /** Share of the kid's whole pile, 0–1. */
  share: number;
  /** One line on where this money actually is and what it's doing. */
  note: string;
}

/**
 * Splits everything a kid owns into the buckets it's sitting in — spendable cash, money asked for
 * but not approved yet, money set aside for goals, and each kind of investment.
 *
 * Two things worth being straight about, because they're easy to get wrong looking at the app:
 * every one of these dollars is really in the same high-yield savings account at the bank (see
 * reconciliation.actualHysaBalances); the buckets are how the app divides it up, not separate
 * accounts. And the "Savings" investment bucket is the same rate as the cash bucket — the
 * difference is that money in it is committed for the minimum hold, not spendable today.
 *
 * Buckets with nothing in them are dropped, and the order is fixed (most spendable first) so a
 * bucket never changes colour or position as amounts move around.
 */
export function moneyBuckets(state: FamilyBankState, kidId: string): MoneyBucket[] {
  const cash = totalBalanceForKid(state, kidId);
  const goals = savedTowardGoalsForKid(state, kidId);
  const pending = pendingWithdrawalsForKid(state, kidId);

  const positions = state.investments.filter((position) => position.kidId === kidId && !position.closedAt);
  const invested = (assetClass: AssetClass) =>
    positions
      .filter((position) => position.assetClass === assetClass)
      .reduce((total, position) => total + position.currentValue, 0);

  const entries: Omit<MoneyBucket, "share">[] = [
    {
      id: "cash",
      label: "Spendable",
      emoji: "💵",
      amount: round2(cash - goals - pending),
      note: "Ready to use — and still earning interest every week.",
    },
    {
      id: "pending",
      label: "Waiting for Dad",
      emoji: "🕐",
      amount: round2(pending),
      note: "Asked for, not approved yet. Still yours until it is.",
    },
    {
      id: "goals",
      label: "Saved for goals",
      emoji: "🎯",
      amount: round2(goals),
      note: "Set aside on purpose. Spending it doesn't break your streak.",
    },
    ...(["savings", "cd", "stocks", "crypto"] as AssetClass[]).map((assetClass) => ({
      id: assetClass,
      label: ASSET_CLASSES[assetClass].shortLabel,
      emoji: ASSET_CLASSES[assetClass].emoji,
      amount: round2(invested(assetClass)),
      note: ASSET_CLASSES[assetClass].description,
    })),
  ];

  const total = entries.reduce((sum, entry) => sum + Math.max(entry.amount, 0), 0);
  return entries
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({ ...entry, share: total > 0 ? entry.amount / total : 0 }));
}

/** Everything the kid owns, across every bucket — the number the shares are shares OF. */
export function bucketTotal(buckets: MoneyBucket[]): number {
  return round2(buckets.reduce((sum, bucket) => sum + bucket.amount, 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
