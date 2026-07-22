import { hashKidPin } from "./crypto";
import type { KidProfile } from "./schema";

/** True if this kid has their own PIN set, gating their Kid View open after email login. */
export function hasKidPinGate(kid: KidProfile): boolean {
  return Boolean(kid.pinHash);
}

/** Checks an entered PIN against this kid's own PIN. Always true if the kid has no PIN set. */
export async function verifyKidPin(kid: KidProfile, pin: string): Promise<boolean> {
  if (!kid.pinHash) return true;
  const hash = await hashKidPin(pin);
  return hash === kid.pinHash;
}
