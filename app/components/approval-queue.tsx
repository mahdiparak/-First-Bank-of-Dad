"use client";

import { useState } from "react";
import { approveBounty, approveWithdrawal, createBounty, deleteBounty, denyBounty, denyWithdrawal } from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

export function ApprovalQueue({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [bountyTitle, setBountyTitle] = useState("");
  const [bountyReward, setBountyReward] = useState("");

  function tryMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    try {
      setError(null);
      onMutate(mutator);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  function kidName(kidId: string): string {
    return state.kids.find((kid) => kid.id === kidId)?.name ?? "Unknown";
  }

  function handleCreateBounty(event: React.FormEvent) {
    event.preventDefault();
    if (!bountyTitle.trim() || !bountyReward) return;
    tryMutate((s) => createBounty(s, bountyTitle.trim(), Number(bountyReward)));
    setBountyTitle("");
    setBountyReward("");
  }

  const pendingWithdrawals = state.withdrawalRequests.filter((request) => request.status === "pending");
  const pendingBounties = state.bounties.filter((bounty) => bounty.status === "pending-approval");
  const openBounties = state.bounties.filter((bounty) => bounty.status === "open");

  return (
    <section className="space-y-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Approve/Deny Queue</h2>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-2">
        <p className="text-sm opacity-70">Withdrawal requests</p>
        {pendingWithdrawals.length === 0 && <p className="text-xs opacity-60">Nothing pending.</p>}
        {pendingWithdrawals.map((request) => (
          <div key={request.id} className="flex items-center justify-between text-sm">
            <span>
              {kidName(request.kidId)} — {request.category} {formatCurrency(request.amount)}
              {request.reason && ` (${request.reason})`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => tryMutate((s) => approveWithdrawal(s, request.id))}
                className="rounded-md bg-black px-2 py-1 text-xs text-white dark:bg-white dark:text-black"
              >
                Approve
              </button>
              <button
                onClick={() => tryMutate((s) => denyWithdrawal(s, request.id))}
                className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="text-sm opacity-70">Claimed bounties</p>
        {pendingBounties.length === 0 && <p className="text-xs opacity-60">Nothing pending.</p>}
        {pendingBounties.map((bounty) => (
          <div key={bounty.id} className="flex items-center justify-between text-sm">
            <span>
              {bounty.claimedByKidId && kidName(bounty.claimedByKidId)} — {bounty.title} (
              {formatCurrency(bounty.reward)})
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => tryMutate((s) => approveBounty(s, bounty.id))}
                className="rounded-md bg-black px-2 py-1 text-xs text-white dark:bg-white dark:text-black"
              >
                Approve
              </button>
              <button
                onClick={() => tryMutate((s) => denyBounty(s, bounty.id))}
                className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="text-sm opacity-70">Bounty Board — open gigs</p>
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
        <form onSubmit={handleCreateBounty} className="flex flex-wrap gap-2 pt-1">
          <input
            value={bountyTitle}
            onChange={(event) => setBountyTitle(event.target.value)}
            placeholder="Chore / task"
            className={`${inputClass} flex-1`}
          />
          <input
            value={bountyReward}
            onChange={(event) => setBountyReward(event.target.value)}
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
      </div>
    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
