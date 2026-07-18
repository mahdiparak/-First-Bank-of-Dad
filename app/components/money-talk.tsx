"use client";

import { weeklyRecapForKid } from "@/lib/recap";
import { kidAvatar, kidColor, type FamilyBankState } from "@/lib/schema";

/**
 * The weekly "Money Talk" recap — designed to be looked at together, parent and kid.
 * The strongest predictor of kids' financial literacy is conversations with parents;
 * this screen exists to start one.
 */
export function MoneyTalk({ state }: { state: FamilyBankState }) {
  if (state.kids.length === 0) {
    return <p className="text-sm opacity-70">Add a kid first — then this becomes your weekly sit-down summary.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm opacity-70">
        This week at the First Bank of Dad — sit down with each kid and walk through it together.
      </p>
      {state.kids.map((kid) => {
        const recap = weeklyRecapForKid(state, kid);
        return (
          <section
            key={kid.id}
            className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10"
            style={{ borderLeftWidth: 4, borderLeftColor: kidColor(kid) }}
          >
            <h2 className="text-lg font-semibold">
              {kidAvatar(kid)} {kid.name}&apos;s week
            </h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Money in" value={formatCurrency(recap.totalIn)} tone="positive" />
              <Stat label="Money out" value={formatCurrency(recap.totalOut)} tone={recap.totalOut > 0 ? "negative" : "neutral"} />
              <Stat
                label="Streak"
                value={`${recap.streakWeeks} wk${recap.streakWeeks === 1 ? "" : "s"} 🔥`}
                tone="neutral"
              />
              <Stat
                label="Invested"
                value={`${formatCurrency(recap.investedValue)} (${recap.investedGain >= 0 ? "+" : "−"}${formatCurrency(Math.abs(recap.investedGain))})`}
                tone={recap.investedGain >= 0 ? "positive" : "negative"}
              />
            </div>

            {recap.inBySource.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {recap.inBySource.map((entry) => (
                  <span key={entry.label} className="rounded-full border border-black/10 px-2 py-1 dark:border-white/10">
                    {entry.label}: {formatCurrency(entry.amount)}
                  </span>
                ))}
              </div>
            )}

            {recap.goals.length > 0 && (
              <div className="space-y-1 text-sm">
                {recap.goals.map((goal) => (
                  <p key={goal.name} className="opacity-80">
                    🎯 {goal.name}: {formatCurrency(goal.savedAmount)} of {formatCurrency(goal.targetAmount)}
                  </p>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60">This week&apos;s question</p>
              <p className="mt-1">💬 {recap.prompt}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "positive" | "negative" | "neutral" }) {
  const toneClass = tone === "positive" ? "text-green-600" : tone === "negative" ? "text-red-500" : "";
  return (
    <div>
      <p className="text-xs opacity-60">{label}</p>
      <p className={`text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
