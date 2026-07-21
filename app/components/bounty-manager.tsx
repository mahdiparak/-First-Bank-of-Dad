"use client";

import { useState } from "react";
import { createBounty, deleteBounty } from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

/** Posting and managing open gigs — an everyday money action, so it lives in the Money tab; Approvals stays a pure review queue. */
export function BountyManager({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState("");

  function tryMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    try {
      setError(null);
      onMutate(mutator);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !reward) return;
    tryMutate((s) => createBounty(s, title.trim(), Number(reward)));
    setTitle("");
    setReward("");
  }

  const openBounties = state.bounties.filter((bounty) => bounty.status === "open");

  return (
    <section className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Bounty Board — open gigs</h2>
      <p className="text-xs opacity-60">
        Extra jobs the kids can claim for extra money. Claimed bounties show up in ✅ Approvals.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {openBounties.length === 0 && <p className="text-xs opacity-60">No open bounties.</p>}
      {openBounties.map((bounty) => (
        <div key={bounty.id} className="flex items-center justify-between text-sm">
          <span>{bounty.title}</span>
          <div className="flex items-center gap-3">
            <span className="opacity-70">{formatCurrency(bounty.reward)}</span>
            <button onClick={() => tryMutate((s) => deleteBounty(s, bounty.id))} className="text-xs text-red-500">
              Remove
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 pt-1">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Chore / task"
          className={`${inputClass} flex-1`}
        />
        <input
          value={reward}
          onChange={(event) => setReward(event.target.value)}
          type="number"
          min={0.01}
          step="0.01"
          placeholder="Reward ($)"
          className={`${inputClass} w-28`}
        />
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
          Post bounty
        </button>
      </form>
    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
