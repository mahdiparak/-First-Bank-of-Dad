"use client";

import { useState } from "react";
import { payTaxRefund, setDadMatchMilestones, updateParentSettings } from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";
import { InfoTooltip } from "./info-tooltip";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

/** The family's financial rules: interest/tax rates, Dad Match rewards, and tax pot payouts — kept separate from Profile Setup. */
export function ParentSettingsPanel({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const settings = state.parentSettings;
  const [hysaApr, setHysaApr] = useState(String(toPercent(settings.hysaApr)));
  const [cdApr, setCdApr] = useState(String(toPercent(settings.cdApr)));
  const [taxRate, setTaxRate] = useState(String(toPercent(settings.taxRate)));
  const [milestoneWeeks, setMilestoneWeeks] = useState("");
  const [milestoneBonus, setMilestoneBonus] = useState("");
  const [taxError, setTaxError] = useState<string | null>(null);

  function handlePayTaxRefund(kidId: string) {
    try {
      setTaxError(null);
      onMutate((s) => payTaxRefund(s, kidId));
    } catch (error) {
      setTaxError(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  function handleSaveRates(event: React.FormEvent) {
    event.preventDefault();
    onMutate((s) =>
      updateParentSettings(s, {
        hysaApr: Number(hysaApr) / 100,
        cdApr: Number(cdApr) / 100,
        taxRate: Number(taxRate) / 100,
      }),
    );
  }

  function handleAddMilestone(event: React.FormEvent) {
    event.preventDefault();
    if (!milestoneWeeks || !milestoneBonus) return;
    onMutate((s) =>
      setDadMatchMilestones(s, [
        ...s.parentSettings.dadMatchMilestones,
        { weeks: Number(milestoneWeeks), bonus: Number(milestoneBonus) },
      ]),
    );
    setMilestoneWeeks("");
    setMilestoneBonus("");
  }

  function handleRemoveMilestone(weeks: number) {
    onMutate((s) =>
      setDadMatchMilestones(
        s,
        s.parentSettings.dadMatchMilestones.filter((milestone) => milestone.weeks !== weeks),
      ),
    );
  }

  return (
    <section className="space-y-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Family Settings</h2>

      <div className="space-y-2">
        <div className="flex items-center text-sm opacity-70">
          Rates
          <InfoTooltip label="What are these rates?">
            <p>
              <strong>HYSA APR:</strong> your real high-yield savings account&apos;s current rate
              (check your bank&apos;s app — e.g. Marcus, Ally).
            </p>
            <p>
              <strong>CD APR:</strong> your CD&apos;s fixed rate, if you have one.
            </p>
            <p>
              <strong>Family Tax %:</strong> how much of each allowance payment is withheld into
              the kid&apos;s Tax Pot below, paid back later as a &quot;refund&quot; — a hands-on
              lesson in how taxes work.
            </p>
          </InfoTooltip>
        </div>
        <form onSubmit={handleSaveRates} className="flex flex-wrap items-end gap-3">
          <Field label="HYSA APR %">
            <input value={hysaApr} onChange={(e) => setHysaApr(e.target.value)} type="number" step="0.01" className={`${inputClass} w-24`} />
          </Field>
          <Field label="CD APR %">
            <input value={cdApr} onChange={(e) => setCdApr(e.target.value)} type="number" step="0.01" className={`${inputClass} w-24`} />
          </Field>
          <Field label="Family Tax %">
            <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} type="number" step="0.01" className={`${inputClass} w-24`} />
          </Field>
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
            Save rates
          </button>
        </form>
      </div>

      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="flex items-center text-sm opacity-70">
          Dad Match milestones
          <InfoTooltip label="How do Dad Match milestones work?">
            <p>
              A reward for saving streaks: go a set number of weeks in a row without withdrawing,
              and a one-time bonus gets paid in automatically.
            </p>
            <p>
              <strong>Weeks:</strong> how many consecutive weeks without a withdrawal earns it.
            </p>
            <p>
              <strong>Bonus $:</strong> the one-time amount paid when that streak is hit. Spending
              toward a completed savings goal doesn&apos;t break the streak — only unplanned
              withdrawals do.
            </p>
          </InfoTooltip>
        </p>
        {settings.dadMatchMilestones.map((milestone) => (
          <div key={milestone.weeks} className="flex items-center justify-between text-sm">
            <span>
              {milestone.weeks} weeks → {formatCurrency(milestone.bonus)} bonus
            </span>
            <button onClick={() => handleRemoveMilestone(milestone.weeks)} className="text-xs text-red-500">
              Remove
            </button>
          </div>
        ))}
        <form onSubmit={handleAddMilestone} className="flex gap-2">
          <input
            value={milestoneWeeks}
            onChange={(e) => setMilestoneWeeks(e.target.value)}
            type="number"
            min={1}
            placeholder="Weeks"
            className={`${inputClass} w-20`}
          />
          <input
            value={milestoneBonus}
            onChange={(e) => setMilestoneBonus(e.target.value)}
            type="number"
            min={0}
            step="0.01"
            placeholder="Bonus $"
            className={`${inputClass} w-24`}
          />
          <button type="submit" className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            Add milestone
          </button>
        </form>
      </div>

      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="flex items-center text-sm opacity-70">
          Tax pots
          <InfoTooltip label="How do Tax pots work?">
            <p>
              Every allowance payment automatically withholds the Family Tax % set above into this
              pot — just like real income tax withholding.
            </p>
            <p>
              Tap &quot;Pay Tax Refund&quot; whenever you want to hand the withheld amount back to
              a kid, mimicking a real tax refund. It&apos;s a hands-on way to show where
              withholding goes and that it does eventually come back.
            </p>
          </InfoTooltip>
        </p>
        <p className="text-xs opacity-60">
          The Family Tax withheld from each allowance payment, ready to pay out as a reward.
        </p>
        {taxError && <p className="text-sm text-red-500">{taxError}</p>}
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
      </div>

    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs opacity-70">
      {label}
      {children}
    </label>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function toPercent(rate: number): number {
  return Math.round(rate * 100 * 10_000) / 10_000;
}
