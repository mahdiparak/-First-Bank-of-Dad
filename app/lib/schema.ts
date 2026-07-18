export interface KidProfile {
  id: string;
  name: string;
  age: number;
  weeklyAllowance: number;
  paydayWeekday: number; // 0 = Sunday ... 6 = Saturday
  createdAt: string;
  lastAllowancePaidAt?: string;
}

export type TransactionSource =
  | "allowance"
  | "bounty"
  | "tax"
  | "dad-match"
  | "manual-deposit"
  | "manual-withdrawal"
  | "goal"
  | "investment";

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
  lockWeeks?: number; // CD only
  maturesAt?: string; // CD only
}

export type WithdrawalStatus = "pending" | "approved" | "denied";

export interface WithdrawalRequest {
  id: string;
  kidId: string;
  amount: number;
  reason?: string;
  status: WithdrawalStatus;
  requestedAt: string;
  resolvedAt?: string;
}

export interface CashAdjustment {
  id: string;
  amount: number; // positive = kid gave dad physical cash, negative = dad paid out physical cash
  note?: string;
  createdAt: string;
}

export interface ReconciliationSnapshot {
  actualHysaBalance: number;
  lastUpdatedAt: string;
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
      actualHysaBalance: 0,
      lastUpdatedAt: now,
      cashAdjustments: [],
    },
    updatedAt: now,
  };
}
