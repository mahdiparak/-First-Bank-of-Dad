import { setKidPin, setParentProfilePin, updateKidProfile, updateParentProfile } from "./mutations";
import { addParentProfile } from "./mutations";
import type { FamilyBankState, KidProfile, ParentProfile } from "./schema";
import type { JoinRequest } from "./sync";

/** Case-insensitive, whitespace-trimmed name match — "alex", "Alex", " ALEX " all match. */
function nameMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findKidByName(state: FamilyBankState, name: string): KidProfile | null {
  return state.kids.find((kid) => nameMatches(kid.name, name)) ?? null;
}

export function findParentByName(state: FamilyBankState, name: string): ParentProfile | null {
  return state.parentProfiles.find((parent) => nameMatches(parent.name, name)) ?? null;
}

/**
 * Folds a joining kid's own entries (their PIN, their email) onto the matched roster profile so
 * that — as requested — the joiner's PIN and personal details override whatever was in the room,
 * while everything else (balance, allowance, history) comes from the family's data. Returns the
 * state a parent broadcasts back to the newly-approved device.
 */
export function mergeJoinedKid(state: FamilyBankState, kidId: string, request: JoinRequest): FamilyBankState {
  let next = state;
  if (request.email) next = updateKidProfile(next, kidId, { email: request.email });
  // Only set the joiner's PIN if they chose one; never clear an existing PIN just because they didn't.
  if (request.pinHash) next = setKidPin(next, kidId, request.pinHash);
  return next;
}

/**
 * Resolves a joining co-parent to a parent profile: reuses one that matches by name, otherwise
 * creates a fresh profile. Either way their submitted email/PIN are applied, and the resolved
 * parentId is returned so the approver can bind the joining device to it.
 */
export function mergeJoinedParent(state: FamilyBankState, request: JoinRequest): { state: FamilyBankState; parentId: string } {
  const existing = findParentByName(state, request.claimedName);
  let next = state;
  let parentId: string;
  if (existing) {
    parentId = existing.id;
  } else {
    next = addParentProfile(next, request.claimedName);
    parentId = next.parentProfiles[next.parentProfiles.length - 1].id;
  }
  if (request.email) next = updateParentProfile(next, parentId, { email: request.email });
  if (request.pinHash) next = setParentProfilePin(next, parentId, request.pinHash);
  return { state: next, parentId };
}
