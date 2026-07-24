import localforage from "localforage";

// Deliberately its own IndexedDB store: attempt counters need to survive a page refresh (otherwise
// reloading the page would trivially reset an in-memory-only throttle), but they're not part of
// the synced family state and shouldn't touch it.
const lockoutStore = localforage.createInstance({ name: "first-bank-of-dad", storeName: "pin-lockout" });

interface StoredLockout {
  failedAttempts: number;
  lockedUntil?: string; // ISO timestamp
}

export interface LockoutStatus {
  locked: boolean;
  remainingMs: number; // 0 when not locked
  failedAttempts: number;
}

// A couple of honest typos cost nothing; a sustained guessing run gets slower every time. This is
// a UI-layer deterrent, not a cryptographic one — see the callers' own docs for why: PIN
// verification happens entirely client-side against a hash already sitting in this device's own
// state, so nothing server-side can enforce this against someone running their own script instead
// of the form. What it DOES stop is the realistic case: a sibling (or anyone else) trying PINs by
// hand through the actual UI — 10,000 combinations at these delays takes many hours by hand.
const BACKOFF_SCHEDULE_MS = [0, 0, 0, 15_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];

/** Exported (pure, no storage access) so the escalation schedule can be tested directly. */
export function delayForAttempt(attempt: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)];
}

function toStatus(stored: StoredLockout | null): LockoutStatus {
  if (!stored) return { locked: false, remainingMs: 0, failedAttempts: 0 };
  const remainingMs = stored.lockedUntil ? new Date(stored.lockedUntil).getTime() - Date.now() : 0;
  return remainingMs > 0
    ? { locked: true, remainingMs, failedAttempts: stored.failedAttempts }
    : { locked: false, remainingMs: 0, failedAttempts: stored.failedAttempts };
}

/** Checks lockout state WITHOUT counting as an attempt — used to grey out a PIN field on mount if
 *  a lockout from a previous try (or a previous page load) is still in effect. */
export async function getLockoutStatus(key: string): Promise<LockoutStatus> {
  return toStatus(await lockoutStore.getItem<StoredLockout>(key));
}

/** Records one more wrong guess and returns the resulting (possibly newly-locked) status. */
export async function recordFailedAttempt(key: string): Promise<LockoutStatus> {
  const current = (await lockoutStore.getItem<StoredLockout>(key)) ?? { failedAttempts: 0 };
  const failedAttempts = current.failedAttempts + 1;
  const delay = delayForAttempt(failedAttempts);
  const stored: StoredLockout = {
    failedAttempts,
    lockedUntil: delay > 0 ? new Date(Date.now() + delay).toISOString() : undefined,
  };
  await lockoutStore.setItem(key, stored);
  return toStatus(stored);
}

/** Resets the counter after a correct PIN, so a legitimate unlock doesn't carry forward any
 *  penalty from earlier typos. */
export async function clearLockout(key: string): Promise<void> {
  await lockoutStore.removeItem(key);
}
