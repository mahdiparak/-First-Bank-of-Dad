import { hashPin } from "./crypto";
import { clearLockout, getLockoutStatus, recordFailedAttempt, type LockoutStatus } from "./pin-lockout";
import type { FamilyBankState } from "./schema";

const LOCKOUT_KEY = "parent-pin";

export interface PinCheckResult {
  ok: boolean;
  /** Set when a specific parent's own PIN matched — no separate "which parent" step needed. */
  parentId?: string;
  /** Set (ok=false) when too many wrong attempts locked this out — see lib/pin-lockout.ts. */
  lockout?: LockoutStatus;
}

/** True if any PIN gate — a parent's own PIN, or the older shared/family PIN — is configured. */
export function hasParentPinGate(state: FamilyBankState): boolean {
  return Boolean(state.parentSettings.parentPinHash) || state.parentProfiles.some((parent) => parent.pinHash);
}

/** Checks lockout state without spending an attempt — for greying out a PIN field on mount if a
 *  lockout from an earlier try (even from before a page reload) is still active. */
export async function parentPinLockoutStatus(): Promise<LockoutStatus> {
  return getLockoutStatus(LOCKOUT_KEY);
}

/**
 * Checks an entered PIN against every parent's own PIN, falling back to the legacy shared
 * family PIN. Matching a specific parent's PIN also identifies who they are.
 *
 * Wrong guesses are throttled with an escalating lockout (shared across all parent PINs on this
 * device, since a wrong guess doesn't reveal which parent it was aimed at). This is a UI-layer
 * deterrent against someone guessing by hand through the actual form — not a cryptographic one:
 * the PIN hash already lives in this device's own (decrypted) state, so nothing here can stop
 * someone who scripts their own guesses directly against that hash instead of using this function.
 */
export async function verifyParentPin(state: FamilyBankState, pin: string): Promise<PinCheckResult> {
  if (!hasParentPinGate(state)) return { ok: true };

  const lockout = await getLockoutStatus(LOCKOUT_KEY);
  if (lockout.locked) return { ok: false, lockout };

  const hash = await hashPin(pin);
  const matchedParent = state.parentProfiles.find((parent) => parent.pinHash === hash);
  if (matchedParent) {
    await clearLockout(LOCKOUT_KEY);
    return { ok: true, parentId: matchedParent.id };
  }
  if (state.parentSettings.parentPinHash && state.parentSettings.parentPinHash === hash) {
    await clearLockout(LOCKOUT_KEY);
    return { ok: true };
  }
  return { ok: false, lockout: await recordFailedAttempt(LOCKOUT_KEY) };
}
