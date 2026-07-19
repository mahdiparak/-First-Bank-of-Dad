import { hashPin } from "./crypto";
import type { FamilyBankState } from "./schema";

export interface PinCheckResult {
  ok: boolean;
  /** Set when a specific parent's own PIN matched — no separate "which parent" step needed. */
  parentId?: string;
}

/** True if any PIN gate — a parent's own PIN, or the older shared/family PIN — is configured. */
export function hasParentPinGate(state: FamilyBankState): boolean {
  return Boolean(state.parentSettings.parentPinHash) || state.parentProfiles.some((parent) => parent.pinHash);
}

/**
 * Checks an entered PIN against every parent's own PIN, falling back to the legacy shared
 * family PIN. Matching a specific parent's PIN also identifies who they are.
 */
export async function verifyParentPin(state: FamilyBankState, pin: string): Promise<PinCheckResult> {
  if (!hasParentPinGate(state)) return { ok: true };
  const hash = await hashPin(pin);
  const matchedParent = state.parentProfiles.find((parent) => parent.pinHash === hash);
  if (matchedParent) return { ok: true, parentId: matchedParent.id };
  if (state.parentSettings.parentPinHash && state.parentSettings.parentPinHash === hash) return { ok: true };
  return { ok: false };
}
