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
import { AppLock, needsAppLock } from "@/components/app-lock";
import { JoinApprovalBanner } from "@/components/join-approval";
import { OnboardingWizard, type CreateFamilyResult, type JoinResult } from "@/components/onboarding-wizard";
import { KidPinPrompt, RoleChooser } from "@/components/role-gate";
import { FamilyPhraseSettings } from "@/components/family-phrase-settings";
import { SyncSettings } from "@/components/sync-settings";
import { TaxPots } from "@/components/tax-pots";
import { runScheduledEngines } from "@/lib/allowance";
import { resolveRoleFromAccessIdentity } from "@/lib/access-identity";
import { diffCelebrations, type CelebrationEvent } from "@/lib/celebrations";
import { notifyClaimedBounties, notifyNewQuests } from "@/lib/push-notifications";
import { deriveEncryptionKey, deriveRoomIdFromPhraseAndName } from "@/lib/crypto";
import { runInvestmentEngine } from "@/lib/investment-engine";
import { loadMarketData, type MarketDataResponse } from "@/lib/market-data";
import { addKid } from "@/lib/mutations";
import { findKidByName, mergeJoinedKid, mergeJoinedParent } from "@/lib/onboarding";
import { isSessionUnlocked, markSessionUnlocked } from "@/lib/session-unlock";
import { createEmptyState, kidAvatar, kidColor, normalizeState, type AuditActor, type FamilyBankState } from "@/lib/schema";
import {
  exportStateToFile,
  getOrCreateDeviceId,
  importStateFromFile,
  loadCryptoKey,
  loadDeviceKidId,
  loadDeviceParentId,
  loadDeviceRole,
  loadOnboardingComplete,
  loadPendingJoin,
  loadRoomId,
  loadState,
  clearFamilyKeyMaterial,
  saveCryptoKey,
  saveDefaultRoomId,
  saveDeviceKidId,
  saveDeviceParentId,
  saveDeviceRole,
  saveOnboardingComplete,
  savePendingJoin,
  saveRoomId,
  saveRoomName,
  saveState,
  type DeviceRole,
  type PendingJoin,
} from "@/lib/storage";
import { SyncClient, type JoinRequest, type SyncMutation, type SyncStatus } from "@/lib/sync";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "";

type Phase = "loading" | "onboarding" | "waiting-approval" | "ready";
type ParentTab = "kids" | "approvals" | "money" | "talk" | "audit" | "settings";
type SettingsSection = "profile" | "family" | "app";

function primeState(loaded: FamilyBankState | null, key: CryptoKey): FamilyBankState | null {
  if (!loaded) return null;
  const processed = runScheduledEngines(loaded);
  if (processed !== loaded) void saveState(key, processed);
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
  // Cold-open PIN lock: starts locked whenever the active identity has a PIN (see needsAppLock).
  const [unlocked, setUnlocked] = useState(true);
  // Parent side: devices asking to join, awaiting this parent's approve/decline.
  const [pendingJoinRequests, setPendingJoinRequests] = useState<JoinRequest[]>([]);
  // Parent side: names that entered the right phrase/room but aren't on the kids list — surfaced so
  // the parent knows to add them (the joiner themselves was already told they weren't found).
  const [unknownJoinNames, setUnknownJoinNames] = useState<string[]>([]);
  // Joining side: shown on the "waiting for a parent to approve" screen if a parent rejects.
  const [joinError, setJoinError] = useState<string | null>(null);
  const [state, setState] = useState<FamilyBankState | null>(null);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  const [parentTab, setParentTab] = useState<ParentTab>("kids");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null);
  const [deviceKidId, setDeviceKidId] = useState<string | null>(null);
  const [pendingKidId, setPendingKidId] = useState<string | null>(null);
  const [deviceParentId, setDeviceParentId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  // Sockets (including this device) currently in this room, per the relay's presence message. A
  // green "open" WebSocket only means THIS device's connection succeeded — it says nothing about
  // whether anyone else is actually in the same room (a phrase/room typo lands you alone in a
  // different, empty room with no error). This is what makes that distinguishable in the UI.
  const [peerCount, setPeerCount] = useState(0);
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
  // True on a joining device between "request to join" and a parent's approval. While set, this
  // device ignores every incoming message except its own approval/rejection, so it never adopts
  // family data before a parent lets it in.
  const awaitingApprovalRef = useRef(false);
  // What this joining device keeps re-announcing until approved (so a parent who comes online later
  // still sees the request — the relay never replays history).
  const pendingJoinRef = useRef<PendingJoin | null>(null);
  const joinRequestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Device ids this (parent) device has already approved, so a joiner's periodic re-announce that
  // arrives just after approval isn't re-queued as a fresh request.
  const approvedJoinDeviceIdsRef = useRef<Set<string>>(new Set());
  // Mirrors `state` for use inside the sync callbacks below, which are handed to SyncClient once
  // at connect time and would otherwise close over a stale value from that moment.
  const stateRef = useRef<FamilyBankState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    void (async () => {
      // loadState needs the CryptoKey (state is encrypted at rest), so it can't join this parallel
      // batch — it's loaded further down, once we know a key actually exists.
      const [key, roomId, deviceId, role, kidId, parentId, onboardingComplete, pendingJoin] =
        await Promise.all([
          loadCryptoKey(),
          loadRoomId(),
          getOrCreateDeviceId(),
          loadDeviceRole(),
          loadDeviceKidId(),
          loadDeviceParentId(),
          loadOnboardingComplete(),
          loadPendingJoin(),
        ]);
      deviceIdRef.current = deviceId;
      deviceRoleRef.current = role;
      setDeviceKidId(kidId);
      setDeviceParentId(parentId);

      // A join that a parent hasn't approved yet: resume the waiting screen and keep announcing.
      // Checked before the "onboarded" logic below, since a mid-join device already has a key+room
      // saved but must NOT be treated as a finished install.
      if (pendingJoin && key && roomId) {
        roomIdRef.current = roomId;
        cryptoKeyRef.current = key;
        pendingJoinRef.current = pendingJoin;
        awaitingApprovalRef.current = true;
        setPhase("waiting-approval");
        startSync(key, roomId);
        return;
      }

      // A device that joined before this build has a key+room but no onboarding flag — treat it as
      // already onboarded so existing families are never sent back through the wizard.
      const legacyOnboarded = Boolean(key && roomId);
      if (!onboardingComplete && legacyOnboarded) await saveOnboardingComplete(true);
      const onboarded = onboardingComplete || legacyOnboarded;

      if (!onboarded || !key || !roomId) {
        setPhase("onboarding");
        return;
      }

      roomIdRef.current = roomId;
      cryptoKeyRef.current = key;
      const storedState = await loadState(key);
      // Seed the celebration diff with the raw stored state, so anything the
      // engines pay out on this load (payday, interest, Dad Match) celebrates.
      prevStateRef.current = storedState;
      const primed = primeState(storedState, key);
      setState(primed);
      let effectiveRole = role;
      let effectiveKidId = kidId;
      let effectiveParentId = parentId;
      if (primed) {
        const resolved = await resolveInitialRole(role, primed);
        effectiveRole = resolved.role;
        deviceRoleRef.current = resolved.role;
        setDeviceRole(resolved.role);
        if (resolved.parentId) {
          effectiveParentId = resolved.parentId;
          setDeviceParentId(resolved.parentId);
        }
        if (resolved.kidId) {
          effectiveKidId = resolved.kidId;
          setDeviceKidId(resolved.kidId);
        }
        if (resolved.pendingKidId) setPendingKidId(resolved.pendingKidId);
      } else {
        setDeviceRole(role);
      }
      // Start locked whenever the resolved identity has a PIN. The pendingKidId path has its own
      // KidPinPrompt (from Cloudflare Access auto-match), so it isn't double-locked here. A prior
      // unlock still remembered for this identity in this same browser tab (see
      // lib/session-unlock.ts) skips the PIN screen again — refreshing the page (or coming back
      // from the Reconnect flow) shouldn't re-ask, only an actual close-and-reopen should.
      const lockNeeded =
        Boolean(primed) &&
        effectiveRole !== null &&
        needsAppLock(primed as FamilyBankState, effectiveRole, effectiveKidId, effectiveParentId) &&
        !isSessionUnlocked(effectiveRole, effectiveKidId, effectiveParentId);
      setUnlocked(!lockNeeded);
      setPhase("ready");
      startSync(key, roomId);
    })();

    return () => {
      syncClientRef.current?.disconnect();
      if (joinRequestTimerRef.current) clearInterval(joinRequestTimerRef.current);
    };
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
      // A parent posting a quest, or a kid claiming one, reaches the other side's device as an
      // incoming sync update, which lands right here too — this is what actually nudges their phone.
      if (deviceRole === "kid") notifyNewQuests(prevStateRef.current, state);
      if (deviceRole === "parent") notifyClaimedBounties(prevStateRef.current, state);
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
      onPresenceChange: setPeerCount,
      onStatusChange: (status) => {
        setSyncStatus(status);
        if (status === "open" && awaitingApprovalRef.current) {
          // Still waiting to be let in: only announce the join request (never hand out or ask for
          // data), and keep re-announcing so a parent who connects later still sees it.
          void sendJoinRequest();
          startJoinRequestLoop();
          return;
        }
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
    // A device still waiting to be let in listens for nothing but its own verdict — it must never
    // adopt family data before a parent approves it.
    if (awaitingApprovalRef.current) {
      if (mutation.type === "join-approved" && mutation.targetDeviceId === deviceIdRef.current) {
        await adoptApproval(mutation);
      } else if (mutation.type === "join-rejected" && mutation.targetDeviceId === deviceIdRef.current) {
        handleRejection(mutation.reason);
      }
      return;
    }

    if (mutation.type === "join-request") {
      handleIncomingJoinRequest(mutation);
      return;
    }
    // A verdict from another parent device: the joiner (targetDeviceId) handles its own case in the
    // awaiting branch above. Here, every established device just drops that request from its own
    // approval queue so a co-parent's banner doesn't linger after someone else already answered.
    if (mutation.type === "join-approved") {
      approvedJoinDeviceIdsRef.current.add(mutation.targetDeviceId);
      setPendingJoinRequests((list) => list.filter((entry) => entry.deviceId !== mutation.targetDeviceId));
      return;
    }
    if (mutation.type === "join-rejected") {
      setPendingJoinRequests((list) => list.filter((entry) => entry.deviceId !== mutation.targetDeviceId));
      return;
    }

    const key = cryptoKeyRef.current;
    if (!key) return; // shouldn't happen — this callback only exists while a sync client (which requires a key) is connected

    if (mutation.type === "snapshot") {
      // Last-write-wins by timestamp — fine for a handful of family devices, not a general CRDT
      // merge. But a device that has never held real data yet (e.g. a kid's phone where "Start
      // fresh" was clicked instead of waiting for the first sync) always has the newest possible
      // clock stamp — it would otherwise permanently outrank every real snapshot arriving after
      // it and "Sync now" would look like it does nothing. An empty local state never wins.
      const incoming = normalizeState(mutation.state);
      setState((current) => {
        if (current && !isEmptyState(current) && current.updatedAt >= incoming.updatedAt) return current;
        void saveState(key, incoming);
        return incoming;
      });
    } else if (mutation.type === "request-snapshot") {
      const mine = stateRef.current;
      if (mine && !isEmptyState(mine)) void broadcastSnapshot(mine);
    } else {
      setState((current) => {
        if (!current) return current;
        const merged = { ...current, ...mutation.patch, updatedAt: mutation.sentAt };
        void saveState(key, merged);
        return merged;
      });
    }
  }

  /** Parent side: a device is asking to join. A kid whose name isn't on the roster is auto-rejected
   *  (the phrase/room were right, but they're not one of ours); everything else waits for a human. */
  function handleIncomingJoinRequest(request: JoinRequest) {
    if (deviceRoleRef.current !== "parent") return; // only a parent grants access
    if (approvedJoinDeviceIdsRef.current.has(request.deviceId)) return; // already let this one in
    const mine = stateRef.current;
    if (!mine) return;
    if (request.requestedRole === "kid" && !findKidByName(mine, request.claimedName)) {
      void syncClientRef.current?.send({
        type: "join-rejected",
        targetDeviceId: request.deviceId,
        reason: "name-not-found",
        deviceId: deviceIdRef.current ?? "",
        sentAt: new Date().toISOString(),
      });
      setUnknownJoinNames((list) => (list.includes(request.claimedName) ? list : [...list, request.claimedName]));
      return;
    }
    // A previously-unknown name that now matches (the parent just added them) shouldn't keep nagging.
    setUnknownJoinNames((list) =>
      list.filter((name) => name.trim().toLowerCase() !== request.claimedName.trim().toLowerCase()),
    );
    setPendingJoinRequests((list) =>
      list.some((existing) => existing.deviceId === request.deviceId) ? list : [...list, request],
    );
  }

  /** Joining side: a parent said yes. Adopt the family state they sent, commit our role, and open. */
  async function adoptApproval(mutation: Extract<SyncMutation, { type: "join-approved" }>) {
    awaitingApprovalRef.current = false;
    stopJoinRequestLoop();
    const incoming = normalizeState(mutation.state);
    // Don't replay the whole imported history as fresh celebrations.
    prevStateRef.current = incoming;

    deviceRoleRef.current = mutation.role;
    setDeviceRole(mutation.role);
    void saveDeviceRole(mutation.role);
    if (mutation.role === "kid" && mutation.kidId) {
      setDeviceKidId(mutation.kidId);
      void saveDeviceKidId(mutation.kidId);
    }
    if (mutation.role === "parent" && mutation.parentId) {
      setDeviceParentId(mutation.parentId);
      void saveDeviceParentId(mutation.parentId);
    }

    if (cryptoKeyRef.current) void saveState(cryptoKeyRef.current, incoming);
    setState(incoming);
    pendingJoinRef.current = null;
    await savePendingJoin(null);
    await saveOnboardingComplete(true);

    // They set their PIN during the join wizard — open straight in. Remembered for this tab session
    // so a refresh moments later doesn't immediately re-ask; a real close-and-reopen still will.
    markSessionUnlocked(mutation.role, mutation.kidId ?? null, mutation.parentId ?? null);
    setUnlocked(true);
    setJoinError(null);
    setPhase("ready");
  }

  function handleRejection(reason: "name-not-found" | "declined") {
    setJoinError(
      reason === "name-not-found"
        ? "We couldn't find your name on this family's list. Check the spelling with a parent — or ask them to add you first."
        : "A parent declined this request.",
    );
    stopJoinRequestLoop();
  }

  async function sendJoinRequest() {
    const pending = pendingJoinRef.current;
    if (!pending || !syncClientRef.current || !deviceIdRef.current) return;
    await syncClientRef.current.send({
      type: "join-request",
      deviceId: deviceIdRef.current,
      sentAt: new Date().toISOString(),
      claimedName: pending.claimedName,
      requestedRole: pending.role,
      email: pending.email,
      pinHash: pending.pinHash,
    });
  }

  function startJoinRequestLoop() {
    stopJoinRequestLoop();
    // Re-announce periodically so a parent who comes online after we did still sees the request.
    joinRequestTimerRef.current = setInterval(() => {
      if (awaitingApprovalRef.current) void sendJoinRequest();
      else stopJoinRequestLoop();
    }, 10_000);
  }

  function stopJoinRequestLoop() {
    if (joinRequestTimerRef.current) {
      clearInterval(joinRequestTimerRef.current);
      joinRequestTimerRef.current = null;
    }
  }

  /** Wizard "Start a new family" finished: derive the key + channel, persist the freshly-built
   *  state, and open straight into the parent dashboard (behind the PIN they just set). */
  async function handleCreateFamily(result: CreateFamilyResult) {
    const [key, roomId] = await Promise.all([
      deriveEncryptionKey(result.phrase),
      deriveRoomIdFromPhraseAndName(result.phrase, result.roomName),
    ]);
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId), saveRoomName(result.roomName)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;

    deviceRoleRef.current = "parent";
    setDeviceRole("parent");
    await saveDeviceRole("parent");
    setDeviceParentId(result.parentId);
    await saveDeviceParentId(result.parentId);
    await saveOnboardingComplete(true);

    prevStateRef.current = result.state;
    setState(result.state);
    await saveState(key, result.state);
    // They just set their PIN in the wizard — don't make them re-enter it right away, and remember
    // it for this tab session so a refresh doesn't either. A real close-and-reopen still will.
    markSessionUnlocked("parent", null, result.parentId);
    setUnlocked(true);
    setPhase("ready");
    startSync(key, roomId);
  }

  /** Wizard "Restore from a backup file": import the backup and secure it under a Family Phrase +
   *  room, so this becomes a fully set-up device (with a key/room the next launch recognizes) that
   *  can also sync with the family's other devices if the same phrase/room are used. */
  async function handleRestoreBackup(file: File, phrase: string, roomName: string) {
    const [key, roomId] = await Promise.all([
      deriveEncryptionKey(phrase),
      deriveRoomIdFromPhraseAndName(phrase, roomName),
    ]);
    const imported = await importStateFromFile(file, key); // throws on a bad file; the wizard shows it
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId), saveRoomName(roomName)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;
    await saveOnboardingComplete(true);

    prevStateRef.current = imported;
    setState(imported);
    const resolved = await resolveInitialRole(deviceRoleRef.current, imported);
    deviceRoleRef.current = resolved.role;
    setDeviceRole(resolved.role);
    if (resolved.parentId) setDeviceParentId(resolved.parentId);
    if (resolved.kidId) setDeviceKidId(resolved.kidId);
    if (resolved.pendingKidId) setPendingKidId(resolved.pendingKidId);
    // They just actively restored their own backup — open directly, and remember it for this tab
    // session so a refresh doesn't immediately re-ask. Only meaningful once an identity is actually
    // resolved (a restore with no role match instead lands on RoleChooser, which handles its own gates).
    if (resolved.role) markSessionUnlocked(resolved.role, resolved.kidId ?? null, resolved.parentId ?? null);
    setUnlocked(true);
    setPhase("ready");
    startSync(key, roomId);
  }

  /** Wizard "Join my family" finished: connect to the family's channel and sit in the waiting room,
   *  announcing the join request, until a parent approves (handled by adoptApproval). */
  async function handleJoin(result: JoinResult) {
    const [key, roomId] = await Promise.all([
      deriveEncryptionKey(result.phrase),
      deriveRoomIdFromPhraseAndName(result.phrase, result.roomName),
    ]);
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId), saveRoomName(result.roomName)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;

    const pending: PendingJoin = {
      claimedName: result.request.claimedName,
      role: result.request.requestedRole,
      email: result.request.email,
      pinHash: result.request.pinHash,
    };
    pendingJoinRef.current = pending;
    await savePendingJoin(pending);
    awaitingApprovalRef.current = true;
    setJoinError(null);
    setPhase("waiting-approval");
    startSync(key, roomId);
  }

  /** Parent taps Approve: fold the joiner's PIN/email onto their profile, broadcast the merged state
   *  to the whole family, and send the newly-approved device its verdict + data to adopt. */
  async function handleApproveJoin(request: JoinRequest) {
    const current = stateRef.current;
    if (!current) return;
    let merged = current;
    let kidId: string | undefined;
    let parentId: string | undefined;
    if (request.requestedRole === "kid") {
      const kid = findKidByName(current, request.claimedName);
      if (!kid) {
        void handleDeclineJoin(request);
        return;
      }
      merged = mergeJoinedKid(current, kid.id, request);
      kidId = kid.id;
    } else {
      const result = mergeJoinedParent(current, request);
      merged = result.state;
      parentId = result.parentId;
    }
    approvedJoinDeviceIdsRef.current.add(request.deviceId);
    commitState(merged);
    await syncClientRef.current?.send({
      type: "join-approved",
      targetDeviceId: request.deviceId,
      role: request.requestedRole,
      kidId,
      parentId,
      state: merged,
      deviceId: deviceIdRef.current ?? "",
      sentAt: new Date().toISOString(),
    });
    setPendingJoinRequests((list) => list.filter((entry) => entry.deviceId !== request.deviceId));
  }

  async function handleDeclineJoin(request: JoinRequest) {
    await syncClientRef.current?.send({
      type: "join-rejected",
      targetDeviceId: request.deviceId,
      reason: "declined",
      deviceId: deviceIdRef.current ?? "",
      sentAt: new Date().toISOString(),
    });
    setPendingJoinRequests((list) => list.filter((entry) => entry.deviceId !== request.deviceId));
  }

  /** Bail out of a pending join (from the waiting screen) back to the wizard. Clears the derived
   *  key/room too, so the next launch doesn't mistake this half-finished attempt for a real
   *  install and drop the user onto the "no local data" screen instead of the wizard. */
  async function handleCancelJoin() {
    awaitingApprovalRef.current = false;
    stopJoinRequestLoop();
    syncClientRef.current?.disconnect();
    pendingJoinRef.current = null;
    roomIdRef.current = null;
    cryptoKeyRef.current = null;
    await savePendingJoin(null);
    await clearFamilyKeyMaterial();
    setJoinError(null);
    setPhase("onboarding");
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (!cryptoKeyRef.current) throw new Error("No encryption key yet — finish setup first.");
      const imported = await importStateFromFile(file, cryptoKeyRef.current);
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
    if (cryptoKeyRef.current) void saveState(cryptoKeyRef.current, newState);
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
      const sentAt = `Sent at ${new Date().toLocaleTimeString()}`;
      setSyncNowMessage(
        peerCount <= 1
          ? `${sentAt} — but no other device is in this room right now, so there's no one to receive it. Double-check the Family Phrase and room name match on the other device.`
          : `${sentAt} — any other device on the same Family Phrase that's online now will pick it up within seconds.`,
      );
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
  async function handleChangeFamilyPhrase(newPhrase: string, newRoomName: string) {
    const phrase = newPhrase.trim();
    const roomName = newRoomName.trim();
    if (phrase.length < 8) throw new Error("Use a longer Family Phrase (8+ characters) — it's your only encryption key.");
    if (!roomName) throw new Error("Give your family a room name.");
    const [key, roomId] = await Promise.all([
      deriveEncryptionKey(phrase),
      deriveRoomIdFromPhraseAndName(phrase, roomName),
    ]);
    syncClientRef.current?.disconnect();
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId), saveRoomName(roomName)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;
    startSync(key, roomId);
    setRoomIdVersion((version) => version + 1);
    if (state) await broadcastSnapshot(state);
  }

  /**
   * Re-points THIS device at a different Family Phrase + room, available to a kid device or a
   * second parent device (unlike handleChangeFamilyPhrase, which only a parent's Settings tab can
   * reach). Fixes the case where a device missed a phrase/room change while it was closed or
   * offline and has no other way back in — this device's local identity (role, PIN, kid/parent
   * selection) is left completely alone; only what it syncs to changes. Connecting triggers the
   * same catch-up startSync already does on every open (broadcast-if-non-empty + request-snapshot).
   */
  async function handleReconnect(newPhrase: string, newRoomName: string) {
    const phrase = newPhrase.trim();
    const roomName = newRoomName.trim();
    if (phrase.length < 8) throw new Error("Enter the full Family Phrase (8+ characters).");
    if (!roomName) throw new Error("Enter the family room name too.");
    const [key, roomId] = await Promise.all([
      deriveEncryptionKey(phrase),
      deriveRoomIdFromPhraseAndName(phrase, roomName),
    ]);
    syncClientRef.current?.disconnect();
    await Promise.all([saveCryptoKey(key), saveRoomId(roomId), saveDefaultRoomId(roomId), saveRoomName(roomName)]);
    roomIdRef.current = roomId;
    cryptoKeyRef.current = key;
    startSync(key, roomId);
    setRoomIdVersion((version) => version + 1);
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

  if (phase === "onboarding") {
    return (
      <OnboardingWizard
        onCreateFamily={handleCreateFamily}
        onJoin={handleJoin}
        onRestoreBackup={handleRestoreBackup}
      />
    );
  }

  if (phase === "waiting-approval") {
    return <WaitingApproval error={joinError} onCancel={() => void handleCancelJoin()} />;
  }

  // Cold-open lock: block the whole app until this device's owner enters their PIN.
  if (!unlocked && state && deviceRole) {
    return (
      <AppLock
        state={state}
        deviceRole={deviceRole}
        deviceKidId={deviceKidId}
        deviceParentId={deviceParentId}
        onUnlock={() => {
          markSessionUnlocked(deviceRole, deviceKidId, deviceParentId);
          setUnlocked(true);
        }}
      />
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
              <SyncBadge status={syncStatus} peerCount={peerCount} />
              <ProfilePanel
                state={state}
                role="kid"
                deviceParentId={deviceParentId}
                deviceKidId={deviceKidId}
                onSetDeviceParentId={handleSetDeviceParentId}
                onSwitchToParent={handleChooseParentRole}
                onReconnect={handleReconnect}
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
            <SyncBadge status={syncStatus} peerCount={peerCount} />
            {state && (
              <ProfilePanel
                state={state}
                role="parent"
                deviceParentId={deviceParentId}
                deviceKidId={deviceKidId}
                onSetDeviceParentId={handleSetDeviceParentId}
                onSwitchToParent={handleChooseParentRole}
                onReconnect={handleReconnect}
              />
            )}
          </div>
        </header>

      {state && (
        <JoinApprovalBanner
          state={state}
          requests={pendingJoinRequests}
          onApprove={(request) => void handleApproveJoin(request)}
          onDecline={(request) => void handleDeclineJoin(request)}
        />
      )}

      {unknownJoinNames.length > 0 && (
        <section className="space-y-2 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm dark:border-white/10 dark:bg-white/[0.06]">
          <p>
            <strong>{unknownJoinNames.join(", ")}</strong> entered the right Family Phrase and room but
            isn&apos;t on your kids list yet, so they couldn&apos;t join. Add them under ⚙️ Settings →
            👤 Profile, then have them tap &quot;Try again&quot;.
          </p>
          <button onClick={() => setUnknownJoinNames([])} className="text-xs opacity-60 underline">
            Dismiss
          </button>
        </section>
      )}

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

/**
 * A green "connected" WebSocket only proves THIS device's own connection succeeded — it says
 * nothing about whether anyone else is actually in the same room (a phrase/room typo silently
 * lands you alone in a different, empty room, with no error). peerCount — from the relay's
 * presence message — is what actually answers "is this doing anything." status === "open" but
 * peerCount <= 1 is called out separately so that distinction is visible instead of just "Synced".
 */
function SyncBadge({ status, peerCount }: { status: SyncStatus; peerCount: number }) {
  if (status === "open" && peerCount <= 1) {
    return (
      <span className="flex items-center gap-2 text-sm opacity-70" title="Connected to the relay, but no other device is in this room right now.">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Connected — alone in room
      </span>
    );
  }

  const labels: Record<SyncStatus, string> = {
    connecting: "Connecting…",
    open: `Synced with ${peerCount - 1} device${peerCount - 1 === 1 ? "" : "s"}`,
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

/** Shown on a joining device between "Request to join" and a parent's decision. */
function WaitingApproval({ error, onCancel }: { error: string | null; onCancel: () => void }) {
  // A wrong Family Phrase or room name can't be detected directly — a typo just connects you to a
  // different, empty room where no parent will ever answer. So after a while, nudge the user to
  // re-check them rather than letting the spinner run forever with no explanation.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (error) return;
    const timer = setTimeout(() => setSlow(true), 25_000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 text-center dark:border-white/10">
        {error ? (
          <>
            <div className="text-4xl">🚫</div>
            <h1 className="text-lg font-semibold">Couldn&apos;t join yet</h1>
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={onCancel}
              className="w-full rounded-md bg-black px-3 py-2 text-white dark:bg-white dark:text-black"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="animate-pulse text-4xl">⏳</div>
            <h1 className="text-lg font-semibold">Waiting for a parent to approve</h1>
            <p className="text-sm opacity-70">
              You&apos;re connected. As soon as a parent opens the app and approves you, this device
              fills with your family&apos;s data. You can leave this screen open.
            </p>
            {slow && (
              <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                Taking a while? Double-check the Family Phrase and room name with a parent — even a
                small typo connects you to a different, empty room. Tap &quot;Try again&quot; to
                re-enter them.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {slow && (
                <button
                  onClick={onCancel}
                  className="w-full rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
                >
                  Try again
                </button>
              )}
              <button onClick={onCancel} className="text-sm opacity-60 underline">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
