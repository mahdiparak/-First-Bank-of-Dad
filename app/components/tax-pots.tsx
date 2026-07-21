"use client";

import { useState } from "react";
import { payTaxRefund } from "@/lib/mutations";
import type { AuditActor, FamilyBankState } from "@/lib/schema";
import { InfoTooltip } from "./info-tooltip";

/** Paying out a tax pot is an operational money action, so it lives in the Money tab — the rate that fills it stays in Family Settings. */
export function TaxPots({
  state,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function handlePayTaxRefund(kidId: string) {
    try {
      setError(null);
      onMutate((s) => payTaxRefund(s, kidId, actor));
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="flex items-center font-semibold">
        Tax pots
        <InfoTooltip label="How do Tax pots work?">
          <p>
            Every allowance payment automatically withholds the Family Tax % (set in ⚙️ Settings →
            📈 Family) into this pot — just like real income tax withholding.
          </p>
          <p>
            Tap &quot;Pay Tax Refund&quot; whenever you want to hand the withheld amount back to a
            kid, mimicking a real tax refund. It&apos;s a hands-on way to show where withholding
            goes and that it does eventually come back.
          </p>
        </InfoTooltip>
      </h2>
      <p className="text-xs opacity-60">
        The Family Tax withheld from each allowance payment, ready to pay out as a reward.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {state.kids.length === 0 && <p className="text-xs opacity-60">No kids yet.</p>}
      {state.kids.map((kid) => {
        const pot = state.taxPots.find((candidate) => candidate.kidId === kid.id);
        const balance = pot?.balance ?? 0;
        return (
          <div key={kid.id} className="flex items-center justify-between text-sm">
            <span>
              {kid.name} — {formatCurrency(balance)}
            </span>
            <button
              onClick={() => handlePayTaxRefund(kid.id)}
              disabled={balance <= 0}
              className="rounded-md border border-black/20 px-2 py-1 text-xs disabled:opacity-40 dark:border-white/20"
            >
              Pay Tax Refund
            </button>
          </div>
        );
      })}
    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
