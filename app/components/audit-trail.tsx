"use client";

import { useState } from "react";
import { undoAuditEntry } from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";

/**
 * A single log of who did what, parent or kid, with an Undo button wherever the action can be
 * cleanly reversed — the general-purpose safety net for the mistake-prone actions (an investment
 * made on the wrong kid, an approval that shouldn't have gone through) that used to need a
 * bespoke delete button per feature.
 */
export function AuditTrailPanel({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const entries = state.auditLog.slice().reverse();

  function handleUndo(entryId: string) {
    try {
      setError(null);
      onMutate((s) => undoAuditEntry(s, entryId));
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Couldn't undo that.");
    }
  }

  function kidName(kidId?: string): string | null {
    if (!kidId) return null;
    return state.kids.find((kid) => kid.id === kidId)?.name ?? null;
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">🧾 Activity &amp; Undo</h2>
      <p className="text-xs opacity-60">
        Every money-moving action, who did it, and a one-tap undo — for whenever a tap goes to the
        wrong kid or a mistake needs cleaning up.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {entries.length === 0 && <p className="text-sm opacity-70">Nothing logged yet.</p>}

      <div className="divide-y divide-black/10 dark:divide-white/10">
        {entries.map((entry) => {
          const kid = kidName(entry.kidId);
          return (
            <div key={entry.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="space-y-0.5">
                <p>
                  {entry.summary}
                  {kid && !entry.summary.includes(kid) && ` (${kid})`}
                </p>
                <p className="text-xs opacity-60">
                  {entry.actor.role === "parent" ? "👤" : "🧒"} {entry.actor.name} ·{" "}
                  {new Date(entry.at).toLocaleString()}
                  {entry.undoneAt && " · Undone"}
                </p>
              </div>
              {entry.undo && !entry.undoneAt && (
                <button
                  onClick={() => handleUndo(entry.id)}
                  className="shrink-0 rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
                >
                  Undo
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
