// Test helpers for the socket integration tests: start the server in-process
// and drive fake clients that behave like phones (each only knows its own view).

import { io as connect } from 'socket.io-client';
import { createServer } from '../server/app.js';
import { setSilent } from '../server/log.js';
import { C2S, S2C } from '../shared/protocol.js';

setSilent(true);

// Everything opened by a test file, so an after() hook can close it all even
// when a test fails halfway (otherwise open sockets keep the process alive).
const openServers = new Set();
const openClients = new Set();
export async function closeAll() {
  for (const c of openClients) c.socket.disconnect();
  openClients.clear();
  await Promise.all([...openServers].map((a) => a.close()));
  openServers.clear();
}

// Bots move far faster than people, so test servers get a high rate limit
// unless a test sets its own.
export async function startServer(overrides = {}, options = {}) {
  const app = createServer({ serveClient: false, rateLimitPerSecond: 10000, rateLimitBurst: 10000, ...overrides }, options);
  const port = await app.listen(0, '127.0.0.1');
  openServers.add(app);
  return {
    app,
    url: `http://127.0.0.1:${port}`,
    close: () => {
      openServers.delete(app);
      return app.close();
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Client {
  constructor(url, opts = {}) {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, ...opts });
    openClients.add(this);
    this.view = null;
    this.views = [];
    this.notices = [];
    this.closed = null;
    this.hello = null;
    this.lastUpdate = 0;
    this.token = null;
    this.code = null;
    this.socket.on(S2C.HELLO, (h) => (this.hello = h));
    this.socket.on(S2C.STATE, (v) => {
      this.view = v;
      this.views.push(v);
      this.lastUpdate = Date.now();
    });
    this.socket.on(S2C.NOTICE, (n) => this.notices.push(n));
    this.socket.on(S2C.ROOM_CLOSED, (c) => (this.closed = c));
  }

  connected() {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve(this);
      this.socket.once('connect', () => resolve(this));
      this.socket.once('connect_error', reject);
    });
  }

  req(event, payload) {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  async create(name) {
    const r = await this.req(C2S.ROOM_CREATE, { name, token: this.token ?? undefined });
    if (r.ok) Object.assign(this, { token: r.token, code: r.code, id: r.playerId });
    return r;
  }

  async join(code, name) {
    const r = await this.req(C2S.ROOM_JOIN, { code, name, token: this.token ?? undefined });
    if (r.ok) Object.assign(this, { token: r.token, code: r.code, id: r.playerId });
    return r;
  }

  async resume(code, token) {
    const r = await this.req(C2S.SESSION_RESUME, { code, token });
    if (r.ok) Object.assign(this, { token, code: r.code, id: r.playerId });
    return r;
  }

  // Wait until this client's view satisfies `pred`.
  async until(pred, ms = 2000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.view && pred(this.view)) return this.view;
      await sleep(5);
    }
    throw new Error(`timed out waiting; last phase=${this.view?.phase}`);
  }

  close() {
    this.socket.disconnect();
  }
}

export async function newClients(url, n) {
  return Promise.all(Array.from({ length: n }, () => new Client(url).connected()));
}

// Wait until no client has received a state update for `quiet` ms.
export async function settle(clients, quiet = 25) {
  for (;;) {
    const last = Math.max(...clients.map((c) => c.lastUpdate));
    if (Date.now() - last >= quiet) return;
    await sleep(5);
  }
}

// One move a player would make from their own view, or null if it isn't
// their turn. This is all a bot knows: exactly what a phone would show.
// Without `random` the bots are predictable (for tests); with it (the demo)
// they vote, sabotage and guess more like people.
export function nextMove(view, random = null) {
  const g = view.game;
  const me = view.you;
  if (!g) return null;
  switch (view.phase) {
    case 'night':
      return g.ready.includes(me) ? null : [C2S.NIGHT_ACK, {}];
    case 'propose': {
      if (g.proposal.leader !== me) return null;
      const size = g.quests[g.questIndex].size;
      return [C2S.TEAM_PROPOSE, { team: [me, ...g.seats.filter((id) => id !== me)].slice(0, size) }];
    }
    case 'vote':
      // Reject the first proposal of each quest, approve the rest, so games
      // see both outcomes without hitting five rejections.
      if (g.proposal.voted.includes(me)) return null;
      if (random) return [C2S.VOTE_CAST, { approve: g.rejects === 4 || g.proposal.team.includes(me) || random() < 0.5 }];
      return [C2S.VOTE_CAST, { approve: g.proposals.filter((p) => p.quest === g.questIndex).length > 0 }];
    case 'vote_reveal':
    case 'quest_result':
      return g.continued.includes(me) ? null : [C2S.REVEAL_CONTINUE, {}];
    case 'quest':
      if (!g.questPlay.team.includes(me) || g.questPlay.played.includes(me)) return null;
      if (random) return [C2S.QUEST_PLAY, { card: g.me.team === 'evil' && random() < 0.6 ? 'fail' : 'success' }];
      return [C2S.QUEST_PLAY, { card: g.me.team === 'evil' && g.questIndex % 2 === 1 ? 'fail' : 'success' }];
    case 'lady':
      if (g.lady.holder !== me) return null;
      if (g.lady.target) return [C2S.LADY_PASS, {}];
      return [C2S.LADY_INSPECT, { playerId: g.seats.find((id) => id !== me && !g.lady.pastHolders.includes(id)) }];
    case 'assassination':
      if (g.assassinId !== me) return null;
      const good = g.seats.filter((id) => !g.evilIds.includes(id));
      return [C2S.ASSASSIN_GUESS, { playerId: random ? good[Math.floor(random() * good.length)] : good[0] }];
    default:
      return null;
  }
}

// Make one move for the first client whose turn it is. Returns false if nobody
// can move. Every accepted move is broadcast to the whole room, so afterwards
// we wait until every connected client has received a newer view.
export async function step(clients, random = null) {
  for (const c of clients) {
    if (!c.socket.connected || !c.view) continue;
    const move = nextMove(c.view, random);
    if (!move) continue;
    const live = clients.filter((x) => x.socket.connected);
    const before = live.map((x) => x.views.length);
    const r = await c.req(...move);
    if (!r.ok) throw new Error(`${move[0]} refused: ${r.code}`);
    const end = Date.now() + 2000;
    while (!live.every((x, i) => x.views.length > before[i] || x.closed)) {
      if (Date.now() > end) throw new Error('broadcast never arrived');
      await sleep(1);
    }
    return true;
  }
  return false;
}
