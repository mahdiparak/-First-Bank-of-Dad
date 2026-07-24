"use client";

import { useState } from "react";
import { deriveRoomId, deriveRoomIdFromPhraseAndName } from "@/lib/crypto";
import { verifyKidPin } from "@/lib/kid-auth";
import { verifyParentPin } from "@/lib/parent-auth";
import { kidAvatar, parentAvatar, type FamilyBankState } from "@/lib/schema";
import { loadRoomId, loadRoomName, type DeviceRole } from "@/lib/storage";
import { RevealInput } from "./reveal-input";

/**
 * The cold-open lock screen: every time the app loads, whoever this device belongs to re-enters
 * their 4-digit PIN before any data is shown. Skipped only when the active identity has no PIN
 * (e.g. a young kid on a shared device a parent set up) — see AppLockGate.needsAppLock.
 *
 * Like every PIN in this app, this is a UI lock, not a cryptographic boundary: the local data and
 * the PIN hash both live in this browser, so someone with device/devtools access could bypass it.
 * The real confidentiality boundary is the Family Phrase (see lib/crypto.ts).
 */
export function AppLock({
  state,
  deviceRole,
  deviceKidId,
  deviceParentId,
  onUnlock,
}: {
  state: FamilyBankState;
  deviceRole: DeviceRole;
  deviceKidId: string | null;
  deviceParentId: string | null;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [recoverError, setRecoverError] = useState<string | null>(null);

  const kid = deviceRole === "kid" ? (state.kids.find((candidate) => candidate.id === deviceKidId) ?? null) : null;
  const parent = deviceParentId ? (state.parentProfiles.find((candidate) => candidate.id === deviceParentId) ?? null) : null;

  const heading =
    kid !== null
      ? `${kidAvatar(kid)} ${kid.name}`
      : parent
        ? `${parentAvatar(parent)} ${parent.name}`
        : "Welcome back";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const ok = kid ? await verifyKidPin(kid, pin) : (await verifyParentPin(state, pin)).ok;
    setBusy(false);
    if (ok) {
      onUnlock();
    } else {
      setError("Wrong PIN.");
      setPin("");
    }
  }

  /**
   * PIN recovery: the Family Phrase is the real secret, so proving you know it unlocks this session
   * even if you've forgotten your PIN. We verify it by re-deriving the room id (the only thing we
   * kept) and comparing — no plaintext phrase was ever stored to check against. Covers both the
   * newer phrase+room derivation and the legacy phrase-only one.
   */
  async function handleRecover(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRecoverError(null);
    const [storedRoomId, roomName] = await Promise.all([loadRoomId(), loadRoomName()]);
    const candidates: string[] = [];
    if (roomName) candidates.push(await deriveRoomIdFromPhraseAndName(phrase, roomName));
    candidates.push(await deriveRoomId(phrase));
    setBusy(false);
    if (storedRoomId && candidates.includes(storedRoomId)) {
      onUnlock();
    } else {
      setRecoverError("That Family Phrase doesn't match this device.");
      setPhrase("");
    }
  }

  if (recovering) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={handleRecover}
          className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 text-center dark:border-white/10"
        >
          <div className="text-4xl">🔑</div>
          <h1 className="text-lg font-semibold">Unlock with your Family Phrase</h1>
          <p className="text-sm opacity-70">
            Forgot your PIN? Enter your Family Phrase to get in, then set a new PIN in Settings.
          </p>
          <RevealInput
            value={phrase}
            onChange={setPhrase}
            placeholder="Family Phrase"
            className="rounded-md border border-black/20 px-3 py-2 text-left dark:border-white/20 dark:bg-transparent"
            autoFocus
          />
          {recoverError && <p className="text-sm text-red-500">{recoverError}</p>}
          <button
            type="submit"
            disabled={busy || phrase.trim().length === 0}
            className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Unlock
          </button>
          <button type="button" onClick={() => { setRecovering(false); setRecoverError(null); }} className="text-sm opacity-60 underline">
            Back to PIN
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 text-center dark:border-white/10"
      >
        <div className="text-4xl">🔒</div>
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="text-sm opacity-70">Enter your PIN to unlock.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-center text-2xl tracking-[0.4em] dark:border-white/20 dark:bg-transparent"
          autoFocus
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || pin.length === 0}
          className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Unlock
        </button>
        <button type="button" onClick={() => setRecovering(true)} className="text-sm opacity-60 underline">
          Forgot PIN?
        </button>
      </form>
    </main>
  );
}

/**
 * Whether this device's active identity has a PIN and therefore must pass AppLock before the app
 * opens. Used at boot to decide whether to start locked.
 */
export function needsAppLock(state: FamilyBankState, deviceRole: DeviceRole | null, deviceKidId: string | null, deviceParentId: string | null): boolean {
  if (deviceRole === "kid") {
    const kid = state.kids.find((candidate) => candidate.id === deviceKidId);
    return Boolean(kid?.pinHash);
  }
  if (deviceRole === "parent") {
    // A parent bound to a specific profile locks on that profile's PIN; otherwise fall back to the
    // shared parent PIN gate (either a co-parent's own PIN or the legacy family PIN).
    const parent = deviceParentId ? state.parentProfiles.find((candidate) => candidate.id === deviceParentId) : null;
    if (parent) return Boolean(parent.pinHash) || Boolean(state.parentSettings.parentPinHash);
    return Boolean(state.parentSettings.parentPinHash) || state.parentProfiles.some((candidate) => candidate.pinHash);
  }
  return false;
}
