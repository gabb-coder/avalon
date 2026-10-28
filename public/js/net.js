// The connection to the game server: one Socket.IO socket that reconnects on
// its own, request() for intents (resolves with the server's ack), and a
// /healthz ping that starts waking a sleeping server as soon as the page opens.

import { io } from '../vendor/socket.io.esm.min.js';
import { S2C } from '../shared/protocol.js';
import { SERVER_URL } from '../config.js';

const REQUEST_TIMEOUT_MS = 15000;

export function createNet(handlers) {
  const socket = io(SERVER_URL || undefined, {
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10000,
  });

  socket.on('connect', () => handlers.onStatus('online'));
  socket.on('disconnect', () => handlers.onStatus('offline'));
  socket.on('connect_error', () => handlers.onStatus('offline'));
  socket.io.on('reconnect_attempt', (n) => handlers.onAttempt?.(n));
  socket.on(S2C.HELLO, handlers.onHello);
  socket.on(S2C.STATE, handlers.onState);
  socket.on(S2C.NOTICE, handlers.onNotice);
  socket.on(S2C.ROOM_CLOSED, handlers.onClosed);

  return {
    get connected() {
      return socket.connected;
    },

    // Send an intent; resolves with { ok, ... } or { ok: false, code, params }.
    // Never rejects, so callers can always show a reason.
    async request(event, payload = {}) {
      try {
        return await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(event, payload);
      } catch {
        return { ok: false, code: 'err.timeout', params: {} };
      }
    },

    // Kick the socket to try again now (e.g. "Try again" on the waking screen).
    retry() {
      if (!socket.connected) {
        socket.disconnect();
        socket.connect();
      }
    },
  };
}

// Ping /healthz until it answers. Render's free tier holds the request while
// the server boots, so a request that is still pending (not failed) means we
// reached Render and it is waking up. Calls onReached once, then onAwake.
export function wakeServer({ onReached, onAwake }) {
  let stopped = false;
  let reached = false;
  const url = `${SERVER_URL || ''}/healthz`;

  async function attempt() {
    if (stopped) return;
    const reachedTimer = setTimeout(() => {
      if (!reached) {
        reached = true;
        onReached();
      }
    }, 1200);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      clearTimeout(reachedTimer);
      if (res.ok) {
        if (!reached) {
          reached = true;
          onReached();
        }
        onAwake();
        return;
      }
    } catch {
      clearTimeout(reachedTimer); // failed fast: offline or DNS trouble
    }
    setTimeout(attempt, 2500);
  }
  attempt();
  return () => {
    stopped = true;
  };
}
