// Socket integration tests: the real server in-process, fake phones over
// real WebSockets. Each fake client acts only on its own view.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { C2S, CODE_PATTERN, TOKEN_PATTERN } from '../shared/protocol.js';
import { NAME_MAX, ROLE_IDS } from '../src/engine/index.js';
import { NAME_MAX as PROTOCOL_NAME_MAX } from '../shared/protocol.js';
import { startServer, Client, newClients, settle, step, closeAll } from './socketClient.js';

after(closeAll);
import { NAMES } from './helpers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What a phone receives must never name another player's role before game
// over (the engine's leak tests check this exhaustively; this checks the wire).
function assertCleanWire(client) {
  for (const v of client.views) {
    if (!v.game || v.phase === 'game_over') continue;
    const { config, setup, lastGame, ...rest } = v;
    const json = JSON.stringify(rest);
    for (const r of ROLE_IDS) {
      const n = json.split(`"${r}"`).length - 1;
      assert.equal(n, r === v.game.me.role ? 1 : 0, `${client.id} saw ${r} in ${v.phase}`);
    }
  }
}

// Create a room with n players; returns { server, clients } with clients[0] as host.
async function room(n, overrides = {}) {
  const server = await startServer(overrides);
  const clients = await newClients(server.url, n);
  const r = await clients[0].create(NAMES[0]);
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < n; i++) assert.ok((await clients[i].join(r.code, NAMES[i])).ok);
  await settle(clients);
  return { server, clients, code: r.code };
}

async function finish(server, clients) {
  for (const c of clients) c.close();
  await server.close();
}

async function playUntil(clients, pred, maxSteps = 2000) {
  await settle(clients);
  for (let i = 0; i < maxSteps; i++) {
    const live = clients.find((c) => c.socket.connected && c.view);
    if (pred(live.view)) return live.view;
    if (!(await step(clients))) throw new Error(`stuck in ${live.view.phase}`);
  }
  throw new Error('too many steps');
}

describe('http', () => {
  test('GET /healthz returns 200 with a tiny JSON body', async () => {
    const server = await startServer();
    const res = await fetch(`${server.url}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.rooms, 'number');
    await server.close();
  });

  test('security headers and CSP are set', async () => {
    const server = await startServer({ serveClient: true });
    const res = await fetch(`${server.url}/`);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /fonts\.googleapis\.com/);
    assert.match(csp, /fonts\.gstatic\.com/);
    assert.match(csp, /img-src 'self' data:/);
    assert.equal(res.headers.get('x-powered-by'), null);
    await server.close();
  });

  test('protocol and engine agree on the name limit', () => {
    assert.equal(NAME_MAX, PROTOCOL_NAME_MAX);
  });
});

describe('rooms', () => {
  test('create gives a 4-letter code, a session token and a lobby view', async () => {
    const server = await startServer();
    const [c] = await newClients(server.url, 1);
    assert.ok(c.hello.seatHoldMs > 0);
    assert.ok(Math.abs(c.hello.serverNow - Date.now()) < 5000);
    const r = await c.create('  Rowan ');
    assert.match(r.code, CODE_PATTERN);
    assert.match(r.token, TOKEN_PATTERN);
    const v = await c.until((x) => x.phase === 'lobby');
    assert.equal(v.hostId, r.playerId);
    assert.deepEqual(v.players.map((p) => p.name), ['Rowan']);
    await finish(server, [c]);
  });

  test('join errors use the copy deck', async () => {
    const { server, clients, code } = await room(2);
    const [x] = await newClients(server.url, 1);
    assert.deepEqual(await x.join('QXTR', 'Kofi'), { ok: false, code: 'code.notFound', params: { code: 'QXTR' } });
    assert.equal((await x.join(code, 'ilse')).code, 'name.taken');
    assert.equal((await x.join(code, '')).code, 'name.empty');
    assert.equal((await x.join(code, 'A'.repeat(17))).code, 'name.tooLong');
    assert.equal((await x.req(C2S.ROOM_JOIN, { code: 'KQ', name: 'Kofi' })).code, 'err.badPayload');
    assert.equal((await x.req(C2S.ROOM_JOIN, { code: 'IOIO', name: 'Kofi' })).code, 'err.badPayload', 'I and O are never in codes');
    assert.ok((await x.join(code.toLowerCase(), 'Kofi')).ok, 'codes are case-insensitive');
    await finish(server, [...clients, x]);
  });

  test('room full at 10; game already started', async () => {
    const { server, clients, code } = await room(10);
    const [x] = await newClients(server.url, 1);
    assert.deepEqual(await x.join(code, 'Late'), { ok: false, code: 'code.full', params: { code, n: 10 } });
    await finish(server, [...clients, x]);

    const r2 = await room(5);
    assert.ok((await r2.clients[0].req(C2S.GAME_START)).ok);
    const [y] = await newClients(r2.server.url, 1);
    assert.equal((await y.join(r2.code, 'Late')).code, 'code.started');
    await finish(r2.server, [...r2.clients, y]);
  });

  test('room:check finds the room and knows if this phone has a seat', async () => {
    const { server, clients, code } = await room(3);
    const [x] = await newClients(server.url, 1);
    assert.deepEqual(await x.req(C2S.ROOM_CHECK, { code: 'QXTR' }), { ok: true, exists: false, code: 'QXTR' });
    const r = await x.req(C2S.ROOM_CHECK, { code, token: clients[1].token });
    assert.deepEqual(r, { ok: true, exists: true, code, hostName: 'Rowan', players: 3, started: false, full: false, seated: true });
    assert.equal((await x.req(C2S.ROOM_CHECK, { code })).seated, false);
    await finish(server, [...clients, x]);
  });

  test('intents need a seat; payloads are checked; the actor comes from the session', async () => {
    const { server, clients } = await room(5);
    const [x] = await newClients(server.url, 1);
    assert.equal((await x.req(C2S.GAME_START)).code, 'err.noSession');
    assert.equal((await clients[0].req(C2S.VOTE_CAST, { approve: 'yes' })).code, 'err.badPayload');
    assert.equal((await clients[0].req(C2S.LOBBY_SET_CONFIG, { config: { evil: true } })).code, 'err.badPayload');
    // A guest can't start the game by claiming to be the host.
    const r = await clients[1].req(C2S.GAME_START, { actor: clients[0].id });
    assert.equal(r.code, 'err.notHost');
    await finish(server, [...clients, x]);
  });

  test('host settings reach every player', async () => {
    const { server, clients } = await room(7);
    assert.ok((await clients[0].req(C2S.LOBBY_SET_CONFIG, { config: { percival: true, morgana: true, lady: true } })).ok);
    const v = await clients[4].until((x) => x.config.lady);
    assert.deepEqual(v.setup.goodRoles, ['merlin', 'percival']);
    assert.equal((await clients[2].req(C2S.LOBBY_SET_CONFIG, { config: { lady: false } })).code, 'err.notHost');
    await finish(server, clients);
  });
});

describe('full games', () => {
  test('5 players, start to finish, with a mid-game disconnect and reconnect', async () => {
    const { server, clients, code } = await room(5);
    assert.ok((await clients[0].req(C2S.GAME_START)).ok);

    // Play into Quest 2, then drop a player who isn't the current leader.
    await playUntil(clients, (v) => v.phase === 'propose' && v.game.questIndex === 1);
    const leader = clients[0].view.game.proposal.leader;
    const idx = clients.findIndex((c) => c.id !== leader && c !== clients[0]);
    const gone = clients[idx];
    const role = gone.view.game.me.role;
    gone.close();
    await clients[0].until((v) => v.players.find((p) => p.id === gone.id).connected === false);
    assert.ok(clients[0].notices.some((n) => n.key === 'notice.away'));

    // Play continues until the missing player is needed (the vote), then waits.
    const others = clients.filter((c) => c !== gone);
    await playUntil(others, (v) => v.phase === 'vote' && v.game.proposal.voted.length === 4);
    assert.equal(await step(others), false, 'nobody else can act: the table waits');
    assert.deepEqual(clients[0].view.game.waitingOn, [gone.id]);

    // Same phone comes back with its token: same seat, same secret role.
    const back = new Client(server.url);
    await back.connected();
    const r = await back.resume(code, gone.token);
    assert.deepEqual(r, { ok: true, code, playerId: gone.id });
    const v = await back.until((x) => x.game);
    assert.equal(v.game.me.role, role);
    await clients[0].until((x) => x.players.find((p) => p.id === gone.id).connected);
    clients[idx] = back;

    const end = await playUntil(clients, (x) => x.phase === 'game_over');
    assert.ok(end.game.winner);
    assert.equal(Object.keys(end.game.roles).length, 5, 'every role is revealed at game over');
    for (const c of clients) assertCleanWire(c);

    // Play again keeps the room and its players.
    assert.ok((await clients[3].req(C2S.GAME_REMATCH)).ok);
    const lobbyView = await clients[0].until((x) => x.phase === 'lobby');
    assert.equal(lobbyView.players.length, 5);
    assert.ok(lobbyView.lastGame.winReason);
    await finish(server, clients);
  });

  test('10 players with every optional role and the Lady, start to finish', async () => {
    const { server, clients } = await room(10);
    await clients[0].req(C2S.LOBBY_SET_CONFIG, { config: { percival: true, morgana: true, mordred: true, oberon: true, lady: true } });
    assert.ok((await clients[0].req(C2S.GAME_START)).ok);
    let sawLady = false;
    await playUntil(clients, (v) => {
      sawLady ||= v.phase === 'lady';
      return v.phase === 'game_over';
    });
    assert.ok(sawLady, 'the Lady was used');
    // The Lady's results reached only their holders.
    const results = clients.flatMap((c) => c.view.game.me.ladyResults.map(() => c.id));
    assert.ok(results.length >= 1);
    for (const c of clients) assertCleanWire(c);
    await finish(server, clients);
  });
});

describe('connections and timers', () => {
  test('refresh in the lobby: joining again with the same token takes the same seat', async () => {
    const { server, clients, code } = await room(3);
    const old = clients[1];
    old.close();
    const again = new Client(server.url);
    await again.connected();
    again.token = old.token;
    const r = await again.join(code, 'Someone else');
    assert.deepEqual([r.ok, r.resumed, r.playerId], [true, true, old.id]);
    const v = await again.until((x) => x.players.every((p) => p.connected));
    assert.equal(v.players.length, 3);
    await finish(server, [clients[0], clients[2], again]);
  });

  test('resuming twice on the same connection does not flicker the seat', async () => {
    const { server, clients, code } = await room(3);
    const before = clients[0].notices.length;
    assert.ok((await clients[1].resume(code, clients[1].token)).ok);
    assert.ok((await clients[1].resume(code, clients[1].token)).ok);
    await settle(clients);
    assert.equal(clients[0].notices.length, before);
    await finish(server, clients);
  });

  test('host away past the grace period: the longest-seated connected player becomes host', async () => {
    const { server, clients } = await room(4, { hostGraceMs: 60 });
    clients[0].close();
    const v = await clients[1].until((x) => x.hostId === clients[1].id, 1000);
    assert.equal(v.hostId, clients[1].id);
    assert.ok(clients[2].notices.some((n) => n.key === 'notice.hostChanged'));
    await finish(server, clients);
  });

  test('host hands the crown on', async () => {
    const { server, clients } = await room(3);
    assert.ok((await clients[0].req(C2S.HOST_TRANSFER, { playerId: clients[2].id })).ok);
    await clients[1].until((x) => x.hostId === clients[2].id);
    await finish(server, clients);
  });

  test('a seat expiring mid-game closes the room; resuming then finds it gone', async () => {
    const { server, clients, code } = await room(5, { seatHoldMs: 80 });
    await clients[0].req(C2S.GAME_START);
    const gone = clients[4];
    gone.close();
    await sleep(200);
    assert.deepEqual(clients[0].closed, { reason: 'seatExpired', name: 'Mei' });
    const back = new Client(server.url);
    await back.connected();
    assert.equal((await back.resume(code, gone.token)).code, 'code.notFound');
    await finish(server, [...clients, back]);
  });

  test('a seat expiring in the lobby just frees it', async () => {
    const { server, clients } = await room(3, { seatHoldMs: 50 });
    clients[2].close();
    const v = await clients[0].until((x) => x.players.length === 2, 1000);
    assert.equal(v.players.length, 2);
    await finish(server, clients);
  });

  test('reveals move on after the fallback even if nobody taps Continue', async () => {
    const { server, clients } = await room(5, { revealFallbackMs: 80 });
    await clients[0].req(C2S.GAME_START);
    await playUntil(clients, (v) => v.phase === 'vote_reveal');
    const v = await clients[0].until((x) => x.phase === 'propose', 1000);
    assert.equal(v.game.proposals.length, 1);
    await finish(server, clients);
  });

  test("leader's live picks reach the table, throttled", async () => {
    const { server, clients } = await room(5, { picksThrottleMs: 100 });
    await clients[0].req(C2S.GAME_START);
    await playUntil(clients, (v) => v.phase === 'propose');
    const leader = clients.find((c) => c.view.game.proposal.leader === c.id);
    const watcher = clients.find((c) => c !== leader);
    const before = watcher.views.length;
    const seats = leader.view.game.seats;
    for (let i = 1; i <= 5; i++) assert.ok((await leader.req(C2S.TEAM_SELECT, { team: seats.slice(0, i) })).ok);
    const v = await watcher.until((x) => x.game.proposal.picks.length === 5, 1000);
    assert.deepEqual(v.game.proposal.picks, seats.slice(0, 5));
    assert.ok(watcher.views.length - before < 5, 'picks were batched');
    await finish(server, clients);
  });

  test('idle rooms are closed', async () => {
    const { server, clients } = await room(2, { roomIdleMs: 50, sweepMs: 30 });
    await sleep(200);
    assert.deepEqual(clients[0].closed, { reason: 'idle' });
    assert.equal(server.app.store.size, 0);
    await finish(server, clients);
  });

  test('leaving: lobby frees the seat, mid-game holds it', async () => {
    const { server, clients } = await room(5);
    assert.ok((await clients[4].req(C2S.ROOM_LEAVE)).ok);
    await clients[0].until((x) => x.players.length === 4);
    const [late] = await newClients(server.url, 1);
    await late.join(clients[0].code, 'Wen');
    await clients[0].req(C2S.GAME_START);
    assert.ok((await clients[3].req(C2S.ROOM_LEAVE)).ok);
    const v = await clients[0].until((x) => x.players.find((p) => p.id === clients[3].id)?.connected === false);
    assert.equal(v.players.length, 5, 'mid-game the seat stays');
    await finish(server, [...clients, late]);
  });

  test('when everyone leaves after game over the room is deleted', async () => {
    const { server, clients } = await room(5);
    await clients[0].req(C2S.GAME_START);
    await playUntil(clients, (v) => v.phase === 'game_over');
    for (const c of clients) assert.ok((await c.req(C2S.ROOM_LEAVE)).ok);
    assert.equal(server.app.store.size, 0);
    await finish(server, clients);
  });

  test('host ends the game for everyone', async () => {
    const { server, clients } = await room(5);
    await clients[0].req(C2S.GAME_START);
    assert.equal((await clients[1].req(C2S.GAME_END)).code, 'err.notHost');
    assert.ok((await clients[0].req(C2S.GAME_END)).ok);
    await sleep(30);
    for (const c of clients) assert.deepEqual(c.closed, { reason: 'hostEnded', name: 'Rowan' });
    await finish(server, clients);
  });
});

describe('kicking', () => {
  test('host kicks in the lobby; a blocked player cannot rejoin by token or name', async () => {
    const { server, clients, code } = await room(4);
    const jude = clients[3];
    assert.equal((await clients[1].req(C2S.LOBBY_KICK, { playerId: jude.id })).code, 'err.notHost');
    assert.ok((await clients[0].req(C2S.LOBBY_KICK, { playerId: jude.id, block: true })).ok);
    await sleep(30);
    assert.deepEqual(jude.closed, { reason: 'kicked' });
    await clients[0].until((x) => x.players.length === 3);
    assert.equal((await jude.join(code, 'Jude 2')).code, 'code.blocked', 'same phone');
    const [other] = await newClients(server.url, 1);
    assert.equal((await other.join(code, 'kofi')).code, 'code.blocked', 'same name');
    assert.ok((await other.join(code, 'Wen')).ok);
    await finish(server, [...clients, other]);
  });

  test('without block, a kicked player may rejoin', async () => {
    const { server, clients, code } = await room(3);
    await clients[0].req(C2S.LOBBY_KICK, { playerId: clients[2].id });
    await sleep(30);
    const r = await clients[2].join(code, 'Tomas');
    assert.deepEqual([r.ok, r.resumed], [true, false]);
    await finish(server, clients);
  });
});

describe('abuse', () => {
  test('rate limiting', async () => {
    const server = await startServer({ rateLimitBurst: 5, rateLimitPerSecond: 1 });
    const [c] = await newClients(server.url, 1);
    const replies = await Promise.all(Array.from({ length: 12 }, () => c.req(C2S.ROOM_CHECK, { code: 'ABCD' })));
    assert.equal(replies.filter((r) => r.code === 'err.rateLimited').length, 7);
    await finish(server, [c]);
  });

  test('the number of open rooms is capped', async () => {
    const server = await startServer({ maxRooms: 2 });
    const cs = await newClients(server.url, 3);
    assert.ok((await cs[0].create('A')).ok);
    assert.ok((await cs[1].create('B')).ok);
    assert.equal((await cs[2].create('C')).code, 'err.busy');
    await finish(server, cs);
  });

  test('oversized payloads drop the connection', async () => {
    const server = await startServer({ maxPayloadBytes: 1024 });
    const [c] = await newClients(server.url, 1);
    const dropped = new Promise((resolve) => c.socket.on('disconnect', resolve));
    c.socket.emit(C2S.ROOM_CREATE, { name: 'x'.repeat(5000) });
    await dropped;
    await server.close();
  });

  test('connections from other origins are refused', async () => {
    const server = await startServer({ allowedOrigins: ['https://avalon.example'] });
    const bad = connect(server.url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { origin: 'https://evil.example' } });
    await new Promise((resolve) => bad.once('connect_error', resolve));
    const good = new Client(server.url, { extraHeaders: { origin: 'https://avalon.example' } });
    await good.connected();
    bad.close();
    await finish(server, [good]);
  });

  test('a crash while handling one room does not affect another', async () => {
    const a = await room(2);
    const manager = a.server.app.manager;
    const original = manager.intent.bind(manager);
    manager.intent = (connId, event, payload) => {
      if (manager.roomOf(connId) === a.code) throw new Error('boom');
      return original(connId, event, payload);
    };
    assert.equal((await a.clients[0].req(C2S.GAME_START)).code, 'err.server');
    const [b1, b2] = await newClients(a.server.url, 2);
    const r = await b1.create('Other');
    await b2.join(r.code, 'Room');
    assert.ok((await b1.req(C2S.LOBBY_SET_CONFIG, { config: { lady: true } })).ok);
    await finish(a.server, [...a.clients, b1, b2]);
  });
});
