"use client";

import { useState } from "react";
import { hashPin } from "@/lib/crypto";
import { parentAvatar, type FamilyBankState } from "@/lib/schema";

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
  const [mode, setMode] = useState<"choose" | "pick-kid" | "pick-parent" | "parent-pin">("choose");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function afterUnlock() {
    if (state.parentProfiles.length > 1) {
      setMode("pick-parent");
    } else {
      onChooseParent(state.parentProfiles[0]?.id);
    }
  }

  function handleParentClick() {
    if (!state.parentSettings.parentPinHash) {
      afterUnlock();
      return;
    }
    setMode("parent-pin");
  }

  async function handlePinSubmit(event: React.FormEvent) {
    event.preventDefault();
    const hash = await hashPin(pin);
    if (hash === state.parentSettings.parentPinHash) {
      afterUnlock();
    } else {
      setError("Wrong PIN.");
      setPin("");
    }
  }

  if (mode === "parent-pin") {
    return (
      <form
        onSubmit={handlePinSubmit}
        className="w-full max-w-sm space-y-3 rounded-xl border border-black/10 p-6 dark:border-white/10"
      >
        <h1 className="text-lg font-semibold">Enter the Parent PIN</h1>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="w-full rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          autoFocus
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-black px-3 py-2 text-white dark:bg-white dark:text-black">
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
              onClick={() => onChooseKid(kid.id)}
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

/** The "Parent Login" escape hatch shown at the bottom of a locked-down Kid View. */
export function ParentLoginPrompt({
  parentPinHash,
  parentProfiles,
  onSuccess,
  onCancel,
}: {
  parentPinHash?: string;
  parentProfiles: FamilyBankState["parentProfiles"];
  onSuccess: (parentId?: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickingParent, setPickingParent] = useState(false);

  function afterUnlock() {
    if (parentProfiles.length > 1) {
      setPickingParent(true);
    } else {
      onSuccess(parentProfiles[0]?.id);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!parentPinHash) {
      afterUnlock();
      return;
    }
    const hash = await hashPin(pin);
    if (hash === parentPinHash) {
      afterUnlock();
    } else {
      setError("Wrong PIN.");
      setPin("");
    }
  }

  if (pickingParent) {
    return (
      <div className="w-full max-w-xs space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm font-semibold">Which parent is this?</p>
        <div className="flex flex-wrap gap-2">
          {parentProfiles.map((parent) => (
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
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-xs space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
    >
      <p className="text-sm font-semibold">Parent Login</p>
      {parentPinHash && (
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="PIN"
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          autoFocus
        />
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          {parentPinHash ? "Unlock" : "Continue"}
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
