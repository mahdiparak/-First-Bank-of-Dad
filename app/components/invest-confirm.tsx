"use client";

import type { WhatIfBand } from "@/lib/investment-engine";
import { ASSET_CLASSES, type AssetClass } from "@/lib/schema";

/**
 * The last gate before real money moves. It repeats the rules the kid just read — in the form of
 * "here's what you're agreeing to" rather than a generic OK/Cancel — and, for the assets that can
 * lose money, makes them look at the worst run the simulation produced before saying yes.
 */
export function InvestConfirmDialog({
  assetClass,
  amount,
  lockWeeks,
  minHoldDays,
  band,
  horizonLabel,
  onConfirm,
  onCancel,
}: {
  assetClass: AssetClass;
  amount: number;
  lockWeeks?: number;
  minHoldDays: number;
  band: WhatIfBand;
  horizonLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = ASSET_CLASSES[assetClass];
  const worst = band.worst[band.worst.length - 1];
  const best = band.best[band.best.length - 1];
  const typical = band.typical[band.typical.length - 1];

  const promises = [
    `${formatCurrency(amount)} leaves your spendable balance right now.`,
    minHoldDays > 0
      ? `You can't cash it out for ${minHoldDays} day${minHoldDays === 1 ? "" : "s"}.`
      : "You can cash it out whenever you want.",
    ...(assetClass === "cd" && lockWeeks
      ? [`It's locked for ${lockWeeks} weeks. Cashing out early gives you your ${formatCurrency(amount)} back — without the interest.`]
      : []),
    ...(band.guaranteed
      ? ["The rate is fixed, so this one can't go down."]
      : [
          "Its value changes every single day — up some days, down others.",
          `In ${band.runs} test runs over ${horizonLabel}, ${Math.round(band.chanceOfLoss * 100)}% of them ended with less than you put in.`,
        ]),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div
        className="w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl bg-white p-5 dark:bg-neutral-900"
        style={{ maxHeight: "90vh" }}
      >
        <h3 className="text-lg font-semibold">
          {meta.emoji} Put {formatCurrency(amount)} into {meta.shortLabel}?
        </h3>

        <ul className="space-y-1.5 text-sm">
          {promises.map((promise) => (
            <li key={promise} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{promise}</span>
            </li>
          ))}
        </ul>

        {!band.guaranteed && (
          <div className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
            <p className="text-xs opacity-60">Where {formatCurrency(amount)} landed over {horizonLabel}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span className="text-red-500">Worst {formatCurrency(worst)}</span>
              <span>Typical {formatCurrency(typical)}</span>
              <span className="text-green-600 dark:text-green-400">Best {formatCurrency(best)}</span>
            </p>
            <p className="mt-1 text-xs opacity-60">Nobody gets to pick which one they get.</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            Yes, invest it
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
