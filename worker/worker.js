// Blind, room-based WebSocket relay for E2EE sync.
//
// The Worker/Durable Object never sees plaintext: clients connect using a
// SHA-256 hash of their "Family Phrase" as the room id, and every message
// body is an AES-GCM ciphertext produced client-side. This file only routes
// bytes between sockets in the same room — it never parses, decrypts, or
// persists a payload.

const MAX_MESSAGE_BYTES = 64 * 1024; // one encrypted mutation should be tiny
const MAX_SOCKETS_PER_ROOM = 8; // parent + kids + a few extra devices
const ROOM_ID_PATTERN = /^[a-f0-9]{64}$/i; // hex-encoded SHA-256

// Plaintext (never encrypted) system messages the Worker originates itself rather than just
// relaying — connection metadata only (a count, a keepalive echo), never room content, so neither
// weakens the "server can't make sense of the data" guarantee. See lib/sync.ts for how the client
// tells these apart from real ciphertext.
function presenceMessage(count) {
  return JSON.stringify({ __presence__: true, count });
}

// A mobile network's NAT/firewall can silently drop an idle-looking WebSocket well before either
// side's own close/error event fires — the browser is left believing a dead connection is still
// open. The client pings this exact string periodically; echoing it back immediately (a) resets
// any idle timer on the path between them, and (b) gives the client a heartbeat it can measure
// against to notice a zombie connection and force a reconnect instead of waiting indefinitely.
const PING_MESSAGE = JSON.stringify({ __ping__: true });
const PONG_MESSAGE = JSON.stringify({ __pong__: true });

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

    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(message);
      } catch {
        // Peer socket is dead; it'll be cleaned up via its own close/error.
      }
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
