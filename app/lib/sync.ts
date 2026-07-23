import { decryptPayload, encryptPayload } from "./crypto";
import type { FamilyBankState } from "./schema";

export type SyncMutation =
  | { type: "snapshot"; state: FamilyBankState; deviceId: string; sentAt: string }
  | { type: "delta"; patch: Partial<FamilyBankState>; deviceId: string; sentAt: string }
  // Sent by a device with no real data yet (e.g. just onboarded) right after it connects, since
  // the relay never replays history — without this, a device that joins after everyone else is
  // already idle and connected would just sit there "synced" but silent forever. Any peer holding
  // real data answers with a fresh "snapshot" broadcast.
  | { type: "request-snapshot"; deviceId: string; sentAt: string };

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
