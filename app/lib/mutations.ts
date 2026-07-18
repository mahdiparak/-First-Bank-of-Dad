import { KID_COLORS, type AssetClass, type DadMatchMilestone, type FamilyBankState, type KidProfile, type ParentSettings, type TransactionSource } from "./schema";

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
    // Goal-spend requests are excluded: that money is already earmarked by the goal itself.
    .filter((request) => request.kidId === kidId && request.status === "pending" && !request.goalId)
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
  input: { name: string; age: number; weeklyAllowance: number; paydayWeekday: number; avatar?: string },
): FamilyBankState {
  const kid: KidProfile = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    color: KID_COLORS[state.kids.length % KID_COLORS.length],
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

/**
 * Kid-side: asks to spend a completed goal's saved money. Approval spends the earmark and
 * deliberately does NOT reset the Dad Match streak — planned spending is the win condition,
 * not a failure.
 */
export function requestGoalSpend(state: FamilyBankState, goalId: string): FamilyBankState {
  const goal = state.goals.find((candidate) => candidate.id === goalId);
  if (!goal) throw new Error("Goal not found.");
  if (!goal.completedAt || goal.spentAt) throw new Error("This goal isn't ready to spend.");
  if (goal.savedAmount <= 0) throw new Error("Nothing saved in this goal.");
  if (state.withdrawalRequests.some((request) => request.goalId === goalId && request.status === "pending")) {
    throw new Error("Already asked — waiting for Dad.");
  }

  return touch({
    ...state,
    withdrawalRequests: [
      ...state.withdrawalRequests,
      {
        id: crypto.randomUUID(),
        kidId: goal.kidId,
        amount: goal.savedAmount,
        category: "🎯",
        reason: `Goal: ${goal.name}`,
        status: "pending",
        requestedAt: new Date().toISOString(),
        goalId,
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
    // A goal-spend is planned spending: it releases the goal's earmark and leaves the streak intact.
    streaks: request.goalId
      ? withTransaction.streaks
      : withTransaction.streaks.map((streak) =>
          streak.kidId === request.kidId ? { ...streak, lastWithdrawalAt: now } : streak,
        ),
    goals: request.goalId
      ? withTransaction.goals.map((goal) =>
          goal.id === request.goalId ? { ...goal, savedAmount: 0, spentAt: now } : goal,
        )
      : withTransaction.goals,
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

/** Parent-only: rename a kid or change their avatar/color. */
export function updateKidProfile(
  state: FamilyBankState,
  kidId: string,
  patch: { name?: string; avatar?: string; color?: string; age?: number },
): FamilyBankState {
  return touch({
    ...state,
    kids: state.kids.map((kid) => (kid.id === kidId ? { ...kid, ...patch } : kid)),
  });
}

/** Parent-only: removes a kid and everything tied to them. Irreversible — the UI must confirm. */
export function removeKid(state: FamilyBankState, kidId: string): FamilyBankState {
  return touch({
    ...state,
    kids: state.kids.filter((kid) => kid.id !== kidId),
    transactions: state.transactions.filter((transaction) => transaction.kidId !== kidId),
    goals: state.goals.filter((goal) => goal.kidId !== kidId),
    streaks: state.streaks.filter((streak) => streak.kidId !== kidId),
    taxPots: state.taxPots.filter((pot) => pot.kidId !== kidId),
    investments: state.investments.filter((position) => position.kidId !== kidId),
    withdrawalRequests: state.withdrawalRequests.filter((request) => request.kidId !== kidId),
    bounties: state.bounties.map((bounty) =>
      bounty.claimedByKidId === kidId && bounty.status === "pending-approval"
        ? { ...bounty, status: "open" as const, claimedByKidId: undefined, claimedAt: undefined }
        : bounty,
    ),
  });
}

/** Deletes a goal; any earmarked money automatically returns to the available balance. */
export function deleteGoal(state: FamilyBankState, goalId: string): FamilyBankState {
  if (state.withdrawalRequests.some((request) => request.goalId === goalId && request.status === "pending")) {
    throw new Error("A spend request for this goal is waiting for approval.");
  }
  return touch({ ...state, goals: state.goals.filter((goal) => goal.id !== goalId) });
}

/** Parent-only: removes an open (unclaimed) bounty from the board. */
export function deleteBounty(state: FamilyBankState, bountyId: string): FamilyBankState {
  const bounty = state.bounties.find((candidate) => candidate.id === bountyId);
  if (!bounty || bounty.status !== "open") throw new Error("Only open bounties can be removed.");
  return touch({ ...state, bounties: state.bounties.filter((candidate) => candidate.id !== bountyId) });
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

/** The sum of every kid's cash balance plus the current value of their still-open mock investments. */
export function virtualAppBalance(state: FamilyBankState): number {
  const cash = state.kids.reduce((total, kid) => total + totalBalanceForKid(state, kid.id), 0);
  const investments = state.investments
    .filter((position) => !position.closedAt)
    .reduce((total, position) => total + position.currentValue, 0);
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

/** Parent-side: pays out a kid's accumulated Family Tax pot as a reward, then zeroes it out. */
export function payTaxRefund(state: FamilyBankState, kidId: string): FamilyBankState {
  const pot = state.taxPots.find((candidate) => candidate.kidId === kidId);
  if (!pot || pot.balance <= 0) throw new Error("Nothing in the tax pot to refund.");

  const withCredit = recordTransaction(state, kidId, pot.balance, "🧾", "tax", "Tax Refund");
  return touch({
    ...withCredit,
    taxPots: withCredit.taxPots.map((candidate) => (candidate.kidId === kidId ? { ...candidate, balance: 0 } : candidate)),
  });
}

const CD_EMOJI_BY_ASSET: Record<AssetClass, string> = {
  savings: "🚲",
  cd: "🔒",
  stocks: "🎢",
  crypto: "🚀",
};

/** Moves real balance into a mock investment position — this is what the kid actually "owns" less. */
export function allocateToInvestment(
  state: FamilyBankState,
  kidId: string,
  assetClass: AssetClass,
  amount: number,
  lockWeeks?: number,
): FamilyBankState {
  if (amount <= 0) throw new Error("Amount must be positive.");
  if (amount > availableBalanceForKid(state, kidId)) {
    throw new Error("That's more than the available balance.");
  }

  const now = new Date().toISOString();
  const withDebit = recordTransaction(
    state,
    kidId,
    -amount,
    CD_EMOJI_BY_ASSET[assetClass],
    "investment",
    `Invested in ${assetClass}`,
  );

  const maturesAt =
    assetClass === "cd" && lockWeeks
      ? new Date(Date.now() + lockWeeks * 7 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

  return touch({
    ...withDebit,
    investments: [
      ...withDebit.investments,
      {
        id: crypto.randomUUID(),
        kidId,
        assetClass,
        principal: amount,
        currentValue: amount,
        openedAt: now,
        lastGrowthUpdateAt: now,
        lockWeeks: assetClass === "cd" ? lockWeeks : undefined,
        maturesAt,
      },
    ],
  });
}

/**
 * Cashes out an investment position back into spendable balance. A CD withdrawn before its
 * maturity date forfeits any gains beyond the original principal — the "penalty for early
 * withdrawal" the CD trades its higher rate for.
 */
export function withdrawFromInvestment(state: FamilyBankState, positionId: string): FamilyBankState {
  const position = state.investments.find((candidate) => candidate.id === positionId);
  if (!position || position.closedAt) throw new Error("Investment not found.");

  const now = new Date().toISOString();
  const isEarlyCdWithdrawal =
    position.assetClass === "cd" && position.maturesAt && new Date(position.maturesAt) > new Date(now);
  const payout = isEarlyCdWithdrawal ? Math.min(position.currentValue, position.principal) : position.currentValue;

  const withCredit = recordTransaction(
    state,
    position.kidId,
    payout,
    CD_EMOJI_BY_ASSET[position.assetClass],
    "investment",
    isEarlyCdWithdrawal ? "Early CD withdrawal (forfeited interest)" : `Cashed out ${position.assetClass}`,
  );

  return touch({
    ...withCredit,
    investments: withCredit.investments.map((candidate) =>
      candidate.id === positionId ? { ...candidate, currentValue: payout, closedAt: now } : candidate,
    ),
  });
}
