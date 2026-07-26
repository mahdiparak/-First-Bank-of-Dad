"use client";

import { setAssetClassUnlocked } from "@/lib/mutations";
import {
  ALL_ASSET_CLASSES,
  ASSET_CLASSES,
  investableAssetClassesFor,
  isAssetClassUnlocked,
  isYoungKidView,
  type AuditActor,
  type FamilyBankState,
  type KidProfile,
} from "@/lib/schema";
import { assetColor } from "./investment-plot";

/**
 * The parent's switchboard for one kid: which kinds of investing they're allowed to use. Lives in
 * two places on purpose — in Settings next to that kid's allowance and PIN (where a parent goes
 * looking for "what is this kid allowed to do"), and on the kid's own Invest screen (where the
 * question actually comes up, with the locked cards right there). Both drive the same setting.
 *
 * Stocks and crypto can't be switched on for a kid still using the little-kid screens; the row
 * says so rather than silently doing nothing, and points at the setting that would change it.
 */
export function InvestPermissions({
  kid,
  actor,
  onMutate,
  compact = false,
}: {
  kid: KidProfile;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
  /** Tighter type and no explainer, for use inside an already-busy settings card. */
  compact?: boolean;
}) {
  const investable = investableAssetClassesFor(kid);
  const young = isYoungKidView(kid);

  return (
    <div className="space-y-2">
      <p className={compact ? "text-xs opacity-60" : "text-sm font-medium"}>
        What {kid.name} can invest in
      </p>
      {!compact && (
        <p className="text-xs opacity-60">
          {young
            ? "Little-kid screens offer Savings and CDs only — the two that can't lose money. Switch them to the older-kid view to open up the rest."
            : "Turn any of these off and it stays visible but locked on their Invest screen."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {ALL_ASSET_CLASSES.map((assetClass) => {
          const meta = ASSET_CLASSES[assetClass];
          const allowed = investable.includes(assetClass);
          const unlocked = isAssetClassUnlocked(kid, assetClass);
          return (
            <button
              key={assetClass}
              type="button"
              disabled={!allowed}
              aria-pressed={unlocked}
              title={
                allowed
                  ? `${unlocked ? "Turn off" : "Turn on"} ${meta.shortLabel} for ${kid.name}`
                  : `${meta.shortLabel} isn't offered on the little-kid screens`
              }
              onClick={() => onMutate((s) => setAssetClassUnlocked(s, kid.id, assetClass, !unlocked, actor))}
              className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs disabled:opacity-40"
              style={{
                borderColor: unlocked ? assetColor(assetClass) : "rgb(128 128 128 / 0.3)",
                backgroundColor: unlocked ? `color-mix(in srgb, ${assetColor(assetClass)} 12%, transparent)` : undefined,
              }}
            >
              <span aria-hidden>{unlocked ? meta.emoji : "🔒"}</span>
              {meta.shortLabel}
              <span className="opacity-60">{allowed ? (unlocked ? "on" : "off") : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
