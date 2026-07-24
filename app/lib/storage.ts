import localforage from "localforage";
import { normalizeState, type FamilyBankState } from "./schema";

const stateStore = localforage.createInstance({
  name: "first-bank-of-dad",
  storeName: "state",
});

// Kept in a separate IndexedDB store from the app state: this holds the
// derived (non-extractable) CryptoKey and Room ID so a returning device
// doesn't have to re-enter the Family Phrase every load. Nothing here is
// more sensitive than the plaintext state already sitting alongside it —
// both live in the same on-device trust boundary.
const keyStore = localforage.createInstance({
  name: "first-bank-of-dad",
  storeName: "keys",
});

const STATE_KEY = "family-bank-state";
const CRYPTO_KEY_KEY = "encryption-key";
const ROOM_ID_KEY = "room-id";
const DEFAULT_ROOM_ID_KEY = "default-room-id";
const ROOM_NAME_KEY = "room-name";
const DEVICE_ID_KEY = "device-id";
const DEVICE_ROLE_KEY = "device-role";
const DEVICE_KID_ID_KEY = "device-kid-id";
const DEVICE_PARENT_ID_KEY = "device-parent-id";
const INSTALL_BANNER_DISMISSED_KEY = "install-banner-dismissed";
const ONBOARDING_COMPLETE_KEY = "onboarding-complete";
const PENDING_JOIN_KEY = "pending-join";
const MARKET_DATA_ADMIN_TOKEN_KEY = "market-data-admin-token";
const ALPHA_VANTAGE_API_KEY_KEY = "alpha-vantage-api-key";

export type DeviceRole = "parent" | "kid";

export async function loadState(): Promise<FamilyBankState | null> {
  const state = await stateStore.getItem<FamilyBankState>(STATE_KEY);
  return state ? normalizeState(state) : null;
}

export async function saveState(state: FamilyBankState): Promise<void> {
  await stateStore.setItem(STATE_KEY, state);
}

export async function clearState(): Promise<void> {
  await stateStore.removeItem(STATE_KEY);
}

export async function loadCryptoKey(): Promise<CryptoKey | null> {
  return keyStore.getItem<CryptoKey>(CRYPTO_KEY_KEY);
}

export async function saveCryptoKey(key: CryptoKey): Promise<void> {
  await keyStore.setItem(CRYPTO_KEY_KEY, key);
}

export async function loadRoomId(): Promise<string | null> {
  return keyStore.getItem<string>(ROOM_ID_KEY);
}

export async function saveRoomId(roomId: string): Promise<void> {
  await keyStore.setItem(ROOM_ID_KEY, roomId);
}

/** The room id as originally derived from the Family Phrase at onboarding — the "Use default" target. */
export async function loadDefaultRoomId(): Promise<string | null> {
  return keyStore.getItem<string>(DEFAULT_ROOM_ID_KEY);
}

export async function saveDefaultRoomId(roomId: string): Promise<void> {
  await keyStore.setItem(DEFAULT_ROOM_ID_KEY, roomId);
}

/** The friendly, human-typed room name (e.g. "Smith Family") the wire Room ID was derived from.
 *  Kept on-device only — like the Family Phrase, it's never sent to the server (only its hash is). */
export async function loadRoomName(): Promise<string | null> {
  return keyStore.getItem<string>(ROOM_NAME_KEY);
}

export async function saveRoomName(roomName: string | null): Promise<void> {
  if (roomName) {
    await keyStore.setItem(ROOM_NAME_KEY, roomName);
  } else {
    await keyStore.removeItem(ROOM_NAME_KEY);
  }
}

/** Forgets the derived key/room id (e.g. "log out"). The Family Phrase itself was never stored. */
export async function forgetFamilyPhraseMaterial(): Promise<void> {
  await keyStore.clear();
}

// This device's role/assigned kid is a local preference, not part of the
// synced FamilyBankState — different devices in the same family can be in
// different modes (dad's phone in Parent mode, a kid's tablet locked to
// their own Kid View).
export async function loadDeviceRole(): Promise<DeviceRole | null> {
  return keyStore.getItem<DeviceRole>(DEVICE_ROLE_KEY);
}

export async function saveDeviceRole(role: DeviceRole | null): Promise<void> {
  if (role) {
    await keyStore.setItem(DEVICE_ROLE_KEY, role);
  } else {
    await keyStore.removeItem(DEVICE_ROLE_KEY);
  }
}

export async function loadDeviceKidId(): Promise<string | null> {
  return keyStore.getItem<string>(DEVICE_KID_ID_KEY);
}

export async function saveDeviceKidId(kidId: string | null): Promise<void> {
  if (kidId) {
    await keyStore.setItem(DEVICE_KID_ID_KEY, kidId);
  } else {
    await keyStore.removeItem(DEVICE_KID_ID_KEY);
  }
}

/** Which named parent profile this device is "signed in" as, for a personalized greeting. */
export async function loadDeviceParentId(): Promise<string | null> {
  return keyStore.getItem<string>(DEVICE_PARENT_ID_KEY);
}

export async function saveDeviceParentId(parentId: string | null): Promise<void> {
  if (parentId) {
    await keyStore.setItem(DEVICE_PARENT_ID_KEY, parentId);
  } else {
    await keyStore.removeItem(DEVICE_PARENT_ID_KEY);
  }
}

/** Device-local: once someone dismisses the install banner on this device, stop showing it. */
export async function loadInstallBannerDismissed(): Promise<boolean> {
  return Boolean(await keyStore.getItem<boolean>(INSTALL_BANNER_DISMISSED_KEY));
}

export async function saveInstallBannerDismissed(dismissed: boolean): Promise<void> {
  await keyStore.setItem(INSTALL_BANNER_DISMISSED_KEY, dismissed);
}

// The market-data Worker's admin bearer token — local to this device only, and never part of
// the synced FamilyBankState (that syncs to every kid's device too).
export async function loadMarketDataAdminToken(): Promise<string | null> {
  return keyStore.getItem<string>(MARKET_DATA_ADMIN_TOKEN_KEY);
}

export async function saveMarketDataAdminToken(token: string | null): Promise<void> {
  if (token) {
    await keyStore.setItem(MARKET_DATA_ADMIN_TOKEN_KEY, token);
  } else {
    await keyStore.removeItem(MARKET_DATA_ADMIN_TOKEN_KEY);
  }
}

// Remembered locally too — purely so the field doesn't come back empty (and unverifiable)
// after a page reload, whether or not the last save to the Worker actually succeeded.
export async function loadAlphaVantageApiKey(): Promise<string | null> {
  return keyStore.getItem<string>(ALPHA_VANTAGE_API_KEY_KEY);
}

export async function saveAlphaVantageApiKey(apiKey: string | null): Promise<void> {
  if (apiKey) {
    await keyStore.setItem(ALPHA_VANTAGE_API_KEY_KEY, apiKey);
  } else {
    await keyStore.removeItem(ALPHA_VANTAGE_API_KEY_KEY);
  }
}

// Whether THIS device has finished the onboarding wizard. Device-local, not part of the synced
// family state — a new device joining an existing family still onboards even though the family
// itself is long since set up.
export async function loadOnboardingComplete(): Promise<boolean> {
  return Boolean(await keyStore.getItem<boolean>(ONBOARDING_COMPLETE_KEY));
}

export async function saveOnboardingComplete(complete: boolean): Promise<void> {
  await keyStore.setItem(ONBOARDING_COMPLETE_KEY, complete);
}

/** What a joining device submitted and is waiting on a parent to approve. Persisted so closing and
 *  reopening the app resumes the "waiting for approval" screen instead of restarting onboarding. */
export interface PendingJoin {
  claimedName: string;
  role: DeviceRole;
  email?: string;
  pinHash?: string;
}

export async function loadPendingJoin(): Promise<PendingJoin | null> {
  return keyStore.getItem<PendingJoin>(PENDING_JOIN_KEY);
}

export async function savePendingJoin(pending: PendingJoin | null): Promise<void> {
  if (pending) {
    await keyStore.setItem(PENDING_JOIN_KEY, pending);
  } else {
    await keyStore.removeItem(PENDING_JOIN_KEY);
  }
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await keyStore.getItem<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  await keyStore.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

export function exportStateToFile(state: FamilyBankState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `family-bank-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function assertLooksLikeFamilyBankState(value: unknown): asserts value is FamilyBankState {
  const candidate = value as Partial<FamilyBankState> | null;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.kids) ||
    !Array.isArray(candidate.transactions) ||
    typeof candidate.version !== "number"
  ) {
    throw new Error("This file doesn't look like a Family Bank backup.");
  }
}

export async function importStateFromFile(file: File): Promise<FamilyBankState> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  assertLooksLikeFamilyBankState(parsed);
  const normalized = normalizeState(parsed);
  await saveState(normalized);
  return normalized;
}
