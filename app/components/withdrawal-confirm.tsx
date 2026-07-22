"use client";

import { buildMoneyTimeline, type TimelinePoint } from "@/lib/timeline";
import { totalTaxPaidForKid } from "@/lib/mutations";
import { kidColor, type FamilyBankState, type KidProfile } from "@/lib/schema";

const WIDTH = 340;
const HEIGHT = 200;
const MARGIN = { top: 24, right: 12, bottom: 22, left: 44 };
const WITHDRAW_COLOR = "#ef4444";

/**
 * A "are you sure?" gut-check shown right when a kid tries to submit a withdrawal request —
 * not while they're still typing (that's WithdrawalPreview's job). The chart deliberately zooms
 * its y-axis to just the two compared lines (keep it vs. take it out) rather than the kid's whole
 * balance history, so even a small withdrawal opens a visibly dramatic gap.
 */
export function WithdrawalConfirmDialog({
  state,
  kid,
  amount,
  onConfirm,
  onCancel,
  young = false,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  amount: number;
  onConfirm: () => void;
  onCancel: () => void;
  young?: boolean;
}) {
  const timeline = buildMoneyTimeline(state, kid, { simAmount: amount, simKind: "withdraw" });
  const taxPaid = totalTaxPaidForKid(state, kid.id);
  const balance = timeline.past[timeline.past.length - 1].value;
  const color = kidColor(kid);

  const horizonWeeks = Math.min(timeline.future.length - 1, Math.max(26, (timeline.recoveryWeeks ?? 0) + 8));
  const future = timeline.future.slice(0, horizonWeeks + 1);
  const sim = (timeline.sim ?? future).slice(0, horizonWeeks + 1);

  const recoveryText =
    timeline.recoveryWeeks == null
      ? `it would take more than 5 years to grow back to ${formatCurrency(balance)} at your current allowance and rate`
      : `it would take about ${timeline.recoveryWeeks} week${timeline.recoveryWeeks === 1 ? "" : "s"} to grow back to ${formatCurrency(balance)}`;
  const oneYearGap = timeline.oneYearBaseline - (timeline.oneYearSim ?? timeline.oneYearBaseline);

  const tMin = future[0].t;
  const tMax = future[future.length - 1].t;
  const values = [...future, ...sim].map((p) => p.value);
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);
  const pad = Math.max((dataMax - dataMin) * 0.15, 1);
  const yTop = dataMax + pad;
  const yBottom = Math.max(0, dataMin - pad);

  const x = (t: number) => MARGIN.left + ((t - tMin) / (tMax - tMin || 1)) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (v: number) =>
    HEIGHT - MARGIN.bottom - ((v - yBottom) / (yTop - yBottom || 1)) * (HEIGHT - MARGIN.top - MARGIN.bottom);
  const path = (points: TimelinePoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const bandPath = (a: TimelinePoint[], b: TimelinePoint[]) => {
    const forward = a.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const backward = [...b]
      .reverse()
      .map((p) => `L${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(" ");
    return `${forward} ${backward} Z`;
  };

  const recoveryAt = timeline.recoveryAt;
  const showRecoveryMarker = recoveryAt !== undefined && recoveryAt <= tMax;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div
        className={`w-full space-y-3 overflow-y-auto rounded-2xl bg-white p-5 dark:bg-neutral-900 ${
          young ? "max-w-md rounded-3xl p-6" : "max-w-sm"
        }`}
        style={{ maxHeight: "90vh" }}
      >
        <h3 className={young ? "text-xl font-semibold" : "text-lg font-semibold"}>
          🤔 Wait — are you sure?
        </h3>

        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" aria-label="What happens to your money if you take this out">
          <path d={bandPath(future, sim)} fill={WITHDRAW_COLOR} fillOpacity="0.18" stroke="none" />
          <path d={path(future)} fill="none" stroke={color} strokeWidth="3" strokeDasharray="5 5" />
          <path d={path(sim)} fill="none" stroke={WITHDRAW_COLOR} strokeWidth="3" strokeDasharray="5 5" />
          {showRecoveryMarker && recoveryAt !== undefined && (
            <circle cx={x(recoveryAt)} cy={y(balance)} r="4.5" fill="#22c55e" />
          )}
          <text x={MARGIN.left} y={MARGIN.top - 10} fontSize="11" fontWeight="700" fill={color}>
            ✅ If you leave it
          </text>
          <text x={MARGIN.left} y={HEIGHT - 4} fontSize="11" fontWeight="700" fill={WITHDRAW_COLOR}>
            💸 If you take it out
          </text>
        </svg>

        <p className={young ? "text-base" : "text-sm"}>
          Taking out {formatCurrency(amount)} today: {recoveryText}.
        </p>
        {oneYearGap > 0 && (
          <p className="text-sm opacity-70">
            In a year, that&apos;s about {formatCurrency(oneYearGap)} less than if it had kept growing.
          </p>
        )}
        {taxPaid > 0 && (
          <p className="text-sm opacity-70">🧾 You&apos;ve paid {formatCurrency(taxPaid)} in Family Tax so far.</p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 ${
              young ? "rounded-2xl py-3 text-base" : ""
            }`}
          >
            Never mind
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black ${
              young ? "rounded-2xl py-3 text-base" : ""
            }`}
          >
            Yes, ask Dad
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
