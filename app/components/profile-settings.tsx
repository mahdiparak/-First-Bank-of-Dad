"use client";

import { useState } from "react";
import { hashPin } from "@/lib/crypto";
import {
  addParentProfile,
  removeKid,
  removeParentProfile,
  setParentPinHash,
  setParentProfilePin,
  updateKidAllowance,
  updateKidProfile,
  updateParentProfile,
} from "@/lib/mutations";
import { AddKidForm, type AddKidFormValues } from "./add-kid-form";
import {
  KID_AVATARS,
  kidAvatar,
  PARENT_AVATARS,
  parentAvatar,
  type FamilyBankState,
  type KidProfile,
  type ParentProfile,
} from "@/lib/schema";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

/**
 * The one place for people-management: naming parents and kids, avatars, login emails, each
 * parent's own PIN, each kid's allowance/payday, and adding a new kid. Deliberately consolidated
 * here so none of it clutters the day-to-day dashboards.
 */
export function ProfileSettingsPanel({
  state,
  onMutate,
  onAddKid,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
  onAddKid: (values: AddKidFormValues) => void;
}) {
  const [parentName, setParentName] = useState("");
  const [parentAvatarChoice, setParentAvatarChoice] = useState<string>(PARENT_AVATARS[0]);
  const [parentError, setParentError] = useState<string | null>(null);

  function handleAddParent(event: React.FormEvent) {
    event.preventDefault();
    try {
      setParentError(null);
      onMutate((s) => addParentProfile(s, parentName, parentAvatarChoice));
      setParentName("");
    } catch (error) {
      setParentError(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Profile Setup</h2>

      <div className="space-y-3">
        <p className="text-sm opacity-70">Parents</p>
        <p className="text-xs opacity-60">
          Name each parent, and optionally set their login email and their own PIN. Any parent has
          the same full access — this is just for personalization and for gating the Kid View
          escape hatch, not for permissions.
        </p>
        {parentError && <p className="text-sm text-red-500">{parentError}</p>}
        {state.parentProfiles.length === 0 && <p className="text-xs opacity-60">No parents named yet.</p>}
        {state.parentProfiles.map((parent) => (
          <ParentProfileEditor key={parent.id} parent={parent} onMutate={onMutate} />
        ))}
        <form onSubmit={handleAddParent} className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {PARENT_AVATARS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setParentAvatarChoice(option)}
                className={`rounded-lg border-2 p-1 text-xl ${
                  parentAvatarChoice === option ? "border-black dark:border-white" : "border-transparent"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Parent's name"
              className={inputClass}
            />
            <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
              Add parent
            </button>
          </div>
        </form>
        <SharedPinEditor state={state} onMutate={onMutate} />
      </div>

      <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="text-sm opacity-70">Kids</p>
        <p className="text-xs opacity-60">
          A kid only needs an email if they have their own device/login (e.g. an older kid) — it
          lets that device open straight to their view. The younger kid with no device of his own
          can skip this; a parent opens his profile for him instead.
        </p>
        {state.kids.length === 0 && <p className="text-xs opacity-60">No kids yet.</p>}
        {state.kids.map((kid) => (
          <KidProfileEditor key={kid.id} kid={kid} onMutate={onMutate} />
        ))}
        <AddKidForm onSubmit={onAddKid} />
      </div>
    </section>
  );
}

/**
 * The old family-wide PIN, kept as a fallback for parents without a personal PIN. Lives here so
 * every PIN control sits in one place, next to the parents it applies to.
 */
function SharedPinEditor({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const hasPin = Boolean(state.parentSettings.parentPinHash);

  async function handleSetPin(event: React.FormEvent) {
    event.preventDefault();
    if (pin.trim().length < 4) {
      setMessage("Use at least 4 digits.");
      return;
    }
    const hash = await hashPin(pin);
    onMutate((s) => setParentPinHash(s, hash));
    setPin("");
    setMessage("Shared PIN saved.");
  }

  function handleRemovePin() {
    onMutate((s) => setParentPinHash(s, null));
    setMessage("Shared PIN removed.");
  }

  return (
    <form onSubmit={handleSetPin} className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <p className="text-xs opacity-70">Shared backup PIN {hasPin ? "(set)" : "(not set)"}</p>
      <p className="text-xs opacity-60">
        Works for any parent who hasn&apos;t set their own PIN above. It&apos;s a speed bump for
        curious kids, not encryption.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          inputMode="numeric"
          placeholder="New PIN"
          className={`${inputClass} w-28`}
        />
        <button type="submit" className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20">
          {hasPin ? "Change PIN" : "Set PIN"}
        </button>
        {hasPin && (
          <button type="button" onClick={handleRemovePin} className="text-xs opacity-70 underline">
            Remove PIN
          </button>
        )}
      </div>
      {message && <p className="text-xs opacity-60">{message}</p>}
    </form>
  );
}

function ParentProfileEditor({
  parent,
  onMutate,
}: {
  parent: ParentProfile;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(parent.name);
  const [avatar, setAvatar] = useState(parentAvatar(parent));
  const [email, setEmail] = useState(parent.email ?? "");
  const [pin, setPin] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onMutate((s) => updateParentProfile(s, parent.id, { name: name.trim(), avatar, email: email.trim() }));
    setEditing(false);
  }

  function handleRemove() {
    if (window.confirm(`Remove ${parent.name} from the parents list?`)) {
      onMutate((s) => removeParentProfile(s, parent.id));
    }
  }

  async function handleSetPin(event: React.FormEvent) {
    event.preventDefault();
    if (pin.trim().length < 4) {
      setPinMessage("Use at least 4 digits.");
      return;
    }
    const hash = await hashPin(pin);
    onMutate((s) => setParentProfilePin(s, parent.id, hash));
    setPin("");
    setPinMessage("PIN saved.");
  }

  function handleRemovePin() {
    onMutate((s) => setParentProfilePin(s, parent.id, null));
    setPinMessage("Personal PIN removed — falls back to the shared PIN, if any.");
  }

  if (!editing) {
    return (
      <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="flex items-center justify-between text-sm">
          <span>
            {parentAvatar(parent)} {parent.name}
            {parent.email && <span className="opacity-60"> · {parent.email}</span>}
          </span>
          <div className="flex gap-3">
            <button onClick={() => setEditing(true)} className="text-xs underline opacity-70">
              Edit
            </button>
            <button onClick={handleRemove} className="text-xs text-red-500">
              Remove
            </button>
          </div>
        </div>
        <form onSubmit={handleSetPin} className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-60">PIN {parent.pinHash ? "(set)" : "(not set)"}</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            placeholder="New PIN"
            className={`${inputClass} w-28`}
          />
          <button type="submit" className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20">
            {parent.pinHash ? "Change PIN" : "Set PIN"}
          </button>
          {parent.pinHash && (
            <button type="button" onClick={handleRemovePin} className="text-xs opacity-70 underline">
              Remove PIN
            </button>
          )}
        </form>
        {pinMessage && <p className="text-xs opacity-60">{pinMessage}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap gap-1">
        {PARENT_AVATARS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setAvatar(option)}
            className={`rounded-lg border-2 p-1 text-xl ${
              avatar === option ? "border-black dark:border-white" : "border-transparent"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Name" />
      </div>
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Login email (optional)"
          className={`${inputClass} flex-1`}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-xs text-white dark:bg-white dark:text-black">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs opacity-70">
          Cancel
        </button>
      </div>
    </form>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function KidProfileEditor({
  kid,
  onMutate,
}: {
  kid: KidProfile;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(kid.name);
  const [avatar, setAvatar] = useState(kidAvatar(kid));
  const [email, setEmail] = useState(kid.email ?? "");
  const [age, setAge] = useState(String(kid.age));
  const [allowance, setAllowance] = useState(String(kid.weeklyAllowance));
  const [payday, setPayday] = useState(String(kid.paydayWeekday));
  const [viewMode, setViewMode] = useState<NonNullable<KidProfile["viewMode"]>>(kid.viewMode ?? "auto");
  const [error, setError] = useState<string | null>(null);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setError(null);
      onMutate((s) =>
        updateKidAllowance(
          updateKidProfile(s, kid.id, {
            name: name.trim(),
            avatar,
            email: email.trim(),
            age: Number(age) || kid.age,
            viewMode,
          }),
          kid.id,
          Number(allowance),
          Number(payday),
        ),
      );
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Something went wrong.");
    }
  }

  function handleRemove() {
    if (
      window.confirm(
        `Remove ${kid.name} and ALL their data (balance, goals, history, investments)? This cannot be undone.`,
      )
    ) {
      onMutate((s) => removeKid(s, kid.id));
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>
          {kidAvatar(kid)} {kid.name} (age {kid.age}) · {formatCurrency(kid.weeklyAllowance)}/wk on{" "}
          {WEEKDAYS[kid.paydayWeekday]}
          {kid.email && <span className="opacity-60"> · {kid.email}</span>}
          <span className="opacity-60"> · {viewModeLabel(kid.viewMode ?? "auto")}</span>
        </span>
        <div className="flex gap-3">
          <button onClick={() => setEditing(true)} className="text-xs underline opacity-70">
            Edit
          </button>
          <button onClick={handleRemove} className="text-xs text-red-500">
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap gap-1">
        {KID_AVATARS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setAvatar(option)}
            className={`rounded-lg border-2 p-1 text-xl ${
              avatar === option ? "border-black dark:border-white" : "border-transparent"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Name" />
        <input
          value={age}
          onChange={(e) => setAge(e.target.value)}
          type="number"
          min={0}
          placeholder="Age"
          className={`${inputClass} w-20`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs opacity-70">
          Allowance $/wk
          <input
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
            type="number"
            min={0}
            step="0.01"
            className={`${inputClass} w-28`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs opacity-70">
          Payday
          <select value={payday} onChange={(e) => setPayday(e.target.value)} className={inputClass}>
            {WEEKDAYS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs opacity-70">
          View
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as NonNullable<KidProfile["viewMode"]>)}
            className={inputClass}
          >
            <option value="auto">Auto (by age)</option>
            <option value="kid">Kid view — big & simple</option>
            <option value="teen">Teen view — full dashboard</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Login email — only if they have their own device"
          className={`${inputClass} flex-1`}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-xs text-white dark:bg-white dark:text-black">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs opacity-70">
          Cancel
        </button>
      </div>
    </form>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function viewModeLabel(viewMode: NonNullable<KidProfile["viewMode"]>): string {
  if (viewMode === "kid") return "Kid view";
  if (viewMode === "teen") return "Teen view";
  return "Auto view (by age)";
}
