"use client";

import { bucketTotal, moneyBuckets, type BucketId, type MoneyBucket } from "@/lib/buckets";
import type { FamilyBankState, KidProfile } from "@/lib/schema";

const BUCKET_COLORS: Record<BucketId, string> = {
  cash: "var(--bucket-cash)",
  pending: "var(--bucket-pending)",
  goals: "var(--bucket-goals)",
  savings: "var(--asset-savings)",
  cd: "var(--asset-cd)",
  stocks: "var(--asset-stocks)",
  crypto: "var(--asset-crypto)",
};

/**
 * "Where my money is": one bar showing how the kid's whole pile is split, with every slice also
 * written out underneath in dollars and percent. The written list isn't decoration — the bar's
 * colours alone can't carry the amounts, and a few of them sit under 3:1 against a light
 * background, so the labels are what make this readable for everyone.
 *
 * A kid sees four numbers around the app (balance, goals, investments, pending) and no picture of
 * how they relate. This is that picture: what's ready to spend, what's promised elsewhere, and
 * what's out working.
 */
export function MoneyBuckets({
  state,
  kid,
  young = false,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  young?: boolean;
}) {
  const buckets = moneyBuckets(state, kid.id);
  const total = bucketTotal(buckets);
  if (buckets.length === 0 || total <= 0) return null;

  return (
    <section className={`space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10 ${young ? "rounded-3xl p-5" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={young ? "text-lg font-semibold" : "font-semibold"}>🗂️ Where my money is</h2>
        <p className="text-sm opacity-60 tabular-nums">{formatCurrency(total)} in total</p>
      </div>

      <BucketBar buckets={buckets} young={young} />

      <ul className="space-y-2">
        {buckets.map((bucket) => (
          <li key={bucket.id} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1 h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: BUCKET_COLORS[bucket.id] }}
            />
            <div className="min-w-0 flex-1">
              <div className={`flex flex-wrap items-baseline justify-between gap-x-2 ${young ? "text-base" : "text-sm"}`}>
                <span>
                  {bucket.emoji} {bucket.label}
                </span>
                <span className="tabular-nums">
                  <strong>{formatCurrency(bucket.amount)}</strong>{" "}
                  <span className="opacity-60">{formatShare(bucket.share)}</span>
                </span>
              </div>
              <p className="text-xs opacity-60">{bucket.note}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs opacity-60">
        All of it really sits in one high-yield savings account at the bank — these are the jars we&apos;ve sorted it
        into, not separate accounts.
      </p>
    </section>
  );
}

/** The stacked bar. Slices are separated by a surface-coloured gap so two neighbours never blur
 *  into one another, and a slice too thin to see still gets a minimum width. */
function BucketBar({ buckets, young }: { buckets: MoneyBucket[]; young: boolean }) {
  return (
    <div
      className={`flex w-full gap-[2px] overflow-hidden rounded-full ${young ? "h-6" : "h-4"}`}
      role="img"
      aria-label={buckets.map((bucket) => `${bucket.label} ${formatShare(bucket.share)}`).join(", ")}
    >
      {buckets.map((bucket) => (
        <div
          key={bucket.id}
          title={`${bucket.label}: ${formatCurrency(bucket.amount)} (${formatShare(bucket.share)})`}
          style={{
            backgroundColor: BUCKET_COLORS[bucket.id],
            flexGrow: Math.max(bucket.share, 0.01),
            flexBasis: 0,
            minWidth: 4,
          }}
        />
      ))}
    </div>
  );
}

function formatShare(share: number): string {
  const percent = share * 100;
  // Never round a real slice down to "0%" — anything present reads as at least 1%.
  return `${percent > 0 && percent < 1 ? "<1" : Math.round(percent)}%`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
