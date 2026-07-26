"use client";

import { useState } from "react";
import { daysUntilPayday } from "@/lib/allowance";
import { autoInvestWeeklyTotal, setAutoInvestRule } from "@/lib/mutations";
import {
  ASSET_CLASSES,
  isAssetClassUnlocked,
  type AssetClass,
  type AuditActor,
  type FamilyBankState,
  type KidProfile,
} from "@/lib/schema";
import { assetColor } from "./investment-plot";

const ASSET_CLASS_ORDER: AssetClass[] = ["savings", "cd", "stocks", "crypto"];
const LOCK_OPTIONS = [4, 12, 26, 52];

/**
 * Standing orders: "every payday, put this much into that." The one screen in the app where a kid
 * decides ahead of time instead of in the moment — which is the whole point, since the decision
 * that builds wealth is the one you don't have to keep making.
 *
 * Everything is per-week and per-asset, shown against what actually lands each payday, so an
 * over-commitment is visible before it happens rather than as a surprise shortfall later.
 */
export function AutoInvest({
  state,
  kid,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [editing, setEditing] = useState<AssetClass | null>(null);

  const netWeekly = round2(kid.weeklyAllowance * (1 - state.parentSettings.taxRate));
  const goalsWeekly = round2(
    state.goals
      .filter((goal) => goal.kidId === kid.id && !goal.completedAt && !goal.spentAt)
      .reduce((total, goal) => total + (goal.weeklyContribution ?? 0), 0),
  );
  const investWeekly = autoInvestWeeklyTotal(state, kid.id);
  const committed = round2(goalsWeekly + investWeekly);
  const leftOver = round2(netWeekly - committed);
  const rules = state.autoInvestRules.filter((rule) => rule.kidId === kid.id);
  const days = daysUntilPayday(kid);

  return (
    <section className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">🔁 Every payday, without asking me</h2>
        <p className="text-xs opacity-60">
          {days === 0 ? "Next payday: today" : `Next payday in ${days} day${days === 1 ? "" : "s"}`}
        </p>
      </div>

      <p className="text-sm opacity-80">
        Decide once, and it happens on its own. Each payday this money moves straight into what you picked — same
        rules as investing by hand, including the {state.parentSettings.investmentMinHoldDays ?? 0}-day hold.
      </p>

      {investWeekly > 0 && (
        <div className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
          <p>
            <strong>{formatCurrency(investWeekly)}</strong> of every payday gets invested
            {netWeekly > 0 && <span className="opacity-70"> — {Math.round((investWeekly / netWeekly) * 100)}% of your allowance</span>}
            .
          </p>
          <p className="mt-1 text-xs opacity-70">
            That&apos;s about {formatCurrency(round2(investWeekly * 52))} a year going to work for you.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {ASSET_CLASS_ORDER.map((assetClass) => {
          const meta = ASSET_CLASSES[assetClass];
          const rule = rules.find((candidate) => candidate.assetClass === assetClass);
          const open = editing === assetClass;
          // Same unlock gate as investing by hand: a locked class stays visible but can't be armed.
          const unlocked = isAssetClassUnlocked(kid, assetClass);

          return (
            <div
              key={assetClass}
              className={`rounded-lg border border-black/10 p-3 dark:border-white/10 ${unlocked ? "" : "opacity-55"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {unlocked ? meta.emoji : "🔒"} {meta.shortLabel}
                  </p>
                  <p className="text-xs opacity-70">
                    {!unlocked ? (
                      "Locked — ask a parent to turn this one on."
                    ) : rule ? (
                      <span style={{ color: assetColor(assetClass) }}>
                        {formatCurrency(rule.weeklyAmount)} every payday
                        {assetClass === "cd" && rule.lockWeeks ? ` · locked ${rule.lockWeeks} weeks each time` : ""}
                      </span>
                    ) : (
                      "Off — nothing goes here automatically"
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => setEditing(open ? null : assetClass)}
                  className="shrink-0 rounded-md border border-black/20 px-2 py-1 text-xs disabled:opacity-40 dark:border-white/20"
                >
                  {open ? "Close" : rule ? "Change" : "Set it up"}
                </button>
              </div>

              {open && unlocked && (
                <RuleEditor
                  assetClass={assetClass}
                  netWeekly={netWeekly}
                  current={rule?.weeklyAmount ?? 0}
                  currentLockWeeks={rule?.lockWeeks}
                  onSave={(amount, lockWeeks) => {
                    onMutate((s) => setAutoInvestRule(s, kid.id, assetClass, amount, lockWeeks, actor));
                    setEditing(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {netWeekly > 0 && (
        <div className="border-t border-black/10 pt-3 text-xs dark:border-white/10">
          <p className="opacity-70">
            Your allowance after tax is {formatCurrency(netWeekly)} a payday. Goals take{" "}
            {formatCurrency(goalsWeekly)}, auto-investing takes {formatCurrency(investWeekly)}.
          </p>
          {leftOver >= 0 ? (
            <p className="opacity-70">That leaves {formatCurrency(leftOver)} a payday to spend or save yourself.</p>
          ) : (
            <p className="text-amber-600 dark:text-amber-400">
              ⚠️ That&apos;s {formatCurrency(Math.abs(leftOver))} more than a payday brings in. Nothing breaks — each
              payday just fills what it can, in order — but some weeks won&apos;t reach everything.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Amount picker for one asset class: quick fractions of the allowance, or type your own. */
function RuleEditor({
  assetClass,
  netWeekly,
  current,
  currentLockWeeks,
  onSave,
}: {
  assetClass: AssetClass;
  netWeekly: number;
  current: number;
  currentLockWeeks?: number;
  onSave: (weeklyAmount: number, lockWeeks: number | undefined) => void;
}) {
  const [amount, setAmount] = useState(current > 0 ? String(current) : "");
  const [lockWeeks, setLockWeeks] = useState(currentLockWeeks ?? 12);
  const value = Number(amount) || 0;
  const fractions = [0.1, 0.25, 0.5].map((fraction) => Math.max(0.25, round2(netWeekly * fraction)));

  return (
    <div className="mt-3 space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min={0}
          step="0.25"
          placeholder="$ per payday"
          aria-label={`Dollars per payday into ${ASSET_CLASSES[assetClass].shortLabel}`}
          className="w-28 rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
        {netWeekly > 0 &&
          fractions.map((fraction, index) => (
            <button
              key={fraction}
              type="button"
              onClick={() => setAmount(String(fraction))}
              className="rounded-full border border-black/20 px-2 py-1 text-xs dark:border-white/20"
            >
              {[10, 25, 50][index]}% ({formatCurrency(fraction)})
            </button>
          ))}
      </div>

      {assetClass === "cd" && (
        <select
          value={lockWeeks}
          onChange={(event) => setLockWeeks(Number(event.target.value))}
          aria-label="How long each payday's slice is locked up"
          className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        >
          {LOCK_OPTIONS.map((weeks) => (
            <option key={weeks} value={weeks}>
              Lock each one {weeks} weeks
            </option>
          ))}
        </select>
      )}

      {value > 0 && (
        <p className="text-xs opacity-70">
          {formatCurrency(value)} a payday is {formatCurrency(round2(value * 52))} a year into{" "}
          {ASSET_CLASSES[assetClass].shortLabel}
          {assetClass === "cd" ? ` — a new locked slice every payday, each freeing up ${lockWeeks} weeks later.` : "."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave(value, assetClass === "cd" ? lockWeeks : undefined)}
          disabled={value <= 0}
          className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {current > 0 ? "Save change" : "Turn it on"}
        </button>
        {current > 0 && (
          <button
            type="button"
            onClick={() => onSave(0, undefined)}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Turn it off
          </button>
        )}
      </div>
    </div>
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
