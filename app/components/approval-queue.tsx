"use client";

import { useState } from "react";
import { approveBounty, approveWithdrawal, denyBounty, denyWithdrawal } from "@/lib/mutations";
import type { AuditActor, FamilyBankState } from "@/lib/schema";

/** A pure review queue: everything here is a kid-initiated request waiting for a yes/no. Posting new bounties lives in the Money tab. */
export function ApprovalQueue({
  state,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);

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

  const pendingWithdrawals = state.withdrawalRequests.filter((request) => request.status === "pending");
  const pendingBounties = state.bounties.filter((bounty) => bounty.status === "pending-approval");

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
                onClick={() => tryMutate((s) => approveWithdrawal(s, request.id, actor))}
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
                onClick={() => tryMutate((s) => approveBounty(s, bounty.id, actor))}
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

    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
