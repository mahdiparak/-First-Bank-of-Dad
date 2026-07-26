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
  /** Overrides the age-based UI choice. "auto" (or unset) picks by age against YOUNG_KID_MAX_AGE. */
  viewMode?: "auto" | "kid" | "teen";
  /** Optional PIN (SHA-256 hash) a kid enters after email login to open their own Kid View. Unset = no PIN needed — fine for a younger kid on a shared/trusted device. */
  pinHash?: string;
  /** Badge ids a parent has manually hidden (e.g. awarded by a data mistake). Badges are otherwise fully recomputed from state, never stored — this is the one override. */
  hiddenBadgeIds?: string[];
  /**
   * Which kinds of investing a parent has switched on for this kid. Unset means the age default
   * (see unlockedAssetClassesFor): an older kid has everything, a little kid has nothing until a
   * parent says otherwise.
   */
  unlockedAssetClasses?: AssetClass[];
  /** When this kid finished (or skipped) their course. Unset = show it the first time they open their view. */
  trainingSeenAt?: string;
}

/** Kids under this age get the simplified, picture-first UI. */
export const YOUNG_KID_MAX_AGE = 7;

/** Whether this kid should see the big, simplified single-screen UI rather than the full tabbed dashboard. */
export function isYoungKidView(kid: KidProfile): boolean {
  if (kid.viewMode === "kid") return true;
  if (kid.viewMode === "teen") return false;
  return kid.age <= YOUNG_KID_MAX_AGE;
}

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
  /** Optional — collected during onboarding for parity with kids; purely informational. */
  age?: number;
  createdAt: string;
  /** Matches Cloudflare Access identity so logging in with this email auto-opens this parent's dashboard. */
  email?: string;
  /** This parent's own PIN (SHA-256 hash) for the Kid View -> Parent switch. Falls back to the shared parentSettings.parentPinHash if unset. */
  pinHash?: string;
  /** When they finished (or skipped) the parent course. Unset = show it on first run. */
  trainingSeenAt?: string;
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
  /** Dollars auto-set-aside from each allowance payday toward this goal. Unset/0 = manual saving only. */
  weeklyContribution?: number;
}

/**
 * Money a kid has earned (currently only from an approved quest) but hasn't put in the bank yet.
 * The kid decides how to split it — some/all toward a goal, the rest to their main account —
 * before it becomes a real transaction.
 */
export interface Envelope {
  id: string;
  kidId: string;
  amount: number;
  /** What this envelope is for, e.g. the quest title — shown on the envelope itself. */
  title: string;
  bountyId?: string;
  createdAt: string;
  /** Set once the kid has split and deposited the envelope's money. */
  openedAt?: string;
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
  icon?: string; // emoji
}

export const QUEST_ICONS = [
  "🧹", "🧺", "🍽️", "🐕", "🌱", "🚗", "🛏️", "🧽", "🗑️", "📚", "🎨", "📦", "🪟", "⭐", "🏃", "📵",
] as const;

export function questIcon(bounty: Bounty): string {
  return bounty.icon ?? QUEST_ICONS[hashIndex(bounty.id, QUEST_ICONS.length)];
}

export interface QuestTier {
  label: string;
  stars: string;
  color: string;
}

/** Turns a reward amount into a game-style difficulty badge — purely a presentation layer over the existing dollar value, no new data. */
export function questTier(reward: number): QuestTier {
  if (reward < 3) return { label: "Easy", stars: "⭐", color: "#22c55e" };
  if (reward < 7) return { label: "Medium", stars: "⭐⭐", color: "#f59e0b" };
  return { label: "Hard", stars: "⭐⭐⭐", color: "#a855f7" };
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
  /** Lifetime total ever withheld into this pot — unlike `balance`, a tax refund never reduces this. */
  totalPaid: number;
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

export interface AssetClassMeta {
  label: string;
  /** The short name on its own, without the nickname — for tight spots like a chart legend. */
  shortLabel: string;
  emoji: string;
  description: string;
  /** The plain-English "what is this, really" a kid reads before choosing it. */
  howItWorks: string;
  ride: "flat" | "gentle" | "bumpy" | "wild";
}

/**
 * A standing "every payday, put this much to work" instruction the kid sets for themselves — the
 * investing counterpart to a goal's weekly auto-save. One rule per asset class per kid; setting an
 * amount of 0 removes it. Deliberately not parent-gated: the money is already theirs and every
 * individual investment it makes follows the same rules (minimum hold, CD lock) as a manual one.
 */
export interface AutoInvestRule {
  id: string;
  kidId: string;
  assetClass: AssetClass;
  /** Dollars moved into this asset class out of each payday. */
  weeklyAmount: number;
  /** CD only — how long each payday's slice gets locked up for. */
  lockWeeks?: number;
  createdAt: string;
}

export const ASSET_CLASSES: Record<AssetClass, AssetClassMeta> = {
  savings: {
    label: "Savings (The Bicycle)",
    shortLabel: "Savings",
    emoji: "🚲",
    description: "Steady and safe — the real HYSA rate, no crashes.",
    howItWorks:
      "The bank pays you a little bit every week just for leaving your money there. It never goes down — it just climbs, slowly, like pedaling a bike. You can take it out whenever you want.",
    ride: "flat",
  },
  cd: {
    label: "CD (The Time Vault)",
    shortLabel: "CD",
    emoji: "🔒",
    description: "A higher fixed rate, but your money is locked up for a while.",
    howItWorks:
      "You promise the bank you won't touch your money for a set number of weeks. Because you promised, it pays you a better rate than plain savings. Break the promise early and you keep your money, but you lose the extra you earned.",
    ride: "gentle",
  },
  stocks: {
    label: "Stocks (The Rollercoaster)",
    shortLabel: "Stocks",
    emoji: "🎢",
    description: "Ups and downs like the real stock market.",
    howItWorks:
      "You own a tiny slice of real companies. Some days that slice is worth more, some days less — this app moves it using how the real stock market has actually behaved. Over a long time it usually goes up, but there is no promise, and some weeks are scary.",
    ride: "bumpy",
  },
  crypto: {
    label: "Crypto (The Rocket Booster)",
    shortLabel: "Crypto",
    emoji: "🚀",
    description: "Huge swings — big gains, big drops.",
    howItWorks:
      "The wildest ride here. It can jump way up in a week and fall just as far the next. People have made a lot and lost a lot. Only put in money you'd be OK watching shrink for a while.",
    ride: "wild",
  },
};

/**
 * What an asset class looks like when this build doesn't know it — a position synced from a newer
 * version, or a hand-edited/imported backup. The screens read metadata off whatever positions the
 * state actually holds, so an unknown class must degrade to a real row a kid can still cash out,
 * never to an undefined lookup that takes the whole dashboard down.
 */
const UNKNOWN_ASSET_CLASS: AssetClassMeta = {
  label: "Investment",
  shortLabel: "Investment",
  emoji: "❔",
  description: "An investment this version of the app doesn't recognise.",
  howItWorks: "This came from another device running a different version of the app.",
  ride: "bumpy",
};

export function assetClassMeta(assetClass: AssetClass): AssetClassMeta {
  // hasOwn, not a plain lookup: a position carrying "constructor" or "toString" as its class would
  // otherwise resolve to something off Object.prototype instead of falling back.
  return Object.hasOwn(ASSET_CLASSES, assetClass) ? ASSET_CLASSES[assetClass] : UNKNOWN_ASSET_CLASS;
}

export const ALL_ASSET_CLASSES: AssetClass[] = ["savings", "cd", "stocks", "crypto"];

/** The two that can't lose money — where a little kid starts, and the easiest yes for a parent. */
export const NO_LOSS_ASSET_CLASSES: AssetClass[] = ["savings", "cd"];

/**
 * Whether this kind of investing reaches past what the little-kid screens are pitched at. "Your
 * money went down and there's nothing you can do" is a hard lesson for a six-year-old, so the
 * rollercoaster and the rocket carry a warning on a little kid's card — but a parent who thinks
 * their kid is ready can still switch them on. The app advises here; it doesn't decide.
 */
export function isAdvancedForAge(kid: KidProfile, assetClass: AssetClass): boolean {
  return isYoungKidView(kid) && !NO_LOSS_ASSET_CLASSES.includes(assetClass);
}

/**
 * What this kid can actually put money into right now. An older kid starts with everything (the
 * behaviour every existing family already has); a little kid starts with nothing until a parent
 * turns something on for them. From there any of the four can be switched on or off for any kid,
 * at any age — the parent's call, not the app's.
 */
export function unlockedAssetClassesFor(kid: KidProfile): AssetClass[] {
  if (!kid.unlockedAssetClasses) return isYoungKidView(kid) ? [] : [...ALL_ASSET_CLASSES];
  return ALL_ASSET_CLASSES.filter((assetClass) => kid.unlockedAssetClasses?.includes(assetClass));
}

export function isAssetClassUnlocked(kid: KidProfile, assetClass: AssetClass): boolean {
  return unlockedAssetClassesFor(kid).includes(assetClass);
}

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

export type AuditActorRole = "parent" | "kid";

/** Whoever triggered a logged action — the signed-in kid, or the parent using this device. */
export interface AuditActor {
  role: AuditActorRole;
  name: string;
}

/** Enough structured detail to cleanly reverse a specific logged action, rather than guessing from its summary text. */
export type AuditUndo =
  | { kind: "remove-transaction"; transactionId: string }
  | { kind: "remove-investment"; positionId: string; transactionId: string }
  | { kind: "reopen-investment"; positionId: string; transactionId: string; previousCurrentValue: number }
  | { kind: "delete-goal"; goalId: string }
  | { kind: "revert-withdrawal-approval"; requestId: string; transactionId: string; goalId?: string; goalAmount?: number }
  | { kind: "revert-bounty-claim"; bountyId: string }
  | { kind: "revert-bounty-approval"; bountyId: string; transactionId: string }
  | { kind: "revert-bounty-envelope"; bountyId: string; envelopeId: string }
  | { kind: "revert-envelope-open"; envelopeId: string; transactionId: string; goalAllocations: { goalId: string; amount: number }[] }
  | { kind: "restore-tax-pot"; kidId: string; transactionId: string; previousBalance: number };

/** One entry in the family's activity log — who did what, and (when possible) how to undo it. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: AuditActor;
  kidId?: string;
  summary: string;
  undo?: AuditUndo;
  undoneAt?: string;
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
  /** Minimum days a kid must hold ANY investment before cashing it out — stops "invest then instantly
   *  take it back" and teaches that money put to work is committed for a while. 0 disables it. */
  investmentMinHoldDays: number;
  /** SHA-256 hash gating Kid View -> Parent Command Center. Unset = no gate. */
  parentPinHash?: string;
}

/** Default minimum investment hold, used for new families and backfilled onto older ones. */
export const DEFAULT_INVESTMENT_MIN_HOLD_DAYS = 7;

export interface FamilyBankState {
  version: number;
  familyId: string;
  kids: KidProfile[];
  parentProfiles: ParentProfile[];
  transactions: Transaction[];
  goals: SavingsGoal[];
  envelopes: Envelope[];
  bounties: Bounty[];
  streaks: StreakState[];
  taxPots: TaxPot[];
  investments: InvestmentPosition[];
  autoInvestRules: AutoInvestRule[];
  withdrawalRequests: WithdrawalRequest[];
  parentSettings: ParentSettings;
  reconciliation: ReconciliationSnapshot;
  auditLog: AuditEntry[];
  updatedAt: string;
}

export const CURRENT_STATE_VERSION = 1;

/**
 * Migrates state loaded from an older deploy so newer code never trips over a missing field.
 * - `reconciliation.actualHysaBalance` (single family-wide number) is replaced by the per-kid
 *   `actualHysaBalances` array. Rather than guessing how to split the old lump sum, this resets
 *   to an empty per-kid list — the parent re-enters each kid's real balance once.
 * - `parentProfiles` defaults to an empty array if the state predates named parent profiles.
 * - `auditLog` defaults to an empty array if the state predates the activity log.
 * - `envelopes` defaults to an empty array if the state predates the quest-reward envelope flow.
 * - `autoInvestRules` defaults to an empty array if the state predates standing invest orders.
 */
export function normalizeState(state: FamilyBankState): FamilyBankState {
  const legacy = state as unknown as {
    parentProfiles?: ParentProfile[];
    reconciliation?: { actualHysaBalances?: KidHysaBalance[]; cashAdjustments?: CashAdjustment[] };
    auditLog?: AuditEntry[];
    envelopes?: Envelope[];
    autoInvestRules?: AutoInvestRule[];
    taxPots?: (TaxPot | Omit<TaxPot, "totalPaid">)[];
  };

  const needsReconciliationFix = !Array.isArray(legacy.reconciliation?.actualHysaBalances);
  const needsParentProfiles = !Array.isArray(legacy.parentProfiles);
  const needsAuditLog = !Array.isArray(legacy.auditLog);
  const needsEnvelopes = !Array.isArray(legacy.envelopes);
  const needsAutoInvest = !Array.isArray(legacy.autoInvestRules);
  const needsTaxPotTotals = (legacy.taxPots ?? []).some((pot) => typeof (pot as TaxPot).totalPaid !== "number");
  const needsMinHold = typeof state.parentSettings.investmentMinHoldDays !== "number";
  if (
    !needsReconciliationFix &&
    !needsParentProfiles &&
    !needsAuditLog &&
    !needsEnvelopes &&
    !needsTaxPotTotals &&
    !needsMinHold &&
    !needsAutoInvest
  ) {
    return state;
  }

  return {
    ...state,
    parentProfiles: needsParentProfiles ? [] : state.parentProfiles,
    parentSettings: needsMinHold
      ? { ...state.parentSettings, investmentMinHoldDays: DEFAULT_INVESTMENT_MIN_HOLD_DAYS }
      : state.parentSettings,
    reconciliation: needsReconciliationFix
      ? { actualHysaBalances: [], cashAdjustments: legacy.reconciliation?.cashAdjustments ?? [] }
      : state.reconciliation,
    auditLog: needsAuditLog ? [] : state.auditLog,
    envelopes: needsEnvelopes ? [] : state.envelopes,
    autoInvestRules: needsAutoInvest ? [] : state.autoInvestRules,
    // Pre-existing installs have no record of tax withheld before this field existed — the
    // current pot balance (what hasn't been refunded yet) is the best floor we can backfill.
    taxPots: needsTaxPotTotals
      ? state.taxPots.map((pot) => ({ ...pot, totalPaid: typeof pot.totalPaid === "number" ? pot.totalPaid : pot.balance }))
      : state.taxPots,
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
    envelopes: [],
    bounties: [],
    streaks: [],
    taxPots: [],
    investments: [],
    autoInvestRules: [],
    withdrawalRequests: [],
    parentSettings: {
      hysaApr: 0.036,
      cdApr: 0.045,
      taxRate: 0.05,
      investmentMinHoldDays: DEFAULT_INVESTMENT_MIN_HOLD_DAYS,
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
    auditLog: [],
    updatedAt: now,
  };
}
