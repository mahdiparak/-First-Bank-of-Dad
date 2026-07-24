"use client";

import { useState } from "react";
import { hashKidPin, hashPin } from "@/lib/crypto";
import {
  addKid,
  addParentProfile,
  setDadMatchMilestones,
  setKidPin,
  setParentProfilePin,
  updateParentProfile,
  updateParentSettings,
} from "@/lib/mutations";
import { createEmptyState, YOUNG_KID_MAX_AGE, type DadMatchMilestone, type FamilyBankState } from "@/lib/schema";
import type { DeviceRole } from "@/lib/storage";
import type { JoinRequest } from "@/lib/sync";
import { RevealInput } from "./reveal-input";

export interface CreateFamilyResult {
  phrase: string;
  roomName: string;
  state: FamilyBankState;
  parentId: string;
}

export interface JoinResult {
  phrase: string;
  roomName: string;
  request: Omit<JoinRequest, "deviceId">;
}

const inputClass = "rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A few sensible saving-streak rewards suggested to the parent — they can keep, remove, or add to these. */
const SUGGESTED_MILESTONES: DadMatchMilestone[] = [
  { weeks: 4, bonus: 5 },
  { weeks: 8, bonus: 10 },
  { weeks: 12, bonus: 20 },
];

interface KidDraft {
  name: string;
  age: string;
  email: string;
  pin: string;
  allowance: string;
  payday: string;
  startingBalance: string;
}

function emptyKid(): KidDraft {
  return { name: "", age: "", email: "", pin: "", allowance: "", payday: "5", startingBalance: "" };
}

function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function OnboardingWizard({
  onCreateFamily,
  onJoin,
  onRestoreBackup,
}: {
  onCreateFamily: (result: CreateFamilyResult) => void;
  onJoin: (result: JoinResult) => void;
  /** Restore a previously-exported backup JSON, securing it under a Family Phrase + room so this
   *  device is a fully set-up install (not a half-state that bounces back to the wizard). */
  onRestoreBackup: (file: File, phrase: string, roomName: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"welcome" | "create" | "join" | "restore">("welcome");

  if (mode === "create") return <CreateFamilyFlow onBack={() => setMode("welcome")} onFinish={onCreateFamily} />;
  if (mode === "join") return <JoinFlow onBack={() => setMode("welcome")} onFinish={onJoin} />;
  if (mode === "restore") return <RestoreFlow onBack={() => setMode("welcome")} onFinish={onRestoreBackup} />;

  return (
    <Shell title="Welcome to First Bank of Dad 🏦" subtitle="Let's get you set up. This takes a minute.">
      <div className="space-y-3">
        <button
          onClick={() => setMode("create")}
          className="w-full rounded-lg bg-black px-4 py-4 text-left text-white dark:bg-white dark:text-black"
        >
          <span className="block font-semibold">Start a new family</span>
          <span className="block text-sm opacity-70">You&apos;re a parent setting things up for the first time.</span>
        </button>
        <button
          onClick={() => setMode("join")}
          className="w-full rounded-lg border border-black/20 px-4 py-4 text-left dark:border-white/20"
        >
          <span className="block font-semibold">Join my family</span>
          <span className="block text-sm opacity-70">A parent already set things up and gave you the Family Phrase.</span>
        </button>
        <button onClick={() => setMode("restore")} className="block w-full text-center text-xs opacity-60 underline">
          Restore from a backup file
        </button>
      </div>
    </Shell>
  );
}

function RestoreFlow({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  onFinish: (file: File, phrase: string, roomName: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState("");
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRestore() {
    if (!file) {
      setError("Choose your backup file first.");
      return;
    }
    if (phrase.trim().length < 8) {
      setError("Set a Family Phrase of at least 8 characters to secure this data.");
      return;
    }
    if (!roomName.trim()) {
      setError("Give your family a room name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onFinish(file, phrase.trim(), roomName.trim());
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Couldn't restore that backup.");
      setBusy(false);
    }
  }

  return (
    <Shell title="Restore from a backup" subtitle="Load a backup file and secure it under a Family Phrase.">
      <div className="space-y-3">
        <label className="block cursor-pointer rounded-md border border-dashed border-black/30 px-3 py-3 text-center text-sm dark:border-white/30">
          {file ? `📄 ${file.name}` : "Choose backup JSON file"}
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Labeled label="Family Phrase (8+ characters)">
          <RevealInput value={phrase} onChange={setPhrase} placeholder="Family Phrase" className={inputClass} />
        </Labeled>
        <Labeled label="Family room name">
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Smith Family"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Labeled>
        <p className="text-xs opacity-60">
          Use the same phrase and room name as your other devices to sync with them, or set new ones
          to run this device on its own.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <NavButtons onBack={onBack} onNext={() => void handleRestore()} nextLabel="Restore" busy={busy} />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Create-family path
// ---------------------------------------------------------------------------

type CreateStep = "parent" | "phrase" | "kids" | "rates" | "streaks";
const CREATE_STEPS: CreateStep[] = ["parent", "phrase", "kids", "rates", "streaks"];

function CreateFamilyFlow({ onBack, onFinish }: { onBack: () => void; onFinish: (result: CreateFamilyResult) => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = CREATE_STEPS[stepIndex];

  // Parent profile
  const [parentName, setParentName] = useState("");
  const [parentAge, setParentAge] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPin, setParentPin] = useState("");

  // Family phrase + room
  const [phrase, setPhrase] = useState("");
  const [phraseConfirm, setPhraseConfirm] = useState("");
  const [roomName, setRoomName] = useState("");

  // Kids
  const [kids, setKids] = useState<KidDraft[]>([]);

  // Rates (percent strings, prefilled from defaults)
  const defaults = createEmptyState("").parentSettings;
  const [taxRate, setTaxRate] = useState(String(round(defaults.taxRate * 100)));
  const [hysaApr, setHysaApr] = useState(String(round(defaults.hysaApr * 100)));
  const [cdApr, setCdApr] = useState(String(round(defaults.cdApr * 100)));

  // Streak rules
  const [milestones, setMilestones] = useState<DadMatchMilestone[]>(SUGGESTED_MILESTONES);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function goBack() {
    setError(null);
    if (stepIndex === 0) onBack();
    else setStepIndex((index) => index - 1);
  }

  function validateStep(): string | null {
    if (step === "parent") {
      if (!parentName.trim()) return "Enter your name.";
      if (!isValidPin(parentPin)) return "Set a 4-digit PIN — you'll enter it every time you open the app.";
    }
    if (step === "phrase") {
      if (phrase.trim().length < 8) return "Use a Family Phrase of at least 8 characters — it's your encryption key.";
      if (phrase.trim() !== phraseConfirm.trim()) return "The two Family Phrases don't match.";
      if (!roomName.trim()) return "Give your family a room name (e.g. \"Smith Family\").";
    }
    if (step === "kids") {
      for (const kid of kids) {
        if (!kid.name.trim()) return "Every kid needs a name (or remove the empty one).";
        if (!kid.age || Number(kid.age) < 0) return `Enter an age for ${kid.name || "your kid"}.`;
        if (kid.pin && !isValidPin(kid.pin)) return `${kid.name}'s PIN must be exactly 4 digits (or leave it blank).`;
      }
    }
    return null;
  }

  async function handleNext() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (stepIndex < CREATE_STEPS.length - 1) {
      setStepIndex((index) => index + 1);
      return;
    }
    // Final step — build the family state and hand it up.
    setBusy(true);
    try {
      const built = await buildCreatedState();
      onFinish({ phrase: phrase.trim(), roomName: roomName.trim(), state: built.state, parentId: built.parentId });
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function buildCreatedState(): Promise<{ state: FamilyBankState; parentId: string }> {
    let s = createEmptyState(crypto.randomUUID());
    s = updateParentSettings(s, {
      taxRate: percentToRate(taxRate),
      hysaApr: percentToRate(hysaApr),
      cdApr: percentToRate(cdApr),
    });
    s = setDadMatchMilestones(s, milestones);

    s = addParentProfile(s, parentName.trim(), undefined, parentAge ? Number(parentAge) : undefined);
    const parentId = s.parentProfiles[s.parentProfiles.length - 1].id;
    if (parentEmail.trim()) s = updateParentProfile(s, parentId, { email: parentEmail.trim() });
    s = setParentProfilePin(s, parentId, await hashPin(parentPin));

    for (const kid of kids) {
      s = addKid(s, {
        name: kid.name.trim(),
        age: Number(kid.age),
        weeklyAllowance: kid.allowance ? Number(kid.allowance) : 0,
        paydayWeekday: Number(kid.payday),
        email: kid.email.trim() || undefined,
        startingBalance: kid.startingBalance ? Number(kid.startingBalance) : undefined,
      });
      if (kid.pin) {
        const kidId = s.kids[s.kids.length - 1].id;
        s = setKidPin(s, kidId, await hashKidPin(kid.pin));
      }
    }
    return { state: s, parentId };
  }

  const stepNumber = stepIndex + 1;
  const isLast = stepIndex === CREATE_STEPS.length - 1;

  return (
    <Shell
      title="Set up your family"
      subtitle={`Step ${stepNumber} of ${CREATE_STEPS.length}`}
    >
      {step === "parent" && (
        <div className="space-y-3">
          <Labeled label="Your name">
            <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={inputClass} placeholder="e.g. Dad" autoFocus />
          </Labeled>
          <Labeled label="Your age (optional)">
            <input value={parentAge} onChange={(e) => setParentAge(e.target.value)} type="number" min={0} className={inputClass} />
          </Labeled>
          <Labeled label="Email (optional)">
            <input value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} type="email" className={inputClass} placeholder="Only if this device signs in with it" />
          </Labeled>
          <Labeled label="Set a 4-digit PIN">
            <PinInput value={parentPin} onChange={setParentPin} />
            <p className="text-xs opacity-60">You&apos;ll enter this each time the app opens.</p>
          </Labeled>
        </div>
      )}

      {step === "phrase" && (
        <div className="space-y-3">
          <p className="text-sm opacity-70">
            The <strong>Family Phrase</strong> is the one secret every device in your family types
            in to share the same data. It never leaves your device and encrypts everything — pick
            something memorable and easy to type, not a random password.
          </p>
          <Labeled label="Family Phrase (8+ characters)">
            <RevealInput value={phrase} onChange={setPhrase} placeholder="e.g. purple otter breakfast" className={inputClass} autoFocus />
          </Labeled>
          <Labeled label="Type it again">
            <RevealInput value={phraseConfirm} onChange={setPhraseConfirm} placeholder="Confirm Family Phrase" className={inputClass} />
          </Labeled>
          <Labeled label="Family room name">
            <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Smith Family"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
            <p className="text-xs opacity-60">
              An easy name your family types to find each other. Kids will need this <em>and</em> the
              Family Phrase to join.
            </p>
          </Labeled>
        </div>
      )}

      {step === "kids" && (
        <div className="space-y-4">
          <p className="text-sm opacity-70">Add your kids now, or skip and add them later in Settings.</p>
          {kids.map((kid, index) => (
            <KidDraftCard
              key={index}
              kid={kid}
              index={index}
              onChange={(next) => setKids((list) => list.map((k, i) => (i === index ? next : k)))}
              onRemove={() => setKids((list) => list.filter((_, i) => i !== index))}
            />
          ))}
          <button
            type="button"
            onClick={() => setKids((list) => [...list, emptyKid()])}
            className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
          >
            + Add a kid
          </button>
        </div>
      )}

      {step === "rates" && (
        <div className="space-y-3">
          <p className="text-sm opacity-70">These are pre-filled with sensible defaults — tweak them or move on.</p>
          <Labeled label="Family Tax % (optional)">
            <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} type="number" step="0.01" className={`${inputClass} w-28`} />
            <p className="text-xs opacity-60">A slice of each allowance withheld into a Tax Pot, refunded later — a hands-on tax lesson.</p>
          </Labeled>
          <Labeled label="Savings (HYSA) interest APR %">
            <input value={hysaApr} onChange={(e) => setHysaApr(e.target.value)} type="number" step="0.01" className={`${inputClass} w-28`} />
          </Labeled>
          <Labeled label="CD interest APR %">
            <input value={cdApr} onChange={(e) => setCdApr(e.target.value)} type="number" step="0.01" className={`${inputClass} w-28`} />
          </Labeled>
        </div>
      )}

      {step === "streaks" && (
        <MilestoneEditor milestones={milestones} onChange={setMilestones} />
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <NavButtons onBack={goBack} onNext={handleNext} nextLabel={isLast ? "Finish setup" : "Next"} busy={busy} />
    </Shell>
  );
}

function KidDraftCard({
  kid,
  index,
  onChange,
  onRemove,
}: {
  kid: KidDraft;
  index: number;
  onChange: (next: KidDraft) => void;
  onRemove: () => void;
}) {
  const young = kid.age !== "" && Number(kid.age) <= YOUNG_KID_MAX_AGE;
  function set<K extends keyof KidDraft>(field: K, value: KidDraft[K]) {
    onChange({ ...kid, [field]: value });
  }
  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{kid.name.trim() || `Kid ${index + 1}`}</span>
        <button type="button" onClick={onRemove} className="text-xs text-red-500">Remove</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={kid.name} onChange={(e) => set("name", e.target.value)} placeholder="Name" className={`${inputClass} flex-1`} />
        <input value={kid.age} onChange={(e) => set("age", e.target.value)} type="number" min={0} placeholder="Age" className={`${inputClass} w-20`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={kid.allowance} onChange={(e) => set("allowance", e.target.value)} type="number" min={0} step="0.01" placeholder="Weekly allowance $" className={`${inputClass} w-44`} />
        <select value={kid.payday} onChange={(e) => set("payday", e.target.value)} className={inputClass}>
          {WEEKDAYS.map((label, i) => (
            <option key={label} value={i}>Payday: {label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={kid.startingBalance} onChange={(e) => set("startingBalance", e.target.value)} type="number" min={0} step="0.01" placeholder="Current balance $ (optional)" className={`${inputClass} w-52`} />
        <input value={kid.email} onChange={(e) => set("email", e.target.value)} type="email" placeholder="Login email (optional)" className={`${inputClass} flex-1`} />
      </div>
      <div>
        <input value={kid.pin} onChange={(e) => set("pin", e.target.value)} inputMode="numeric" maxLength={4} placeholder="4-digit PIN (optional)" className={`${inputClass} w-44`} />
        <p className="mt-1 text-xs opacity-60">
          {young
            ? "Young kids on a shared device can skip a PIN. They'll get the big, picture-first app."
            : "Leave blank if they share this device; older kids set their own PIN when they join on their own device."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join path
// ---------------------------------------------------------------------------

type JoinStep = "profile" | "connect";
const JOIN_STEPS: JoinStep[] = ["profile", "connect"];

function JoinFlow({ onBack, onFinish }: { onBack: () => void; onFinish: (result: JoinResult) => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = JOIN_STEPS[stepIndex];

  const [role, setRole] = useState<DeviceRole>("kid");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [phrase, setPhrase] = useState("");
  const [roomName, setRoomName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function goBack() {
    setError(null);
    if (stepIndex === 0) onBack();
    else setStepIndex((index) => index - 1);
  }

  function validateStep(): string | null {
    if (step === "profile") {
      if (!name.trim()) return "Enter your name — it has to match what a parent set up for you.";
      if (!isValidPin(pin)) return "Set a 4-digit PIN for this device.";
    }
    if (step === "connect") {
      if (phrase.trim().length < 8) return "Enter the Family Phrase a parent gave you (8+ characters).";
      if (!roomName.trim()) return "Enter the family room name a parent gave you.";
    }
    return null;
  }

  async function handleNext() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (stepIndex < JOIN_STEPS.length - 1) {
      setStepIndex((index) => index + 1);
      return;
    }
    setBusy(true);
    try {
      const pinHash = role === "kid" ? await hashKidPin(pin) : await hashPin(pin);
      onFinish({
        phrase: phrase.trim(),
        roomName: roomName.trim(),
        request: {
          claimedName: name.trim(),
          requestedRole: role,
          email: email.trim() || undefined,
          pinHash,
        },
      });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const isLast = stepIndex === JOIN_STEPS.length - 1;

  return (
    <Shell title="Join your family" subtitle={`Step ${stepIndex + 1} of ${JOIN_STEPS.length}`}>
      {step === "profile" && (
        <div className="space-y-3">
          <Labeled label="I am a…">
            <div className="flex gap-2">
              {(["kid", "parent"] as DeviceRole[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm capitalize ${
                    role === option ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/20 dark:border-white/20"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Labeled>
          <Labeled label="Your name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Exactly as a parent set it up" autoFocus />
          </Labeled>
          <Labeled label="Your age (optional)">
            <input value={age} onChange={(e) => setAge(e.target.value)} type="number" min={0} className={inputClass} />
          </Labeled>
          <Labeled label="Email (optional)">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputClass} />
          </Labeled>
          <Labeled label="Set a 4-digit PIN for this device">
            <PinInput value={pin} onChange={setPin} />
            <p className="text-xs opacity-60">This stays on your device even after you join.</p>
          </Labeled>
        </div>
      )}

      {step === "connect" && (
        <div className="space-y-3">
          <p className="text-sm opacity-70">Enter the Family Phrase and room name a parent gave you.</p>
          <Labeled label="Family Phrase">
            <RevealInput value={phrase} onChange={setPhrase} placeholder="Family Phrase" className={inputClass} autoFocus />
          </Labeled>
          <Labeled label="Family room name">
            <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Smith Family"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          </Labeled>
          <p className="text-xs opacity-60">
            A parent will need to approve you before your device fills with the family&apos;s data.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <NavButtons onBack={goBack} onNext={handleNext} nextLabel={isLast ? "Request to join" : "Next"} busy={busy} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function MilestoneEditor({
  milestones,
  onChange,
}: {
  milestones: DadMatchMilestone[];
  onChange: (next: DadMatchMilestone[]) => void;
}) {
  const [weeks, setWeeks] = useState("");
  const [bonus, setBonus] = useState("");

  function add() {
    if (!weeks || !bonus) return;
    const weeksNum = Number(weeks);
    if (milestones.some((m) => m.weeks === weeksNum)) return;
    onChange([...milestones, { weeks: weeksNum, bonus: Number(bonus) }].sort((a, b) => a.weeks - b.weeks));
    setWeeks("");
    setBonus("");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70">
        <strong>Saving streak rewards:</strong> go this many weeks in a row without a withdrawal and
        a one-time bonus pays in automatically. Here are some suggestions — keep, remove, or add your own.
      </p>
      <div className="space-y-1">
        {milestones.map((milestone) => (
          <div key={milestone.weeks} className="flex items-center justify-between rounded-md bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.06]">
            <span>{milestone.weeks} weeks → ${milestone.bonus} bonus</span>
            <button type="button" onClick={() => onChange(milestones.filter((m) => m.weeks !== milestone.weeks))} className="text-xs text-red-500">
              Remove
            </button>
          </div>
        ))}
        {milestones.length === 0 && <p className="text-xs opacity-60">No streak rewards — that&apos;s fine, you can add them later.</p>}
      </div>
      <div className="flex gap-2">
        <input value={weeks} onChange={(e) => setWeeks(e.target.value)} type="number" min={1} placeholder="Weeks" className={`${inputClass} w-20`} />
        <input value={bonus} onChange={(e) => setBonus(e.target.value)} type="number" min={0} step="0.01" placeholder="Bonus $" className={`${inputClass} w-24`} />
        <button type="button" onClick={add} className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
          Add
        </button>
      </div>
    </div>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-black/10 p-6 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="text-sm opacity-60">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-col gap-1">{children}</div>
    </label>
  );
}

function PinInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      inputMode="numeric"
      maxLength={4}
      placeholder="0000"
      className={`${inputClass} w-32 text-center text-xl tracking-[0.3em]`}
    />
  );
}

function NavButtons({ onBack, onNext, nextLabel, busy }: { onBack: () => void; onNext: () => void; nextLabel: string; busy: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="button" onClick={onBack} disabled={busy} className="rounded-md border border-black/20 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20">
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={busy}
        className="flex-1 rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Working…" : nextLabel}
      </button>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentToRate(percent: string): number {
  const value = Number(percent);
  return Number.isFinite(value) ? value / 100 : 0;
}
