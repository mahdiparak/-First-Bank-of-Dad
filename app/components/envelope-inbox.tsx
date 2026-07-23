"use client";

import { useState } from "react";
import { resolveEnvelope } from "@/lib/mutations";
import type { AuditActor, Envelope, FamilyBankState, KidProfile } from "@/lib/schema";

/** Shows every unopened envelope this kid has waiting — quest rewards they haven't split yet. */
export function EnvelopeInbox({
  state,
  kid,
  actor,
  onMutate,
  young = false,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
  young?: boolean;
}) {
  const envelopes = state.envelopes.filter((envelope) => envelope.kidId === kid.id && !envelope.openedAt);
  if (envelopes.length === 0) return null;

  return (
    <div className="space-y-3">
      {envelopes.map((envelope) => (
        <EnvelopeCard key={envelope.id} envelope={envelope} state={state} kid={kid} actor={actor} onMutate={onMutate} young={young} />
      ))}
    </div>
  );
}

function EnvelopeCard({
  envelope,
  state,
  kid,
  actor,
  onMutate,
  young,
}: {
  envelope: Envelope;
  state: FamilyBankState;
  kid: KidProfile;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
  young: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splits, setSplits] = useState<Record<string, string>>({});

  const goals = state.goals.filter((goal) => goal.kidId === kid.id && !goal.completedAt && !goal.spentAt);
  const totalToGoals = round2(Object.values(splits).reduce((total, value) => total + (Number(value) || 0), 0));
  const toMain = Math.max(0, round2(envelope.amount - totalToGoals));
  const overAllocated = totalToGoals > envelope.amount;

  function handleConfirm() {
    const allocations = Object.entries(splits)
      .map(([goalId, value]) => ({ goalId, amount: Number(value) || 0 }))
      .filter((allocation) => allocation.amount > 0);
    try {
      setError(null);
      onMutate((s) => resolveEnvelope(s, envelope.id, allocations, actor));
      setOpen(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`w-full rounded-3xl border-4 border-dashed border-amber-500 bg-amber-500/10 p-5 text-center transition active:scale-[0.98] ${
          young ? "rounded-[2rem]" : ""
        }`}
      >
        <p className="text-4xl">💌</p>
        <p className={`mt-1 font-semibold ${young ? "text-xl" : "text-lg"}`}>Congratulations! 🎉</p>
        <p className="text-sm opacity-70">
          Quest done — {envelope.title} — {formatCurrency(envelope.amount)}
        </p>
        <p className="mt-2 text-sm font-semibold underline">Tap to open</p>
      </button>
    );
  }

  return (
    <div className={`space-y-3 rounded-3xl border-4 border-amber-500 bg-amber-500/5 p-5 ${young ? "rounded-[2rem]" : ""}`}>
      <p className={young ? "text-xl font-semibold" : "text-lg font-semibold"}>
        💌 {formatCurrency(envelope.amount)} from &quot;{envelope.title}&quot;
      </p>
      <p className={young ? "text-base" : "text-sm"} style={{ opacity: 0.8 }}>
        How much goes toward your goal, and how much goes to your main account?
      </p>

      {goals.length === 0 && (
        <p className="text-sm opacity-60">No goals yet — it&apos;ll all go to your main account.</p>
      )}
      {goals.map((goal) => {
        const remaining = round2(goal.targetAmount - goal.savedAmount);
        return (
          <div key={goal.id} className="flex items-center justify-between gap-2">
            <span className={young ? "text-base" : "text-sm"}>🎯 {goal.name}</span>
            <input
              type="number"
              min={0}
              max={Math.min(envelope.amount, remaining)}
              step="0.01"
              value={splits[goal.id] ?? ""}
              onChange={(event) => setSplits((prev) => ({ ...prev, [goal.id]: event.target.value }))}
              placeholder="$0"
              className={`w-24 rounded-md border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent ${
                young ? "rounded-xl py-2 text-base" : "text-sm"
              }`}
            />
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t border-black/10 pt-2 dark:border-white/10">
        <span className={young ? "text-base" : "text-sm"}>💰 Main account</span>
        <span className={`font-semibold ${young ? "text-base" : "text-sm"}`}>{formatCurrency(toMain)}</span>
      </div>
      {overAllocated && <p className="text-xs text-red-500">That&apos;s more than what&apos;s in the envelope.</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => setOpen(false)}
          className={`flex-1 rounded-md border border-black/20 px-3 py-2 dark:border-white/20 ${
            young ? "rounded-2xl py-3 text-base" : "text-sm"
          }`}
        >
          Wait
        </button>
        <button
          onClick={handleConfirm}
          disabled={overAllocated}
          className={`flex-1 rounded-md bg-black px-3 py-2 font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black ${
            young ? "rounded-2xl py-3 text-base" : "text-sm"
          }`}
        >
          Deposit it!
        </button>
      </div>
    </div>
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
