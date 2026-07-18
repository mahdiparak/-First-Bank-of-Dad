import type { DadMatchMilestone, FamilyBankState, KidProfile, ParentSettings, TransactionSource } from "./schema";

function touch(state: FamilyBankState): FamilyBankState {
  return { ...state, updatedAt: new Date().toISOString() };
}

export function totalBalanceForKid(state: FamilyBankState, kidId: string): number {
  return state.transactions
    .filter((transaction) => transaction.kidId === kidId)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function savedTowardGoalsForKid(state: FamilyBankState, kidId: string): number {
  return state.goals
    .filter((goal) => goal.kidId === kidId)
    .reduce((total, goal) => total + goal.savedAmount, 0);
}

export function pendingWithdrawalsForKid(state: FamilyBankState, kidId: string): number {
  return state.withdrawalRequests
    .filter((request) => request.kidId === kidId && request.status === "pending")
    .reduce((total, request) => total + request.amount, 0);
}

/** Balance not already earmarked toward a goal or a pending withdrawal request. */
export function availableBalanceForKid(state: FamilyBankState, kidId: string): number {
  return (
    totalBalanceForKid(state, kidId) - savedTowardGoalsForKid(state, kidId) - pendingWithdrawalsForKid(state, kidId)
  );
}

export function addKid(
  state: FamilyBankState,
  input: { name: string; age: number; weeklyAllowance: number; paydayWeekday: number },
): FamilyBankState {
  const kid: KidProfile = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  return touch({
    ...state,
    kids: [...state.kids, kid],
    taxPots: [...state.taxPots, { kidId: kid.id, balance: 0, rate: state.parentSettings.taxRate }],
    streaks: [...state.streaks, { kidId: kid.id, weeksWithoutWithdrawal: 0 }],
  });
}

export function recordTransaction(
  state: FamilyBankState,
  kidId: string,
  amount: number,
  category: string,
  source: TransactionSource,
  memo?: string,
  createdAt: string = new Date().toISOString(),
): FamilyBankState {
  return touch({
    ...state,
    transactions: [
      ...state.transactions,
      {
        id: crypto.randomUUID(),
        kidId,
        amount,
        category,
        memo,
        source,
        createdAt,
      },
    ],
  });
}

/** Kid-side: asks a parent for money to spend. Nothing leaves the balance until approved. */
export function requestWithdrawal(
  state: FamilyBankState,
  kidId: string,
  amount: number,
  category: string,
  reason?: string,
): FamilyBankState {
  if (amount <= 0) throw new Error("Amount must be positive.");
  const available = availableBalanceForKid(state, kidId);
  if (amount > available) throw new Error("That's more than the available balance.");

  return touch({
    ...state,
    withdrawalRequests: [
      ...state.withdrawalRequests,
      {
        id: crypto.randomUUID(),
        kidId,
        amount,
        category,
        reason,
        status: "pending",
        requestedAt: new Date().toISOString(),
      },
    ],
  });
}

/** Parent-side: approves a pending withdrawal, which is what actually debits the kid's balance. */
export function approveWithdrawal(state: FamilyBankState, requestId: string): FamilyBankState {
  const request = state.withdrawalRequests.find((candidate) => candidate.id === requestId);
  if (!request || request.status !== "pending") throw new Error("Nothing to approve.");

  const now = new Date().toISOString();
  const withTransaction = recordTransaction(
    state,
    request.kidId,
    -request.amount,
    request.category,
    "manual-withdrawal",
    request.reason,
  );

  return {
    ...withTransaction,
    streaks: withTransaction.streaks.map((streak) =>
      streak.kidId === request.kidId ? { ...streak, lastWithdrawalAt: now } : streak,
    ),
    withdrawalRequests: withTransaction.withdrawalRequests.map((candidate) =>
      candidate.id === requestId ? { ...candidate, status: "approved", resolvedAt: now } : candidate,
    ),
  };
}

/** Parent-side: denies a pending withdrawal. Nothing changes for the kid's balance. */
export function denyWithdrawal(state: FamilyBankState, requestId: string): FamilyBankState {
  const now = new Date().toISOString();
  return touch({
    ...state,
    withdrawalRequests: state.withdrawalRequests.map((candidate) =>
      candidate.id === requestId ? { ...candidate, status: "denied", resolvedAt: now } : candidate,
    ),
  });
}

export function createGoal(
  state: FamilyBankState,
  kidId: string,
  name: string,
  targetAmount: number,
): FamilyBankState {
  if (targetAmount <= 0) throw new Error("Goal target must be positive.");
  return touch({
    ...state,
    goals: [
      ...state.goals,
      {
        id: crypto.randomUUID(),
        kidId,
        name,
        targetAmount,
        savedAmount: 0,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}

/** Moves money between "available" and a goal's earmark. Positive delta = save toward the goal. */
export function allocateToGoal(state: FamilyBankState, goalId: string, delta: number): FamilyBankState {
  const goal = state.goals.find((candidate) => candidate.id === goalId);
  if (!goal) throw new Error("Goal not found.");

  if (delta > 0 && delta > availableBalanceForKid(state, goal.kidId)) {
    throw new Error("Not enough available balance to save that much.");
  }
  if (delta < 0 && -delta > goal.savedAmount) {
    throw new Error("Can't take out more than what's saved.");
  }

  const now = new Date().toISOString();
  return touch({
    ...state,
    goals: state.goals.map((candidate) =>
      candidate.id === goalId
        ? {
            ...candidate,
            savedAmount: candidate.savedAmount + delta,
            completedAt:
              candidate.savedAmount + delta >= candidate.targetAmount ? now : candidate.completedAt,
          }
        : candidate,
    ),
  });
}

/** Parent-only: change a kid's allowance amount and/or payday. */
export function updateKidAllowance(
  state: FamilyBankState,
  kidId: string,
  weeklyAllowance: number,
  paydayWeekday: number,
): FamilyBankState {
  if (weeklyAllowance < 0) throw new Error("Allowance can't be negative.");
  return touch({
    ...state,
    kids: state.kids.map((kid) => (kid.id === kidId ? { ...kid, weeklyAllowance, paydayWeekday } : kid)),
  });
}

/** Parent-only: the HYSA/CD rates, Family Tax rate, and Dad Match milestones. */
export function updateParentSettings(
  state: FamilyBankState,
  patch: Partial<Omit<ParentSettings, "parentPinHash">>,
): FamilyBankState {
  return touch({ ...state, parentSettings: { ...state.parentSettings, ...patch } });
}

export function setDadMatchMilestones(
  state: FamilyBankState,
  milestones: DadMatchMilestone[],
): FamilyBankState {
  return updateParentSettings(state, {
    dadMatchMilestones: milestones.slice().sort((a, b) => a.weeks - b.weeks),
  });
}

/** Sets, changes, or (passing null) removes the PIN gating Kid View -> Parent Command Center. */
export function setParentPinHash(state: FamilyBankState, pinHash: string | null): FamilyBankState {
  const parentSettings = { ...state.parentSettings };
  if (pinHash) {
    parentSettings.parentPinHash = pinHash;
  } else {
    delete parentSettings.parentPinHash;
  }
  return touch({ ...state, parentSettings });
}

/** Parent-side: posts a new gig on the Bounty Board. */
export function createBounty(state: FamilyBankState, title: string, reward: number): FamilyBankState {
  if (reward <= 0) throw new Error("Reward must be positive.");
  return touch({
    ...state,
    bounties: [...state.bounties, { id: crypto.randomUUID(), title, reward, status: "open" }],
  });
}

/** Kid-side: claims an open bounty, putting it in the parent's approval queue. */
export function claimBounty(state: FamilyBankState, bountyId: string, kidId: string): FamilyBankState {
  const bounty = state.bounties.find((candidate) => candidate.id === bountyId);
  if (!bounty || bounty.status !== "open") throw new Error("That bounty isn't available anymore.");

  return touch({
    ...state,
    bounties: state.bounties.map((candidate) =>
      candidate.id === bountyId
        ? { ...candidate, status: "pending-approval", claimedByKidId: kidId, claimedAt: new Date().toISOString() }
        : candidate,
    ),
  });
}

/** Parent-side: approves a claimed bounty, which pays out the reward to the kid who claimed it. */
export function approveBounty(state: FamilyBankState, bountyId: string): FamilyBankState {
  const bounty = state.bounties.find((candidate) => candidate.id === bountyId);
  if (!bounty || bounty.status !== "pending-approval" || !bounty.claimedByKidId) {
    throw new Error("Nothing to approve.");
  }

  const now = new Date().toISOString();
  const withPayout = recordTransaction(state, bounty.claimedByKidId, bounty.reward, "💪", "bounty", bounty.title);

  return {
    ...withPayout,
    bounties: withPayout.bounties.map((candidate) =>
      candidate.id === bountyId ? { ...candidate, status: "approved", resolvedAt: now } : candidate,
    ),
  };
}

/** Parent-side: denies a claim and reopens the bounty for anyone to try again. */
export function denyBounty(state: FamilyBankState, bountyId: string): FamilyBankState {
  return touch({
    ...state,
    bounties: state.bounties.map((candidate) =>
      candidate.id === bountyId
        ? { ...candidate, status: "open", claimedByKidId: undefined, claimedAt: undefined }
        : candidate,
    ),
  });
}

/** The sum of every kid's cash balance plus the current value of their mock investments. */
export function virtualAppBalance(state: FamilyBankState): number {
  const cash = state.kids.reduce((total, kid) => total + totalBalanceForKid(state, kid.id), 0);
  const investments = state.investments.reduce((total, position) => total + position.currentValue, 0);
  return cash + investments;
}

function sumCashAdjustments(state: FamilyBankState): number {
  return state.reconciliation.cashAdjustments.reduce((total, adjustment) => total + adjustment.amount, 0);
}

/**
 * What the parent still owes the kids beyond what's actually sitting in the real HYSA —
 * i.e. how much more real money needs to move into the account (or how much surplus exists,
 * if negative). Cash adjustments are manual corrections for money already reconciled outside
 * a specific kid's ledger (e.g. bank-paid interest not yet reflected).
 */
export function parentCashLiability(state: FamilyBankState): number {
  return virtualAppBalance(state) - state.reconciliation.actualHysaBalance - sumCashAdjustments(state);
}

/** Parent-side: records what the real HYSA balance actually is right now. */
export function setActualHysaBalance(state: FamilyBankState, amount: number): FamilyBankState {
  return touch({
    ...state,
    reconciliation: { ...state.reconciliation, actualHysaBalance: amount, lastUpdatedAt: new Date().toISOString() },
  });
}

/**
 * Parent-side: records a real, physical cash movement tied to a specific kid — e.g. a kid
 * handed over birthday cash (positive) or the parent bought something with cash instead of
 * from the HYSA (negative). This adjusts the kid's virtual balance directly.
 */
export function recordCashMovementForKid(
  state: FamilyBankState,
  kidId: string,
  amount: number,
  note?: string,
): FamilyBankState {
  if (amount === 0) throw new Error("Amount can't be zero.");
  const source: TransactionSource = amount > 0 ? "manual-deposit" : "manual-withdrawal";
  return recordTransaction(state, kidId, amount, "💵", source, note);
}

/** Parent-side: a general reconciliation note not tied to any one kid (e.g. bank-paid interest). */
export function addCashAdjustment(state: FamilyBankState, amount: number, note?: string): FamilyBankState {
  if (amount === 0) throw new Error("Amount can't be zero.");
  return touch({
    ...state,
    reconciliation: {
      ...state.reconciliation,
      cashAdjustments: [
        ...state.reconciliation.cashAdjustments,
        { id: crypto.randomUUID(), amount, note, createdAt: new Date().toISOString() },
      ],
    },
  });
}

export function removeCashAdjustment(state: FamilyBankState, adjustmentId: string): FamilyBankState {
  return touch({
    ...state,
    reconciliation: {
      ...state.reconciliation,
      cashAdjustments: state.reconciliation.cashAdjustments.filter(
        (adjustment) => adjustment.id !== adjustmentId,
      ),
    },
  });
}
