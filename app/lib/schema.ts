export interface KidProfile {
  id: string;
  name: string;
  age: number;
  weeklyAllowance: number;
  paydayWeekday: number; // 0 = Sunday ... 6 = Saturday
  createdAt: string;
  lastAllowancePaidAt?: string;
  lastInterestPaidAt?: string;
  avatar?: string; // emoji
  color?: string; // hex accent color
  /** Only set for a kid with their own device/login (e.g. an older kid) — matches Cloudflare Access identity to auto-open their view. */
  email?: string;
}

/** Kids under this age get the simplified, picture-first UI. */
export const YOUNG_KID_MAX_AGE = 7;

export const KID_AVATARS = ["🦁", "🐯", "🦊", "🐼", "🐸", "🦄", "🐙", "🦖"] as const;
export const KID_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"] as const;

export function kidAvatar(kid: KidProfile): string {
  return kid.avatar ?? KID_AVATARS[hashIndex(kid.id, KID_AVATARS.length)];
}

export function kidColor(kid: KidProfile): string {
  return kid.color ?? KID_COLORS[hashIndex(kid.id, KID_COLORS.length)];
}

function hashIndex(id: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % modulo;
}

/** A named parent/guardian — lets the app greet whoever's using a device rather than a generic "Parent." */
export interface ParentProfile {
  id: string;
  name: string;
  avatar?: string;
  createdAt: string;
  /** Matches Cloudflare Access identity so logging in with this email auto-opens this parent's dashboard. */
  email?: string;
  /** This parent's own PIN (SHA-256 hash) for the Kid View -> Parent switch. Falls back to the shared parentSettings.parentPinHash if unset. */
  pinHash?: string;
}

export const PARENT_AVATARS = ["👨", "👩", "🧑", "👨‍🦰", "👩‍🦰", "🧔", "👱", "👴", "👵"] as const;

export function parentAvatar(parent: ParentProfile): string {
  return parent.avatar ?? PARENT_AVATARS[hashIndex(parent.id, PARENT_AVATARS.length)];
}

export type TransactionSource =
  | "allowance"
  | "bounty"
  | "tax"
  | "dad-match"
  | "manual-deposit"
  | "manual-withdrawal"
  | "goal"
  | "investment"
  | "interest";

export interface Transaction {
  id: string;
  kidId: string;
  amount: number; // positive = credit, negative = debit
  category: string; // emoji key chosen by the kid
  memo?: string;
  createdAt: string;
  source: TransactionSource;
}

export interface SavingsGoal {
  id: string;
  kidId: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  createdAt: string;
  completedAt?: string;
  /** Set once the goal's money was actually spent (via an approved goal-spend request). */
  spentAt?: string;
}

export type BountyStatus =
  | "open"
  | "claimed"
  | "pending-approval"
  | "approved"
  | "denied";

export interface Bounty {
  id: string;
  title: string;
  reward: number;
  status: BountyStatus;
  claimedByKidId?: string;
  claimedAt?: string;
  resolvedAt?: string;
}

export interface DadMatchMilestone {
  weeks: number;
  bonus: number;
}

export interface StreakState {
  kidId: string;
  weeksWithoutWithdrawal: number;
  lastWithdrawalAt?: string;
  lastMilestonePaidWeeks?: number;
}

export interface TaxPot {
  kidId: string;
  balance: number;
  rate: number; // e.g. 0.05
}

export type AssetClass = "savings" | "cd" | "stocks" | "crypto";

export interface InvestmentPosition {
  id: string;
  kidId: string;
  assetClass: AssetClass;
  principal: number;
  currentValue: number;
  openedAt: string;
  lastGrowthUpdateAt: string;
  lockWeeks?: number; // CD only
  maturesAt?: string; // CD only
  closedAt?: string;
}

export const ASSET_CLASSES: Record<AssetClass, { label: string; description: string }> = {
  savings: { label: "Savings (The Bicycle)", description: "Steady and safe — the real HYSA rate, no crashes." },
  cd: { label: "CD (The Time Vault)", description: "A higher fixed rate, but your money is locked up for a while." },
  stocks: { label: "Stocks (The Rollercoaster)", description: "Ups and downs like the real stock market." },
  crypto: { label: "Crypto (The Rocket Booster)", description: "Huge swings — big gains, big drops." },
};

export type WithdrawalStatus = "pending" | "approved" | "denied";

export interface WithdrawalRequest {
  id: string;
  kidId: string;
  amount: number;
  category: string; // emoji key chosen by the kid, same set as Transaction.category
  reason?: string;
  status: WithdrawalStatus;
  requestedAt: string;
  resolvedAt?: string;
  /**
   * Set when this is a "spend my completed goal" request. Approving it spends the goal's
   * earmarked money and — deliberately — does NOT reset the Dad Match streak: planned
   * spending toward a goal is the behavior we celebrate, not punish.
   */
  goalId?: string;
}

export interface CashAdjustment {
  id: string;
  amount: number; // positive = kid gave dad physical cash, negative = dad paid out physical cash
  note?: string;
  createdAt: string;
}

export interface KidHysaBalance {
  kidId: string;
  balance: number;
  lastUpdatedAt: string;
}

/** Each kid has their own real-world HYSA account (e.g. separate Marcus accounts) — no shared family balance. */
export interface ReconciliationSnapshot {
  actualHysaBalances: KidHysaBalance[];
  cashAdjustments: CashAdjustment[];
}

export interface ParentSettings {
  hysaApr: number;
  cdApr: number;
  taxRate: number;
  dadMatchMilestones: DadMatchMilestone[];
  /** SHA-256 hash gating Kid View -> Parent Command Center. Unset = no gate. */
  parentPinHash?: string;
}

export interface FamilyBankState {
  version: number;
  familyId: string;
  kids: KidProfile[];
  parentProfiles: ParentProfile[];
  transactions: Transaction[];
  goals: SavingsGoal[];
  bounties: Bounty[];
  streaks: StreakState[];
  taxPots: TaxPot[];
  investments: InvestmentPosition[];
  withdrawalRequests: WithdrawalRequest[];
  parentSettings: ParentSettings;
  reconciliation: ReconciliationSnapshot;
  updatedAt: string;
}

export const CURRENT_STATE_VERSION = 1;

/**
 * Migrates state loaded from an older deploy so newer code never trips over a missing field.
 * - `reconciliation.actualHysaBalance` (single family-wide number) is replaced by the per-kid
 *   `actualHysaBalances` array. Rather than guessing how to split the old lump sum, this resets
 *   to an empty per-kid list — the parent re-enters each kid's real balance once.
 * - `parentProfiles` defaults to an empty array if the state predates named parent profiles.
 */
export function normalizeState(state: FamilyBankState): FamilyBankState {
  const legacy = state as unknown as {
    parentProfiles?: ParentProfile[];
    reconciliation?: { actualHysaBalances?: KidHysaBalance[]; cashAdjustments?: CashAdjustment[] };
  };

  const needsReconciliationFix = !Array.isArray(legacy.reconciliation?.actualHysaBalances);
  const needsParentProfiles = !Array.isArray(legacy.parentProfiles);
  if (!needsReconciliationFix && !needsParentProfiles) return state;

  return {
    ...state,
    parentProfiles: needsParentProfiles ? [] : state.parentProfiles,
    reconciliation: needsReconciliationFix
      ? { actualHysaBalances: [], cashAdjustments: legacy.reconciliation?.cashAdjustments ?? [] }
      : state.reconciliation,
  };
}

export const SPENDING_CATEGORIES = [
  { emoji: "🍕", label: "Food" },
  { emoji: "🎮", label: "Games" },
  { emoji: "🧸", label: "Toys" },
  { emoji: "👕", label: "Clothes" },
  { emoji: "🎬", label: "Fun" },
  { emoji: "📚", label: "Books" },
  { emoji: "🎁", label: "Gifts" },
  { emoji: "❓", label: "Other" },
] as const;

export function createEmptyState(familyId: string): FamilyBankState {
  const now = new Date().toISOString();
  return {
    version: CURRENT_STATE_VERSION,
    familyId,
    kids: [],
    parentProfiles: [],
    transactions: [],
    goals: [],
    bounties: [],
    streaks: [],
    taxPots: [],
    investments: [],
    withdrawalRequests: [],
    parentSettings: {
      hysaApr: 0.036,
      cdApr: 0.045,
      taxRate: 0.05,
      dadMatchMilestones: [
        { weeks: 4, bonus: 5 },
        { weeks: 8, bonus: 10 },
        { weeks: 12, bonus: 20 },
      ],
    },
    reconciliation: {
      actualHysaBalances: [],
      cashAdjustments: [],
    },
    updatedAt: now,
  };
}
