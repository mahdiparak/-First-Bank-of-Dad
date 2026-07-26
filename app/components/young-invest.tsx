"use client";

import { useState } from "react";
import { positionValueSeries } from "@/lib/investment-engine";
import type { MarketDataResponse } from "@/lib/market-data";
import {
  allocateToInvestment,
  availableBalanceForKid,
  canCashOutInvestment,
  investmentUnlockAt,
  setAssetClassUnlocked,
  withdrawFromInvestment,
} from "@/lib/mutations";
import {
  ALL_ASSET_CLASSES,
  ASSET_CLASSES,
  investableAssetClassesFor,
  isAssetClassUnlocked,
  type AssetClass,
  type AuditActor,
  type FamilyBankState,
  type KidProfile,
} from "@/lib/schema";
import { Sparkline } from "./charts";
import { assetColor } from "./investment-plot";

const YOUNG_CD_LOCK_WEEKS = 4;

/**
 * Investing for a little kid. Every kind is on the screen — seeing the rocket you can't press yet
 * is the point, it's what makes "when I'm older" mean something — but only what a parent has
 * switched on can be tapped, and only the two that can't lose money are switchable at this age.
 *
 * A parent looking at this same screen gets the switches inline, so unlocking happens right where
 * the question comes up rather than three menus away.
 */
export function YoungInvest({
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
  const investable = investableAssetClassesFor(kid);
  const positions = state.investments.filter((position) => position.kidId === kid.id && !position.closedAt);
  const anythingUnlocked = ALL_ASSET_CLASSES.some((assetClass) => isAssetClassUnlocked(kid, assetClass));

  return (
    <section className="space-y-4 rounded-3xl border border-black/10 p-5 dark:border-white/10">
      <p className="text-lg font-semibold">📈 Make my money grow</p>
      <p className="text-sm opacity-70">
        {anythingUnlocked
          ? "Money you put in here keeps growing on its own. You can take it back out later."
          : "These are the ways money can grow. Ask Dad to turn one on for you!"}
      </p>

      {ALL_ASSET_CLASSES.map((assetClass) => (
        <YoungAssetCard
          key={assetClass}
          state={state}
          kid={kid}
          role={role}
          assetClass={assetClass}
          unlocked={isAssetClassUnlocked(kid, assetClass)}
          allowedAtThisAge={investable.includes(assetClass)}
          positions={positions.filter((position) => position.assetClass === assetClass)}
          marketData={marketData}
          actor={actor}
          onMutate={onMutate}
        />
      ))}
    </section>
  );
}

function YoungAssetCard({
  state,
  kid,
  role,
  assetClass,
  unlocked,
  allowedAtThisAge,
  positions,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  assetClass: AssetClass;
  unlocked: boolean;
  allowedAtThisAge: boolean;
  positions: FamilyBankState["investments"];
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const meta = ASSET_CLASSES[assetClass];
  const available = availableBalanceForKid(state, kid.id);
  const total = positions.reduce((sum, position) => sum + position.currentValue, 0);
  const paidIn = positions.reduce((sum, position) => sum + position.principal, 0);
  const color = assetColor(assetClass);
  const choices = [1, 5, 10].filter((value) => value <= available);

  function invest(value: number) {
    onMutate((s) =>
      allocateToInvestment(s, kid.id, assetClass, value, assetClass === "cd" ? YOUNG_CD_LOCK_WEEKS : undefined, actor),
    );
    setAmount(null);
  }

  return (
    <div
      className={`space-y-2 rounded-2xl border-2 p-4 ${unlocked ? "" : "opacity-55"}`}
      style={{ borderColor: unlocked ? color : "rgb(128 128 128 / 0.3)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold">
            {unlocked ? meta.emoji : "🔒"} {meta.shortLabel}
          </p>
          <p className="text-sm opacity-70">{meta.description}</p>
        </div>
        {unlocked && total > 0 && (
          <div className="text-right">
            <p className="text-xl font-semibold tabular-nums">{formatCurrency(total)}</p>
            {paidIn > 0 && total !== paidIn && (
              <p className="text-xs" style={{ color }}>
                {total > paidIn ? "▲ grew by " : "▼ down "}
                {formatCurrency(Math.abs(total - paidIn))}
              </p>
            )}
          </div>
        )}
      </div>

      {!unlocked && (
        <p className="text-sm opacity-80">
          {allowedAtThisAge
            ? "🔒 Ask Dad to turn this one on for you."
            : "🔒 This one's for when you're older — Dad can switch you to the big-kid screens when you're ready."}
        </p>
      )}

      {unlocked && positions.length > 0 && (
        <div className="space-y-2">
          {positions.map((position) => {
            const series = positionValueSeries(position, state.parentSettings, marketData).map((point) => point.value);
            const canCashOut = canCashOutInvestment(position, state.parentSettings.investmentMinHoldDays ?? 0);
            return (
              <div key={position.id} className="space-y-1">
                {series.length > 2 && (
                  <div style={{ color }}>
                    <Sparkline values={series} color="currentColor" baseline={position.principal} />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="opacity-70">
                    {formatCurrency(position.principal)} put in{" "}
                    {new Date(position.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {canCashOut ? (
                    <button
                      type="button"
                      onClick={() => onMutate((s) => withdrawFromInvestment(s, position.id, actor))}
                      className="rounded-xl border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
                    >
                      Take it back
                    </button>
                  ) : (
                    <span className="text-xs opacity-60">
                      🔒 until{" "}
                      {investmentUnlockAt(position, state.parentSettings.investmentMinHoldDays ?? 0).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unlocked && available > 0 && (
        <div className="space-y-2">
          {amount === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm opacity-70">Put in</span>
              {choices.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(value)}
                  className="rounded-2xl border-2 border-black/15 px-4 py-2 text-base font-semibold dark:border-white/20"
                >
                  {formatCurrency(value)}
                </button>
              ))}
              {choices.length === 0 && <span className="text-sm opacity-60">Not enough money yet.</span>}
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl bg-black/[0.04] p-3 dark:bg-white/[0.08]">
              <p className="text-base">
                Put {formatCurrency(amount)} into {meta.emoji} {meta.shortLabel}?
                {assetClass === "cd" && ` It stays there for ${YOUNG_CD_LOCK_WEEKS} weeks.`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmount(null)}
                  className="flex-1 rounded-2xl border border-black/20 px-3 py-2.5 text-base dark:border-white/20"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => invest(amount)}
                  className="flex-1 rounded-2xl bg-black px-3 py-2.5 text-base font-semibold text-white dark:bg-white dark:text-black"
                >
                  Yes! 🎉
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {role === "parent" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-2 text-xs dark:border-white/10">
          <span className="opacity-60">
            {allowedAtThisAge
              ? `Parent: ${unlocked ? "on" : "off"} for ${kid.name}`
              : `Parent: not offered on the little-kid screens`}
          </span>
          <button
            type="button"
            disabled={!allowedAtThisAge}
            onClick={() => onMutate((s) => setAssetClassUnlocked(s, kid.id, assetClass, !unlocked, actor))}
            className="rounded-md border border-black/20 px-2 py-1 disabled:opacity-40 dark:border-white/20"
          >
            {unlocked ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
