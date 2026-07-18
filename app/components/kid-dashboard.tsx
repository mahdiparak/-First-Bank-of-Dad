"use client";

import { useState } from "react";
import { daysUntilPayday, weeksWithoutWithdrawalFor } from "@/lib/allowance";
import {
  allocateToGoal,
  availableBalanceForKid,
  claimBounty,
  createGoal,
  requestWithdrawal,
  totalBalanceForKid,
  updateKidAllowance,
} from "@/lib/mutations";
import { SPENDING_CATEGORIES, type Bounty, type FamilyBankState, type KidProfile } from "@/lib/schema";
import { InvestmentSandbox } from "./investment-sandbox";
import type { MarketDataResponse } from "@/lib/market-data";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function KidDashboard({
  state,
  kid,
  role,
  marketData,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  marketData: MarketDataResponse | null;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function tryMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    try {
      setError(null);
      onMutate(mutator);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  const total = totalBalanceForKid(state, kid.id);
  const available = availableBalanceForKid(state, kid.id);
  const days = daysUntilPayday(kid);
  const streakWeeks = weeksWithoutWithdrawalFor(state, kid.id);
  const nextMilestone = state.parentSettings.dadMatchMilestones
    .filter((milestone) => milestone.weeks > streakWeeks)
    .sort((a, b) => a.weeks - b.weeks)[0];

  const goals = state.goals.filter((goal) => goal.kidId === kid.id);
  const transactions = state.transactions.filter((transaction) => transaction.kidId === kid.id);
  const withdrawalRequests = state.withdrawalRequests.filter((request) => request.kidId === kid.id);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm opacity-70">Total balance</p>
          <p className="text-3xl font-semibold">{formatCurrency(total)}</p>
          {available !== total && (
            <p className="text-xs opacity-60">
              {formatCurrency(available)} available (rest saved toward goals or pending approval)
            </p>
          )}
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm opacity-70">Allowance</p>
          <p className="text-3xl font-semibold">{formatCurrency(kid.weeklyAllowance)}/wk</p>
          <p className="text-xs opacity-60">{days === 0 ? "Payday today!" : `Payday in ${days} day${days === 1 ? "" : "s"}`}</p>
          {role === "parent" && <AllowanceEditor kid={kid} onMutate={tryMutate} />}
        </div>
      </section>

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm opacity-70">Dad Match streak</p>
        <p className="text-2xl font-semibold">
          {streakWeeks} week{streakWeeks === 1 ? "" : "s"} without a withdrawal
        </p>
        {nextMilestone && (
          <p className="text-xs opacity-60">
            {nextMilestone.weeks - streakWeeks} more week{nextMilestone.weeks - streakWeeks === 1 ? "" : "s"} for a{" "}
            {formatCurrency(nextMilestone.bonus)} bonus
          </p>
        )}
      </section>

      <GoalGetter goals={goals} available={available} onMutate={tryMutate} kid={kid} />

      <InvestmentSandbox state={state} kid={kid} marketData={marketData} onMutate={tryMutate} />

      {role === "kid" && <BountyBoard bounties={state.bounties} kid={kid} onMutate={tryMutate} />}

      <Ledger transactions={transactions} withdrawalRequests={withdrawalRequests} available={available} onMutate={tryMutate} kid={kid} />
    </div>
  );
}

function AllowanceEditor({
  kid,
  onMutate,
}: {
  kid: KidProfile;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(kid.weeklyAllowance));
  const [weekday, setWeekday] = useState(String(kid.paydayWeekday));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    onMutate((state) => updateKidAllowance(state, kid.id, Number(amount), Number(weekday)));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="mt-1 text-xs underline opacity-70">
        Edit allowance
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        type="number"
        min={0}
        step="0.01"
        className="w-24 rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
      />
      <select
        value={weekday}
        onChange={(event) => setWeekday(event.target.value)}
        className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
      >
        {WEEKDAYS.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-md bg-black px-2 py-1 text-xs text-white dark:bg-white dark:text-black">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs opacity-70">
        Cancel
      </button>
    </form>
  );
}

function GoalGetter({
  goals,
  available,
  kid,
  onMutate,
}: {
  goals: FamilyBankState["goals"];
  available: number;
  kid: KidProfile;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !target) return;
    onMutate((state) => createGoal(state, kid.id, name.trim(), Number(target)));
    setName("");
    setTarget("");
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Goal Getter</h2>

      {goals.length === 0 && <p className="text-sm opacity-70">No goals yet — start saving for something!</p>}

      <div className="space-y-3">
        {goals.map((goal) => {
          const progress = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));
          return (
            <div key={goal.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{goal.name}</span>
                <span className="opacity-70">
                  {formatCurrency(goal.savedAmount)} / {formatCurrency(goal.targetAmount)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onMutate((state) => allocateToGoal(state, goal.id, Math.min(5, available)))}
                  className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
                  disabled={available <= 0}
                >
                  + $5
                </button>
                <button
                  onClick={() => onMutate((state) => allocateToGoal(state, goal.id, -Math.min(5, goal.savedAmount)))}
                  className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
                  disabled={goal.savedAmount <= 0}
                >
                  - $5
                </button>
                {goal.completedAt && <span className="text-xs text-green-600">Goal reached! 🎉</span>}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 pt-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What are you saving for?"
          className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          type="number"
          min={1}
          step="0.01"
          placeholder="Target ($)"
          className="w-32 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
          Create goal
        </button>
      </form>
    </section>
  );
}

function BountyBoard({
  bounties,
  kid,
  onMutate,
}: {
  bounties: Bounty[];
  kid: KidProfile;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const open = bounties.filter((bounty) => bounty.status === "open");
  const mine = bounties.filter((bounty) => bounty.claimedByKidId === kid.id && bounty.status !== "open");

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Bounty Board</h2>

      {open.length === 0 && <p className="text-sm opacity-70">No open bounties right now.</p>}
      <div className="space-y-2">
        {open.map((bounty) => (
          <div key={bounty.id} className="flex items-center justify-between text-sm">
            <span>{bounty.title}</span>
            <div className="flex items-center gap-2">
              <span className="text-green-600">{formatCurrency(bounty.reward)}</span>
              <button
                onClick={() => onMutate((state) => claimBounty(state, bounty.id, kid.id))}
                className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
              >
                Claim
              </button>
            </div>
          </div>
        ))}
      </div>

      {mine.length > 0 && (
        <div className="space-y-1 border-t border-black/10 pt-2 dark:border-white/10">
          {mine.map((bounty) => (
            <div key={bounty.id} className="flex items-center justify-between text-xs opacity-70">
              <span>{bounty.title}</span>
              <span>{bountyStatusLabel(bounty.status)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function bountyStatusLabel(status: Bounty["status"]): string {
  switch (status) {
    case "pending-approval":
      return "Waiting for Dad";
    case "approved":
      return "Paid! 🎉";
    case "denied":
      return "Not this time";
    default:
      return status;
  }
}

function Ledger({
  transactions,
  withdrawalRequests,
  available,
  kid,
  onMutate,
}: {
  transactions: FamilyBankState["transactions"];
  withdrawalRequests: FamilyBankState["withdrawalRequests"];
  available: number;
  kid: KidProfile;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(SPENDING_CATEGORIES[0].emoji);
  const [memo, setMemo] = useState("");

  function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    onMutate((state) => requestWithdrawal(state, kid.id, Number(amount), category, memo.trim() || undefined));
    setAmount("");
    setMemo("");
  }

  type Row =
    | { kind: "transaction"; at: string; item: FamilyBankState["transactions"][number] }
    | { kind: "request"; at: string; item: FamilyBankState["withdrawalRequests"][number] };

  const rows: Row[] = [
    ...transactions.map((item): Row => ({ kind: "transaction", at: item.createdAt, item })),
    ...withdrawalRequests
      .filter((item) => item.status !== "approved") // approved ones already show as a transaction
      .map((item): Row => ({ kind: "request", at: item.requestedAt, item })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Ledger</h2>

      <form onSubmit={handleRequest} className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-md border border-black/20 px-2 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          {SPENDING_CATEGORIES.map((entry) => (
            <option key={entry.emoji} value={entry.emoji}>
              {entry.emoji} {entry.label}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min={0.01}
          step="0.01"
          placeholder="Amount ($)"
          className="w-32 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <input
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="What'd you get? (optional)"
          className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={available <= 0}
          className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          Ask to spend
        </button>
      </form>
      <p className="text-xs opacity-60">Sends a request to Dad — the money leaves your balance once approved.</p>

      <div className="divide-y divide-black/10 dark:divide-white/10">
        {rows.length === 0 && <p className="py-2 text-sm opacity-70">No transactions yet.</p>}
        {rows.map((row) =>
          row.kind === "transaction" ? (
            <div key={row.item.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{row.item.category}</span>
                <span>{row.item.memo ?? sourceLabel(row.item.source)}</span>
              </div>
              <span className={row.item.amount < 0 ? "text-red-500" : "text-green-600"}>
                {row.item.amount < 0 ? "-" : "+"}
                {formatCurrency(Math.abs(row.item.amount))}
              </span>
            </div>
          ) : (
            <div key={row.item.id} className="flex items-center justify-between py-2 text-sm opacity-60">
              <div className="flex items-center gap-2">
                <span>{row.item.category}</span>
                <span>{row.item.reason ?? "Spending request"}</span>
                <span className="text-xs italic">
                  {row.item.status === "pending" ? "(waiting for Dad)" : "(denied)"}
                </span>
              </div>
              <span>-{formatCurrency(row.item.amount)}</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function sourceLabel(source: string): string {
  return source
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
