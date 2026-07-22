"use client";

import { useState } from "react";
import { badgesForKid, type Badge } from "@/lib/badges";
import { setBadgeHidden } from "@/lib/mutations";
import type { AuditActor, FamilyBankState, KidProfile } from "@/lib/schema";

export function BadgeWall({
  state,
  kid,
  role,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  role: "parent" | "kid";
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const badges = badgesForKid(state, kid.id);
  const earnedCount = badges.filter((badge) => badge.earned).length;
  const [selected, setSelected] = useState<Badge | null>(null);

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Badges</h2>
        <span className="text-sm opacity-70">
          {earnedCount} / {badges.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {badges.map((badge) => (
          <button
            key={badge.id}
            type="button"
            onClick={() => setSelected(badge)}
            className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
              badge.earned
                ? "border-amber-400/60 bg-amber-400/10"
                : "border-black/10 opacity-40 grayscale dark:border-white/10"
            }`}
          >
            <span className="text-3xl">{badge.earned ? badge.emoji : "🔒"}</span>
            <span className="text-xs font-medium leading-tight">{badge.title}</span>
          </button>
        ))}
      </div>

      {selected && (
        <BadgeDetail
          badge={selected}
          role={role}
          onClose={() => setSelected(null)}
          onRemove={() => {
            onMutate((s) => setBadgeHidden(s, kid.id, selected.id, selected.title, true, actor));
            setSelected(null);
          }}
          onRestore={() => {
            onMutate((s) => setBadgeHidden(s, kid.id, selected.id, selected.title, false, actor));
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}

function BadgeDetail({
  badge,
  role,
  onClose,
  onRemove,
  onRestore,
}: {
  badge: Badge;
  role: "parent" | "kid";
  onClose: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-xl border border-black/10 bg-white p-4 text-center text-black shadow-xl dark:border-white/10 dark:bg-neutral-900 dark:text-white"
      >
        <span className="text-4xl">{badge.earned ? badge.emoji : "🔒"}</span>
        <p className="font-semibold">{badge.title}</p>
        <p className="text-sm opacity-70">{badge.description}</p>
        {badge.earned && <p className="text-xs font-medium text-amber-500">Earned! 🎉</p>}
        {badge.revoked && <p className="text-xs opacity-60">Hidden by a parent.</p>}

        {role === "parent" && badge.earned && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove the "${badge.title}" badge? It was awarded by mistake and can be restored later.`)) {
                onRemove();
              }
            }}
            className="w-full rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-500"
          >
            Remove this badge
          </button>
        )}
        {role === "parent" && badge.revoked && (
          <button
            type="button"
            onClick={onRestore}
            className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
          >
            Restore this badge
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
