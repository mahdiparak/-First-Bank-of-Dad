"use client";

import { useState } from "react";
import {
  actualHysaBalanceForKid,
  addCashAdjustment,
  kidCashLiability,
  parentCashLiability,
  recordCashMovementForKid,
  removeCashAdjustment,
  setActualHysaBalanceForKid,
  virtualAppBalance,
  virtualBalanceForKid,
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
          <p className="text-xs opacity-70">Actual HYSA balance (all kids)</p>
          <p className="text-xl font-semibold">
            {formatCurrency(state.reconciliation.actualHysaBalances.reduce((sum, entry) => sum + entry.balance, 0))}
          </p>
        </div>
        <div>
          <p className="text-xs opacity-70">{liability >= 0 ? "You still owe" : "Surplus in the HYSA"}</p>
          <p className={`text-xl font-semibold ${liability > 0 ? "text-red-500" : "text-green-600"}`}>
            {formatCurrency(Math.abs(liability))}
          </p>
        </div>
      </div>

      {state.kids.length === 0 ? (
        <p className="text-sm opacity-70">Add a kid to start reconciling their real account.</p>
      ) : (
        <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
          <p className="text-sm opacity-70">Each kid&apos;s own real HYSA account</p>
          {state.kids.map((kid) => (
            <KidHysaRow key={kid.id} state={state} kidId={kid.id} kidName={kid.name} onMutate={tryMutate} />
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
        <p className="text-sm opacity-70">Record a physical cash movement</p>
        <form onSubmit={handleRecordMovement} className="flex flex-wrap items-end gap-2">
          <select
            value={movementKidId || state.kids[0]?.id || ""}
            onChange={(event) => setMovementKidId(event.target.value)}
            className={inputClass}
            disabled={state.kids.length === 0}
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
          <button
            type="submit"
            disabled={state.kids.length === 0}
            className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
          >
            Record
          </button>
        </form>
      </div>

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

function KidHysaRow({
  state,
  kidId,
  kidName,
  onMutate,
}: {
  state: FamilyBankState;
  kidId: string;
  kidName: string;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const actual = actualHysaBalanceForKid(state, kidId);
  const [hysaInput, setHysaInput] = useState(String(actual));
  const virtual = virtualBalanceForKid(state, kidId);
  const liability = kidCashLiability(state, kidId);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    onMutate((s) => setActualHysaBalanceForKid(s, kidId, Number(hysaInput)));
  }

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{kidName}</p>
        <p className={`text-xs ${liability > 0 ? "text-red-500" : liability < 0 ? "text-green-600" : "opacity-60"}`}>
          {liability === 0
            ? "Reconciled"
            : liability > 0
              ? `You owe ${formatCurrency(liability)}`
              : `Surplus ${formatCurrency(-liability)}`}
        </p>
      </div>
      <p className="text-xs opacity-60">Virtual: {formatCurrency(virtual)}</p>
      <form onSubmit={handleSave} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs opacity-70">
          Real HYSA balance
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
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
