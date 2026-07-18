"use client";

import { useState } from "react";
import { simulateWhatIf, type WhatIfResult } from "@/lib/investment-engine";
import type { MarketDataResponse } from "@/lib/market-data";
import { ASSET_CLASSES, type AssetClass } from "@/lib/schema";

const ASSET_CLASS_ORDER: AssetClass[] = ["savings", "cd", "stocks", "crypto"];

export function WhatIfSimulator({
  parentSettings,
  marketData,
}: {
  parentSettings: { hysaApr: number; cdApr: number };
  marketData: MarketDataResponse | null;
}) {
  const [assetClass, setAssetClass] = useState<AssetClass>("stocks");
  const [principal, setPrincipal] = useState("100");
  const [weeks, setWeeks] = useState("52");
  const [result, setResult] = useState<WhatIfResult | null>(null);

  function handleRun(event: React.FormEvent) {
    event.preventDefault();
    setResult(simulateWhatIf(assetClass, Number(principal), Number(weeks), parentSettings, marketData));
  }

  return (
    <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
      <p className="text-sm font-medium">What-If Time Machine</p>
      <p className="text-xs opacity-60">
        This is just for exploring — it never touches real money or gets saved.
      </p>

      <form onSubmit={handleRun} className="flex flex-wrap gap-2">
        <select
          value={assetClass}
          onChange={(event) => setAssetClass(event.target.value as AssetClass)}
          className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        >
          {ASSET_CLASS_ORDER.map((option) => (
            <option key={option} value={option}>
              {ASSET_CLASSES[option].label}
            </option>
          ))}
        </select>
        <input
          value={principal}
          onChange={(event) => setPrincipal(event.target.value)}
          type="number"
          min={1}
          step="1"
          placeholder="Starting $"
          className="w-24 rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <select
          value={weeks}
          onChange={(event) => setWeeks(event.target.value)}
          className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="12">3 months</option>
          <option value="26">6 months</option>
          <option value="52">1 year</option>
        </select>
        <button type="submit" className="rounded-md bg-black px-3 py-1 text-sm text-white dark:bg-white dark:text-black">
          Fast-forward
        </button>
      </form>

      {result && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs opacity-60">Ending value</p>
            <p className="font-semibold">{formatCurrency(result.endingValue)}</p>
          </div>
          <div>
            <p className="text-xs opacity-60">Lowest point</p>
            <p className="font-semibold text-red-500">{formatCurrency(result.minValue)}</p>
          </div>
          <div>
            <p className="text-xs opacity-60">Highest point</p>
            <p className="font-semibold text-green-600">{formatCurrency(result.maxValue)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
