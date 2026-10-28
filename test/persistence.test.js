// Optional Redis persistence (REDIS_URL): rooms are copied to Redis and read
// back after a restart. These tests use a stand-in for the Redis client (a
// Map with the same few methods), so they need no Redis server.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { C2S } from '../shared/protocol.js';
import { RedisRoomStore } from '../server/roomStore.js';
import { loadConfig } from '../server/config.js';
import { startServer, newClients, settle, step, closeAll } from './socketClient.js';
import { NAMES } from './helpers.js';

after(closeAll);

// The subset of @redis/client that RedisRoomStore uses.
class FakeRedis {
  data = new Map();
  writes = 0;
  async set(key, value, opts) {
    assert.ok(opts.PX > 0, 'rooms expire in Redis too');
    this.writes += 1;
    this.data.set(key, value);
  }
  async get(key) {
    return this.data.get(key) ?? null;
  }
  async del(key) {
    this.data.delete(key);
  }
  async *scanIterator({ MATCH }) {
    const prefix = MATCH.replace(/\*$/, '');
    yield [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
  async quit() {}
}

describe('RedisRoomStore', () => {
  test('writes go through to Redis; loadAll reads them back', async () => {
    const redis = new FakeRedis();
    const a = new RedisRoomStore(redis, { ttlMs: 1000 });
    a.set('KQVX', { code: 'KQVX', state: { phase: 'lobby' } });
    a.set('ABCD', { code: 'ABCD', state: { phase: 'vote' } });
    a.delete('ABCD');
    assert.equal(a.get('KQVX').state.phase, 'lobby', 'reads stay in memory');
    await a.flush();
    assert.deepEqual([...redis.data.keys()], ['avalon:room:KQVX']);
    const b = new RedisRoomStore(redis, { ttlMs: 1000 });
    assert.equal(await b.loadAll(), 1);
    assert.equal(b.get('KQVX').state.phase, 'lobby');
  });

  test('a failed write is logged, never thrown: the game carries on from memory', async () => {
    const broken = new FakeRedis();
    broken.set = async () => {
      throw new Error('connection lost');
    };
    const store = new RedisRoomStore(broken, { ttlMs: 1000 });
    assert.doesNotThrow(() => store.set('KQVX', { code: 'KQVX' }));
    await store.flush();
    assert.ok(store.has('KQVX'));
  });
});

describe('restart', () => {
  test('with Redis, a game in progress survives a server restart', async () => {
    const redis = new FakeRedis();
    const first = await startServer({}, { store: new RedisRoomStore(redis, { ttlMs: 60000 }) });
    const clients = await newClients(first.url, 5);
    const r = await clients[0].create(NAMES[0]);
    for (let i = 1; i < 5; i++) await clients[i].join(r.code, NAMES[i]);
    await clients[0].req(C2S.GAME_START);
    await settle(clients);
    // Play into the first vote.
    for (let i = 0; i < 50 && clients[0].view.phase !== 'vote'; i++) await step(clients);
    assert.equal(clients[0].view.phase, 'vote');
    await clients[1].req(C2S.VOTE_CAST, { approve: true });
    await settle(clients);
    const before = clients.map((c) => ({ id: c.id, token: c.token, role: c.view.game.me.role }));

    // The server goes away (a redeploy, a crash, the free plan sleeping)…
    for (const c of clients) c.close();
    await first.close();

    // …and a new one starts from what Redis kept.
    const store = new RedisRoomStore(redis, { ttlMs: 60000 });
    assert.equal(await store.loadAll(), 1);
    const second = await startServer({}, { store });
    const back = await newClients(second.url, 5);
    for (const [i, c] of back.entries()) {
      const res = await c.resume(r.code, before[i].token);
      assert.ok(res.ok, JSON.stringify(res));
      assert.equal(res.playerId, before[i].id, 'same seat');
    }
    await settle(back);
    const v = back[0].view;
    assert.equal(v.phase, 'vote', 'same phase');
    assert.deepEqual(v.game.proposal.voted, [before[1].id], 'the vote cast before the restart still counts');
    for (const [i, c] of back.entries()) assert.equal(c.view.game.me.role, before[i].role, 'same roles');
    assert.ok(v.players.every((p) => p.connected), 'everyone is back');

    // And the game plays on to the end.
    for (let i = 0; i < 2000 && back[0].view.phase !== 'game_over'; i++) {
      if (!(await step(back))) break;
    }
    assert.equal(back[0].view.phase, 'game_over');
    for (const c of back) c.close();
    await second.close();
  });

  test('after a restart, seats are held for players who never come back', async () => {
    const redis = new FakeRedis();
    const first = await startServer({}, { store: new RedisRoomStore(redis, { ttlMs: 60000 }) });
    const clients = await newClients(first.url, 5);
    const r = await clients[0].create(NAMES[0]);
    for (let i = 1; i < 5; i++) await clients[i].join(r.code, NAMES[i]);
    await clients[0].req(C2S.GAME_START);
    await settle(clients);
    for (const c of clients) c.close();
    await first.close();
    const store = new RedisRoomStore(redis, { ttlMs: 60000 });
    await store.loadAll();
    const second = await startServer({ seatHoldMs: 40 }, { store });
    const [late] = await newClients(second.url, 1);
    // Nobody returns within the seat hold: mid-game, that closes the room.
    await new Promise((res) => setTimeout(res, 120));
    assert.equal((await late.resume(r.code, clients[0].token)).code, 'code.notFound');
    late.close();
    await second.close();
  });
});

test('ALLOWED_ORIGIN tolerates a trailing slash and several origins', () => {
  const saved = process.env.ALLOWED_ORIGIN;
  process.env.ALLOWED_ORIGIN = 'https://avalon.onrender.com/, https://avalon.example.org';
  try {
    assert.deepEqual(loadConfig().allowedOrigins, ['https://avalon.onrender.com', 'https://avalon.example.org']);
  } finally {
    if (saved === undefined) delete process.env.ALLOWED_ORIGIN;
    else process.env.ALLOWED_ORIGIN = saved;
  }
});
