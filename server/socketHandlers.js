// Socket.IO wiring: every client event is rate-limited, shape-checked, handed
// to the RoomManager, and answered through the acknowledgement callback.
// Nothing here knows the game rules.

import { S2C, SERVER_ERRORS } from '../shared/protocol.js';
import { validators } from './validate.js';
import { makeRateLimiter } from './rateLimit.js';
import { log } from './log.js';

const fail = (code) => ({ ok: false, code, params: {} });

// After this many refused events in a row, the socket is cut off.
const MAX_STRIKES = 50;

export function attachSocketHandlers(io, manager, config) {
  io.on('connection', (socket) => {
    const allow = makeRateLimiter({ perSecond: config.rateLimitPerSecond, burst: config.rateLimitBurst });
    let strikes = 0;

    socket.emit(S2C.HELLO, {
      serverNow: Date.now(),
      seatHoldMs: config.seatHoldMs,
      hostEndAfterMs: config.hostEndAfterMs,
      revealFallbackMs: config.revealFallbackMs,
      connectionLostMs: config.connectionLostMs,
    });

    for (const [event, validate] of Object.entries(validators)) {
      socket.on(event, (payload, ack) => {
        // Allow emit(event, ack) with no payload.
        if (typeof payload === 'function') {
          ack = payload;
          payload = undefined;
        }
        const reply = typeof ack === 'function' ? ack : () => {};

        if (!allow()) {
          if (++strikes > MAX_STRIKES) {
            log.warn('socket.flood', { room: manager.roomOf(socket.id) });
            socket.disconnect(true);
          }
          return reply(fail(SERVER_ERRORS.RATE_LIMITED));
        }
        strikes = 0;

        const clean = validate(payload);
        if (!clean) return reply(fail(SERVER_ERRORS.BAD_PAYLOAD));

        try {
          reply(manager.handle(socket.id, event, clean));
        } catch (err) {
          // A bug while handling one room's event: log it, tell the client,
          // keep serving every other room.
          log.error('handler.crash', err, { room: manager.roomOf(socket.id), event });
          reply(fail(SERVER_ERRORS.SERVER));
        }
      });
    }

    socket.on('disconnect', () => {
      try {
        manager.disconnect(socket.id);
      } catch (err) {
        log.error('disconnect.crash', err, { room: manager.roomOf(socket.id) });
      }
    });
  });
}
