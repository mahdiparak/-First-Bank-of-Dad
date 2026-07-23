"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type AddKidFormValues } from "@/components/add-kid-form";
import { ApprovalQueue } from "@/components/approval-queue";
import { AuditTrailPanel } from "@/components/audit-trail";
import { BountyManager } from "@/components/bounty-manager";
import { CelebrationOverlay } from "@/components/celebration-overlay";
import { InstallBanner } from "@/components/install-banner";
import { KidDashboard } from "@/components/kid-dashboard";
import { MarketDataSettings } from "@/components/market-data-settings";
import { MoneyTalk } from "@/components/money-talk";
import { ParentSettingsPanel } from "@/components/parent-settings";
import { ProfilePanel } from "@/components/profile-panel";
import { ProfileSettingsPanel } from "@/components/profile-settings";
import { ReconciliationPanel } from "@/components/reconciliation-panel";
import { RevealInput } from "@/components/reveal-input";
import { KidPinPrompt, RoleChooser } from "@/components/role-gate";
import { FamilyPhraseSettings } from "@/components/family-phrase-settings";
import { SyncSettings } from "@/components/sync-settings";
import { TaxPots } from "@/components/tax-pots";
import { runScheduledEngines } from "@/lib/allowance";
import { resolveRoleFromAccessIdentity } from "@/lib/access-identity";
import { diffCelebrations, type CelebrationEvent } from "@/lib/celebrations";
import { notifyNewQuests } from "@/lib/push-notifications";
import { deriveEncryptionKey, deriveRoomId } from "@/lib/crypto";
import { runInvestmentEngine } from "@/lib/investment-engine";
import { loadMarketData, type MarketDataResponse } from "@/lib/market-data";
import { addKid } from "@/lib/mutations";
import { createEmptyState, kidAvatar, kidColor, normalizeState, type AuditActor, type FamilyBankState } from "@/lib/schema";
import {
  exportStateToFile,
  getOrCreateDeviceId,
  importStateFromFile,
  loadCryptoKey,
  loadDeviceKidId,
  loadDeviceParentId,
  loadDeviceRole,
  loadRoomId,
  loadState,
  saveCryptoKey,
  saveDefaultRoomId,
  saveDeviceKidId,
  saveDeviceParentId,
  saveDeviceRole,
  saveRoomId,
  saveState,
  type DeviceRole,
} from "@/lib/storage";
import { SyncClient, type SyncMutation, type SyncStatus } from "@/lib/sync";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "";

type Phase = "loading" | "enter-phrase" | "ready";
type ParentTab = "kids" | "approvals" | "money" | "talk" | "audit" | "settings";
type SettingsSection = "profile" | "family" | "app";

function primeState(loaded: FamilyBankState | null): FamilyBankState | null {
  if (!loaded) return null;
  const processed = runScheduledEngines(loaded);
  if (processed !== loaded) void saveState(processed);
  return processed;
}

/** True for a state that's never held real data — e.g. a device where "Start fresh" was clicked
 *  instead of waiting for the first sync. Used so an empty device never blocks or gets mistaken
 *  for having anything worth sending. */
function isEmptyState(candidate: FamilyBankState): boolean {
  return candidate.kids.length === 0 && candidate.transactions.length === 0;
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

interface InitialRole {
  role: DeviceRole | null;
  parentId?: string;
  kidId?: string;
  /** Set instead of resolving the role when the matched kid has a PIN — the caller must show KidPinPrompt first. */
  pendingKidId?: string;
}

/**
 * Only runs when this device has never chosen a role. First tries the family-PIN-less
 * bootstrap case, then — for a device signed into Cloudflare Access as a named parent or
 * kid — matches that email against parentProfiles/kids so the right dashboard just opens,
 * no RoleChooser needed. If the matched kid has their own PIN set, the role isn't saved yet;
 * the caller shows KidPinPrompt and only commits the role once it's entered correctly. A
 * device that already picked a role keeps it on every later load.
 */
async function resolveInitialRole(currentRole: DeviceRole | null, state: FamilyBankState): Promise<InitialRole> {
  const bootstrapped = await resolveBootstrapRole(currentRole, state);
  if (bootstrapped) return { role: bootstrapped };

  const match = await resolveRoleFromAccessIdentity(state);
  if (!match) return { role: null };

  if (match.role === "kid" && match.kidId) {
    const kid = state.kids.find((candidate) => candidate.id === match.kidId);
    if (kid?.pinHash) return { role: null, pendingKidId: kid.id };
  }

  await saveDeviceRole(match.role);
  if (match.role === "parent" && match.parentId) await saveDeviceParentId(match.parentId);
  if (match.role === "kid" && match.kidId) await saveDeviceKidId(match.kidId);
  return { role: match.role, parentId: match.parentId, kidId: match.kidId };
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [phraseInput, setPhraseInput] = useState("");
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [state, setState] = useState<FamilyBankState | null>(null);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  const [parentTab, setParentTab] = useState<ParentTab>("kids");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null);
  const [deviceKidId, setDeviceKidId] = useState<string | null>(null);
  const [pendingKidId, setPendingKidId] = useState<string | null>(null);
  const [deviceParentId, setDeviceParentId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  // Bumped whenever the Family Phrase changes, so SyncSettings (which loads the Room ID from
  // storage once on mount) remounts and picks up the newly-derived value instead of showing
  // what's now a stale room id from before the change.
  const [roomIdVersion, setRoomIdVersion] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [syncNowBusy, setSyncNowBusy] = useState(false);
  const [syncNowMessage, setSyncNowMessage] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [marketDataLoaded, setMarketDataLoaded] = useState(false);
  const [celebrations, setCelebrations] = useState<CelebrationEvent[]>([]);

  const roomIdRef = useRef<string | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const deviceRoleRef = useRef<DeviceRole | null>(null);
  const syncClientRef = useRef<SyncClient | null>(null);
  const prevStateRef = useRef<FamilyBankState | null>(null);
  // Mirrors `state` for use inside the sync callbacks below, which are handed to SyncClient once
  // at connect time and would otherwise close over a stale value from that moment.
  const stateRef = useRef<FamilyBankState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    void (async () => {
      const [key, roomId, storedState, deviceId, role, kidId, parentId] = await Promise.all([
        loadCryptoKey(),
        loadRoomId(),
        loadState(),
        getOrCreateDeviceId(),
        loadDeviceRole(),
        loadDeviceKidId(),
        loadDeviceParentId(),
      ]);
      deviceIdRef.current = deviceId;
      deviceRoleRef.current = role;
      setDeviceKidId(kidId);
      setDeviceParentId(parentId);

      if (!key || !roomId) {
        setPhase("enter-phrase");
        return;
      }

      roomIdRef.current = roomId;
      cryptoKeyRef.current = key;
      // Seed the celebration diff with the raw stored state, so anything the
      // engines pay out on this load (payday, interest, Dad Match) celebrates.
      prevStateRef.current = storedState;
      const primed = primeState(storedState);
      setState(primed);
      if (primed) {
        const resolved = await resolveInitialRole(role, primed);
        deviceRoleRef.current = resolved.role;
        setDeviceRole(resolved.role);
        if (resolved.parentId) setDeviceParentId(resolved.parentId);
        if (resolved.kidId) setDeviceKidId(resolved.kidId);
        if (resolved.pendingKidId) setPendingKidId(resolved.pendingKidId);
      } else {
        setDeviceRole(role);
      }
      setPhase("ready");
      startSync(key, roomId);
    })();

    return () => syncClientRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadMarketData().then((data) => {
      setMarketData(data);
      setMarketDataLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!state || !marketDataLoaded) return;
    const updated = runInvestmentEngine(state, marketData);
    if (updated !== state) commitState(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, marketDataLoaded, marketData]);

  // Every state transition (local mutation, engine catch-up, incoming sync) flows
  // through here once, so celebrations fire no matter where the change came from.
  useEffect(() => {
    if (state) {
      const events = diffCelebrations(prevStateRef.current, state);
      if (events.length > 0) setCelebrations((queue) => [...queue, ...events].slice(-20));
      // A parent posting a quest on their own device reaches a kid's device as an incoming sync
      // update, which lands right here too — this is what actually nudges their phone.
      if (deviceRole === "kid") notifyNewQuests(prevStateRef.current, state);
    }
    prevStateRef.current = state;
  }, [state, deviceRole]);

  function startSync(key: CryptoKey, roomId: string) {
    if (!RELAY_URL) {
      setSyncStatus("error");
      return;
    }
    const client = new SyncClient({
      relayUrl: RELAY_URL,
      key,
      roomId,
      onStatusChange: (status) => {
        setSyncStatus(status);
        // The relay never replays history, so joining a room tells you nothing about whether
        // anyone else is already there with real data — and this device may itself have missed
        // broadcasts while it was disconnected (e.g. backgrounded). On every fresh connection,
        // hand over what we have (so a peer that's been waiting gets it immediately) AND ask for
        // theirs (so this device catches up too, whether it started empty or just went stale).
        if (status === "open") {
          const mine = stateRef.current;
          if (mine && !isEmptyState(mine)) void broadcastSnapshot(mine);
          if (deviceIdRef.current) {
            void syncClientRef.current?.send({
              type: "request-snapshot",
              deviceId: deviceIdRef.current,
              sentAt: new Date().toISOString(),
            });
          }
        }
      },
      onMutation: (mutation) => void applyMutation(mutation),
    });
    syncClientRef.current = client;
    client.connect();
  }

  async function applyMutation(mutation: SyncMutation) {
    if (mutation.type === "snapshot") {
      // Last-write-wins by timestamp — fine for a handful of family devices, not a general CRDT
      // merge. But a device that has never held real data yet (e.g. a kid's phone where "Start
      // fresh" was clicked instead of waiting for the first sync) always has the newest possible
      // clock stamp — it would otherwise permanently outrank every real snapshot arriving after
      // it and "Sync now" would look like it does nothing. An empty local state never wins.
      const incoming = normalizeState(mutation.state);
      setState((current) => {
        if (current && !isEmptyState(current) && current.updatedAt >= incoming.updatedAt) return current;
        void saveState(incoming);
        return incoming;
      });
    } else if (mutation.type === "request-snapshot") {
      const mine = stateRef.current;
      if (mine && !isEmptyState(mine)) void broadcastSnapshot(mine);
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
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;
    setPhraseInput("");

    const existing = await loadState();
    prevStateRef.current = existing;
    const primed = primeState(existing);
    setState(primed);
    if (primed) {
      const resolved = await resolveInitialRole(deviceRoleRef.current, primed);
      deviceRoleRef.current = resolved.role;
      setDeviceRole(resolved.role);
      if (resolved.parentId) setDeviceParentId(resolved.parentId);
      if (resolved.kidId) setDeviceKidId(resolved.kidId);
      if (resolved.pendingKidId) setPendingKidId(resolved.pendingKidId);
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
      const resolved = await resolveInitialRole(deviceRoleRef.current, imported);
      deviceRoleRef.current = resolved.role;
      setDeviceRole(resolved.role);
      if (resolved.parentId) setDeviceParentId(resolved.parentId);
      if (resolved.kidId) setDeviceKidId(resolved.kidId);
      if (resolved.pendingKidId) setPendingKidId(resolved.pendingKidId);
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

  /** The "Sync now" button gives no feedback on its own — SyncClient.send() silently no-ops if
   *  the socket isn't open, and there's no ack from the blind relay either way. This makes both
   *  outcomes visible: an honest "not connected" when there's nowhere to send it, and a "sent"
   *  confirmation (not a delivery guarantee — the relay never acks) otherwise. */
  async function handleSyncNow() {
    setSyncNowMessage(null);
    if (!state) return;
    if (syncStatus !== "open") {
      setSyncNowMessage("Not connected right now — check your internet connection and try again.");
      return;
    }
    setSyncNowBusy(true);
    try {
      await broadcastSnapshot(state);
      setSyncNowMessage(`Sent at ${new Date().toLocaleTimeString()} — any other device on the same Family Phrase that's online now will pick it up within seconds.`);
    } catch (error) {
      setSyncNowMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSyncNowBusy(false);
    }
  }

  function handleAddKid(values: AddKidFormValues) {
    if (!state) return;
    commitState(addKid(state, values));
  }

  function handleMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    if (!state) return;
    commitState(mutator(state));
  }

  function handleChooseParentRole(parentId?: string) {
    deviceRoleRef.current = "parent";
    setDeviceRole("parent");
    void saveDeviceRole("parent");
    if (parentId) {
      setDeviceParentId(parentId);
      void saveDeviceParentId(parentId);
    }
  }

  function handleSetDeviceParentId(parentId: string) {
    setDeviceParentId(parentId || null);
    void saveDeviceParentId(parentId || null);
  }

  function handleChooseKidRole(kidId: string) {
    deviceRoleRef.current = "kid";
    setDeviceRole("kid");
    setDeviceKidId(kidId);
    setPendingKidId(null);
    void saveDeviceRole("kid");
    void saveDeviceKidId(kidId);
  }

  function handleChangeRoomId(newRoomId: string) {
    if (newRoomId === roomIdRef.current) return;
    syncClientRef.current?.disconnect();
    roomIdRef.current = newRoomId;
    void saveRoomId(newRoomId);
    if (cryptoKeyRef.current) startSync(cryptoKeyRef.current, newRoomId);
  }

  /** Parent-only: switches this whole family to a new Family Phrase, re-deriving both the
   *  encryption key and the room it syncs through, then re-broadcasting this device's current
   *  data so it becomes the seed for whichever other devices are given the new phrase next. */
  async function handleChangeFamilyPhrase(newPhrase: string) {
    const phrase = newPhrase.trim();
    if (phrase.length < 8) throw new Error("Use a longer Family Phrase (8+ characters) — it's your only encryption key.");
    const [key, roomId] = await Promise.all([deriveEncryptionKey(phrase), deriveRoomId(phrase)]);
    syncClientRef.current?.disconnect();
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;
    startSync(key, roomId);
    setRoomIdVersion((version) => version + 1);
    if (state) await broadcastSnapshot(state);
  }

  const activeCelebration =
    deviceRole === "kid" && deviceKidId
      ? (celebrations.find((event) => event.kidId === deviceKidId) ?? null)
      : null;

  const dismissCelebration = useCallback(() => {
    setCelebrations((queue) => (activeCelebration ? queue.filter((event) => event.id !== activeCelebration.id) : queue));
  }, [activeCelebration]);

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
          <RevealInput
            value={phraseInput}
            onChange={setPhraseInput}
            placeholder="Family Phrase"
            className="rounded-md border border-black/20 py-2 pl-3 dark:border-white/20 dark:bg-transparent"
            autoFocus
          />
          <p className="text-xs opacity-60">
            A typo here lands silently on a different, empty family instead of an error — tap 👁️
            to double-check what you typed before continuing.
          </p>
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
    const pendingKid = pendingKidId ? (state.kids.find((kid) => kid.id === pendingKidId) ?? null) : null;
    return (
      <>
        <InstallBanner />
        <main className="flex flex-1 items-center justify-center p-6">
          {pendingKid ? (
            <KidPinPrompt
              kid={pendingKid}
              onSuccess={() => handleChooseKidRole(pendingKid.id)}
              onCancel={() => setPendingKidId(null)}
            />
          ) : (
            <RoleChooser state={state} onChooseParent={handleChooseParentRole} onChooseKid={handleChooseKidRole} />
          )}
        </main>
      </>
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
      <>
        <InstallBanner />
        <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
          {activeCelebration && <CelebrationOverlay event={activeCelebration} onDismiss={dismissCelebration} />}
          <header className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">
              {kid ? `${kidAvatar(kid)} ${kid.name}'s Bank` : "First Bank of Dad"}
            </h1>
            <div className="flex items-center gap-3">
              <SyncBadge status={syncStatus} />
              <ProfilePanel
                state={state}
                role="kid"
                deviceParentId={deviceParentId}
                deviceKidId={deviceKidId}
                onSetDeviceParentId={handleSetDeviceParentId}
                onSwitchToParent={handleChooseParentRole}
              />
            </div>
          </header>

          {kid ? (
            <KidDashboard
              state={state}
              kid={kid}
              role="kid"
              marketData={marketData}
              actor={{ role: "kid", name: kid.name }}
              onMutate={handleMutate}
            />
          ) : (
            <p className="text-sm opacity-70">Ask a parent to set this device up.</p>
          )}
        </main>
      </>
    );
  }

  const parentTabs: { id: ParentTab; label: string }[] = [
    { id: "kids", label: "👨‍👧‍👦 Kids" },
    { id: "approvals", label: "✅ Approvals" },
    { id: "money", label: "🏦 Money" },
    { id: "talk", label: "💬 Money Talk" },
    { id: "audit", label: "🧾 Activity" },
    { id: "settings", label: "⚙️ Settings" },
  ];

  const settingsSections: { id: SettingsSection; label: string }[] = [
    { id: "profile", label: "👤 Profile" },
    { id: "family", label: "📈 Family" },
    { id: "app", label: "🛠️ App" },
  ];

  const pendingCount = state
    ? state.withdrawalRequests.filter((request) => request.status === "pending").length +
      state.bounties.filter((bounty) => bounty.status === "pending-approval").length
    : 0;

  const currentParentName = state
    ? (state.parentProfiles.find((parent) => parent.id === deviceParentId)?.name ?? "Dad")
    : "Dad";
  const parentActor: AuditActor = { role: "parent", name: currentParentName };

  return (
    <>
      <InstallBanner />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">First Bank of Dad</h1>
          <div className="flex items-center gap-3">
            <SyncBadge status={syncStatus} />
            {state && (
              <ProfilePanel
                state={state}
                role="parent"
                deviceParentId={deviceParentId}
                deviceKidId={deviceKidId}
                onSetDeviceParentId={handleSetDeviceParentId}
                onSwitchToParent={handleChooseParentRole}
              />
            )}
          </div>
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
          <nav className="flex flex-wrap gap-2">
            {parentTabs.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setParentTab(entry.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  parentTab === entry.id
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "border border-black/20 dark:border-white/20"
                }`}
              >
                {entry.label}
                {entry.id === "approvals" && pendingCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{pendingCount}</span>
                )}
              </button>
            ))}
          </nav>

          {parentTab === "kids" && (
            <>
              {state.kids.length > 0 && (
                <nav className="flex flex-wrap gap-2">
                  {state.kids.map((kid) => (
                    <button
                      key={kid.id}
                      onClick={() => setSelectedKidId(kid.id)}
                      className="rounded-full border-2 px-3 py-1.5 text-sm"
                      style={
                        kid.id === effectiveSelectedKidId
                          ? { borderColor: kidColor(kid), backgroundColor: `${kidColor(kid)}22` }
                          : { borderColor: "transparent", backgroundColor: "rgba(127,127,127,0.1)" }
                      }
                    >
                      {kidAvatar(kid)} {kid.name}
                    </button>
                  ))}
                </nav>
              )}

              {selectedKid ? (
                <>
                  <KidDashboard
                    state={state}
                    kid={selectedKid}
                    role="parent"
                    marketData={marketData}
                    actor={parentActor}
                    onMutate={handleMutate}
                  />
                  <button
                    onClick={() => handleChooseKidRole(selectedKid.id)}
                    className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
                  >
                    Enter {selectedKid.name}&apos;s Kid View
                  </button>
                </>
              ) : (
                <p className="text-sm opacity-70">No kids yet — add one under ⚙️ Settings → 👤 Profile.</p>
              )}
            </>
          )}

          {parentTab === "approvals" && <ApprovalQueue state={state} actor={parentActor} onMutate={handleMutate} />}

          {parentTab === "money" && (
            <>
              <ReconciliationPanel state={state} actor={parentActor} onMutate={handleMutate} />
              <TaxPots state={state} actor={parentActor} onMutate={handleMutate} />
              <BountyManager state={state} onMutate={handleMutate} />
            </>
          )}

          {parentTab === "talk" && <MoneyTalk state={state} />}

          {parentTab === "audit" && <AuditTrailPanel state={state} onMutate={handleMutate} />}

          {parentTab === "settings" && (
            <>
              <nav className="flex flex-wrap gap-2">
                {settingsSections.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSettingsSection(entry.id)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      settingsSection === entry.id
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "border border-black/20 dark:border-white/20"
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </nav>

              {settingsSection === "profile" && (
                <ProfileSettingsPanel state={state} onMutate={handleMutate} onAddKid={handleAddKid} />
              )}

              {settingsSection === "family" && <ParentSettingsPanel state={state} onMutate={handleMutate} />}

              {settingsSection === "app" && (
                <>
                  <FamilyPhraseSettings state={state} onChangePhrase={handleChangeFamilyPhrase} />
                  <SyncSettings key={roomIdVersion} onSave={handleChangeRoomId} />
                  <MarketDataSettings marketData={marketData} onMarketDataRefreshed={setMarketData} />
                  <section className="flex flex-wrap items-center gap-3">
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
                      onClick={() => void handleSyncNow()}
                      disabled={syncNowBusy}
                      className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      {syncNowBusy ? "Syncing…" : "Sync now"}
                    </button>
                  </section>
                  {syncNowMessage && <p className="text-xs opacity-70">{syncNowMessage}</p>}
                  {importError && <p className="text-sm text-red-500">{importError}</p>}
                </>
              )}
            </>
          )}
        </>
      )}
      </main>
    </>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus, string> = {
    connecting: "Connecting…",
    open: "Synced",
    closed: "Offline — saved on this device",
    error: "Offline — saved on this device",
  };
  const colors: Record<SyncStatus, string> = {
    connecting: "bg-yellow-500",
    open: "bg-green-500",
    closed: "bg-gray-400",
    error: "bg-gray-400",
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
