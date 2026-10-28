// Builds the HTTP server, Express app and Socket.IO server, without listening.
// index.js starts it for real; tests start it in-process on a random port.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { loadConfig } from './config.js';
import { MemoryRoomStore } from './roomStore.js';
import { RoomManager } from './roomManager.js';
import { attachSocketHandlers } from './socketHandlers.js';
import { log } from './log.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Same-origin requests are always fine; cross-origin only from ALLOWED_ORIGIN
// (the Render static site). Checked for the WebSocket upgrade too, which
// browsers don't protect with CORS.
function originAllowed(config, origin, host) {
  if (!origin) return true; // not a browser (tests, health checks)
  if (config.allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// `store`: where rooms live. Defaults to memory; index.js passes the Redis
// store when REDIS_URL is set (see createRoomStore), already loaded.
export function createServer(overrides = {}, { store = new MemoryRoomStore() } = {}) {
  const config = loadConfig(overrides);
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // No 'unsafe-inline': the client sets styles through the CSSOM, never style attributes.
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'], // rt.css icon masks and textures are data: URIs
          connectSrc: ["'self'", 'ws:', 'wss:', ...config.allowedOrigins],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          // Production is HTTPS-only. In dev, phones on the same Wi-Fi use plain http.
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS for the health check, so the static site can wake the server (A6).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    next();
  });

  app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true, rooms: store.size, uptime: Math.round(process.uptime()) });
  });

  // Local dev: serve the client and the two files the static build copies in
  // (see scripts/buildStatic.js), straight from their sources.
  if (config.serveClient) {
    app.use('/shared', express.static(path.join(root, 'shared')));
    app.get('/vendor/socket.io.esm.min.js', (req, res) =>
      res.sendFile(path.join(root, 'node_modules/socket.io-client/dist/socket.io.esm.min.js')),
    );
    app.use(express.static(path.join(root, 'public')));
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: config.maxPayloadBytes,
    cors: config.allowedOrigins.length ? { origin: config.allowedOrigins } : undefined,
    allowRequest: (req, done) => {
      const ok = originAllowed(config, req.headers.origin, req.headers.host);
      // Helps spot a mistyped ALLOWED_ORIGIN on Render. An origin is a site
      // address, not a secret.
      if (!ok) log.warn('socket.refusedOrigin', { origin: String(req.headers.origin).slice(0, 100) });
      done(null, ok);
    },
    serveClient: false,
  });

  const transport = { send: (connId, event, data) => io.to(connId).emit(event, data) };
  const manager = new RoomManager({ config, store, transport });
  attachSocketHandlers(io, manager, config);
  if (store.size > 0) manager.restoreAfterRestart(); // rooms loaded from Redis

  return {
    app,
    server,
    io,
    manager,
    store,
    config,
    // Rejects if the port can't be used (e.g. already taken).
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address().port);
        });
      });
    },
    async close() {
      manager.shutdown();
      await new Promise((resolve) => io.close(() => resolve()));
      await store.close?.(); // Redis: finish pending writes, then disconnect
    },
  };
}
