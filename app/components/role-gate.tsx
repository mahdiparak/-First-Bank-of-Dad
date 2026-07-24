"use client";

import { useEffect, useState } from "react";
import { hasKidPinGate, kidPinLockoutStatus, verifyKidPin } from "@/lib/kid-auth";
import { hasParentPinGate, parentPinLockoutStatus, verifyParentPin } from "@/lib/parent-auth";
import { kidAvatar, parentAvatar, type FamilyBankState, type KidProfile } from "@/lib/schema";
import { formatLockoutRemaining, useLockoutCountdown } from "@/lib/use-lockout-countdown";

/** Shown on a device with no locally-remembered role once a Parent PIN already exists elsewhere in the family. */
export function RoleChooser({
  state,
  onChooseParent,
  onChooseKid,
}: {
  state: FamilyBankState;
  onChooseParent: (parentId?: string) => void;
  onChooseKid: (kidId: string) => void;
}) {
  const [mode, setMode] = useState<"choose" | "pick-kid" | "pick-parent" | "parent-pin" | "kid-pin">("choose");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingKid, setPendingKid] = useState<KidProfile | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const countdown = useLockoutCountdown(lockoutRemaining);
  const locked = countdown > 0;

  function afterUnlock(parentId?: string) {
    if (parentId) {
      onChooseParent(parentId);
    } else if (state.parentProfiles.length > 1) {
      setMode("pick-parent");
    } else {
      onChooseParent(state.parentProfiles[0]?.id);
    }
  }

  function handleParentClick() {
    if (!hasParentPinGate(state)) {
      afterUnlock();
      return;
    }
    void parentPinLockoutStatus().then((status) => {
      if (status.locked) setLockoutRemaining(status.remainingMs);
    });
    setMode("parent-pin");
  }

  async function handlePinSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    const result = await verifyParentPin(state, pin);
    setPin("");
    if (result.ok) {
      afterUnlock(result.parentId);
    } else if (result.lockout?.locked) {
      setLockoutRemaining(result.lockout.remainingMs);
    } else {
      setError("Wrong PIN.");
    }
  }

  function handleKidClick(kid: KidProfile) {
    if (!hasKidPinGate(kid)) {
      onChooseKid(kid.id);
      return;
    }
    setPendingKid(kid);
    setMode("kid-pin");
  }

  if (mode === "kid-pin" && pendingKid) {
    return (
      <KidPinPrompt
        kid={pendingKid}
        onSuccess={() => onChooseKid(pendingKid.id)}
        onCancel={() => {
          setPendingKid(null);
          setMode("pick-kid");
        }}
      />
    );
  }

  if (mode === "parent-pin") {
    return (
      <form
        onSubmit={handlePinSubmit}
        className="w-full max-w-sm space-y-3 rounded-xl border border-black/10 p-6 dark:border-white/10"
      >
        <h1 className="text-lg font-semibold">Enter your Parent PIN</h1>
        {locked && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            Too many wrong attempts — try again in {formatLockoutRemaining(countdown)}.
          </p>
        )}
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          disabled={locked}
          className="w-full rounded-md border border-black/20 px-3 py-2 disabled:opacity-50 dark:border-white/20 dark:bg-transparent"
          autoFocus
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={locked}
          className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Unlock
        </button>
        <button type="button" onClick={() => setMode("choose")} className="w-full text-sm opacity-70">
          Back
        </button>
      </form>
    );
  }

  if (mode === "pick-parent") {
    return (
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-black/10 p-6 dark:border-white/10">
        <h1 className="text-lg font-semibold">Which parent is this?</h1>
        <div className="flex flex-wrap gap-2">
          {state.parentProfiles.map((parent) => (
            <button
              key={parent.id}
              onClick={() => onChooseParent(parent.id)}
              className="rounded-full border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
            >
              {parentAvatar(parent)} {parent.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onChooseParent()} className="text-xs opacity-60 underline">
          Skip
        </button>
      </div>
    );
  }

  if (mode === "pick-kid") {
    return (
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-black/10 p-6 dark:border-white/10">
        <h1 className="text-lg font-semibold">Which kid is this?</h1>
        <div className="flex flex-wrap gap-2">
          {state.kids.map((kid) => (
            <button
              key={kid.id}
              onClick={() => handleKidClick(kid)}
              className="rounded-full border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
            >
              {kid.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setMode("choose")} className="text-sm opacity-70">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 dark:border-white/10">
      <h1 className="text-lg font-semibold">Who&apos;s using this device?</h1>
      <div className="flex gap-3">
        <button
          onClick={handleParentClick}
          className="flex-1 rounded-md bg-black px-3 py-3 text-white dark:bg-white dark:text-black"
        >
          Parent
        </button>
        <button
          onClick={() => setMode("pick-kid")}
          disabled={state.kids.length === 0}
          className="flex-1 rounded-md border border-black/20 px-3 py-3 disabled:opacity-40 dark:border-white/20"
        >
          Kid
        </button>
      </div>
      {state.kids.length === 0 && <p className="text-xs opacity-60">Add a kid from Parent mode first.</p>}
    </div>
  );
}

/**
 * Gates opening a kid's own Kid View behind their PIN — shown after Cloudflare Access email
 * login auto-matches a kid, or after picking that kid from the RoleChooser, whenever that kid
 * has a PIN set. A kid with no PIN never sees this.
 */
export function KidPinPrompt({
  kid,
  onSuccess,
  onCancel,
}: {
  kid: KidProfile;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const countdown = useLockoutCountdown(lockoutRemaining);
  const locked = countdown > 0;

  useEffect(() => {
    void kidPinLockoutStatus(kid.id).then((status) => {
      if (status.locked) setLockoutRemaining(status.remainingMs);
    });
  }, [kid.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    const result = await verifyKidPin(kid, pin);
    setPin("");
    if (result.ok) {
      onSuccess();
    } else if (result.lockout?.locked) {
      setLockoutRemaining(result.lockout.remainingMs);
    } else {
      setError("Wrong PIN.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-3 rounded-xl border border-black/10 p-6 dark:border-white/10"
    >
      <h1 className="text-lg font-semibold">
        {kidAvatar(kid)} Enter {kid.name}&apos;s PIN
      </h1>
      {locked && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          Too many wrong attempts — try again in {formatLockoutRemaining(countdown)}.
        </p>
      )}
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
        disabled={locked}
        className="w-full rounded-md border border-black/20 px-3 py-2 disabled:opacity-50 dark:border-white/20 dark:bg-transparent"
        autoFocus
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={locked}
        className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        Unlock
      </button>
      <button type="button" onClick={onCancel} className="w-full text-sm opacity-70">
        Not you?
      </button>
    </form>
  );
}

/** The "Switch to Parent" flow — shown inline from the Kid View's profile panel. */
export function ParentLoginPrompt({
  state,
  onSuccess,
  onCancel,
}: {
  state: FamilyBankState;
  onSuccess: (parentId?: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickingParent, setPickingParent] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const countdown = useLockoutCountdown(lockoutRemaining);
  const locked = countdown > 0;

  useEffect(() => {
    if (!hasParentPinGate(state)) return;
    void parentPinLockoutStatus().then((status) => {
      if (status.locked) setLockoutRemaining(status.remainingMs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function afterUnlock(parentId?: string) {
    if (parentId) {
      onSuccess(parentId);
    } else if (state.parentProfiles.length > 1) {
      setPickingParent(true);
    } else {
      onSuccess(state.parentProfiles[0]?.id);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasParentPinGate(state)) {
      afterUnlock();
      return;
    }
    if (locked) return;
    const result = await verifyParentPin(state, pin);
    setPin("");
    if (result.ok) {
      afterUnlock(result.parentId);
    } else if (result.lockout?.locked) {
      setLockoutRemaining(result.lockout.remainingMs);
    } else {
      setError("Wrong PIN.");
    }
  }

  if (pickingParent) {
    return (
      <div className="w-full space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm font-semibold">Which parent is this?</p>
        <div className="flex flex-wrap gap-2">
          {state.parentProfiles.map((parent) => (
            <button
              key={parent.id}
              onClick={() => onSuccess(parent.id)}
              className="rounded-full border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
            >
              {parentAvatar(parent)} {parent.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onSuccess()} className="text-xs opacity-60 underline">
          Skip
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-semibold">Switch to Parent</p>
      {hasParentPinGate(state) && locked && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          Too many wrong attempts — try again in {formatLockoutRemaining(countdown)}.
        </p>
      )}
      {hasParentPinGate(state) && (
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="Parent PIN"
          disabled={locked}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20 dark:bg-transparent"
          autoFocus
        />
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={locked}
          className="flex-1 rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {hasParentPinGate(state) ? "Unlock" : "Continue"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
