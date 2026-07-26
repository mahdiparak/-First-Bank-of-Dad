"use client";

import { useMemo, useState } from "react";
import { undoAuditEntry } from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";
import { MonthFilterBar, PagerBar, useMonthFilter, usePager } from "./paging";

/**
 * A single log of who did what, parent or kid, with an Undo button wherever the action can be
 * cleanly reversed — the general-purpose safety net for the mistake-prone actions (an investment
 * made on the wrong kid, an approval that shouldn't have gone through) that used to need a
 * bespoke delete button per feature.
 *
 * It holds hundreds of entries, so it's filtered by month and paged; the kid filter is here too,
 * since "what did Sam do last month" is the question this panel usually gets asked.
 */
export function AuditTrailPanel({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [kidFilter, setKidFilter] = useState<string>("all");

  const entries = useMemo(() => {
    const newestFirst = state.auditLog.slice().reverse();
    return kidFilter === "all" ? newestFirst : newestFirst.filter((entry) => entry.kidId === kidFilter);
  }, [state.auditLog, kidFilter]);

  const filter = useMonthFilter(entries, (entry) => entry.at);
  const pager = usePager(filter.filtered, 20);

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

      {state.auditLog.length === 0 ? (
        <p className="text-sm opacity-70">Nothing logged yet.</p>
      ) : (
        <>
          <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
            <MonthFilterBar filter={filter} />
            {state.kids.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs opacity-60">Who:</span>
                <FilterChip active={kidFilter === "all"} onClick={() => setKidFilter("all")}>
                  Everyone
                </FilterChip>
                {state.kids.map((kid) => (
                  <FilterChip key={kid.id} active={kidFilter === kid.id} onClick={() => setKidFilter(kid.id)}>
                    {kid.name}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>

          {filter.filtered.length === 0 ? (
            <p className="py-2 text-sm opacity-70">Nothing logged in {filter.label}.</p>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {pager.page.map((entry) => {
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
          )}

          <PagerBar
            pager={pager}
            noun="entries"
            className="border-t border-black/10 pt-3 dark:border-white/10"
          />
        </>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs ${
        active
          ? "border-transparent bg-black text-white dark:bg-white dark:text-black"
          : "border-black/20 dark:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
