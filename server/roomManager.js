// Rooms, seats, session tokens, connections and timers.
//
// The RoomManager sits between the sockets and the pure engine. It knows
// nothing about Socket.IO: connections are opaque ids, and everything sent to
// a client goes through `transport.send(connId, event, data)`. That keeps it
// easy to test and keeps all game rules in the engine.
//
// Hidden information: the only game data ever sent is viewFor(state, playerId)
// for the player on that connection. Session tokens are stored hashed and are
// never sent to anyone but their owner (once, when issued).
//
// Bots: the host can seat bots in the lobby. A bot is an ordinary player with
// no connection; this class plays it on timers. Each move is decided by
// botBrain.js from viewFor(state, botId), the same view a phone in that seat
// would get, and sent through the engine like anyone's intent.

import crypto from 'node:crypto';
import { createRoom, reduce, viewFor, cleanName, MAX_PLAYERS } from '../src/engine/index.js';
import { C2S, S2C, SERVER_ERRORS, CODE_ALPHABET, CODE_LENGTH } from '../shared/protocol.js';
import { log } from './log.js';
import { botDuty, botMove } from './botBrain.js';

const fail = (code, params = {}) => ({ ok: false, code, params });

// Client intents that map one-to-one onto engine actions.
const INTENT_ACTIONS = {
  [C2S.LOBBY_SET_CONFIG]: (p) => ({ type: 'SET_CONFIG', config: p.config }),
  [C2S.HOST_TRANSFER]: (p) => ({ type: 'TRANSFER_HOST', to: p.playerId }),
  [C2S.GAME_START]: () => ({ type: 'START' }),
  [C2S.NIGHT_ACK]: () => ({ type: 'NIGHT_ACK' }),
  [C2S.TEAM_SELECT]: (p) => ({ type: 'SELECT', team: p.team }),
  [C2S.TEAM_PROPOSE]: (p) => ({ type: 'PROPOSE', team: p.team }),
  [C2S.VOTE_CAST]: (p) => ({ type: 'VOTE', approve: p.approve }),
  [C2S.REVEAL_CONTINUE]: () => ({ type: 'CONTINUE' }),
  [C2S.QUEST_PLAY]: (p) => ({ type: 'PLAY', card: p.card }),
  [C2S.LADY_INSPECT]: (p) => ({ type: 'LADY_INSPECT', target: p.playerId }),
  [C2S.LADY_PASS]: () => ({ type: 'LADY_PASS' }),
  [C2S.ASSASSIN_GUESS]: (p) => ({ type: 'GUESS', target: p.playerId }),
  [C2S.GAME_REMATCH]: () => ({ type: 'REMATCH' }),
  [C2S.GAME_END]: () => ({ type: 'END' }),
};

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('base64url');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const newPlayerId = () => crypto.randomBytes(6).toString('base64url');

// Bots get knights' and ladies' names from the old tales (public domain).
const BOT_NAMES = ['Gawain', 'Tristan', 'Elaine', 'Bedivere', 'Galahad', 'Enid', 'Lynette', 'Gareth', 'Isolde', 'Lamorak', 'Bors', 'Kay', 'Dagonet', 'Ector'];

// How long a bot "thinks" before each kind of move, in ms [min, max], scaled
// by config.botSpeed (tests set 0). Reveals wait long enough for the
// animations; the Assassin takes a dramatic pause.
const BOT_DELAYS = {
  night: [1500, 4000],
  lead: [2000, 3500], // the first pick
  pick: [600, 1100], // each further pick, then sending the team
  vote: [1500, 4500],
  continue: [3500, 5500],
  quest: [1500, 3500],
  lady: [2500, 4000],
  guess: [4000, 7000],
};

// Bots' small choices (who to pick, a bluff now and then) need no secrecy.
const botRng = { next: () => Math.random(), int: (n) => Math.floor(Math.random() * n) };

export class RoomManager {
  constructor({ config, store, transport, now = () => Date.now() }) {
    this.config = config;
    this.store = store;
    this.transport = transport;
    this.now = now;
    this.conns = new Map(); // connId -> { code, playerId }
    this.timers = new Map(); // code -> { reveal, hostGrace, picks, seats: Map(playerId -> timer) }
    this.lastBroadcast = new Map(); // code -> time of the last state broadcast
    this.sweeper = setInterval(() => this.sweepIdle(), config.sweepMs);
    this.sweeper.unref?.();
  }

  // ---------- entry points (called by the socket layer) ----------

  handle(connId, event, payload) {
    switch (event) {
      case C2S.ROOM_CREATE: return this.create(connId, payload);
      case C2S.ROOM_JOIN: return this.join(connId, payload);
      case C2S.ROOM_CHECK: return this.check(payload);
      case C2S.SESSION_RESUME: return this.resume(connId, payload);
      case C2S.ROOM_LEAVE: return this.leave(connId);
      case C2S.LOBBY_KICK: return this.kick(connId, payload);
      case C2S.LOBBY_ADD_BOT: return this.addBot(connId);
      default: return this.intent(connId, event, payload);
    }
  }

  create(connId, { name, token }) {
    if (this.store.size >= this.config.maxRooms) return fail(SERVER_ERRORS.BUSY);
    this.detach(connId);
    const code = this.newCode();
    const record = {
      code,
      state: createRoom({ code, seed: crypto.randomInt(2 ** 31) }),
      sessions: {}, // sha256(token) -> playerId
      blocked: { tokens: [], names: [] },
      lastActivity: this.now(),
    };
    const playerId = newPlayerId();
    const r = reduce(record.state, { type: 'JOIN', playerId, name, now: this.now() });
    if (r.error) return fail(r.error.code, r.error.params);
    record.state = r.state;
    token = token || newToken();
    record.sessions[hashToken(token)] = playerId;
    this.store.set(code, record);
    log.info('room.create', { room: code });
    this.attach(connId, code, playerId);
    this.broadcast(code);
    return { ok: true, code, playerId, token };
  }

  join(connId, { code, name, token }) {
    const record = this.store.get(code);
    if (!record) return fail(SERVER_ERRORS.NOT_FOUND, { code });

    // Same phone coming back (refresh, closed tab, A5 "use the same phone"):
    // its token already has a seat here, so this is a resume, not a new seat.
    if (token) {
      const seated = this.seatFor(record, token);
      if (seated) {
        this.rebind(connId, code, seated);
        this.touch(record);
        this.broadcast(code);
        return { ok: true, code, playerId: seated, token, resumed: true };
      }
      if (record.blocked.tokens.includes(hashToken(token))) return fail(SERVER_ERRORS.BLOCKED, { code });
    }
    if (record.blocked.names.includes(cleanName(name).toLocaleLowerCase())) return fail(SERVER_ERRORS.BLOCKED, { code });

    const playerId = newPlayerId();
    const result = this.dispatch(code, { type: 'JOIN', playerId, name, now: this.now() });
    if (!result.ok) return result;
    token = token || newToken();
    record.sessions[hashToken(token)] = playerId;
    this.store.set(code, record);
    this.detach(connId);
    this.attach(connId, code, playerId);
    this.broadcast(code);
    return { ok: true, code, playerId, token, resumed: false };
  }

  // A read-only lookup for the join screen and "Back to room?" panel.
  check({ code, token }) {
    const record = this.store.get(code);
    if (!record) return { ok: true, exists: false, code };
    const s = record.state;
    const host = s.players.find((p) => p.id === s.hostId);
    return {
      ok: true,
      exists: true,
      code,
      hostName: host ? host.name : null,
      players: s.players.length,
      started: s.phase !== 'lobby',
      full: s.players.length >= MAX_PLAYERS,
      seated: !!(token && this.seatFor(record, token)),
    };
  }

  resume(connId, { code, token }) {
    const record = this.store.get(code);
    if (!record) return fail(SERVER_ERRORS.NOT_FOUND, { code });
    const playerId = this.seatFor(record, token);
    if (!playerId) return fail(SERVER_ERRORS.SEAT_GONE, { code });
    this.rebind(connId, code, playerId);
    this.touch(record);
    this.broadcast(code);
    return { ok: true, code, playerId };
  }

  // In the lobby or at game over, leaving frees the seat. Mid-game the seat
  // is held like any disconnect (G5), so the player can come back.
  leave(connId) {
    const conn = this.conns.get(connId);
    if (!conn) return fail(SERVER_ERRORS.NO_SESSION);
    const { code, playerId } = conn;
    const record = this.store.get(code);
    const phase = record.state.phase;
    if (phase === 'lobby' || phase === 'game_over') {
      for (const id of this.connsOf(code, playerId)) this.conns.delete(id);
      this.forgetSessions(record, playerId);
      this.clearSeatTimer(code, playerId);
      const result = this.dispatch(code, { type: 'LEAVE', actor: playerId });
      if (result.ok && this.store.has(code)) this.broadcast(code);
      return { ok: true };
    }
    this.detach(connId);
    return { ok: true };
  }

  kick(connId, { playerId: target, block }) {
    const conn = this.conns.get(connId);
    if (!conn) return fail(SERVER_ERRORS.NO_SESSION);
    const record = this.store.get(conn.code);
    const victim = record.state.players.find((p) => p.id === target);
    const result = this.dispatch(conn.code, { type: 'KICK', actor: conn.playerId, target });
    if (!result.ok) return result;
    if (block && victim) {
      record.blocked.names.push(victim.name.toLocaleLowerCase());
      for (const [hash, id] of Object.entries(record.sessions)) if (id === target) record.blocked.tokens.push(hash);
    }
    this.forgetSessions(record, target);
    this.clearSeatTimer(conn.code, target);
    for (const id of this.connsOf(conn.code, target)) {
      this.conns.delete(id);
      this.transport.send(id, S2C.ROOM_CLOSED, { reason: 'kicked' });
    }
    this.store.set(conn.code, record);
    this.broadcast(conn.code);
    return { ok: true };
  }

  // Host only, lobby only (the engine checks both): seat a bot with a free name.
  addBot(connId) {
    const conn = this.conns.get(connId);
    if (!conn) return fail(SERVER_ERRORS.NO_SESSION);
    const record = this.store.get(conn.code);
    const taken = new Set(record.state.players.map((p) => p.name.toLocaleLowerCase()));
    const free = BOT_NAMES.filter((n) => !taken.has(n.toLocaleLowerCase()));
    const name = free.length ? free[crypto.randomInt(free.length)] : `Bot ${record.state.players.length + 1}`;
    const result = this.dispatch(conn.code, { type: 'ADD_BOT', actor: conn.playerId, playerId: newPlayerId(), name, now: this.now() });
    if (!result.ok) return result;
    this.broadcast(conn.code);
    return { ok: true };
  }

  intent(connId, event, payload) {
    const toAction = INTENT_ACTIONS[event];
    if (!toAction) return fail(SERVER_ERRORS.BAD_PAYLOAD);
    const conn = this.conns.get(connId);
    if (!conn) return fail(SERVER_ERRORS.NO_SESSION);
    // The actor always comes from the connection's session, never from the payload.
    const action = { ...toAction(payload), actor: conn.playerId, now: this.now() };
    const result = this.dispatch(conn.code, action);
    if (result.ok && this.store.has(conn.code)) this.broadcast(conn.code, { throttle: action.type === 'SELECT' });
    return result.ok ? { ok: true } : result;
  }

  // The socket closed (tab slept, network dropped, page closed).
  disconnect(connId) {
    this.detach(connId);
  }

  // ---------- connections ----------

  // Point a connection at a seat. Already there: nothing to do (otherwise the
  // player would flicker away and back, and everyone would get two toasts).
  rebind(connId, code, playerId) {
    const cur = this.conns.get(connId);
    if (cur && cur.code === code && cur.playerId === playerId) return;
    this.detach(connId);
    this.attach(connId, code, playerId);
  }

  attach(connId, code, playerId) {
    const wasConnected = this.connsOf(code, playerId).length > 0;
    this.conns.set(connId, { code, playerId });
    this.clearSeatTimer(code, playerId);
    if (!wasConnected) this.dispatch(code, { type: 'SET_CONNECTED', playerId, connected: true, now: this.now() });
  }

  // Detach a connection from its seat. If it was the player's last one, the
  // player is now away: hold their seat, and start the host grace period.
  detach(connId) {
    const conn = this.conns.get(connId);
    if (!conn) return;
    this.conns.delete(connId);
    const { code, playerId } = conn;
    if (!this.store.has(code) || this.connsOf(code, playerId).length > 0) return;
    this.dispatch(code, { type: 'SET_CONNECTED', playerId, connected: false, now: this.now() });
    if (!this.store.has(code)) return;
    this.holdSeat(code, playerId);
    this.broadcast(code);
  }

  // A player is away: keep their seat for `seatHoldMs`, and if they're the
  // host, hand the crown on after `hostGraceMs`.
  holdSeat(code, playerId) {
    const t = this.timersOf(code);
    clearTimeout(t.seats.get(playerId));
    t.seats.set(playerId, this.later(this.config.seatHoldMs, () => this.seatExpired(code, playerId)));
    if (this.store.get(code).state.hostId === playerId) {
      clearTimeout(t.hostGrace);
      t.hostGrace = this.later(this.config.hostGraceMs, () => {
        if (this.dispatch(code, { type: 'HOST_AUTO' }).ok) this.broadcast(code);
      });
    }
  }

  // After a restart with a persistent store (REDIS_URL), rooms come back but
  // no phone is connected yet, and timers didn't survive. Treat everyone as
  // just gone: seats held, host grace, a reveal's fallback timer. Phones
  // reconnect on their own and resume with their tokens.
  restoreAfterRestart() {
    for (const record of [...this.store.values()]) {
      const code = record.code;
      // Bots are always "connected": they need no phone, and their timers are
      // started again below.
      for (const p of record.state.players) {
        if (p.connected && !p.bot) this.dispatch(code, { type: 'SET_CONNECTED', playerId: p.id, connected: false, now: this.now() });
      }
      if (!this.store.has(code)) continue;
      for (const p of this.store.get(code).state.players) if (!p.bot) this.holdSeat(code, p.id);
      this.driveBots(code);
      const phase = this.store.get(code).state.phase;
      if (phase === 'vote_reveal' || phase === 'quest_result') this.applyEffect(code, { type: 'phase', phase });
      log.info('room.restored', { room: code, phase });
    }
  }

  connsOf(code, playerId) {
    const out = [];
    for (const [id, c] of this.conns) if (c.code === code && (playerId === undefined || c.playerId === playerId)) out.push(id);
    return out;
  }

  // ---------- engine dispatch and effects ----------

  dispatch(code, action, { bot = false } = {}) {
    const record = this.store.get(code);
    if (!record) return fail(SERVER_ERRORS.NOT_FOUND, { code });
    const r = reduce(record.state, action);
    if (r.error) return fail(r.error.code, r.error.params);
    record.state = r.state;
    // People's actions count as activity for the idle timer; system and bot ones don't.
    if ((action.actor && !bot) || action.type === 'JOIN') this.touch(record);
    this.store.set(code, record);
    if (action.type !== 'SET_CONNECTED') log.info('room.action', { room: code, action: action.type });
    for (const effect of r.effects) this.applyEffect(code, effect);
    if (this.store.has(code)) this.driveBots(code);
    return { ok: true };
  }

  // ---------- bots ----------

  // After every change: give each bot that now owes the table a move a timer
  // for it (once per turn; a turn that passes cancels the timer).
  driveBots(code) {
    const record = this.store.get(code);
    if (!record) return;
    const t = this.timersOf(code);
    for (const p of record.state.players) {
      if (!p.bot) continue;
      const duty = botDuty(viewFor(record.state, p.id));
      const cur = t.bots.get(p.id);
      if ((cur?.duty ?? null) === duty) continue;
      clearTimeout(cur?.timer);
      if (!duty || t.botStuck.get(p.id) === duty) {
        t.bots.delete(p.id);
        continue;
      }
      const kind = duty.startsWith('lead') ? (duty.endsWith(':0') ? 'lead' : 'pick') : duty.split(':')[0];
      const [min, max] = BOT_DELAYS[kind] || [1500, 3000];
      const ms = Math.round((min + Math.random() * (max - min)) * this.config.botSpeed);
      t.bots.set(p.id, { duty, timer: this.later(ms, () => this.botAct(code, p.id, duty)) });
    }
  }

  botAct(code, botId, duty) {
    const record = this.store.get(code);
    if (!record) return;
    const t = this.timersOf(code);
    t.bots.delete(botId);
    const view = viewFor(record.state, botId);
    if (botDuty(view) !== duty) return this.driveBots(code);
    // A leader keeps its chosen team between picks.
    const turn = `${view.game.questIndex}.${view.game.proposals.length}`;
    const memo = t.botPlans.get(botId);
    const plan = memo?.turn === turn ? memo.plan : {};
    t.botPlans.set(botId, { turn, plan });
    const move = botMove(view, botRng, plan);
    if (!move) return;
    const { type, ...rest } = move;
    const result = this.dispatch(code, { type, ...rest, actor: botId, now: this.now() }, { bot: true });
    if (result.ok) {
      if (this.store.has(code)) this.broadcast(code, { throttle: type === 'SELECT' });
      return;
    }
    // A refused move is a bug in the brain. Log it, and don't retry this turn
    // forever: the table sees the bot waiting, and the host can end the game.
    log.warn('bot.refused', { room: code, action: type, error: result.code });
    t.botStuck.set(botId, duty);
    this.driveBots(code);
  }

  applyEffect(code, effect) {
    const t = this.timersOf(code);
    switch (effect.type) {
      case 'phase':
        clearTimeout(t.reveal);
        if (effect.phase === 'vote_reveal' || effect.phase === 'quest_result') {
          const seq = this.store.get(code).state.game.revealSeq;
          t.reveal = this.later(this.config.revealFallbackMs, () => {
            if (this.dispatch(code, { type: 'ADVANCE', revealSeq: seq }).ok) this.broadcast(code);
          });
        }
        break;
      case 'notice':
        for (const id of this.connsOf(code)) this.transport.send(id, S2C.NOTICE, { key: effect.key, params: effect.params });
        break;
      case 'empty':
        this.closeRoom(code, 'empty');
        break;
      default:
        break;
    }
  }

  // Send each connection in the room its own view. Live team picks are
  // throttled so a leader tapping quickly doesn't flood the table.
  broadcast(code, { throttle = false } = {}) {
    const t = this.timersOf(code);
    if (throttle) {
      const since = this.now() - (this.lastBroadcast.get(code) || 0);
      if (since < this.config.picksThrottleMs) {
        if (!t.picks) t.picks = this.later(this.config.picksThrottleMs - since, () => {
          t.picks = null;
          this.broadcast(code);
        });
        return;
      }
    }
    clearTimeout(t.picks);
    t.picks = null;
    const record = this.store.get(code);
    if (!record) return;
    this.lastBroadcast.set(code, this.now());
    for (const id of this.connsOf(code)) {
      const view = viewFor(record.state, this.conns.get(id).playerId);
      if (view) this.transport.send(id, S2C.STATE, view);
    }
  }

  // ---------- seats, hosts, closing ----------

  seatExpired(code, playerId) {
    const record = this.store.get(code);
    if (!record) return;
    this.timersOf(code).seats.delete(playerId);
    const player = record.state.players.find((p) => p.id === playerId);
    if (!player || player.connected) return;
    const phase = record.state.phase;
    if (phase === 'lobby' || phase === 'game_over') {
      this.forgetSessions(record, playerId);
      if (this.dispatch(code, { type: 'LEAVE', actor: playerId }).ok && this.store.has(code)) this.broadcast(code);
    } else {
      // Mid-game the table can't go on without them (G5): close the room.
      this.closeRoom(code, 'seatExpired', { name: player.name });
    }
  }

  closeRoom(code, reason, extra = {}) {
    if (!this.store.has(code)) return;
    for (const id of this.connsOf(code)) {
      this.transport.send(id, S2C.ROOM_CLOSED, { reason, ...extra });
      this.conns.delete(id);
    }
    const t = this.timers.get(code);
    if (t) {
      clearTimeout(t.reveal);
      clearTimeout(t.hostGrace);
      clearTimeout(t.picks);
      for (const timer of t.seats.values()) clearTimeout(timer);
      for (const b of t.bots.values()) clearTimeout(b.timer);
    }
    this.timers.delete(code);
    this.lastBroadcast.delete(code);
    this.store.delete(code);
    log.info('room.close', { room: code, reason });
  }

  sweepIdle() {
    const cutoff = this.now() - this.config.roomIdleMs;
    for (const record of [...this.store.values()]) {
      if (record.lastActivity < cutoff) this.closeRoom(record.code, 'idle');
    }
  }

  shutdown() {
    clearInterval(this.sweeper);
    for (const code of [...this.timers.keys()]) {
      const t = this.timers.get(code);
      clearTimeout(t.reveal);
      clearTimeout(t.hostGrace);
      clearTimeout(t.picks);
      for (const timer of t.seats.values()) clearTimeout(timer);
      for (const b of t.bots.values()) clearTimeout(b.timer);
    }
    this.timers.clear();
  }

  // ---------- small helpers ----------

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.store.has(code)) return code;
    }
  }

  seatFor(record, token) {
    const playerId = record.sessions[hashToken(token)];
    return playerId && record.state.players.some((p) => p.id === playerId) ? playerId : null;
  }

  forgetSessions(record, playerId) {
    for (const [hash, id] of Object.entries(record.sessions)) if (id === playerId) delete record.sessions[hash];
  }

  touch(record) {
    record.lastActivity = this.now();
  }

  timersOf(code) {
    if (!this.timers.has(code)) {
      // bots: playerId -> { duty, timer }; botPlans: a leader bot's chosen team;
      // botStuck: a turn a bot's move was refused on (not retried).
      this.timers.set(code, { reveal: null, hostGrace: null, picks: null, seats: new Map(), bots: new Map(), botPlans: new Map(), botStuck: new Map() });
    }
    return this.timers.get(code);
  }

  clearSeatTimer(code, playerId) {
    const t = this.timers.get(code);
    if (!t) return;
    clearTimeout(t.seats.get(playerId));
    t.seats.delete(playerId);
  }

  // setTimeout that never throws out of the timer: a bug in one room's timer
  // is logged and can't take the process (or other rooms) down.
  later(ms, fn) {
    const timer = setTimeout(() => {
      try {
        fn();
      } catch (err) {
        log.error('timer.crash', err);
      }
    }, ms);
    timer.unref?.();
    return timer;
  }

  roomOf(connId) {
    return this.conns.get(connId)?.code;
  }
}
