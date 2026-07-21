"use client";

import { claimBounty } from "@/lib/mutations";
import { questIcon, questTier, type AuditActor, type Bounty, type FamilyBankState, type KidProfile } from "@/lib/schema";

/** A single job card — shared by the full Quest Board tab and the young-kid home screen. */
export function QuestCard({
  bounty,
  onClaim,
  young = false,
}: {
  bounty: Bounty;
  onClaim?: () => void;
  young?: boolean;
}) {
  const tier = questTier(bounty.reward);
  const icon = questIcon(bounty);
  const claimable = Boolean(onClaim) && bounty.status === "open";

  const card = (
    <div
      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left ${young ? "rounded-3xl border-4 p-4" : ""}`}
      style={{ borderColor: `${tier.color}66`, background: `linear-gradient(135deg, ${tier.color}1a, transparent)` }}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full ${young ? "h-16 w-16 text-4xl" : "h-12 w-12 text-2xl"}`}
        style={{ backgroundColor: `${tier.color}26` }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`break-words font-semibold ${young ? "text-lg" : "text-sm"}`}>{bounty.title}</p>
        <p className="text-xs font-medium" style={{ color: tier.color }}>
          {tier.stars} {tier.label}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`font-bold text-green-600 ${young ? "text-xl" : "text-base"}`}>{formatCurrency(bounty.reward)}</span>
        {claimable && (
          <span className={`rounded-full bg-black px-3 py-1 font-semibold text-white dark:bg-white dark:text-black ${young ? "text-sm" : "text-xs"}`}>
            🙋 Claim!
          </span>
        )}
        {!claimable && bounty.status !== "open" && <StatusPill status={bounty.status} />}
      </div>
    </div>
  );

  if (!claimable) return card;

  return (
    <button onClick={onClaim} className="w-full text-left transition active:scale-[0.98]">
      {card}
    </button>
  );
}

function StatusPill({ status }: { status: Bounty["status"] }) {
  const meta = statusMeta(status);
  return (
    <span className="rounded-full px-2 py-1 text-xs font-medium" style={{ backgroundColor: `${meta.color}26`, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function statusMeta(status: Bounty["status"]): { label: string; color: string } {
  switch (status) {
    case "pending-approval":
      return { label: "⏳ Checking…", color: "#f59e0b" };
    case "approved":
      return { label: "✅ Paid!", color: "#22c55e" };
    case "denied":
      return { label: "🔁 Try again", color: "#6b7280" };
    default:
      return { label: status, color: "#6b7280" };
  }
}

/** The full Quest Board tab: open jobs to claim, plus a shelf of this kid's own quests in flight. */
export function QuestBoard({
  bounties,
  kid,
  actor,
  onMutate,
}: {
  bounties: Bounty[];
  kid: KidProfile;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const open = bounties.filter((bounty) => bounty.status === "open");
  const mine = bounties
    .filter((bounty) => bounty.claimedByKidId === kid.id && bounty.status !== "open")
    .sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));

  return (
    <section className="space-y-4 rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-lg font-bold">🗺️ Quest Board</h2>
        <p className="text-xs opacity-70">Do a job, tap Claim, and Dad pays out once it&apos;s done!</p>
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl border border-black/10 p-4 text-center text-sm opacity-60 dark:border-white/10">
          🏝️ No quests posted right now — check back soon!
        </p>
      ) : (
        <div className="space-y-2">
          {open.map((bounty) => (
            <QuestCard key={bounty.id} bounty={bounty} onClaim={() => onMutate((state) => claimBounty(state, bounty.id, kid.id, actor))} />
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
          <p className="text-xs font-semibold opacity-70">My quests</p>
          {mine.map((bounty) => (
            <QuestCard key={bounty.id} bounty={bounty} />
          ))}
        </div>
      )}
    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
