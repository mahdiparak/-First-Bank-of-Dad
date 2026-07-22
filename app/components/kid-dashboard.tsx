"use client";

import { useCallback, useMemo, useState } from "react";
import { daysUntilPayday, paydaysInMonth, streakWeekDate, weeksWithoutWithdrawalFor } from "@/lib/allowance";
import {
  allocateToGoal,
  availableBalanceForKid,
  claimBounty,
  createGoal,
  deleteGoal,
  removeTransaction,
  requestGoalSpend,
  requestWithdrawal,
  totalBalanceForKid,
} from "@/lib/mutations";
import {
  isYoungKidView,
  kidColor,
  SPENDING_CATEGORIES,
  type AuditActor,
  type FamilyBankState,
  type KidProfile,
} from "@/lib/schema";
import { BadgeWall } from "./badge-wall";
import { MonthCalendar, type CalendarMarker } from "./calendar";
import { MoneyTimeline } from "./money-timeline";
import { InvestmentSandbox } from "./investment-sandbox";
import { QuestBoard, QuestCard } from "./quest-board";
import { WithdrawalPreview } from "./withdrawal-preview";
import { WithdrawalConfirmDialog } from "./withdrawal-confirm";
import type { MarketDataResponse } from "@/lib/market-data";

type KidTab = "home" | "goals" | "invest" | "quests" | "ledger";

export function KidDashboard({
  state,
  kid,
  role,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<KidTab>("home");

  function tryMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    try {
      setError(null);
      onMutate(mutator);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  if (isYoungKidView(kid)) {
    return (
      <div className="space-y-6">
        {error && <p className="text-sm text-red-500">{error}</p>}
        <YoungKidHome state={state} kid={kid} role={role} marketData={marketData} actor={actor} onMutate={tryMutate} />
      </div>
    );
  }

  const tabs: { id: KidTab; label: string }[] = [
    { id: "home", label: "🏠 Home" },
    { id: "goals", label: "🎯 Goals" },
    { id: "invest", label: "📈 Invest" },
    ...(role === "kid" ? [{ id: "quests" as KidTab, label: "🗺️ Quests" }] : []),
    { id: "ledger", label: "📒 Ledger" },
  ];

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === entry.id
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-black/20 dark:border-white/20"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {tab === "home" && <HomeTab state={state} kid={kid} marketData={marketData} />}
      {tab === "goals" && <GoalGetter state={state} kid={kid} role={role} actor={actor} onMutate={tryMutate} />}
      {tab === "invest" && (
        <InvestmentSandbox state={state} kid={kid} marketData={marketData} actor={actor} onMutate={tryMutate} />
      )}
      {tab === "quests" && role === "kid" && (
        <QuestBoard bounties={state.bounties} kid={kid} actor={actor} onMutate={tryMutate} />
      )}
      {tab === "ledger" && <Ledger state={state} kid={kid} role={role} onMutate={tryMutate} />}
    </div>
  );
}

function HomeTab({
  state,
  kid,
  marketData,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  marketData: MarketDataResponse | null;
}) {
  const total = totalBalanceForKid(state, kid.id);
  const available = availableBalanceForKid(state, kid.id);
  const days = daysUntilPayday(kid);
  const streakWeeks = weeksWithoutWithdrawalFor(state, kid.id);
  const nextMilestone = state.parentSettings.dadMatchMilestones
    .filter((milestone) => milestone.weeks > streakWeeks)
    .sort((a, b) => a.weeks - b.weeks)[0];
  const color = kidColor(kid);

  return (
    <div className="space-y-6">
      {/* Total balance leads the screen — the number a kid cares about most, before the story of
          how it got there. */}
      <div className="rounded-xl border border-black/10 p-4 dark:border-white/10" style={{ borderTopWidth: 4, borderTopColor: color }}>
        <p className="text-sm opacity-70">Total balance</p>
        <p className="text-4xl font-semibold tabular-nums">{formatCurrency(total)}</p>
        {available !== total && (
          <p className="text-xs opacity-60">
            {formatCurrency(available)} available (rest saved toward goals or pending approval)
          </p>
        )}
      </div>

      <MoneyTimeline state={state} kid={kid} marketData={marketData} />

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm opacity-70">Allowance</p>
        <p className="text-3xl font-semibold">{formatCurrency(kid.weeklyAllowance)}/wk</p>
        <p className="text-xs opacity-60">{days === 0 ? "Payday today! 🎉" : `Payday in ${days} day${days === 1 ? "" : "s"}`}</p>
        <p className="text-xs opacity-60">
          Plus interest every week — your money earns {formatPercent(state.parentSettings.hysaApr)} a year just by sitting here.
        </p>
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          <PaydayCalendar kid={kid} color={color} />
        </div>
      </section>

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm opacity-70">Dad Match streak</p>
        <p className="text-2xl font-semibold">
          {"🔥".repeat(Math.min(streakWeeks, 8)) || "—"} {streakWeeks} week{streakWeeks === 1 ? "" : "s"}
        </p>
        <p className="text-xs opacity-60">
          Weeks without an impulse withdrawal. Spending a finished goal never breaks your streak.
        </p>
        {nextMilestone && (
          <p className="text-xs opacity-60">
            {nextMilestone.weeks - streakWeeks} more week{nextMilestone.weeks - streakWeeks === 1 ? "" : "s"} for a{" "}
            {formatCurrency(nextMilestone.bonus)} bonus
          </p>
        )}
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          <StreakCalendar state={state} kid={kid} streakWeeks={streakWeeks} nextMilestone={nextMilestone} color={color} />
        </div>
      </section>

      <BadgeWall state={state} kid={kid} />
    </div>
  );
}

/** A month calendar marking every payday with 💲 — paydays are a fixed weekday, so this is just
 *  every date in the displayed month that matches it, past or future. */
function PaydayCalendar({ kid, color }: { kid: KidProfile; color: string }) {
  const getMarkers = useCallback(
    (year: number, month: number): CalendarMarker[] =>
      paydaysInMonth(kid, year, month).map((date) => ({ date, content: "💲", title: "Payday" })),
    [kid],
  );

  return (
    <MonthCalendar
      getMarkers={getMarkers}
      color={color}
      legend={<span>💲 Payday</span>}
    />
  );
}

/** A month calendar showing the Dad Match streak: each week already banked gets a ✅, and — if
 *  the streak holds — the date of the next milestone bonus gets a 💲 so a kid can see exactly
 *  when a broken streak would have cost them a payout. */
function StreakCalendar({
  state,
  kid,
  streakWeeks,
  nextMilestone,
  color,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  streakWeeks: number;
  nextMilestone?: { weeks: number; bonus: number };
  color: string;
}) {
  const horizonWeeks = Math.max(streakWeeks, nextMilestone?.weeks ?? streakWeeks);

  const allMarkers = useMemo(() => {
    const markers: CalendarMarker[] = [];
    for (let week = 1; week <= horizonWeeks; week++) {
      const date = streakWeekDate(state, kid.id, week);
      if (week <= streakWeeks) {
        markers.push({ date, content: "✅", title: `Week ${week} of your streak` });
      } else if (nextMilestone && week === nextMilestone.weeks) {
        markers.push({
          date,
          content: "💲",
          title: `Dad Match bonus day — ${formatCurrency(nextMilestone.bonus)} if the streak holds`,
        });
      }
    }
    return markers;
  }, [state, kid.id, streakWeeks, nextMilestone, horizonWeeks]);

  const getMarkers = useCallback(
    (year: number, month: number): CalendarMarker[] =>
      allMarkers.filter((marker) => marker.date.getFullYear() === year && marker.date.getMonth() === month),
    [allMarkers],
  );

  return (
    <MonthCalendar
      getMarkers={getMarkers}
      color={color}
      legend={
        <>
          <span>✅ Streak week banked</span>
          {nextMilestone && <span>💲 Bonus payday if it holds</span>}
        </>
      }
    />
  );
}

function YoungKidHome({
  state,
  kid,
  role,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const total = totalBalanceForKid(state, kid.id);
  const available = availableBalanceForKid(state, kid.id);
  const days = daysUntilPayday(kid);
  const streakWeeks = weeksWithoutWithdrawalFor(state, kid.id);
  const color = kidColor(kid);
  const openBounties = state.bounties.filter((bounty) => bounty.status === "open");
  const recent = state.transactions
    .filter((transaction) => transaction.kidId === kid.id)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <section
        className="rounded-3xl border-4 p-6 text-center"
        style={{ borderColor: color, backgroundColor: `${color}14` }}
      >
        <p className="text-lg font-semibold">My money</p>
        <p className="text-6xl font-bold tabular-nums">{formatCurrency(total)}</p>
        <CoinPile balance={total} />
        <p className="mt-3 text-lg">
          {days === 0 ? "💰 Payday is TODAY!" : `💰 ${days} more sleep${days === 1 ? "" : "s"} until payday`}
        </p>
      </section>

      <MoneyTimeline state={state} kid={kid} marketData={marketData} />

      <section className="rounded-3xl border border-black/10 p-5 text-center dark:border-white/10">
        <p className="text-lg font-semibold">My saving streak</p>
        <p className="mt-1 text-4xl">{"⭐".repeat(Math.min(Math.max(streakWeeks, 0), 10)) || "🌱"}</p>
        <p className="mt-1 text-sm opacity-70">
          {streakWeeks === 0 ? "A new streak is growing!" : `${streakWeeks} week${streakWeeks === 1 ? "" : "s"} of saving!`}
        </p>
      </section>

      <GoalGetter state={state} kid={kid} role={role} actor={actor} onMutate={onMutate} young />

      {openBounties.length > 0 && role === "kid" && (
        <section className="space-y-3 rounded-3xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-5">
          <p className="text-lg font-semibold">🗺️ Quest Board — earn extra money!</p>
          {openBounties.map((bounty) => (
            <QuestCard
              key={bounty.id}
              bounty={bounty}
              onClaim={() => onMutate((s) => claimBounty(s, bounty.id, kid.id, actor))}
              young
            />
          ))}
        </section>
      )}

      <YoungSpendForm state={state} kid={kid} available={available} onMutate={onMutate} />

      {recent.length > 0 && (
        <section className="space-y-2 rounded-3xl border border-black/10 p-5 dark:border-white/10">
          <p className="text-lg font-semibold">What happened</p>
          {recent.map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between text-base">
              <span>
                {transaction.category} {transaction.memo ?? ""}
              </span>
              <span className="flex items-center gap-2">
                <span className={transaction.amount < 0 ? "text-red-500" : "text-green-600"}>
                  {transaction.amount < 0 ? "-" : "+"}
                  {formatCurrency(Math.abs(transaction.amount))}
                </span>
                {role === "parent" && (
                  <button
                    onClick={() => onMutate((s) => removeTransaction(s, transaction.id))}
                    aria-label="Delete this transaction"
                    className="text-sm opacity-50"
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

    </div>
  );
}

/** Renders whole dollars as a pile of coins so the amount is something a 6-year-old can *see*. */
function CoinPile({ balance }: { balance: number }) {
  const coins = Math.min(Math.floor(balance), 30);
  const extra = Math.floor(balance) - coins;
  if (coins <= 0) return null;
  return (
    <p className="mx-auto mt-2 max-w-xs text-2xl leading-7" aria-label={`${Math.floor(balance)} dollars`}>
      {"🪙".repeat(coins)}
      {extra > 0 && <span className="text-sm opacity-70"> +{extra} more</span>}
    </p>
  );
}

function YoungSpendForm({
  state,
  kid,
  available,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  available: number;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [category, setCategory] = useState<string>(SPENDING_CATEGORIES[0].emoji);
  const [amount, setAmount] = useState("");
  const [asked, setAsked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function handleAsk(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    setConfirming(true);
  }

  function handleConfirm() {
    onMutate((s) => requestWithdrawal(s, kid.id, Number(amount), category));
    setAmount("");
    setAsked(true);
    setConfirming(false);
  }

  return (
    <section className="space-y-3 rounded-3xl border border-black/10 p-5 dark:border-white/10">
      <p className="text-lg font-semibold">🙋 Ask to spend</p>
      <div className="flex flex-wrap gap-2">
        {SPENDING_CATEGORIES.map((entry) => (
          <button
            key={entry.emoji}
            type="button"
            onClick={() => setCategory(entry.emoji)}
            className={`rounded-2xl border-2 p-3 text-3xl ${
              category === entry.emoji ? "border-black dark:border-white" : "border-black/10 dark:border-white/15"
            }`}
            aria-label={entry.label}
          >
            {entry.emoji}
          </button>
        ))}
      </div>
      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min={0.01}
          step="0.01"
          placeholder="How much?"
          className="w-32 rounded-2xl border-2 border-black/15 px-4 py-3 text-lg dark:border-white/20 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={available <= 0}
          className="flex-1 rounded-2xl bg-black px-4 py-3 text-lg font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          Ask Dad
        </button>
      </form>
      <WithdrawalPreview state={state} kid={kid} amount={Number(amount) || 0} young />
      {asked && <p className="text-sm text-green-600">Sent! Dad will say yes or no. 🕐</p>}
      {confirming && (
        <WithdrawalConfirmDialog
          state={state}
          kid={kid}
          amount={Number(amount) || 0}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
          young
        />
      )}
    </section>
  );
}

function GoalGetter({
  state,
  kid,
  role,
  young = false,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  young?: boolean;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const available = availableBalanceForKid(state, kid.id);
  const goals = state.goals.filter((goal) => goal.kidId === kid.id && !goal.spentAt);
  const step = young ? 1 : 5;
  const netWeekly = kid.weeklyAllowance * (1 - state.parentSettings.taxRate);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !target) return;
    onMutate((s) => createGoal(s, kid.id, name.trim(), Number(target), actor));
    setName("");
    setTarget("");
  }

  return (
    <section className={`space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10 ${young ? "rounded-3xl p-5" : ""}`}>
      <h2 className={young ? "text-lg font-semibold" : "font-semibold"}>🎯 Goal Getter</h2>

      {goals.length === 0 && <p className="text-sm opacity-70">No goals yet — start saving for something!</p>}

      <div className="space-y-4">
        {goals.map((goal) => {
          const progress = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));
          const remaining = goal.targetAmount - goal.savedAmount;
          const etaWeeks = !goal.completedAt && netWeekly > 0 ? Math.ceil(remaining / netWeekly) : null;
          const pendingSpend = state.withdrawalRequests.some(
            (request) => request.goalId === goal.id && request.status === "pending",
          );
          return (
            <div key={goal.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className={young ? "text-base" : ""}>{goal.name}</span>
                <span className="opacity-70">
                  {formatCurrency(goal.savedAmount)} / {formatCurrency(goal.targetAmount)}
                </span>
              </div>
              <div className={`w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10 ${young ? "h-4" : "h-2"}`}>
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {etaWeeks !== null && etaWeeks > 0 && (
                <p className="text-xs opacity-60">
                  ~{etaWeeks} week{etaWeeks === 1 ? "" : "s"} to go at allowance pace
                </p>
              )}
              <div className="flex items-center gap-2">
                {!goal.completedAt && (
                  <>
                    <button
                      onClick={() => onMutate((s) => allocateToGoal(s, goal.id, Math.min(step, available)))}
                      className={`rounded-md border border-black/20 dark:border-white/20 ${young ? "px-4 py-2 text-base" : "px-2 py-1 text-xs"}`}
                      disabled={available <= 0}
                    >
                      + ${step}
                    </button>
                    <button
                      onClick={() => onMutate((s) => allocateToGoal(s, goal.id, -Math.min(step, goal.savedAmount)))}
                      className={`rounded-md border border-black/20 dark:border-white/20 ${young ? "px-4 py-2 text-base" : "px-2 py-1 text-xs"}`}
                      disabled={goal.savedAmount <= 0}
                    >
                      - ${step}
                    </button>
                  </>
                )}
                {goal.completedAt && pendingSpend && <span className="text-xs opacity-70">Asked Dad — waiting 🕐</span>}
                {goal.completedAt && !pendingSpend && (
                  <button
                    onClick={() => onMutate((s) => requestGoalSpend(s, goal.id))}
                    className={`rounded-md bg-green-600 text-white ${young ? "px-4 py-2 text-base" : "px-3 py-1 text-xs"}`}
                  >
                    Spend it! 🎉
                  </button>
                )}
                {role === "parent" && !goal.completedAt && <DeleteGoalButton goalId={goal.id} onMutate={onMutate} />}
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
          className={`rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent ${young ? "rounded-2xl py-3 text-base" : ""}`}
        />
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          type="number"
          min={1}
          step="0.01"
          placeholder="Target ($)"
          className={`w-32 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent ${young ? "rounded-2xl py-3 text-base" : ""}`}
        />
        <button
          type="submit"
          className={`rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black ${young ? "rounded-2xl py-3 text-base" : ""}`}
        >
          Create goal
        </button>
      </form>
    </section>
  );
}

function DeleteGoalButton({
  goalId,
  onMutate,
}: {
  goalId: string;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  return (
    <button
      onClick={() => {
        if (window.confirm("Delete this goal? Saved money returns to the available balance.")) {
          onMutate((s) => deleteGoal(s, goalId));
        }
      }}
      className="ml-auto text-xs text-red-500"
    >
      Delete
    </button>
  );
}

function Ledger({
  state,
  kid,
  role,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(SPENDING_CATEGORIES[0].emoji);
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState(false);

  const available = availableBalanceForKid(state, kid.id);
  const transactions = state.transactions.filter((transaction) => transaction.kidId === kid.id);
  const withdrawalRequests = state.withdrawalRequests.filter((request) => request.kidId === kid.id);

  function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    setConfirming(true);
  }

  function handleConfirm() {
    onMutate((s) => requestWithdrawal(s, kid.id, Number(amount), category, memo.trim() || undefined));
    setAmount("");
    setMemo("");
    setConfirming(false);
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
      <h2 className="font-semibold">📒 Ledger</h2>

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
      <WithdrawalPreview state={state} kid={kid} amount={Number(amount) || 0} />

      <div className="divide-y divide-black/10 dark:divide-white/10">
        {rows.length === 0 && <p className="py-2 text-sm opacity-70">No transactions yet.</p>}
        {rows.map((row) =>
          row.kind === "transaction" ? (
            <div key={row.item.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{row.item.category}</span>
                <span>{row.item.memo ?? sourceLabel(row.item.source)}</span>
              </div>
              <span className="flex items-center gap-2">
                <span className={row.item.amount < 0 ? "text-red-500" : "text-green-600"}>
                  {row.item.amount < 0 ? "-" : "+"}
                  {formatCurrency(Math.abs(row.item.amount))}
                </span>
                {role === "parent" && (
                  <button
                    onClick={() => onMutate((s) => removeTransaction(s, row.item.id))}
                    aria-label="Delete this transaction"
                    className="text-xs opacity-50"
                  >
                    ✕
                  </button>
                )}
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

      {confirming && (
        <WithdrawalConfirmDialog
          state={state}
          kid={kid}
          amount={Number(amount) || 0}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
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

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
