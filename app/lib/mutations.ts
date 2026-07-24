import { KID_COLORS, type AssetClass, type AuditActor, type AuditUndo, type DadMatchMilestone, type FamilyBankState, type KidProfile, type ParentSettings, type TransactionSource } from "./schema";

function touch(state: FamilyBankState): FamilyBankState {
  return { ...state, updatedAt: new Date().toISOString() };
}

const MAX_AUDIT_ENTRIES = 300;

/** Appends one activity-log entry. Called after the state change it's describing, so the entry
 *  can reference IDs (a new transaction, a new position) the change just created. */
function logAudit(
  state: FamilyBankState,
  actor: AuditActor,
  summary: string,
  options: { kidId?: string; undo?: AuditUndo } = {},
): FamilyBankState {
  return touch({
    ...state,
    auditLog: [
      ...state.auditLog,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actor,
        kidId: options.kidId,
        summary,
        undo: options.undo,
      },
    ].slice(-MAX_AUDIT_ENTRIES),
  });
}

function kidName(state: FamilyBankState, kidId: string): string {
  return state.kids.find((kid) => kid.id === kidId)?.name ?? "this kid";
}

function goalName(state: FamilyBankState, goalId: string): string {
  return state.goals.find((goal) => goal.id === goalId)?.name ?? "a goal";
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
  input: {
    name: string;
    age: number;
    weeklyAllowance: number;
    paydayWeekday: number;
    avatar?: string;
    email?: string;
    /** Money the kid already has when they join — recorded as an opening deposit so history starts truthful. */
    startingBalance?: number;
  },
): FamilyBankState {
  const { startingBalance, ...profile } = input;
  const now = new Date().toISOString();
  const kid: KidProfile = {
    id: crypto.randomUUID(),
    createdAt: now,
    color: KID_COLORS[state.kids.length % KID_COLORS.length],
    ...profile,
  };
  const withKid = touch({
    ...state,
    kids: [...state.kids, kid],
    taxPots: [...state.taxPots, { kidId: kid.id, balance: 0, rate: state.parentSettings.taxRate, totalPaid: 0 }],
    streaks: [...state.streaks, { kidId: kid.id, weeksWithoutWithdrawal: 0 }],
  });
  if (!startingBalance || startingBalance <= 0) return withKid;
  return recordTransaction(withKid, kid.id, startingBalance, "🏦", "manual-deposit", "Starting balance", now);
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

/** Parent-side: erases a transaction entirely (e.g. a test entry), rather than offsetting it with a reversal. */
export function removeTransaction(state: FamilyBankState, transactionId: string): FamilyBankState {
  return touch({
    ...state,
    transactions: state.transactions.filter((transaction) => transaction.id !== transactionId),
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
export function approveWithdrawal(state: FamilyBankState, requestId: string, actor: AuditActor): FamilyBankState {
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
  const transactionId = withTransaction.transactions[withTransaction.transactions.length - 1].id;

  const approved: FamilyBankState = {
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

  return logAudit(
    approved,
    actor,
    `Approved ${kidName(state, request.kidId)}'s ${request.category} request for ${formatCurrency(request.amount)}`,
    {
      kidId: request.kidId,
      undo: {
        kind: "revert-withdrawal-approval",
        requestId,
        transactionId,
        goalId: request.goalId,
        goalAmount: request.goalId ? request.amount : undefined,
      },
    },
  );
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
  actor: AuditActor,
  weeklyContribution = 0,
): FamilyBankState {
  if (targetAmount <= 0) throw new Error("Goal target must be positive.");
  if (weeklyContribution < 0) throw new Error("Weekly savings amount can't be negative.");
  const goalId = crypto.randomUUID();
  const withGoal = touch({
    ...state,
    goals: [
      ...state.goals,
      {
        id: goalId,
        kidId,
        name,
        targetAmount,
        savedAmount: 0,
        createdAt: new Date().toISOString(),
        weeklyContribution: weeklyContribution > 0 ? weeklyContribution : undefined,
      },
    ],
  });
  const autoSaveNote = weeklyContribution > 0 ? `, auto-saving ${formatCurrency(weeklyContribution)}/wk` : "";
  return logAudit(
    withGoal,
    actor,
    `Created goal "${name}" (${formatCurrency(targetAmount)} target) for ${kidName(state, kidId)}${autoSaveNote}`,
    { kidId, undo: { kind: "delete-goal", goalId } },
  );
}

/** Kid/parent-side: sets (or clears, with 0) how much allowance auto-saves toward this goal each payday. */
export function setGoalWeeklyContribution(
  state: FamilyBankState,
  goalId: string,
  weeklyContribution: number,
): FamilyBankState {
  if (weeklyContribution < 0) throw new Error("Weekly savings amount can't be negative.");
  const goal = state.goals.find((candidate) => candidate.id === goalId);
  if (!goal) throw new Error("Goal not found.");
  return touch({
    ...state,
    goals: state.goals.map((candidate) =>
      candidate.id === goalId
        ? { ...candidate, weeklyContribution: weeklyContribution > 0 ? weeklyContribution : undefined }
        : candidate,
    ),
  });
}

/**
 * Moves money between "available" and a goal's earmark. Positive delta = save toward the goal.
 * `at` lets a caller backdate `completedAt` (e.g. allowance catch-up crediting a past payday)
 * instead of stamping it with the moment this function happens to run.
 */
export function allocateToGoal(
  state: FamilyBankState,
  goalId: string,
  delta: number,
  at: string = new Date().toISOString(),
): FamilyBankState {
  const goal = state.goals.find((candidate) => candidate.id === goalId);
  if (!goal) throw new Error("Goal not found.");

  if (delta > 0 && delta > availableBalanceForKid(state, goal.kidId)) {
    throw new Error("Not enough available balance to save that much.");
  }
  if (delta < 0 && -delta > goal.savedAmount) {
    throw new Error("Can't take out more than what's saved.");
  }

  return touch({
    ...state,
    goals: state.goals.map((candidate) =>
      candidate.id === goalId
        ? {
            ...candidate,
            savedAmount: candidate.savedAmount + delta,
            completedAt:
              candidate.savedAmount + delta >= candidate.targetAmount ? at : candidate.completedAt,
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

/** Adds a named parent/guardian profile, so a device can greet whoever's using it by name. */
export function addParentProfile(state: FamilyBankState, name: string, avatar?: string, age?: number): FamilyBankState {
  if (!name.trim()) throw new Error("Enter a name.");
  return touch({
    ...state,
    parentProfiles: [
      ...state.parentProfiles,
      { id: crypto.randomUUID(), name: name.trim(), avatar, age, createdAt: new Date().toISOString() },
    ],
  });
}

export function updateParentProfile(
  state: FamilyBankState,
  parentId: string,
  patch: { name?: string; avatar?: string; email?: string },
): FamilyBankState {
  return touch({
    ...state,
    parentProfiles: state.parentProfiles.map((parent) => (parent.id === parentId ? { ...parent, ...patch } : parent)),
  });
}

export function removeParentProfile(state: FamilyBankState, parentId: string): FamilyBankState {
  return touch({
    ...state,
    parentProfiles: state.parentProfiles.filter((parent) => parent.id !== parentId),
  });
}

/** Sets, changes, or (passing null) removes this parent's own PIN. Any parent can change any parent's PIN. */
export function setParentProfilePin(state: FamilyBankState, parentId: string, pinHash: string | null): FamilyBankState {
  return touch({
    ...state,
    parentProfiles: state.parentProfiles.map((parent) => {
      if (parent.id !== parentId) return parent;
      const next = { ...parent };
      if (pinHash) {
        next.pinHash = pinHash;
      } else {
        delete next.pinHash;
      }
      return next;
    }),
  });
}

/** Parent-only: rename a kid, change their avatar/color, or set the email for a kid with their own device. */
export function updateKidProfile(
  state: FamilyBankState,
  kidId: string,
  patch: { name?: string; avatar?: string; color?: string; age?: number; email?: string; viewMode?: KidProfile["viewMode"] },
): FamilyBankState {
  return touch({
    ...state,
    kids: state.kids.map((kid) => (kid.id === kidId ? { ...kid, ...patch } : kid)),
  });
}

/** Parent-only: sets, changes, or (passing null) removes a kid's own PIN for opening their Kid View. */
export function setKidPin(state: FamilyBankState, kidId: string, pinHash: string | null): FamilyBankState {
  return touch({
    ...state,
    kids: state.kids.map((kid) => {
      if (kid.id !== kidId) return kid;
      const next = { ...kid };
      if (pinHash) {
        next.pinHash = pinHash;
      } else {
        delete next.pinHash;
      }
      return next;
    }),
  });
}

/** Parent-only: hides or restores a badge that was awarded by mistake. Badges are otherwise fully
 *  recomputed from state, never stored — this just adds/removes one id from a per-kid override list. */
export function setBadgeHidden(
  state: FamilyBankState,
  kidId: string,
  badgeId: string,
  badgeTitle: string,
  hidden: boolean,
  actor: AuditActor,
): FamilyBankState {
  const updated = {
    ...state,
    kids: state.kids.map((kid) => {
      if (kid.id !== kidId) return kid;
      const hiddenBadgeIds = new Set(kid.hiddenBadgeIds ?? []);
      if (hidden) hiddenBadgeIds.add(badgeId);
      else hiddenBadgeIds.delete(badgeId);
      return { ...kid, hiddenBadgeIds: Array.from(hiddenBadgeIds) };
    }),
  };
  return logAudit(
    updated,
    actor,
    `${hidden ? "Removed" : "Restored"} ${kidName(state, kidId)}'s "${badgeTitle}" badge`,
    { kidId },
  );
}

/** Parent-only: removes a kid and everything tied to them. Irreversible — the UI must confirm. */
export function removeKid(state: FamilyBankState, kidId: string): FamilyBankState {
  return touch({
    ...state,
    kids: state.kids.filter((kid) => kid.id !== kidId),
    transactions: state.transactions.filter((transaction) => transaction.kidId !== kidId),
    goals: state.goals.filter((goal) => goal.kidId !== kidId),
    envelopes: state.envelopes.filter((envelope) => envelope.kidId !== kidId),
    streaks: state.streaks.filter((streak) => streak.kidId !== kidId),
    taxPots: state.taxPots.filter((pot) => pot.kidId !== kidId),
    investments: state.investments.filter((position) => position.kidId !== kidId),
    withdrawalRequests: state.withdrawalRequests.filter((request) => request.kidId !== kidId),
    bounties: state.bounties.map((bounty) =>
      bounty.claimedByKidId === kidId && bounty.status === "pending-approval"
        ? { ...bounty, status: "open" as const, claimedByKidId: undefined, claimedAt: undefined }
        : bounty,
    ),
    reconciliation: {
      ...state.reconciliation,
      actualHysaBalances: state.reconciliation.actualHysaBalances.filter((entry) => entry.kidId !== kidId),
    },
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

/** Parent-side: posts a new gig on the Quest Board. */
export function createBounty(state: FamilyBankState, title: string, reward: number, icon?: string): FamilyBankState {
  if (reward <= 0) throw new Error("Reward must be positive.");
  return touch({
    ...state,
    bounties: [...state.bounties, { id: crypto.randomUUID(), title, reward, status: "open", icon }],
  });
}

/** Kid-side: claims an open bounty, putting it in the parent's approval queue. */
export function claimBounty(state: FamilyBankState, bountyId: string, kidId: string, actor: AuditActor): FamilyBankState {
  const bounty = state.bounties.find((candidate) => candidate.id === bountyId);
  if (!bounty || bounty.status !== "open") throw new Error("That bounty isn't available anymore.");

  const claimed = touch({
    ...state,
    bounties: state.bounties.map((candidate) =>
      candidate.id === bountyId
        ? { ...candidate, status: "pending-approval", claimedByKidId: kidId, claimedAt: new Date().toISOString() }
        : candidate,
    ),
  });
  return logAudit(claimed, actor, `Claimed bounty "${bounty.title}" (${formatCurrency(bounty.reward)})`, {
    kidId,
    undo: { kind: "revert-bounty-claim", bountyId },
  });
}

/**
 * Parent-side: approves a claimed bounty. The reward doesn't land in the kid's balance yet — it
 * becomes an envelope the kid has to open and split between their goals and their main account,
 * so the "how much toward savings" decision is the kid's to make.
 */
export function approveBounty(state: FamilyBankState, bountyId: string, actor: AuditActor): FamilyBankState {
  const bounty = state.bounties.find((candidate) => candidate.id === bountyId);
  if (!bounty || bounty.status !== "pending-approval" || !bounty.claimedByKidId) {
    throw new Error("Nothing to approve.");
  }

  const now = new Date().toISOString();
  const envelopeId = crypto.randomUUID();
  const approved: FamilyBankState = touch({
    ...state,
    bounties: state.bounties.map((candidate) =>
      candidate.id === bountyId ? { ...candidate, status: "approved", resolvedAt: now } : candidate,
    ),
    envelopes: [
      ...state.envelopes,
      { id: envelopeId, kidId: bounty.claimedByKidId, amount: bounty.reward, title: bounty.title, bountyId, createdAt: now },
    ],
  });
  return logAudit(
    approved,
    actor,
    `Approved bounty "${bounty.title}" for ${kidName(state, bounty.claimedByKidId)} — sent as a ${formatCurrency(bounty.reward)} envelope`,
    { kidId: bounty.claimedByKidId, undo: { kind: "revert-bounty-envelope", bountyId, envelopeId } },
  );
}

/**
 * Kid-side: opens an earned envelope, splitting it between chosen goals and their main account.
 * `goalAllocations` amounts must not add up to more than the envelope — whatever's left over
 * goes straight to the main balance.
 */
export function resolveEnvelope(
  state: FamilyBankState,
  envelopeId: string,
  goalAllocations: { goalId: string; amount: number }[],
  actor: AuditActor,
): FamilyBankState {
  const envelope = state.envelopes.find((candidate) => candidate.id === envelopeId);
  if (!envelope || envelope.openedAt) throw new Error("This envelope is already open.");

  const allocations = goalAllocations.filter((allocation) => allocation.amount > 0);
  const totalToGoals = round2(allocations.reduce((total, allocation) => total + allocation.amount, 0));
  if (totalToGoals > envelope.amount) throw new Error("That's more than what's in the envelope.");

  for (const allocation of allocations) {
    const goal = state.goals.find((candidate) => candidate.id === allocation.goalId);
    if (!goal || goal.kidId !== envelope.kidId) throw new Error("Goal not found.");
    if (goal.completedAt) throw new Error(`"${goal.name}" is already full.`);
  }

  const now = new Date().toISOString();
  const withDeposit = recordTransaction(state, envelope.kidId, envelope.amount, "💌", "bounty", envelope.title, now);
  const transactionId = withDeposit.transactions[withDeposit.transactions.length - 1].id;

  let working = touch({
    ...withDeposit,
    envelopes: withDeposit.envelopes.map((candidate) =>
      candidate.id === envelopeId ? { ...candidate, openedAt: now } : candidate,
    ),
  });
  for (const allocation of allocations) {
    working = allocateToGoal(working, allocation.goalId, allocation.amount, now);
  }

  const mainAmount = round2(envelope.amount - totalToGoals);
  const summary = allocations.length
    ? `Opened envelope: ${formatCurrency(envelope.amount)} — ${allocations
        .map((allocation) => `${formatCurrency(allocation.amount)} to "${goalName(state, allocation.goalId)}"`)
        .join(", ")}, ${formatCurrency(mainAmount)} to main account`
    : `Opened envelope: ${formatCurrency(envelope.amount)} deposited to main account`;

  return logAudit(working, actor, summary, {
    kidId: envelope.kidId,
    undo: { kind: "revert-envelope-open", envelopeId, transactionId, goalAllocations: allocations },
  });
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

/** A single kid's cash balance plus the current value of their still-open mock investments. */
export function virtualBalanceForKid(state: FamilyBankState, kidId: string): number {
  const cash = totalBalanceForKid(state, kidId);
  const investments = state.investments
    .filter((position) => position.kidId === kidId && !position.closedAt)
    .reduce((total, position) => total + position.currentValue, 0);
  return cash + investments;
}

/** The sum of every kid's cash balance plus the current value of their still-open mock investments. */
export function virtualAppBalance(state: FamilyBankState): number {
  return state.kids.reduce((total, kid) => total + virtualBalanceForKid(state, kid.id), 0);
}

/** What's actually sitting in this kid's own real-world HYSA account (e.g. their Marcus account) right now. */
export function actualHysaBalanceForKid(state: FamilyBankState, kidId: string): number {
  return state.reconciliation.actualHysaBalances.find((entry) => entry.kidId === kidId)?.balance ?? 0;
}

function sumCashAdjustments(state: FamilyBankState): number {
  return state.reconciliation.cashAdjustments.reduce((total, adjustment) => total + adjustment.amount, 0);
}

/**
 * What the parent still owes this kid beyond what's actually sitting in their real HYSA — i.e.
 * how much more real money needs to move into their account (or how much surplus exists, if
 * negative).
 */
export function kidCashLiability(state: FamilyBankState, kidId: string): number {
  return virtualBalanceForKid(state, kidId) - actualHysaBalanceForKid(state, kidId);
}

/**
 * The family-wide total of every kid's liability, adjusted by general cash corrections not
 * tied to any one kid (e.g. bank-paid interest not yet reflected).
 */
export function parentCashLiability(state: FamilyBankState): number {
  const totalPerKid = state.kids.reduce((total, kid) => total + kidCashLiability(state, kid.id), 0);
  return totalPerKid - sumCashAdjustments(state);
}

/** Parent-side: records what a specific kid's real HYSA account balance actually is right now. */
export function setActualHysaBalanceForKid(state: FamilyBankState, kidId: string, amount: number): FamilyBankState {
  const now = new Date().toISOString();
  const existing = state.reconciliation.actualHysaBalances.some((entry) => entry.kidId === kidId);
  const actualHysaBalances = existing
    ? state.reconciliation.actualHysaBalances.map((entry) =>
        entry.kidId === kidId ? { ...entry, balance: amount, lastUpdatedAt: now } : entry,
      )
    : [...state.reconciliation.actualHysaBalances, { kidId, balance: amount, lastUpdatedAt: now }];

  return touch({ ...state, reconciliation: { ...state.reconciliation, actualHysaBalances } });
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
  note: string | undefined,
  actor: AuditActor,
): FamilyBankState {
  if (amount === 0) throw new Error("Amount can't be zero.");
  const source: TransactionSource = amount > 0 ? "manual-deposit" : "manual-withdrawal";
  const withTransaction = recordTransaction(state, kidId, amount, "💵", source, note);
  const transactionId = withTransaction.transactions[withTransaction.transactions.length - 1].id;
  return logAudit(
    withTransaction,
    actor,
    `Recorded ${formatCurrency(Math.abs(amount))} cash ${amount > 0 ? "from" : "to"} ${kidName(state, kidId)}${note ? ` (${note})` : ""}`,
    { kidId, undo: { kind: "remove-transaction", transactionId } },
  );
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

/** Lifetime Family Tax withheld from this kid's allowance so far — survives tax refunds, unlike the pot balance. */
export function totalTaxPaidForKid(state: FamilyBankState, kidId: string): number {
  return state.taxPots.find((pot) => pot.kidId === kidId)?.totalPaid ?? 0;
}

/** Parent-side: pays out a kid's accumulated Family Tax pot as a reward, then zeroes it out. */
export function payTaxRefund(state: FamilyBankState, kidId: string, actor: AuditActor): FamilyBankState {
  const pot = state.taxPots.find((candidate) => candidate.kidId === kidId);
  if (!pot || pot.balance <= 0) throw new Error("Nothing in the tax pot to refund.");

  const previousBalance = pot.balance;
  const withCredit = recordTransaction(state, kidId, pot.balance, "🧾", "tax", "Tax Refund");
  const transactionId = withCredit.transactions[withCredit.transactions.length - 1].id;
  const refunded = touch({
    ...withCredit,
    taxPots: withCredit.taxPots.map((candidate) => (candidate.kidId === kidId ? { ...candidate, balance: 0 } : candidate)),
  });
  return logAudit(refunded, actor, `Paid ${kidName(state, kidId)}'s tax refund (${formatCurrency(previousBalance)})`, {
    kidId,
    undo: { kind: "restore-tax-pot", kidId, transactionId, previousBalance },
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
  lockWeeks: number | undefined,
  actor: AuditActor,
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
  const transactionId = withDebit.transactions[withDebit.transactions.length - 1].id;

  const maturesAt =
    assetClass === "cd" && lockWeeks
      ? new Date(Date.now() + lockWeeks * 7 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

  const positionId = crypto.randomUUID();
  const invested = touch({
    ...withDebit,
    investments: [
      ...withDebit.investments,
      {
        id: positionId,
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
  return logAudit(invested, actor, `Invested ${formatCurrency(amount)} in ${assetClass} for ${kidName(state, kidId)}`, {
    kidId,
    undo: { kind: "remove-investment", positionId, transactionId },
  });
}

/**
 * Cashes out an investment position back into spendable balance. A CD withdrawn before its
 * maturity date forfeits any gains beyond the original principal — the "penalty for early
 * withdrawal" the CD trades its higher rate for.
 */
export function withdrawFromInvestment(state: FamilyBankState, positionId: string, actor: AuditActor): FamilyBankState {
  const position = state.investments.find((candidate) => candidate.id === positionId);
  if (!position || position.closedAt) throw new Error("Investment not found.");

  const now = new Date().toISOString();
  const isEarlyCdWithdrawal =
    position.assetClass === "cd" && position.maturesAt && new Date(position.maturesAt) > new Date(now);
  const payout = isEarlyCdWithdrawal ? Math.min(position.currentValue, position.principal) : position.currentValue;
  const previousCurrentValue = position.currentValue;

  const withCredit = recordTransaction(
    state,
    position.kidId,
    payout,
    CD_EMOJI_BY_ASSET[position.assetClass],
    "investment",
    isEarlyCdWithdrawal ? "Early CD withdrawal (forfeited interest)" : `Cashed out ${position.assetClass}`,
  );
  const transactionId = withCredit.transactions[withCredit.transactions.length - 1].id;

  const closed = touch({
    ...withCredit,
    investments: withCredit.investments.map((candidate) =>
      candidate.id === positionId ? { ...candidate, currentValue: payout, closedAt: now } : candidate,
    ),
  });
  return logAudit(closed, actor, `Cashed out ${position.assetClass} for ${kidName(state, position.kidId)} (${formatCurrency(payout)})`, {
    kidId: position.kidId,
    undo: { kind: "reopen-investment", positionId, transactionId, previousCurrentValue },
  });
}

/**
 * Parent-side: reverses a logged action using the structured undo data captured when it
 * happened, rather than a bespoke delete button per feature. Marks the entry undone so it can't
 * be undone twice; throws (surfaced to the parent) if what it describes has already moved on —
 * e.g. a bounty that was denied after being approved some other way.
 */
export function undoAuditEntry(state: FamilyBankState, entryId: string): FamilyBankState {
  const entry = state.auditLog.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error("That activity entry is gone.");
  if (entry.undoneAt) throw new Error("Already undone.");
  if (!entry.undo) throw new Error("This action can't be undone.");
  const undo = entry.undo;

  let reverted: FamilyBankState;
  switch (undo.kind) {
    case "remove-transaction": {
      reverted = removeTransaction(state, undo.transactionId);
      break;
    }
    case "remove-investment": {
      const withoutTransaction = removeTransaction(state, undo.transactionId);
      reverted = touch({
        ...withoutTransaction,
        investments: withoutTransaction.investments.filter((position) => position.id !== undo.positionId),
      });
      break;
    }
    case "reopen-investment": {
      const withoutTransaction = removeTransaction(state, undo.transactionId);
      reverted = touch({
        ...withoutTransaction,
        investments: withoutTransaction.investments.map((position) =>
          position.id === undo.positionId
            ? { ...position, closedAt: undefined, currentValue: undo.previousCurrentValue }
            : position,
        ),
      });
      break;
    }
    case "delete-goal": {
      reverted = deleteGoal(state, undo.goalId);
      break;
    }
    case "revert-withdrawal-approval": {
      const withoutTransaction = removeTransaction(state, undo.transactionId);
      reverted = touch({
        ...withoutTransaction,
        withdrawalRequests: withoutTransaction.withdrawalRequests.map((request) =>
          request.id === undo.requestId ? { ...request, status: "pending", resolvedAt: undefined } : request,
        ),
        goals: undo.goalId
          ? withoutTransaction.goals.map((goal) =>
              goal.id === undo.goalId ? { ...goal, savedAmount: undo.goalAmount ?? goal.savedAmount, spentAt: undefined } : goal,
            )
          : withoutTransaction.goals,
      });
      break;
    }
    case "revert-bounty-claim": {
      const bounty = state.bounties.find((candidate) => candidate.id === undo.bountyId);
      if (!bounty || bounty.status !== "pending-approval") throw new Error("This bounty has already moved on.");
      reverted = touch({
        ...state,
        bounties: state.bounties.map((candidate) =>
          candidate.id === undo.bountyId
            ? { ...candidate, status: "open", claimedByKidId: undefined, claimedAt: undefined }
            : candidate,
        ),
      });
      break;
    }
    case "revert-bounty-approval": {
      const bounty = state.bounties.find((candidate) => candidate.id === undo.bountyId);
      if (!bounty || bounty.status !== "approved") throw new Error("This bounty has already moved on.");
      const withoutTransaction = removeTransaction(state, undo.transactionId);
      reverted = touch({
        ...withoutTransaction,
        bounties: withoutTransaction.bounties.map((candidate) =>
          candidate.id === undo.bountyId ? { ...candidate, status: "pending-approval", resolvedAt: undefined } : candidate,
        ),
      });
      break;
    }
    case "revert-bounty-envelope": {
      const bounty = state.bounties.find((candidate) => candidate.id === undo.bountyId);
      if (!bounty || bounty.status !== "approved") throw new Error("This bounty has already moved on.");
      const envelope = state.envelopes.find((candidate) => candidate.id === undo.envelopeId);
      if (envelope?.openedAt) throw new Error("The kid already opened this envelope.");
      reverted = touch({
        ...state,
        bounties: state.bounties.map((candidate) =>
          candidate.id === undo.bountyId ? { ...candidate, status: "pending-approval", resolvedAt: undefined } : candidate,
        ),
        envelopes: state.envelopes.filter((candidate) => candidate.id !== undo.envelopeId),
      });
      break;
    }
    case "revert-envelope-open": {
      const withoutTransaction = removeTransaction(state, undo.transactionId);
      reverted = touch({
        ...withoutTransaction,
        envelopes: withoutTransaction.envelopes.map((candidate) =>
          candidate.id === undo.envelopeId ? { ...candidate, openedAt: undefined } : candidate,
        ),
        goals: withoutTransaction.goals.map((goal) => {
          const allocation = undo.goalAllocations.find((candidate) => candidate.goalId === goal.id);
          if (!allocation) return goal;
          const savedAmount = Math.max(0, round2(goal.savedAmount - allocation.amount));
          return {
            ...goal,
            savedAmount,
            completedAt: savedAmount >= goal.targetAmount ? goal.completedAt : undefined,
          };
        }),
      });
      break;
    }
    case "restore-tax-pot": {
      const withoutTransaction = removeTransaction(state, undo.transactionId);
      reverted = touch({
        ...withoutTransaction,
        taxPots: withoutTransaction.taxPots.map((pot) =>
          pot.kidId === undo.kidId ? { ...pot, balance: undo.previousBalance } : pot,
        ),
      });
      break;
    }
  }

  return touch({
    ...reverted,
    auditLog: reverted.auditLog.map((candidate) =>
      candidate.id === entryId ? { ...candidate, undoneAt: new Date().toISOString() } : candidate,
    ),
  });
}
