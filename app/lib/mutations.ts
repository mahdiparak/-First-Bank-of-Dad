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

/** Balance not already earmarked toward a savings goal — what a kid can freely spend or allocate. */
export function availableBalanceForKid(state: FamilyBankState, kidId: string): number {
  return totalBalanceForKid(state, kidId) - savedTowardGoalsForKid(state, kidId);
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

export function logPurchase(
  state: FamilyBankState,
  kidId: string,
  amount: number,
  category: string,
  memo?: string,
): FamilyBankState {
  if (amount <= 0) throw new Error("Purchase amount must be positive.");
  const available = availableBalanceForKid(state, kidId);
  if (amount > available) throw new Error("That's more than the available balance.");

  const withTransaction = recordTransaction(state, kidId, -amount, category, "manual-withdrawal", memo);
  const now = new Date().toISOString();
  return {
    ...withTransaction,
    streaks: withTransaction.streaks.map((streak) =>
      streak.kidId === kidId
        ? { ...streak, weeksWithoutWithdrawal: 0, lastWithdrawalAt: now }
        : streak,
    ),
  };
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
