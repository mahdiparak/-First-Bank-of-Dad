"use client";

import { useState } from "react";
import { updateKidProfile, updateParentProfile } from "@/lib/mutations";
import { kidAvatar, parentAvatar, type FamilyBankState } from "@/lib/schema";
import { ParentLoginPrompt } from "./role-gate";

const inputClass =
  "min-w-0 flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

export function ProfilePanel({
  state,
  role,
  deviceParentId,
  deviceKidId,
  onMutate,
  onSetDeviceParentId,
  onSwitchToParent,
}: {
  state: FamilyBankState;
  role: "parent" | "kid";
  deviceParentId: string | null;
  deviceKidId: string | null;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
  onSetDeviceParentId: (parentId: string) => void;
  onSwitchToParent: (parentId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [switchingToParent, setSwitchingToParent] = useState(false);

  const currentParent = deviceParentId ? state.parentProfiles.find((parent) => parent.id === deviceParentId) : null;
  const currentKid = deviceKidId ? state.kids.find((kid) => kid.id === deviceKidId) : null;

  function close() {
    setOpen(false);
    setSwitchingToParent(false);
  }

  function handleSwitchSuccess(parentId?: string) {
    close();
    onSwitchToParent(parentId);
  }

  const buttonGlyph = role === "parent" ? (currentParent ? parentAvatar(currentParent) : "👤") : currentKid ? kidAvatar(currentKid) : "👤";

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Profile"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 text-lg dark:border-white/20"
      >
        {buttonGlyph}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-72 space-y-3 rounded-xl border border-black/10 bg-white p-4 text-sm text-black shadow-lg dark:border-white/10 dark:bg-neutral-900 dark:text-white">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Profile</p>
            <button type="button" onClick={close} className="text-xs opacity-60 underline">
              Close
            </button>
          </div>

          {role === "parent" ? (
            <ParentProfileSection
              state={state}
              currentParent={currentParent ?? null}
              onSetDeviceParentId={onSetDeviceParentId}
              onMutate={onMutate}
            />
          ) : (
            <>
              {currentKid && <KidEmailField kidId={currentKid.id} email={currentKid.email} onMutate={onMutate} />}

              <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
                {switchingToParent ? (
                  <ParentLoginPrompt state={state} onSuccess={handleSwitchSuccess} onCancel={() => setSwitchingToParent(false)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setSwitchingToParent(true)}
                    className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
                  >
                    Switch to Parent
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}

function ParentProfileSection({
  state,
  currentParent,
  onSetDeviceParentId,
  onMutate,
}: {
  state: FamilyBankState;
  currentParent: FamilyBankState["parentProfiles"][number] | null;
  onSetDeviceParentId: (parentId: string) => void;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  return (
    <div className="space-y-3">
      {state.parentProfiles.length > 0 && (
        <label className="flex flex-col gap-1 text-xs opacity-70">
          Who&apos;s using this device?
          <select
            value={currentParent?.id ?? ""}
            onChange={(event) => onSetDeviceParentId(event.target.value)}
            className="rounded-md border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
          >
            <option value="">Not set</option>
            {state.parentProfiles.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parentAvatar(parent)} {parent.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {currentParent ? (
        <ParentEmailField parentId={currentParent.id} email={currentParent.email} onMutate={onMutate} />
      ) : (
        <p className="text-xs opacity-60">Pick who you are above to set your email.</p>
      )}
    </div>
  );
}

function ParentEmailField({
  parentId,
  email,
  onMutate,
}: {
  parentId: string;
  email?: string;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [value, setValue] = useState(email ?? "");
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onMutate((s) => updateParentProfile(s, parentId, { email: value.trim() }));
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <label className="flex flex-col gap-1 text-xs opacity-70">
        Email (matches your login so this device opens straight to you)
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            type="email"
            placeholder="you@example.com"
            className={inputClass}
          />
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-xs text-white dark:bg-white dark:text-black">
            Save
          </button>
        </div>
      </label>
      {saved && <p className="text-xs opacity-60">Saved.</p>}
    </form>
  );
}

function KidEmailField({
  kidId,
  email,
  onMutate,
}: {
  kidId: string;
  email?: string;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [value, setValue] = useState(email ?? "");
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onMutate((s) => updateKidProfile(s, kidId, { email: value.trim() }));
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <label className="flex flex-col gap-1 text-xs opacity-70">
        Your email (only if you have your own device/login)
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            type="email"
            placeholder="you@example.com"
            className={inputClass}
          />
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-xs text-white dark:bg-white dark:text-black">
            Save
          </button>
        </div>
      </label>
      {saved && <p className="text-xs opacity-60">Saved.</p>}
    </form>
  );
}
