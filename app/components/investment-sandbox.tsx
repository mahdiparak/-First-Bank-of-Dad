"use client";

import { useState } from "react";
import type { MarketDataResponse } from "@/lib/market-data";
import {
  allocateToInvestment,
  availableBalanceForKid,
  canCashOutInvestment,
  investmentUnlockAt,
  withdrawFromInvestment,
} from "@/lib/mutations";
import { ASSET_CLASSES, type AssetClass, type AuditActor, type FamilyBankState, type InvestmentPosition, type KidProfile } from "@/lib/schema";
import { WhatIfSimulator } from "./whatif-simulator";

const ASSET_CLASS_ORDER: AssetClass[] = ["savings", "cd", "stocks", "crypto"];

export function InvestmentSandbox({
  state,
  kid,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  marketData: MarketDataResponse | null;
  actor: AuditActor;
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

  const available = availableBalanceForKid(state, kid.id);
  const positions = state.investments.filter((position) => position.kidId === kid.id && !position.closedAt);

  return (
    <section className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Investment Sandbox</h2>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs opacity-60">{formatCurrency(available)} available to invest.</p>

      {ASSET_CLASS_ORDER.map((assetClass) => (
        <AssetClassCard
          key={assetClass}
          assetClass={assetClass}
          state={state}
          kid={kid}
          available={available}
          positions={positions.filter((position) => position.assetClass === assetClass)}
          actor={actor}
          onMutate={tryMutate}
        />
      ))}

      <WhatIfSimulator parentSettings={state.parentSettings} marketData={marketData} />
    </section>
  );
}

function AssetClassCard({
  assetClass,
  state,
  kid,
  available,
  positions,
  actor,
  onMutate,
}: {
  assetClass: AssetClass;
  state: FamilyBankState;
  kid: KidProfile;
  available: number;
  positions: InvestmentPosition[];
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [amount, setAmount] = useState("");
  const [lockWeeks, setLockWeeks] = useState("12");
  const meta = ASSET_CLASSES[assetClass];
  const minHoldDays = state.parentSettings.investmentMinHoldDays ?? 0;
  const total = positions.reduce((sum, position) => sum + position.currentValue, 0);
  const totalPrincipal = positions.reduce((sum, position) => sum + position.principal, 0);

  function handleInvest(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    onMutate((s) =>
      allocateToInvestment(
        s,
        kid.id,
        assetClass,
        Number(amount),
        assetClass === "cd" ? Number(lockWeeks) : undefined,
        actor,
      ),
    );
    setAmount("");
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="text-xs opacity-60">{meta.description}</p>
          {assetClass === "savings" && <p className="text-xs opacity-60">{formatPercent(state.parentSettings.hysaApr)} APR</p>}
          {assetClass === "cd" && <p className="text-xs opacity-60">{formatPercent(state.parentSettings.cdApr)} APR</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{formatCurrency(total)}</p>
          {positions.length > 0 && <Delta principal={totalPrincipal} value={total} />}
        </div>
      </div>

      {positions.map((position) => {
        const unlocked = canCashOutInvestment(position, minHoldDays);
        return (
          <div key={position.id} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="opacity-80">
                {formatCurrency(position.principal)} → <strong>{formatCurrency(position.currentValue)}</strong>
              </span>{" "}
              <Delta principal={position.principal} value={position.currentValue} inline />
              {position.assetClass === "cd" && position.maturesAt && (
                <span className="opacity-60"> · matures {new Date(position.maturesAt).toLocaleDateString()}</span>
              )}
            </div>
            {unlocked ? (
              <button
                onClick={() => onMutate((s) => withdrawFromInvestment(s, position.id, actor))}
                className="shrink-0 rounded-md border border-black/20 px-2 py-1 dark:border-white/20"
              >
                Cash out
              </button>
            ) : (
              <span className="shrink-0 whitespace-nowrap rounded-md bg-black/[0.04] px-2 py-1 opacity-60 dark:bg-white/[0.08]">
                🔒 until {investmentUnlockAt(position, minHoldDays).toLocaleDateString()}
              </span>
            )}
          </div>
        );
      })}

      <form onSubmit={handleInvest} className="flex flex-wrap gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min={0.01}
          step="0.01"
          placeholder="Amount ($)"
          className="w-28 rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
        {assetClass === "cd" && (
          <select
            value={lockWeeks}
            onChange={(event) => setLockWeeks(event.target.value)}
            className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="4">4 weeks</option>
            <option value="12">12 weeks</option>
            <option value="26">26 weeks</option>
            <option value="52">52 weeks</option>
          </select>
        )}
        <button
          type="submit"
          disabled={available <= 0}
          className="rounded-md bg-black px-3 py-1 text-sm text-white dark:bg-white dark:text-black"
        >
          Invest
        </button>
      </form>
    </div>
  );
}

/** Gain/loss vs. what was put in — the "is my money going up or down" signal, in $ and %, with a
 *  direction arrow and colour. Flat (exactly break-even) reads neutral. */
function Delta({ principal, value, inline = false }: { principal: number; value: number; inline?: boolean }) {
  const change = value - principal;
  const pct = principal > 0 ? (change / principal) * 100 : 0;
  const up = change > 0.004;
  const down = change < -0.004;
  const arrow = up ? "▲" : down ? "▼" : "▬";
  const color = up ? "text-green-600 dark:text-green-400" : down ? "text-red-500" : "opacity-60";
  const text = `${arrow} ${change >= 0 ? "+" : "−"}${formatCurrency(Math.abs(change))} (${change >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`;
  return <span className={`${color} ${inline ? "text-xs" : "text-sm font-medium"}`}>{text}</span>;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
