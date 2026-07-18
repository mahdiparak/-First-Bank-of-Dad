"use client";

import { useState } from "react";
import { hashPin } from "@/lib/crypto";
import { setDadMatchMilestones, setParentPinHash, updateParentSettings } from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

export function ParentSettingsPanel({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const settings = state.parentSettings;
  const [hysaApr, setHysaApr] = useState(String(toPercent(settings.hysaApr)));
  const [cdApr, setCdApr] = useState(String(toPercent(settings.cdApr)));
  const [taxRate, setTaxRate] = useState(String(toPercent(settings.taxRate)));
  const [milestoneWeeks, setMilestoneWeeks] = useState("");
  const [milestoneBonus, setMilestoneBonus] = useState("");
  const [pin, setPin] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  function handleSaveRates(event: React.FormEvent) {
    event.preventDefault();
    onMutate((s) =>
      updateParentSettings(s, {
        hysaApr: Number(hysaApr) / 100,
        cdApr: Number(cdApr) / 100,
        taxRate: Number(taxRate) / 100,
      }),
    );
  }

  function handleAddMilestone(event: React.FormEvent) {
    event.preventDefault();
    if (!milestoneWeeks || !milestoneBonus) return;
    onMutate((s) =>
      setDadMatchMilestones(s, [
        ...s.parentSettings.dadMatchMilestones,
        { weeks: Number(milestoneWeeks), bonus: Number(milestoneBonus) },
      ]),
    );
    setMilestoneWeeks("");
    setMilestoneBonus("");
  }

  function handleRemoveMilestone(weeks: number) {
    onMutate((s) =>
      setDadMatchMilestones(
        s,
        s.parentSettings.dadMatchMilestones.filter((milestone) => milestone.weeks !== weeks),
      ),
    );
  }

  async function handleSetPin(event: React.FormEvent) {
    event.preventDefault();
    if (pin.trim().length < 4) {
      setPinMessage("Use at least 4 digits.");
      return;
    }
    const hash = await hashPin(pin);
    onMutate((s) => setParentPinHash(s, hash));
    setPin("");
    setPinMessage("PIN saved.");
  }

  function handleRemovePin() {
    onMutate((s) => setParentPinHash(s, null));
    setPinMessage("PIN removed — Kid View can switch to Parent freely.");
  }

  return (
    <section className="space-y-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Parent Settings</h2>

      <form onSubmit={handleSaveRates} className="flex flex-wrap items-end gap-3">
        <Field label="HYSA APR %">
          <input value={hysaApr} onChange={(e) => setHysaApr(e.target.value)} type="number" step="0.01" className={`${inputClass} w-24`} />
        </Field>
        <Field label="CD APR %">
          <input value={cdApr} onChange={(e) => setCdApr(e.target.value)} type="number" step="0.01" className={`${inputClass} w-24`} />
        </Field>
        <Field label="Family Tax %">
          <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} type="number" step="0.01" className={`${inputClass} w-24`} />
        </Field>
        <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
          Save rates
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-sm opacity-70">Dad Match milestones</p>
        {settings.dadMatchMilestones.map((milestone) => (
          <div key={milestone.weeks} className="flex items-center justify-between text-sm">
            <span>
              {milestone.weeks} weeks → {formatCurrency(milestone.bonus)} bonus
            </span>
            <button onClick={() => handleRemoveMilestone(milestone.weeks)} className="text-xs text-red-500">
              Remove
            </button>
          </div>
        ))}
        <form onSubmit={handleAddMilestone} className="flex gap-2">
          <input
            value={milestoneWeeks}
            onChange={(e) => setMilestoneWeeks(e.target.value)}
            type="number"
            min={1}
            placeholder="Weeks"
            className={`${inputClass} w-20`}
          />
          <input
            value={milestoneBonus}
            onChange={(e) => setMilestoneBonus(e.target.value)}
            type="number"
            min={0}
            step="0.01"
            placeholder="Bonus $"
            className={`${inputClass} w-24`}
          />
          <button type="submit" className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            Add milestone
          </button>
        </form>
      </div>

      <form onSubmit={handleSetPin} className="space-y-2">
        <p className="text-sm opacity-70">Parent PIN {settings.parentPinHash ? "(set)" : "(not set)"}</p>
        <p className="text-xs opacity-60">
          Gates switching a device from Kid View back to Parent Settings. It&apos;s a speed bump for
          curious kids, not encryption — anyone with the Family Phrase already has the data.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            placeholder="New PIN"
            className={inputClass}
          />
          <button type="submit" className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            {settings.parentPinHash ? "Change PIN" : "Set PIN"}
          </button>
          {settings.parentPinHash && (
            <button
              type="button"
              onClick={handleRemovePin}
              className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
            >
              Remove PIN
            </button>
          )}
        </div>
        {pinMessage && <p className="text-xs opacity-60">{pinMessage}</p>}
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs opacity-70">
      {label}
      {children}
    </label>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function toPercent(rate: number): number {
  return Math.round(rate * 100 * 10_000) / 10_000;
}
