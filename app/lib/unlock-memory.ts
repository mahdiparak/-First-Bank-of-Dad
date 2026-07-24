import type { DeviceRole } from "./storage";

// sessionStorage was tried first (the textbook "survives a refresh, clears on real close"
// primitive) but iOS Safari/WKWebView — almost certainly what a family's phones are running,
// installed as a home-screen PWA — is well known to unreliably wipe sessionStorage across a
// reload in standalone mode, which is exactly the bug this file exists to avoid. localStorage
// with an explicit, app-controlled expiry sidesteps that platform quirk entirely: it reliably
// persists everywhere, and WE decide the boundary instead of the browser silently deciding it for us.
const UNLOCK_MEMORY_KEY = "app-lock-remembered-unlock";

// How long an unlock is remembered before AppLock asks again regardless of activity. Short enough
// that a lost/stolen device doesn't stay open for long just because it was unlocked once; long
// enough that refreshing or briefly backgrounding the PWA within the same sitting doesn't re-prompt.
const REMEMBER_DURATION_MS = 60 * 60 * 1000; // 1 hour

interface StoredUnlock {
  identity: string;
  expiresAt: string; // ISO timestamp
}

function identityKey(role: DeviceRole, kidId: string | null, parentId: string | null): string {
  return role === "kid" ? `kid:${kidId ?? ""}` : `parent:${parentId ?? "shared"}`;
}

function readStored(): StoredUnlock | null {
  try {
    const raw = localStorage.getItem(UNLOCK_MEMORY_KEY);
    return raw ? (JSON.parse(raw) as StoredUnlock) : null;
  } catch {
    return null;
  }
}

/** Remembers that this identity passed AppLock, so it skips the PIN screen again — across a
 *  refresh, a backgrounded-then-resumed PWA, or fully closing and reopening the app — until the
 *  remember window expires. Fails silently if localStorage is unavailable (e.g. private
 *  browsing), which just means this device won't get the "don't ask every time" convenience. */
export function rememberUnlock(role: DeviceRole, kidId: string | null, parentId: string | null): void {
  try {
    const stored: StoredUnlock = {
      identity: identityKey(role, kidId, parentId),
      expiresAt: new Date(Date.now() + REMEMBER_DURATION_MS).toISOString(),
    };
    localStorage.setItem(UNLOCK_MEMORY_KEY, JSON.stringify(stored));
  } catch {
    // No localStorage access — this device just always asks.
  }
}

/** Whether THIS identity has a still-valid remembered unlock. Keyed by identity so a remembered
 *  unlock granted to one kid/parent never silently carries over to another. */
export function isUnlockRemembered(role: DeviceRole, kidId: string | null, parentId: string | null): boolean {
  const stored = readStored();
  if (!stored) return false;
  if (stored.identity !== identityKey(role, kidId, parentId)) return false;
  return new Date(stored.expiresAt).getTime() > Date.now();
}

/** Clears the remembered unlock — e.g. before re-showing AppLock after switching identities. */
export function forgetUnlock(): void {
  try {
    localStorage.removeItem(UNLOCK_MEMORY_KEY);
  } catch {
    // Nothing to clear if it was never accessible.
  }
}
