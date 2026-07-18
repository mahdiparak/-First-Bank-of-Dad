"use client";

import { useState } from "react";
import type { MarketDataResponse } from "@/lib/market-data";
import { allocateToInvestment, availableBalanceForKid, withdrawFromInvestment } from "@/lib/mutations";
import { ASSET_CLASSES, type AssetClass, type FamilyBankState, type InvestmentPosition, type KidProfile } from "@/lib/schema";
import { WhatIfSimulator } from "./whatif-simulator";

const ASSET_CLASS_ORDER: AssetClass[] = ["savings", "cd", "stocks", "crypto"];

export function InvestmentSandbox({
  state,
  kid,
  marketData,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
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
  onMutate,
}: {
  assetClass: AssetClass;
  state: FamilyBankState;
  kid: KidProfile;
  available: number;
  positions: InvestmentPosition[];
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [amount, setAmount] = useState("");
  const [lockWeeks, setLockWeeks] = useState("12");
  const meta = ASSET_CLASSES[assetClass];
  const total = positions.reduce((sum, position) => sum + position.currentValue, 0);

  function handleInvest(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    onMutate((s) =>
      allocateToInvestment(s, kid.id, assetClass, Number(amount), assetClass === "cd" ? Number(lockWeeks) : undefined),
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
        <p className="text-lg font-semibold">{formatCurrency(total)}</p>
      </div>

      {positions.map((position) => (
        <div key={position.id} className="flex items-center justify-between text-xs opacity-80">
          <span>
            {formatCurrency(position.currentValue)}
            {position.assetClass === "cd" && position.maturesAt && ` (matures ${new Date(position.maturesAt).toLocaleDateString()})`}
          </span>
          <button
            onClick={() => onMutate((s) => withdrawFromInvestment(s, position.id))}
            className="rounded-md border border-black/20 px-2 py-1 dark:border-white/20"
          >
            Cash out
          </button>
        </div>
      ))}

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

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
