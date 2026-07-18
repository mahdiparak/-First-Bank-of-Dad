"use client";

import { useState } from "react";
import {
  addCashAdjustment,
  parentCashLiability,
  recordCashMovementForKid,
  removeCashAdjustment,
  setActualHysaBalance,
  virtualAppBalance,
} from "@/lib/mutations";
import type { FamilyBankState } from "@/lib/schema";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

export function ReconciliationPanel({
  state,
  onMutate,
}: {
  state: FamilyBankState;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [hysaInput, setHysaInput] = useState(String(state.reconciliation.actualHysaBalance));
  const [movementKidId, setMovementKidId] = useState(state.kids[0]?.id ?? "");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDirection, setMovementDirection] = useState<"deposit" | "withdrawal">("deposit");
  const [movementNote, setMovementNote] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");

  function tryMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    try {
      setError(null);
      onMutate(mutator);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  const virtual = virtualAppBalance(state);
  const liability = parentCashLiability(state);

  function handleSaveHysa(event: React.FormEvent) {
    event.preventDefault();
    tryMutate((s) => setActualHysaBalance(s, Number(hysaInput)));
  }

  function handleRecordMovement(event: React.FormEvent) {
    event.preventDefault();
    const kidId = movementKidId || state.kids[0]?.id;
    if (!kidId || !movementAmount) return;
    const signedAmount = movementDirection === "deposit" ? Number(movementAmount) : -Number(movementAmount);
    tryMutate((s) => recordCashMovementForKid(s, kidId, signedAmount, movementNote.trim() || undefined));
    setMovementAmount("");
    setMovementNote("");
  }

  function handleAddAdjustment(event: React.FormEvent) {
    event.preventDefault();
    if (!adjustmentAmount) return;
    tryMutate((s) => addCashAdjustment(s, Number(adjustmentAmount), adjustmentNote.trim() || undefined));
    setAdjustmentAmount("");
    setAdjustmentNote("");
  }

  return (
    <section className="space-y-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Reconciliation Engine</h2>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs opacity-70">Virtual balance (all kids)</p>
          <p className="text-xl font-semibold">{formatCurrency(virtual)}</p>
        </div>
        <div>
          <p className="text-xs opacity-70">Actual HYSA balance</p>
          <p className="text-xl font-semibold">{formatCurrency(state.reconciliation.actualHysaBalance)}</p>
        </div>
        <div>
          <p className="text-xs opacity-70">{liability >= 0 ? "You still owe" : "Surplus in the HYSA"}</p>
          <p className={`text-xl font-semibold ${liability > 0 ? "text-red-500" : "text-green-600"}`}>
            {formatCurrency(Math.abs(liability))}
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveHysa} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs opacity-70">
          Update actual HYSA balance
          <input
            value={hysaInput}
            onChange={(event) => setHysaInput(event.target.value)}
            type="number"
            step="0.01"
            className={`${inputClass} w-32`}
          />
        </label>
        <button type="submit" className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
          Save
        </button>
      </form>

      {state.kids.length > 0 && (
      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="text-sm opacity-70">Record a physical cash movement</p>
        <form onSubmit={handleRecordMovement} className="flex flex-wrap items-end gap-2">
          <select
            value={movementKidId || state.kids[0]?.id || ""}
            onChange={(event) => setMovementKidId(event.target.value)}
            className={inputClass}
          >
            {state.kids.map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.name}
              </option>
            ))}
          </select>
          <select
            value={movementDirection}
            onChange={(event) => setMovementDirection(event.target.value as "deposit" | "withdrawal")}
            className={inputClass}
          >
            <option value="deposit">Kid gave cash (deposit)</option>
            <option value="withdrawal">Paid out with cash (withdrawal)</option>
          </select>
          <input
            value={movementAmount}
            onChange={(event) => setMovementAmount(event.target.value)}
            type="number"
            min={0.01}
            step="0.01"
            placeholder="Amount ($)"
            className={`${inputClass} w-28`}
          />
          <input
            value={movementNote}
            onChange={(event) => setMovementNote(event.target.value)}
            placeholder="Note (optional)"
            className={`${inputClass} flex-1`}
          />
          <button type="submit" className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            Record
          </button>
        </form>
      </div>
      )}

      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="text-sm opacity-70">General adjustments (not tied to a kid, e.g. bank-paid interest)</p>
        {state.reconciliation.cashAdjustments.map((adjustment) => (
          <div key={adjustment.id} className="flex items-center justify-between text-sm">
            <span>
              {formatCurrency(adjustment.amount)} {adjustment.note && `— ${adjustment.note}`}
            </span>
            <button
              onClick={() => tryMutate((s) => removeCashAdjustment(s, adjustment.id))}
              className="text-xs text-red-500"
            >
              Remove
            </button>
          </div>
        ))}
        <form onSubmit={handleAddAdjustment} className="flex flex-wrap gap-2">
          <input
            value={adjustmentAmount}
            onChange={(event) => setAdjustmentAmount(event.target.value)}
            type="number"
            step="0.01"
            placeholder="Amount ($, +/-)"
            className={`${inputClass} w-32`}
          />
          <input
            value={adjustmentNote}
            onChange={(event) => setAdjustmentNote(event.target.value)}
            placeholder="Note"
            className={`${inputClass} flex-1`}
          />
          <button type="submit" className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            Add
          </button>
        </form>
      </div>
    </section>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
