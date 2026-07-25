"use client";

import { useState } from "react";
import { streakWeekDate, weeksWithoutWithdrawalFor } from "@/lib/allowance";
import { estimateGoalSchedule } from "@/lib/goal-schedule";
import { buildMoneyTimeline, type TimelinePoint } from "@/lib/timeline";
import { totalTaxPaidForKid } from "@/lib/mutations";
import type { FamilyBankState, KidProfile } from "@/lib/schema";

const WIDTH = 340;
const HEIGHT = 200;
const MARGIN = { top: 24, right: 12, bottom: 22, left: 44 };
// Fixed, meaning-coded colors (not the kid's own accent color) so the two lines always read the
// same way: green + solid = safe/leave it alone, red + dashed = the "spend it" line.
const KEEP_COLOR = "#22c55e";
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
  suggestedGoalName,
  onConfirm,
  onCancel,
  onPlanInstead,
  young = false,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  amount: number;
  /** What they said they wanted it for — becomes the goal's name if they plan it instead. */
  suggestedGoalName?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Turns this request into a savings goal with a weekly auto-save, instead of a withdrawal. */
  onPlanInstead: (name: string, weeklyContribution: number) => void;
  young?: boolean;
}) {
  const timeline = buildMoneyTimeline(state, kid, { simAmount: amount, simKind: "withdraw" });
  const taxPaid = totalTaxPaidForKid(state, kid.id);
  const balance = timeline.past[timeline.past.length - 1].value;

  // A short horizon keeps the near-term — the part that actually matters for "should I do this
  // right now" — from getting diluted by unrelated months of allowance growth.
  const horizonWeeks = Math.min(timeline.future.length - 1, Math.max(12, (timeline.recoveryWeeks ?? 0) + 6));
  const future = timeline.future.slice(0, horizonWeeks + 1);
  const sim = (timeline.sim ?? future).slice(0, horizonWeeks + 1);

  const recoveryText =
    timeline.recoveryWeeks == null
      ? `it would take more than 5 years to grow back to ${formatCurrency(balance)} at your current allowance and rate`
      : `it would take about ${timeline.recoveryWeeks} week${timeline.recoveryWeeks === 1 ? "" : "s"} to grow back to ${formatCurrency(balance)}`;
  const oneYearGap = timeline.oneYearBaseline - (timeline.oneYearSim ?? timeline.oneYearBaseline);

  // What restarting the streak actually costs: the weeks already banked, and the next Dad Match
  // bonus — which doesn't just get delayed, it goes back to being its full length away.
  const streakWeeks = weeksWithoutWithdrawalFor(state, kid.id);
  const nextMilestone = state.parentSettings.dadMatchMilestones
    .filter((milestone) => milestone.weeks > streakWeeks)
    .sort((a, b) => a.weeks - b.weeks)[0];
  const weeksToBonus = nextMilestone ? nextMilestone.weeks - streakWeeks : 0;
  const bonusDate = nextMilestone ? streakWeekDate(state, kid.id, nextMilestone.weeks) : null;

  const tMin = future[0].t;
  const tMax = future[future.length - 1].t;

  // A withdrawal that's small next to the kid's balance (say $10 out of $1,600) barely moves the
  // needle on a plain linear axis — months of ordinary allowance growth swamp the gap and the two
  // lines look like one. Instead of scaling to raw dollars, scale to distance from *today's*
  // balance: values near it (where the actual comparison lives) get stretched out, values far from
  // it (mostly just "time passing") get compressed. A sqrt keeps this smooth in both directions.
  const warp = (v: number) => Math.sign(v - balance) * Math.sqrt(Math.abs(v - balance));
  const values = [...future, ...sim].map((p) => p.value);
  const warped = values.map(warp);
  const wMax = Math.max(...warped, 0);
  const wMin = Math.min(...warped, 0);
  const wPad = Math.max((wMax - wMin) * 0.1, 0.4);
  const wTop = wMax + wPad;
  const wBottom = wMin - wPad;

  const x = (t: number) => MARGIN.left + ((t - tMin) / (tMax - tMin || 1)) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (v: number) =>
    HEIGHT - MARGIN.bottom - ((warp(v) - wBottom) / (wTop - wBottom || 1)) * (HEIGHT - MARGIN.top - MARGIN.bottom);
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
          <path d={path(future)} fill="none" stroke={KEEP_COLOR} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path(sim)} fill="none" stroke={WITHDRAW_COLOR} strokeWidth="3.5" strokeDasharray="6 5" strokeLinecap="round" />
          {showRecoveryMarker && recoveryAt !== undefined && (
            <circle cx={x(recoveryAt)} cy={y(balance)} r="4.5" fill={KEEP_COLOR} />
          )}
          {/* Legend swatches mirror the actual line style (solid vs. dashed), not just color, so
              the difference reads even without relying on color perception alone. */}
          <line x1={MARGIN.left} x2={MARGIN.left + 18} y1={MARGIN.top - 15} y2={MARGIN.top - 15} stroke={KEEP_COLOR} strokeWidth="3.5" strokeLinecap="round" />
          <text x={MARGIN.left + 24} y={MARGIN.top - 10} fontSize="11" fontWeight="700" fill={KEEP_COLOR}>
            ✅ If you leave it
          </text>
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + 18}
            y1={HEIGHT - 9}
            y2={HEIGHT - 9}
            stroke={WITHDRAW_COLOR}
            strokeWidth="3.5"
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
          <text x={MARGIN.left + 24} y={HEIGHT - 4} fontSize="11" fontWeight="700" fill={WITHDRAW_COLOR}>
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
        {(streakWeeks > 0 || nextMilestone) && (
          <div className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
            <p className="font-medium">🔥 This restarts your streak</p>
            {streakWeeks > 0 && (
              <p className="opacity-80">
                {streakWeeks} week{streakWeeks === 1 ? "" : "s"} of saving goes back to zero.
              </p>
            )}
            {nextMilestone && (
              <p className="opacity-80">
                The {formatCurrency(nextMilestone.bonus)} Dad Match bonus is {weeksToBonus} week
                {weeksToBonus === 1 ? "" : "s"} away
                {bonusDate ? ` (${formatShortDate(bonusDate)})` : ""} — after restarting it&apos;s {nextMilestone.weeks}{" "}
                weeks away again.
              </p>
            )}
          </div>
        )}

        {taxPaid > 0 && (
          <p className="text-sm opacity-70">🧾 You&apos;ve paid {formatCurrency(taxPaid)} in Family Tax so far.</p>
        )}

        <PlanInstead
          kid={kid}
          state={state}
          amount={amount}
          suggestedGoalName={suggestedGoalName}
          onPlanInstead={onPlanInstead}
          young={young}
        />

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

/**
 * The other door, offered on every spending request: don't take the money out — name the thing,
 * set aside a few dollars a payday, and watch a date arrive. It turns "I want it now" into a plan
 * with a finish line, keeps the streak alive, and leaves the balance (and its growth) untouched.
 */
function PlanInstead({
  state,
  kid,
  amount,
  suggestedGoalName,
  onPlanInstead,
  young,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  amount: number;
  suggestedGoalName?: string;
  onPlanInstead: (name: string, weeklyContribution: number) => void;
  young: boolean;
}) {
  const netWeekly = round2(kid.weeklyAllowance * (1 - state.parentSettings.taxRate));
  // Default to about a third of what actually lands each payday — enough to feel like progress
  // without swallowing the whole allowance. Never more than the goal itself needs.
  const suggested = Math.max(0.5, Math.min(round2(netWeekly / 3) || 1, amount));
  const [name, setName] = useState(suggestedGoalName?.trim() || "");
  const [weekly, setWeekly] = useState(suggested);

  const contribution = Math.min(Math.max(weekly, 0), amount);
  const schedule = estimateGoalSchedule(kid, amount, contribution);
  const options = [round2(netWeekly / 3), round2(netWeekly / 2), netWeekly]
    .map((value) => Math.max(0.5, Math.min(round2(value) || 1, amount)))
    .filter((value, index, all) => all.indexOf(value) === index);

  return (
    <div className={`space-y-2 rounded-lg border border-green-600/40 bg-green-600/5 p-3 ${young ? "text-base" : "text-sm"}`}>
      <p className="font-medium">🎯 Or make it a plan instead</p>
      <p className="opacity-80">
        Save toward it instead of taking money out — your balance keeps growing and your streak keeps going.
      </p>

      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="What are you saving for?"
        className={`w-full rounded-md border border-black/20 px-2 py-1.5 dark:border-white/20 dark:bg-transparent ${
          young ? "rounded-xl py-2.5 text-base" : "text-sm"
        }`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="opacity-70">Save</span>
        {options.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setWeekly(value)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              contribution === value
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-black/20 dark:border-white/20"
            }`}
          >
            {formatCurrency(value)}/wk
          </button>
        ))}
      </div>

      <p className="opacity-80">
        {schedule
          ? `You'd have ${formatCurrency(amount)} by ${formatShortDate(schedule.completionDate)} — ${schedule.weeksToGo} payday${
              schedule.weeksToGo === 1 ? "" : "s"
            } from now.`
          : "Pick an amount to save each payday to see when you'd have it."}
      </p>

      <button
        type="button"
        disabled={!name.trim() || !schedule}
        onClick={() => onPlanInstead(name.trim(), contribution)}
        className={`w-full rounded-md bg-green-600 px-3 py-2 font-medium text-white disabled:opacity-40 ${
          young ? "rounded-2xl py-3 text-base" : "text-sm"
        }`}
      >
        Save toward this instead
      </button>
    </div>
  );
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
