"use client";

import { buildMoneyTimeline } from "@/lib/timeline";
import { totalTaxPaidForKid } from "@/lib/mutations";
import type { FamilyBankState, KidProfile } from "@/lib/schema";

/**
 * Shown wherever a kid is about to ask to spend money: what this withdrawal costs them in
 * forgone growth, plus a reminder of how much Family Tax they've paid over their lifetime —
 * both purely informational, neither changes the amount they actually receive.
 */
export function WithdrawalPreview({
  state,
  kid,
  amount,
  young = false,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  amount: number;
  young?: boolean;
}) {
  const taxPaid = totalTaxPaidForKid(state, kid.id);

  if (!amount || amount <= 0) {
    if (taxPaid <= 0) return null;
    return (
      <p className={`opacity-60 ${young ? "text-base" : "text-xs"}`}>
        🧾 You&apos;ve paid {formatCurrency(taxPaid)} in Family Tax so far.
      </p>
    );
  }

  const timeline = buildMoneyTimeline(state, kid, { simAmount: amount, simKind: "withdraw" });
  const balance = timeline.past[timeline.past.length - 1].value;
  const oneYearGap = timeline.oneYearBaseline - (timeline.oneYearSim ?? timeline.oneYearBaseline);

  const recoveryText =
    timeline.recoveryWeeks == null
      ? `it'd take more than 5 years to grow back to ${formatCurrency(balance)} at your current allowance and rate`
      : `it'd take about ${timeline.recoveryWeeks} week${timeline.recoveryWeeks === 1 ? "" : "s"} to grow back to ${formatCurrency(balance)}`;

  return (
    <div
      className={`space-y-1 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 ${
        young ? "rounded-2xl p-4 text-base" : "p-3 text-xs"
      }`}
    >
      <p>
        💡 If you leave {formatCurrency(amount)} in savings instead of taking it out, {recoveryText}.
      </p>
      {oneYearGap > 0 && (
        <p className="opacity-70">
          In a year, that&apos;s about {formatCurrency(oneYearGap)} less than if it had kept growing.
        </p>
      )}
      {taxPaid > 0 && (
        <p className="opacity-70">🧾 You&apos;ve paid {formatCurrency(taxPaid)} in Family Tax so far.</p>
      )}
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
