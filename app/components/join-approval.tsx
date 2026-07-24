"use client";

import { findKidByName, findParentByName } from "@/lib/onboarding";
import { type FamilyBankState } from "@/lib/schema";
import type { JoinRequest } from "@/lib/sync";

/**
 * The parent's approval prompt for devices asking to join the family. A kid request only reaches
 * here once its name already matched a roster kid (a no-match is auto-rejected upstream). A parent
 * request always lands here so the approving parent can bind it to an existing profile or create a
 * new one.
 *
 * Approving is a UX gate, not a security one: the joiner already holds the Family Phrase (they
 * couldn't be in the room otherwise), so this controls *who a device is set up as*, not whether
 * they can technically decrypt data.
 */
export function JoinApprovalBanner({
  state,
  requests,
  onApprove,
  onDecline,
}: {
  state: FamilyBankState;
  requests: JoinRequest[];
  onApprove: (request: JoinRequest) => void;
  onDecline: (request: JoinRequest) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-400/60 bg-amber-50 p-4 dark:bg-amber-500/10">
      <h2 className="font-semibold">🙋 Someone wants to join your family</h2>
      {requests.map((request) => {
        const matchedKid = request.requestedRole === "kid" ? findKidByName(state, request.claimedName) : null;
        const matchedParent = request.requestedRole === "parent" ? findParentByName(state, request.claimedName) : null;
        const detail = matchedKid
          ? `Matches ${matchedKid.name} on your list — approving fills their device with the family data.`
          : matchedParent
            ? `Matches co-parent ${matchedParent.name}.`
            : "New co-parent — approving adds them to your family.";
        return (
          <div key={request.deviceId} className="space-y-2 rounded-lg bg-white/70 p-3 dark:bg-black/20">
            <p className="text-sm">
              <strong>{request.claimedName}</strong> wants to join as a {request.requestedRole}.
            </p>
            <p className="text-xs opacity-70">{detail}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(request)}
                className="rounded-md bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
              >
                Approve
              </button>
              <button
                onClick={() => onDecline(request)}
                className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
              >
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
