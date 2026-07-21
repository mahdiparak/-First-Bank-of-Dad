"use client";

import { useState } from "react";
import { createBounty, deleteBounty } from "@/lib/mutations";
import { QUEST_ICONS, questIcon, questTier, type FamilyBankState } from "@/lib/schema";

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
  const [icon, setIcon] = useState<string>(QUEST_ICONS[0]);

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
    tryMutate((s) => createBounty(s, title.trim(), Number(reward), icon));
    setTitle("");
    setReward("");
  }

  const openBounties = state.bounties.filter((bounty) => bounty.status === "open");
  const previewTier = reward ? questTier(Number(reward)) : null;

  return (
    <section className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">🗺️ Quest Board — open gigs</h2>
      <p className="text-xs opacity-60">
        Extra jobs the kids can claim for extra money. Claimed quests show up in ✅ Approvals. The
        reward amount sets the difficulty badge kids see (Easy/Medium/Hard) — no separate setting.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {openBounties.length === 0 && <p className="text-xs opacity-60">No open quests.</p>}
      {openBounties.map((bounty) => {
        const tier = questTier(bounty.reward);
        return (
          <div key={bounty.id} className="flex items-center justify-between text-sm">
            <span>
              {questIcon(bounty)} {bounty.title}{" "}
              <span className="text-xs opacity-60">
                {tier.stars} {tier.label}
              </span>
            </span>
            <div className="flex items-center gap-3">
              <span className="opacity-70">{formatCurrency(bounty.reward)}</span>
              <button onClick={() => tryMutate((s) => deleteBounty(s, bounty.id))} className="text-xs text-red-500">
                Remove
              </button>
            </div>
          </div>
        );
      })}
      <form onSubmit={handleCreate} className="space-y-2 pt-1">
        <div className="flex flex-wrap gap-1">
          {QUEST_ICONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setIcon(option)}
              className={`rounded-lg border-2 p-1 text-xl ${
                icon === option ? "border-black dark:border-white" : "border-transparent"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
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
            Post quest
          </button>
        </div>
        {previewTier && (
          <p className="text-xs opacity-60">
            Kids will see: {icon} {title || "Chore / task"} — {previewTier.stars} {previewTier.label}
          </p>
        )}
      </form>
    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
