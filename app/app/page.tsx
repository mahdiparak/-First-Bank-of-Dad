"use client";

import { useEffect, useRef, useState } from "react";
import { AddKidForm, type AddKidFormValues } from "@/components/add-kid-form";
import { KidDashboard } from "@/components/kid-dashboard";
import { ParentSettingsPanel } from "@/components/parent-settings";
import { ParentLoginPrompt, RoleChooser } from "@/components/role-gate";
import { runScheduledEngines } from "@/lib/allowance";
import { deriveEncryptionKey, deriveRoomId } from "@/lib/crypto";
import { addKid } from "@/lib/mutations";
import { createEmptyState, type FamilyBankState } from "@/lib/schema";
import {
  exportStateToFile,
  getOrCreateDeviceId,
  importStateFromFile,
  loadCryptoKey,
  loadDeviceKidId,
  loadDeviceRole,
  loadRoomId,
  loadState,
  saveCryptoKey,
  saveDeviceKidId,
  saveDeviceRole,
  saveRoomId,
  saveState,
  type DeviceRole,
} from "@/lib/storage";
import { SyncClient, type SyncMutation, type SyncStatus } from "@/lib/sync";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "";

type Phase = "loading" | "enter-phrase" | "ready";

function primeState(loaded: FamilyBankState | null): FamilyBankState | null {
  if (!loaded) return null;
  const processed = runScheduledEngines(loaded);
  if (processed !== loaded) void saveState(processed);
  return processed;
}

/** If no Parent PIN exists yet anywhere in the family, this must be the first-ever setup device. */
async function resolveBootstrapRole(currentRole: DeviceRole | null, state: FamilyBankState): Promise<DeviceRole | null> {
  if (currentRole) return currentRole;
  if (!state.parentSettings.parentPinHash) {
    await saveDeviceRole("parent");
    return "parent";
  }
  return null;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [phraseInput, setPhraseInput] = useState("");
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [state, setState] = useState<FamilyBankState | null>(null);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null);
  const [deviceKidId, setDeviceKidId] = useState<string | null>(null);
  const [showParentLogin, setShowParentLogin] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [importError, setImportError] = useState<string | null>(null);

  const roomIdRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const deviceRoleRef = useRef<DeviceRole | null>(null);
  const syncClientRef = useRef<SyncClient | null>(null);

  useEffect(() => {
    void (async () => {
      const [key, roomId, storedState, deviceId, role, kidId] = await Promise.all([
        loadCryptoKey(),
        loadRoomId(),
        loadState(),
        getOrCreateDeviceId(),
        loadDeviceRole(),
        loadDeviceKidId(),
      ]);
      deviceIdRef.current = deviceId;
      deviceRoleRef.current = role;
      setDeviceKidId(kidId);

      if (!key || !roomId) {
        setPhase("enter-phrase");
        return;
      }

      roomIdRef.current = roomId;
      const primed = primeState(storedState);
      setState(primed);
      if (primed) {
        const resolvedRole = await resolveBootstrapRole(role, primed);
        deviceRoleRef.current = resolvedRole;
        setDeviceRole(resolvedRole);
      } else {
        setDeviceRole(role);
      }
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
    const primed = primeState(existing);
    setState(primed);
    if (primed) {
      const resolvedRole = await resolveBootstrapRole(deviceRoleRef.current, primed);
      deviceRoleRef.current = resolvedRole;
      setDeviceRole(resolvedRole);
    }
    setPhase("ready");
    startSync(key, roomId);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = await importStateFromFile(file);
      commitState(imported);
      setImportError(null);
      const resolvedRole = await resolveBootstrapRole(deviceRoleRef.current, imported);
      deviceRoleRef.current = resolvedRole;
      setDeviceRole(resolvedRole);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    }
  }

  function handleCreateFresh() {
    if (!roomIdRef.current) return;
    const fresh = createEmptyState(roomIdRef.current);
    commitState(fresh);
    // The very first device to ever create state has no PIN yet — it's the parent's.
    deviceRoleRef.current = "parent";
    setDeviceRole("parent");
    void saveDeviceRole("parent");
  }

  function commitState(newState: FamilyBankState) {
    setState(newState);
    void saveState(newState);
    void broadcastSnapshot(newState);
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

  function handleAddKid(values: AddKidFormValues) {
    if (!state) return;
    commitState(addKid(state, values));
  }

  function handleMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    if (!state) return;
    commitState(mutator(state));
  }

  function handleChooseParentRole() {
    deviceRoleRef.current = "parent";
    setDeviceRole("parent");
    void saveDeviceRole("parent");
  }

  function handleChooseKidRole(kidId: string) {
    deviceRoleRef.current = "kid";
    setDeviceRole("kid");
    setDeviceKidId(kidId);
    void saveDeviceRole("kid");
    void saveDeviceKidId(kidId);
  }

  function handleEnterKidView(kidId: string) {
    handleChooseKidRole(kidId);
  }

  function handleParentLoginSuccess() {
    setShowParentLogin(false);
    handleChooseParentRole();
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

  if (state && deviceRole === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <RoleChooser state={state} onChooseParent={handleChooseParentRole} onChooseKid={handleChooseKidRole} />
      </main>
    );
  }

  const effectiveSelectedKidId =
    state && selectedKidId && state.kids.some((kid) => kid.id === selectedKidId)
      ? selectedKidId
      : (state?.kids[0]?.id ?? null);
  const selectedKid = state?.kids.find((kid) => kid.id === effectiveSelectedKidId) ?? null;

  if (state && deviceRole === "kid") {
    const kid = state.kids.find((candidate) => candidate.id === deviceKidId);
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{kid ? `${kid.name}'s Bank` : "First Bank of Dad"}</h1>
          <SyncBadge status={syncStatus} />
        </header>

        {kid ? (
          <KidDashboard state={state} kid={kid} role="kid" onMutate={handleMutate} />
        ) : (
          <p className="text-sm opacity-70">Ask a parent to set this device up.</p>
        )}

        <div className="pt-6">
          {showParentLogin ? (
            <ParentLoginPrompt
              parentPinHash={state.parentSettings.parentPinHash}
              onSuccess={handleParentLoginSuccess}
              onCancel={() => setShowParentLogin(false)}
            />
          ) : (
            <button onClick={() => setShowParentLogin(true)} className="text-xs opacity-50 underline">
              Parent Login
            </button>
          )}
        </div>
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
          {state.kids.length > 0 && (
            <nav className="flex flex-wrap gap-2">
              {state.kids.map((kid) => (
                <button
                  key={kid.id}
                  onClick={() => setSelectedKidId(kid.id)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    kid.id === effectiveSelectedKidId
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "border border-black/20 dark:border-white/20"
                  }`}
                >
                  {kid.name}
                </button>
              ))}
            </nav>
          )}

          {selectedKid ? (
            <>
              <KidDashboard state={state} kid={selectedKid} role="parent" onMutate={handleMutate} />
              <button
                onClick={() => handleEnterKidView(selectedKid.id)}
                className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
              >
                Enter {selectedKid.name}&apos;s Kid View
              </button>
            </>
          ) : (
            <p className="text-sm opacity-70">Add a kid below to get started.</p>
          )}

          <AddKidForm onSubmit={handleAddKid} />

          <ParentSettingsPanel state={state} onMutate={handleMutate} />

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
