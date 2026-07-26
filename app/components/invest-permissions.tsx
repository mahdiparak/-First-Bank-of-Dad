"use client";

import { setAssetClassUnlocked } from "@/lib/mutations";
import {
  ALL_ASSET_CLASSES,
  ASSET_CLASSES,
  isAdvancedForAge,
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
 * Every kind can be switched on for every kid. For a kid still on the little-kid screens the two
 * that can lose money are marked as such and spelled out underneath, so the warning is there
 * without the app overruling a parent who's decided their kid is ready.
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
  const young = isYoungKidView(kid);

  return (
    <div className="space-y-2">
      <p className={compact ? "text-xs opacity-60" : "text-sm font-medium"}>
        What {kid.name} can invest in
      </p>
      {!compact && (
        <p className="text-xs opacity-60">
          Turn any of these off and it stays visible but locked on their Invest screen.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {ALL_ASSET_CLASSES.map((assetClass) => {
          const meta = ASSET_CLASSES[assetClass];
          const advanced = isAdvancedForAge(kid, assetClass);
          const unlocked = isAssetClassUnlocked(kid, assetClass);
          return (
            <button
              key={assetClass}
              type="button"
              aria-pressed={unlocked}
              title={
                advanced
                  ? `${unlocked ? "Turn off" : "Turn on"} ${meta.shortLabel} for ${kid.name} — this one can lose money, and ${kid.name} is on the little-kid screens`
                  : `${unlocked ? "Turn off" : "Turn on"} ${meta.shortLabel} for ${kid.name}`
              }
              onClick={() => onMutate((s) => setAssetClassUnlocked(s, kid.id, assetClass, !unlocked, actor))}
              className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs"
              style={{
                borderColor: unlocked ? assetColor(assetClass) : "rgb(128 128 128 / 0.3)",
                backgroundColor: unlocked ? `color-mix(in srgb, ${assetColor(assetClass)} 12%, transparent)` : undefined,
              }}
            >
              <span aria-hidden>{unlocked ? meta.emoji : "🔒"}</span>
              {meta.shortLabel}
              {advanced && <span aria-hidden title="Can lose money">⚠️</span>}
              <span className="opacity-60">{unlocked ? "on" : "off"}</span>
            </button>
          );
        })}
      </div>

      {young && (
        <p className="text-xs opacity-60">
          ⚠️ Stocks and Crypto can lose money, and {kid.name}&apos;s screens are built around money that
          only goes up. They still work if you turn them on — your call.
        </p>
      )}
    </div>
  );
}
