// Blind, room-based WebSocket relay for E2EE sync.
//
// The Worker/Durable Object never sees plaintext: clients connect using a
// SHA-256 hash of their "Family Phrase" as the room id, and every message
// body is an AES-GCM ciphertext produced client-side. This file routes bytes
// between sockets in the same room and keeps a short mailbox of those same
// bytes — it never parses or decrypts a payload.
//
// The mailbox is what makes the app work at all for a family that isn't
// online at the same moment. A kid asks for approval at 4pm and closes the
// app; a parent opens theirs at 7pm. With pure fan-out that message went to
// nobody and was gone. Now it's held (still as ciphertext) and replayed to
// whoever asks on connect.

const MAX_MESSAGE_BYTES = 64 * 1024; // one encrypted mutation should be tiny
const MAX_SOCKETS_PER_ROOM = 8; // parent + kids + a few extra devices
const ROOM_ID_PATTERN = /^[a-f0-9]{64}$/i; // hex-encoded SHA-256

// Mailbox limits. Deliberately small: what clients broadcast is a whole-state
// snapshot, and a stale one can never beat a newer one (the client compares
// timestamps), so holding the last few is as good as holding hundreds and
// costs a fraction of the storage.
const MAX_STORED_MESSAGES = 50;
const MAX_STORED_BYTES = 1_500_000;
const MAX_STORED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MESSAGE_PREFIX = 'm:';
const INDEX_KEY = 'idx';

// Plaintext (never encrypted) system messages the Worker originates itself rather than just
// relaying — connection metadata only (a count, a keepalive echo, a mailbox position), never room
// content, so none of them weaken the "server can't make sense of the data" guarantee. See
// lib/sync.ts for how the client tells these apart from real ciphertext.
function presenceMessage(count) {
  return JSON.stringify({ __presence__: true, count });
}

/** Tells a client how far through the mailbox it now is, so its next connect can ask for the rest. */
function cursorMessage(seq) {
  return JSON.stringify({ __cursor__: true, seq });
}

// A mobile network's NAT/firewall can silently drop an idle-looking WebSocket well before either
// side's own close/error event fires — the browser is left believing a dead connection is still
// open. The client pings this exact string periodically; echoing it back immediately (a) resets
// any idle timer on the path between them, and (b) gives the client a heartbeat it can measure
// against to notice a zombie connection and force a reconnect instead of waiting indefinitely.
const PING_MESSAGE = JSON.stringify({ __ping__: true });
const PONG_MESSAGE = JSON.stringify({ __pong__: true });

/**
 * A client's opening line: "I last saw sequence N, send me anything after it."
 * Real payloads are base64 ciphertext and can never start with '{', so this
 * check can't be fooled by room content.
 */
function parseHello(message) {
  if (typeof message !== 'string' || !message.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(message);
    if (parsed && parsed.__hello__ === true) {
      const since = Number(parsed.since);
      return { since: Number.isFinite(since) && since >= 0 ? since : 0 };
    }
  } catch {
    // Not JSON — it's room content, which is none of our business.
  }
  return null;
}

/** Zero-padded so the storage layer's lexicographic key order is also sequence order. */
function messageKey(seq) {
  return MESSAGE_PREFIX + String(seq).padStart(12, '0');
}

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    if (this.state.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      return new Response('Room is full', { status: 503 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // Hibernation API: the runtime can evict this Durable Object between
    // messages and still wake it for webSocketMessage/Close/Error, so an
    // idle family doesn't hold any compute or memory.
    this.state.acceptWebSocket(server);
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * The mailbox index: one small record per stored message ({ key, at, bytes }) plus the running
   * sequence number. Kept separate from the payloads so pruning doesn't have to read back a
   * megabyte of ciphertext to find out what's there.
   */
  async readIndex() {
    const index = await this.state.storage.get(INDEX_KEY);
    if (!index || !Array.isArray(index.entries)) return { seq: 0, entries: [] };
    return { seq: Number(index.seq) || 0, entries: index.entries };
  }

  async webSocketMessage(ws, message) {
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      ws.close(1009, 'Message too large');
      return;
    }

    // A keepalive ping is answered directly, not relayed — it's between one client and the relay,
    // not room content the other peer needs to see.
    if (message === PING_MESSAGE) {
      try {
        ws.send(PONG_MESSAGE);
      } catch {
        // Sender socket is already gone; nothing to do.
      }
      return;
    }

    const hello = parseHello(message);
    if (hello) {
      await this.replayTo(ws, hello.since);
      return;
    }

    await this.store(message, size);

    const { seq } = await this.readIndex();
    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(message);
        // Follows the payload, never wraps it: the wire format for room content stays exactly what
        // it was, so a client from before the mailbox existed still understands every message it
        // receives and simply fails to decrypt this one, which it already ignores.
        peer.send(cursorMessage(seq));
      } catch {
        // Peer socket is dead; it'll be cleaned up via its own close/error.
      }
    }
  }

  /** Appends one message to the mailbox and evicts whatever no longer fits. */
  async store(message, size) {
    const index = await this.readIndex();
    const seq = index.seq + 1;
    const now = Date.now();

    await this.state.storage.put(messageKey(seq), message);
    const entries = [...index.entries, { seq, at: now, bytes: size }];

    // Oldest-first eviction against all three limits at once. Age is checked before the count and
    // byte caps so a room that's been quiet for a fortnight empties out instead of holding a
    // snapshot nobody will ever want again.
    let kept = entries.filter((entry) => now - entry.at <= MAX_STORED_AGE_MS);
    if (kept.length === 0) kept = [entries[entries.length - 1]];

    while (kept.length > MAX_STORED_MESSAGES) kept.shift();
    let bytes = kept.reduce((total, entry) => total + entry.bytes, 0);
    while (kept.length > 1 && bytes > MAX_STORED_BYTES) {
      bytes -= kept[0].bytes;
      kept.shift();
    }

    const keptSeqs = new Set(kept.map((entry) => entry.seq));
    const evicted = entries.filter((entry) => !keptSeqs.has(entry.seq)).map((entry) => messageKey(entry.seq));
    if (evicted.length > 0) await this.state.storage.delete(evicted);

    await this.state.storage.put(INDEX_KEY, { seq, entries: kept });
  }

  /**
   * Sends everything this client hasn't seen, oldest first, then where it now stands. A client
   * asking from 0 (a fresh open, which is the normal case) gets the whole mailbox — cheap, and it
   * means catching up never depends on another device happening to be awake.
   */
  async replayTo(ws, since) {
    const { seq, entries } = await this.readIndex();
    const pending = entries.filter((entry) => entry.seq > since);

    for (const entry of pending) {
      const body = await this.state.storage.get(messageKey(entry.seq));
      if (body === undefined) continue; // evicted between the index read and now
      try {
        ws.send(body);
      } catch {
        return; // socket died mid-replay; the cursor would be a lie
      }
    }

    try {
      ws.send(cursorMessage(seq));
    } catch {
      // Socket died; nothing to tell.
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    try {
      ws.close(wasClean ? code : 1011, reason);
    } catch {
      // Already closed.
    }
    // Fires after the closing socket is already gone from getWebSockets(), so the remaining
    // peers get an accurate, immediately-updated count.
    this.broadcastPresence();
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, 'Socket error');
    } catch {
      // Already closed.
    }
    this.broadcastPresence();
  }

  broadcastPresence() {
    const message = presenceMessage(this.state.getWebSockets().length);
    for (const peer of this.state.getWebSockets()) {
      try {
        peer.send(message);
      } catch {
        // Peer socket is dead; it'll be cleaned up via its own close/error.
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response('ok');
    }

    if (url.pathname !== '/ws') {
      return new Response('Not found', { status: 404 });
    }

    const roomId = url.searchParams.get('room');
    if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
      return new Response('Missing or invalid room id', { status: 400 });
    }

    const id = env.ROOMS.idFromName(roomId.toLowerCase());
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  },
};
