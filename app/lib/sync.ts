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

export interface SyncClientOptions {
  relayUrl: string; // e.g. wss://relay.example.workers.dev/ws
  key: CryptoKey;
  roomId: string;
  onMutation: (mutation: SyncMutation) => void;
  onStatusChange?: (status: SyncStatus) => void;
}

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class SyncClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;

  constructor(private readonly options: SyncClientOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  async send(mutation: SyncMutation): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload = await encryptPayload(this.options.key, mutation);
    this.ws.send(payload);
  }

  private open(): void {
    const url = `${this.options.relayUrl}?room=${this.options.roomId}`;
    this.options.onStatusChange?.("connecting");

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.options.onStatusChange?.("open");
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      void this.handleMessage(event.data);
    });

    ws.addEventListener("close", () => {
      this.options.onStatusChange?.("closed");
      if (!this.closedByUser) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      this.options.onStatusChange?.("error");
    });
  }

  private async handleMessage(data: string): Promise<void> {
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
