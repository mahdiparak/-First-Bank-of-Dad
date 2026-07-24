import { decryptPayload, encryptPayload } from "./crypto";
import type { DeviceRole } from "./storage";
import type { FamilyBankState } from "./schema";

/** A device asking to be let into a family: what it claims to be, so a parent device can match it
 *  against the roster and approve. Encrypted like every other message — the relay never sees it. */
export interface JoinRequest {
  deviceId: string;
  /** The name the joiner typed in the wizard — matched case-insensitively against the roster. */
  claimedName: string;
  requestedRole: DeviceRole;
  email?: string;
  /** The joiner's own PIN hash (already hashed on their device), so approval can preserve it on
   *  the merged profile rather than making them set it again. */
  pinHash?: string;
}

export type SyncMutation =
  | { type: "snapshot"; state: FamilyBankState; deviceId: string; sentAt: string }
  | { type: "delta"; patch: Partial<FamilyBankState>; deviceId: string; sentAt: string }
  // Sent by every device right after it (re)connects, since the relay never replays history —
  // without this, a device that was disconnected when a change went out (backgrounded, briefly
  // offline, or just onboarding) has no way to learn about it other than someone happening to
  // send another change later. Any peer holding real data answers with a fresh "snapshot" broadcast.
  | { type: "request-snapshot"; deviceId: string; sentAt: string }
  // A joining device announces itself and waits. Re-sent on every reconnect (like request-snapshot)
  // so a parent who was offline still sees it once they come online. A parent device answers with
  // either "join-approved" (carrying the current state to adopt) or "join-rejected".
  | ({ type: "join-request"; sentAt: string } & JoinRequest)
  // Parent -> a specific joining device: you're in. Carries the full state so the newly-approved
  // device adopts it atomically, plus which profile it was bound to. This is NOT a security
  // boundary — anyone holding the Family Phrase can already decrypt every broadcast — it's an
  // orderly-onboarding gate so a parent controls who a device is set up as.
  | { type: "join-approved"; targetDeviceId: string; role: DeviceRole; kidId?: string; parentId?: string; state: FamilyBankState; deviceId: string; sentAt: string }
  // Parent -> a specific joining device: no. "name-not-found" means the claimed name isn't on the
  // roster (the phrase/room were still correct); "declined" means a parent actively said no.
  | { type: "join-rejected"; targetDeviceId: string; reason: "name-not-found" | "declined"; deviceId: string; sentAt: string };

export type SyncStatus = "connecting" | "open" | "closed" | "error";

/** The relay's one self-originated (never encrypted) message: how many sockets — including this
 *  one — are currently connected to this room. See worker/worker.js's presenceMessage(). */
interface PresenceMessage {
  __presence__: true;
  count: number;
}

function isPresenceMessage(value: unknown): value is PresenceMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __presence__?: unknown }).__presence__ === true &&
    typeof (value as { count?: unknown }).count === "number"
  );
}

// Plaintext keepalive, never encrypted — see worker.js's matching PING_MESSAGE/PONG_MESSAGE. A
// mobile network's NAT/firewall can silently drop an idle-looking connection well before the
// browser's own close/error event notices; sending this periodically resets that idle timer, and
// the reply is what lets zombieCheck (below) notice a connection that's gone dead.
const PING_MESSAGE = JSON.stringify({ __ping__: true });
const PONG_MESSAGE = JSON.stringify({ __pong__: true });
const PING_INTERVAL_MS = 20_000;
// Generous relative to PING_INTERVAL_MS (2x + slack) so one delayed tick under load isn't mistaken
// for a dead connection — but still short enough that a real drop is caught well before "a few
// seconds" turns into the user having to notice and manually refresh.
const ZOMBIE_TIMEOUT_MS = 50_000;
const ZOMBIE_CHECK_INTERVAL_MS = 10_000;

export interface SyncClientOptions {
  relayUrl: string; // e.g. wss://relay.example.workers.dev/ws
  key: CryptoKey;
  roomId: string;
  onMutation: (mutation: SyncMutation) => void;
  onStatusChange?: (status: SyncStatus) => void;
  /** How many sockets (including this device) are in the room right now — the only reliable way
   *  to tell "my connection is open" apart from "I'm actually in the same room as anyone else." */
  onPresenceChange?: (count: number) => void;
}

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function tryParsePresence(data: string): PresenceMessage | null {
  // Real ciphertext is base64 (no '{'), so this cheaply rules out the common case before parsing.
  if (!data.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isPresenceMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export class SyncClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private zombieCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private closedByUser = false;

  constructor(private readonly options: SyncClientOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
    // A backgrounded tab/PWA can have its timers throttled or fully suspended by the OS, so a
    // scheduled reconnect (or even the browser's own close event) may not fire promptly — if at
    // all — until the user comes back. Checking the moment they do, instead of waiting on a timer
    // that might not run, is what turns "only a refresh brings it back" into "just works."
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleResume);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleResume);
    }
  }

  disconnect(): void {
    this.closedByUser = true;
    this.clearTimers();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleResume);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleResume);
    }
    this.ws?.close();
  }

  async send(mutation: SyncMutation): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload = await encryptPayload(this.options.key, mutation);
    this.ws.send(payload);
  }

  // Bound once so add/removeEventListener target the same reference.
  private handleResume = (): void => {
    if (this.closedByUser) return;
    if (document.visibilityState === "hidden") return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    // Jump the queue instead of waiting out whatever backoff delay had built up — the user is
    // looking at the screen right now.
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.open();
  };

  private open(): void {
    const url = `${this.options.relayUrl}?room=${this.options.roomId}`;
    this.options.onStatusChange?.("connecting");
    // A stale count from a previous room (e.g. right after reconnecting somewhere new) would be
    // actively misleading — the fresh count arrives the moment this socket is accepted.
    this.options.onPresenceChange?.(0);
    this.clearTimers();

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.lastActivityAt = Date.now();
      this.options.onStatusChange?.("open");
      this.startKeepalive();
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      // Any inbound byte — presence, a pong, or a real mutation — proves the connection is alive,
      // even before we know which of those this particular message is.
      this.lastActivityAt = Date.now();
      void this.handleMessage(event.data);
    });

    ws.addEventListener("close", () => {
      this.clearTimers();
      this.options.onStatusChange?.("closed");
      this.options.onPresenceChange?.(0);
      if (!this.closedByUser) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      this.options.onStatusChange?.("error");
    });
  }

  /** Pings the relay periodically (resets idle-network timeouts that would otherwise silently
   *  drop the connection) and independently checks how long it's been since ANYTHING was heard
   *  back — a connection whose readyState still says OPEN but has gone quiet for too long is
   *  almost certainly a zombie the browser hasn't noticed yet; force-closing it lets the normal
   *  reconnect path recover instead of leaving the app stuck showing a stale "Synced". */
  private startKeepalive(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(PING_MESSAGE);
    }, PING_INTERVAL_MS);

    this.zombieCheckTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastActivityAt > ZOMBIE_TIMEOUT_MS) {
        this.ws.close(); // triggers the "close" listener, which schedules a normal reconnect
      }
    }, ZOMBIE_CHECK_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.zombieCheckTimer) {
      clearInterval(this.zombieCheckTimer);
      this.zombieCheckTimer = null;
    }
  }

  private async handleMessage(data: string): Promise<void> {
    // The relay's own messages are deliberately plaintext JSON (see worker.js) — check for those
    // before attempting to decrypt, since neither is AES-GCM ciphertext and would just fail below.
    if (data === PONG_MESSAGE) return;
    const presence = tryParsePresence(data);
    if (presence) {
      this.options.onPresenceChange?.(presence.count);
      return;
    }
    try {
      const mutation = await decryptPayload<SyncMutation>(this.options.key, data);
      this.options.onMutation(mutation);
    } catch {
      // Undecryptable with our key — not a message for this Family Phrase. Ignore.
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.closedByUser) this.open();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }
}
