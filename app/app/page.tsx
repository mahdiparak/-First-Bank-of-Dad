"use client";

import { useEffect, useRef, useState } from "react";
import { deriveEncryptionKey, deriveRoomId } from "@/lib/crypto";
import { createEmptyState, type FamilyBankState } from "@/lib/schema";
import {
  exportStateToFile,
  getOrCreateDeviceId,
  importStateFromFile,
  loadCryptoKey,
  loadRoomId,
  loadState,
  saveCryptoKey,
  saveRoomId,
  saveState,
} from "@/lib/storage";
import { SyncClient, type SyncMutation, type SyncStatus } from "@/lib/sync";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "";

type Phase = "loading" | "enter-phrase" | "ready";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [phraseInput, setPhraseInput] = useState("");
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [state, setState] = useState<FamilyBankState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [importError, setImportError] = useState<string | null>(null);

  const roomIdRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const syncClientRef = useRef<SyncClient | null>(null);

  useEffect(() => {
    void (async () => {
      const [key, roomId, storedState, deviceId] = await Promise.all([
        loadCryptoKey(),
        loadRoomId(),
        loadState(),
        getOrCreateDeviceId(),
      ]);
      deviceIdRef.current = deviceId;

      if (!key || !roomId) {
        setPhase("enter-phrase");
        return;
      }

      roomIdRef.current = roomId;
      setState(storedState);
      setPhase("ready");
      startSync(key, roomId);
    })();

    return () => syncClientRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startSync(key: CryptoKey, roomId: string) {
    if (!RELAY_URL) {
      setSyncStatus("error");
      return;
    }
    const client = new SyncClient({
      relayUrl: RELAY_URL,
      key,
      roomId,
      onStatusChange: setSyncStatus,
      onMutation: (mutation) => void applyMutation(mutation),
    });
    syncClientRef.current = client;
    client.connect();
  }

  async function applyMutation(mutation: SyncMutation) {
    if (mutation.type === "snapshot") {
      // Last-write-wins by timestamp — fine for a handful of family
      // devices, not a general CRDT merge.
      setState((current) => {
        if (current && current.updatedAt >= mutation.state.updatedAt) return current;
        void saveState(mutation.state);
        return mutation.state;
      });
    } else {
      setState((current) => {
        if (!current) return current;
        const merged = { ...current, ...mutation.patch, updatedAt: mutation.sentAt };
        void saveState(merged);
        return merged;
      });
    }
  }

  async function handlePhraseSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPhraseError(null);
    const phrase = phraseInput.trim();
    if (phrase.length < 8) {
      setPhraseError("Use a longer Family Phrase (8+ characters) — it's your only encryption key.");
      return;
    }

    const [key, roomId] = await Promise.all([deriveEncryptionKey(phrase), deriveRoomId(phrase)]);
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId)]);
    roomIdRef.current = roomId;
    setPhraseInput("");

    const existing = await loadState();
    setState(existing);
    setPhase("ready");
    startSync(key, roomId);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = await importStateFromFile(file);
      setState(imported);
      setImportError(null);
      await broadcastSnapshot(imported);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    }
  }

  async function handleCreateFresh() {
    if (!roomIdRef.current) return;
    const fresh = createEmptyState(roomIdRef.current);
    await saveState(fresh);
    setState(fresh);
    await broadcastSnapshot(fresh);
  }

  async function broadcastSnapshot(snapshot: FamilyBankState) {
    if (!syncClientRef.current || !deviceIdRef.current) return;
    await syncClientRef.current.send({
      type: "snapshot",
      state: snapshot,
      deviceId: deviceIdRef.current,
      sentAt: new Date().toISOString(),
    });
  }

  if (phase === "loading") {
    return <CenteredMessage text="Loading…" />;
  }

  if (phase === "enter-phrase") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={handlePhraseSubmit}
          className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 dark:border-white/10"
        >
          <h1 className="text-lg font-semibold">Enter your Family Phrase</h1>
          <p className="text-sm opacity-70">
            This unlocks this device and is never sent anywhere. If this is a new device, it&apos;ll
            wait for the first sync — or you can import a backup JSON file after continuing.
          </p>
          <input
            type="password"
            value={phraseInput}
            onChange={(event) => setPhraseInput(event.target.value)}
            placeholder="Family Phrase"
            className="w-full rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            autoFocus
          />
          {phraseError && <p className="text-sm text-red-500">{phraseError}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-black px-3 py-2 text-white dark:bg-white dark:text-black"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">First Bank of Dad</h1>
        <SyncBadge status={syncStatus} />
      </header>

      {!state ? (
        <section className="space-y-4 rounded-xl border border-black/10 p-6 dark:border-white/10">
          <p>No local data yet on this device.</p>
          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
              Import backup JSON
              <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
            </label>
            <button
              onClick={handleCreateFresh}
              className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
            >
              Start fresh (first device)
            </button>
          </div>
          {importError && <p className="text-sm text-red-500">{importError}</p>}
          <p className="text-sm opacity-70">
            Or leave this open — if another device on the same Family Phrase hits &quot;Sync
            now&quot;, this device will receive it automatically.
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {state.kids.length === 0 && <p className="text-sm opacity-70">No kids set up yet.</p>}
            {state.kids.map((kid) => (
              <div key={kid.id} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                <p className="text-sm opacity-70">{kid.name}</p>
                <p className="text-2xl font-semibold">{formatCurrency(balanceForKid(state, kid.id))}</p>
              </div>
            ))}
          </section>

          <section className="flex flex-wrap gap-3">
            <button
              onClick={() => exportStateToFile(state)}
              className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
            >
              Export backup JSON
            </button>
            <label className="cursor-pointer rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20">
              Import backup JSON
              <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
            </label>
            <button
              onClick={() => void broadcastSnapshot(state)}
              className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
            >
              Sync now
            </button>
          </section>
          {importError && <p className="text-sm text-red-500">{importError}</p>}
        </>
      )}
    </main>
  );
}

function balanceForKid(state: FamilyBankState, kidId: string): number {
  return state.transactions
    .filter((transaction) => transaction.kidId === kidId)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus, string> = {
    connecting: "Connecting…",
    open: "Synced",
    closed: "Offline",
    error: "Sync error",
  };
  const colors: Record<SyncStatus, string> = {
    connecting: "bg-yellow-500",
    open: "bg-green-500",
    closed: "bg-gray-400",
    error: "bg-red-500",
  };
  return (
    <span className="flex items-center gap-2 text-sm opacity-70">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <main className="flex flex-1 items-center justify-center">
      <p className="text-sm opacity-70">{text}</p>
    </main>
  );
}
