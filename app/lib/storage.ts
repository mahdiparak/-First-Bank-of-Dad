import localforage from "localforage";
import type { FamilyBankState } from "./schema";

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
const DEVICE_ID_KEY = "device-id";
const DEVICE_ROLE_KEY = "device-role";
const DEVICE_KID_ID_KEY = "device-kid-id";

export type DeviceRole = "parent" | "kid";

export async function loadState(): Promise<FamilyBankState | null> {
  return stateStore.getItem<FamilyBankState>(STATE_KEY);
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
  await saveState(parsed);
  return parsed;
}
