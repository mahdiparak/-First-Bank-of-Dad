"use client";

import { badgesForKid } from "@/lib/badges";
import type { FamilyBankState, KidProfile } from "@/lib/schema";

export function BadgeWall({ state, kid }: { state: FamilyBankState; kid: KidProfile }) {
  const badges = badgesForKid(state, kid.id);
  const earnedCount = badges.filter((badge) => badge.earned).length;

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
          <div
            key={badge.id}
            title={badge.description}
            className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
              badge.earned
                ? "border-amber-400/60 bg-amber-400/10"
                : "border-black/10 opacity-40 grayscale dark:border-white/10"
            }`}
          >
            <span className="text-3xl">{badge.earned ? badge.emoji : "🔒"}</span>
            <span className="text-xs font-medium leading-tight">{badge.title}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
