import { hashKidPin } from "./crypto";
import { clearLockout, getLockoutStatus, recordFailedAttempt, type LockoutStatus } from "./pin-lockout";
import type { KidProfile } from "./schema";

function lockoutKey(kidId: string): string {
  return `kid-pin:${kidId}`;
}

/** True if this kid has their own PIN set, gating their Kid View open after email login. */
export function hasKidPinGate(kid: KidProfile): boolean {
  return Boolean(kid.pinHash);
}

export interface KidPinCheckResult {
  ok: boolean;
  /** Set (ok=false) when too many wrong attempts locked this out — see lib/pin-lockout.ts. */
  lockout?: LockoutStatus;
}

/** Checks lockout state without spending an attempt — for greying out a PIN field on mount. */
export async function kidPinLockoutStatus(kidId: string): Promise<LockoutStatus> {
  return getLockoutStatus(lockoutKey(kidId));
}

/**
 * Checks an entered PIN against this kid's own PIN. Always ok if the kid has no PIN set.
 *
 * Wrong guesses are throttled with an escalating lockout, kept per-kid so guessing one sibling's
 * PIN doesn't lock out another's. Same "UI deterrent, not a cryptographic one" caveat as
 * verifyParentPin — see there for why.
 */
export async function verifyKidPin(kid: KidProfile, pin: string): Promise<KidPinCheckResult> {
  if (!kid.pinHash) return { ok: true };
  const key = lockoutKey(kid.id);

  const lockout = await getLockoutStatus(key);
  if (lockout.locked) return { ok: false, lockout };

  const hash = await hashKidPin(pin);
  if (hash === kid.pinHash) {
    await clearLockout(key);
    return { ok: true };
  }
  return { ok: false, lockout: await recordFailedAttempt(key) };
}
