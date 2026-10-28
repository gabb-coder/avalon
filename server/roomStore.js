// Where rooms live. The interface is deliberately small and synchronous:
//
//   get(code) → record | undefined     has(code) → boolean
//   set(code, record)                  delete(code)
//   values() → iterable of records     size → number
//
// A record is plain JSON (see RoomManager): the engine state, hashed session
// tokens, the block list and the last-activity time. Timers and sockets are
// never stored; they belong to the running process.
//
// The server runs as a single instance, so rooms are always kept in memory
// and reads stay synchronous. RedisRoomStore (below) keeps this same
// interface and also copies every write to Redis, so a restart or redeploy
// doesn't end the games being played.

import { log } from './log.js';

export class MemoryRoomStore {
  #rooms = new Map();

  get(code) {
    return this.#rooms.get(code);
  }

  has(code) {
    return this.#rooms.has(code);
  }

  set(code, record) {
    this.#rooms.set(code, record);
  }

  delete(code) {
    this.#rooms.delete(code);
  }

  values() {
    return this.#rooms.values();
  }

  get size() {
    return this.#rooms.size;
  }
}

// Optional (REDIS_URL): the same in-memory store, with every write also sent
// to Redis in the background. Commands on one connection run in order, so
// Redis always ends up with the latest record. At boot, loadAll() reads the
// rooms back.
//
// PRIVACY: a record holds the room's secrets (roles, votes, tokens hashed),
// exactly like memory does. Use a Redis that only the game server can reach
// (on Render: the Key Value instance's internal URL), and never log records.
export class RedisRoomStore extends MemoryRoomStore {
  #client;
  #prefix;
  #ttlMs;
  #inflight = new Set();

  // `client` needs set/get/del/scanIterator/quit, as @redis/client has.
  constructor(client, { ttlMs, prefix = 'avalon:room:' }) {
    super();
    this.#client = client;
    this.#prefix = prefix;
    this.#ttlMs = ttlMs; // Redis forgets rooms nobody has touched, even if the server never closed them
  }

  set(code, record) {
    super.set(code, record);
    this.#send('set', () => this.#client.set(this.#prefix + code, JSON.stringify(record), { PX: this.#ttlMs }));
  }

  delete(code) {
    super.delete(code);
    this.#send('delete', () => this.#client.del(this.#prefix + code));
  }

  // Read every saved room into memory. Returns how many were loaded.
  async loadAll() {
    for await (const batch of this.#client.scanIterator({ MATCH: `${this.#prefix}*`, COUNT: 100 })) {
      for (const key of [].concat(batch)) {
        const raw = await this.#client.get(key);
        if (!raw) continue;
        try {
          const record = JSON.parse(raw);
          super.set(record.code, record);
        } catch {
          log.warn('redis.badRecord', { key: key.slice(this.#prefix.length) });
        }
      }
    }
    return this.size;
  }

  // Wait for writes still on their way (graceful shutdown, tests).
  async flush() {
    await Promise.allSettled([...this.#inflight]);
  }

  async close() {
    await this.flush();
    await this.#client.quit?.();
  }

  // A failed write is logged, never thrown: the game carries on from memory.
  #send(op, fn) {
    const p = Promise.resolve()
      .then(fn)
      .catch((err) => log.error('redis.write', err, { op }))
      .finally(() => this.#inflight.delete(p));
    this.#inflight.add(p);
  }
}

const REDIS_CONNECT_MS = 10000;

// MemoryRoomStore, or RedisRoomStore when REDIS_URL is set (rooms loaded).
// If Redis can't be reached at boot, the server starts anyway with rooms in
// memory: a game without persistence beats no game.
export async function createRoomStore(config) {
  if (!config.redisUrl) return new MemoryRoomStore();
  // Loaded only when wanted: @redis/client is an optional dependency.
  const { createClient } = await import('@redis/client');
  const client = createClient({ url: config.redisUrl, socket: { reconnectStrategy: (n) => Math.min(200 * n, 5000) } });
  // The client retries on its own and reports every failed attempt; log each
  // distinct problem once, not every few seconds.
  let lastError = '';
  client.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    log.warn('redis.error', { message: err.message });
  });
  client.on('ready', () => {
    lastError = '';
  });
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer in ${REDIS_CONNECT_MS / 1000} s`)), REDIS_CONNECT_MS).unref()),
    ]);
  } catch (err) {
    log.error('redis.unavailable', err);
    client.destroy?.();
    return new MemoryRoomStore();
  }
  // Twice the idle limit: the server closes idle rooms itself; this only
  // catches rooms left behind if the server was down when they went idle.
  const store = new RedisRoomStore(client, { ttlMs: 2 * config.roomIdleMs });
  const n = await store.loadAll();
  log.info('redis.loaded', { rooms: n });
  return store;
}
