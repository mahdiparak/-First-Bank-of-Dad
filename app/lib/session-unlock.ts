import type { DeviceRole } from "./storage";

// sessionStorage is the browser-native "survives a refresh, cleared when the tab/app is actually
// closed" primitive — exactly the boundary asked for: unlocking shouldn't have to happen again
// after a reload or after using the Reconnect flow, but a genuine close-and-reopen (a fresh
// browsing session) should still ask, matching the original "PIN every time except onboarding"
// intent. Scoped to this tab only — a second open tab/window still unlocks independently.
const SESSION_UNLOCK_KEY = "app-lock-session-unlock";

function identityKey(role: DeviceRole, kidId: string | null, parentId: string | null): string {
  return role === "kid" ? `kid:${kidId ?? ""}` : `parent:${parentId ?? "shared"}`;
}

/** Remembers that this identity passed AppLock this session, so later reloads in the same tab
 *  skip straight past the PIN screen. Fails silently (falls back to "not unlocked") if
 *  sessionStorage is unavailable — e.g. private browsing — since that's the safe direction. */
export function markSessionUnlocked(role: DeviceRole, kidId: string | null, parentId: string | null): void {
  try {
    sessionStorage.setItem(SESSION_UNLOCK_KEY, identityKey(role, kidId, parentId));
  } catch {
    // No sessionStorage access — just means this session won't get the "skip on refresh" perk.
  }
}

/** Whether THIS identity already unlocked earlier in this same browser tab session. Keyed by
 *  identity so an unlock granted to one kid/parent never silently carries over to another. */
export function isSessionUnlocked(role: DeviceRole, kidId: string | null, parentId: string | null): boolean {
  try {
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === identityKey(role, kidId, parentId);
  } catch {
    return false;
  }
}

/** Clears the remembered unlock — e.g. before showing AppLock again after switching identities. */
export function clearSessionUnlock(): void {
  try {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  } catch {
    // Nothing to clear if it was never accessible.
  }
}
