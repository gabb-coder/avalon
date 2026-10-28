// The game engine: one pure reducer for a whole room.
//
//   reduce(state, action) -> { state, effects, error? }
//
// `state` is never mutated. On an illegal action the original state comes back
// with `error: { code, params }` and no effects. No I/O, timers or clocks live
// here: times arrive inside actions (`now`), randomness comes from the seeded
// RNG kept in the state, and the server turns `effects` into socket messages.
//
// The raw state holds every secret (roles, votes before the reveal, quest
// cards before the shuffle). It must never be sent to a client: every
// outgoing message goes through viewFor() in views.js.
//
// Action types fall into two groups:
//   player intents (carry `actor`, the acting player's id, set by the server
//   from the socket's session, never from client input):
//     JOIN LEAVE KICK SET_CONFIG TRANSFER_HOST START NIGHT_ACK SELECT PROPOSE
//     VOTE CONTINUE PLAY LADY_INSPECT LADY_PASS GUESS REMATCH END
//   system actions (only the server's own timers and connection tracking):
//     SET_CONNECTED HOST_AUTO ADVANCE

import {
  MAX_PLAYERS, MAX_REJECTS, WINS_NEEDED, LADY_AFTER_QUEST_INDEXES, QUEST_SIZES,
  DEFAULT_CONFIG, GOOD, EVIL, teamOf, failsNeeded, checkSetup,
} from './rules.js';
import { assignRoles, nightInfoAll, ladySees } from './roles.js';
import { makeRng } from './rng.js';
import { ERR, error } from './errors.js';

export const PHASES = [
  'lobby', 'night', 'propose', 'vote', 'vote_reveal', 'quest',
  'quest_result', 'lady', 'assassination', 'game_over',
];

export const NAME_MAX = 16;

// A new, empty room. The first player to JOIN becomes the host.
export function createRoom({ code, seed }) {
  return {
    v: 1,
    code,
    hostId: null,
    players: [], // seat order = join order: { id, name, connected, disconnectedAt, joinedAt }
    config: { ...DEFAULT_CONFIG },
    phase: 'lobby',
    rng: seed >>> 0,
    game: null,
    lastGame: null, // public summary of the previous game, kept for Play again
  };
}

// Trim, collapse whitespace and drop control characters from a display name.
export function cleanName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Validates an already-cleaned name against the room. Returns an error or null.
export function nameError(name, players, exceptId = null) {
  if (!name) return error(ERR.NAME_EMPTY);
  if ([...name].length > NAME_MAX) return error(ERR.NAME_TOO_LONG);
  const lower = name.toLocaleLowerCase();
  if (players.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase() === lower)) {
    return error(ERR.NAME_TAKEN, { name });
  }
  return null;
}

export function reduce(state, action) {
  const handler = action && HANDLERS[action.type];
  if (!handler) return { state, effects: [], error: error(ERR.BAD_ACTION) };

  // The state is plain JSON data by design (it can be stored in Redis as is),
  // so a JSON round trip is a complete, and fast, deep copy.
  const s = JSON.parse(JSON.stringify(state));
  const ctx = { effects: [], rng: makeRng(s.rng) };
  const err = handler(s, action, ctx);
  if (err) return { state, effects: [], error: err };

  s.rng = ctx.rng.state;
  if (s.phase !== state.phase) {
    ctx.effects.push({ type: 'phase', phase: s.phase, from: state.phase });
  }
  return { state: s, effects: ctx.effects };
}

// ---------- helpers ----------

const player = (s, id) => s.players.find((p) => p.id === id);
const isSeated = (s, id) => !!s.game && s.game.seats.includes(id);
const notice = (ctx, key, params = {}) => ctx.effects.push({ type: 'notice', key, params });

function needPhase(s, ...phases) {
  return phases.includes(s.phase) ? null : error(ERR.PHASE);
}
function needPlayer(s, id) {
  return player(s, id) ? null : error(ERR.NOT_PLAYER);
}
function needHost(s, id) {
  return needPlayer(s, id) || (s.hostId === id ? null : error(ERR.NOT_HOST));
}
function needSeat(s, id) {
  return isSeated(s, id) ? null : error(ERR.NOT_PLAYER);
}

// A list of distinct seated player ids, or null if the input isn't one.
function seatList(s, ids) {
  if (!Array.isArray(ids) || ids.length > s.game.seats.length) return null;
  if (new Set(ids).size !== ids.length) return null;
  if (!ids.every((id) => isSeated(s, id))) return null;
  return ids.slice();
}

// The longest-seated connected player other than `exceptId`, or null.
function nextHost(s, exceptId) {
  return s.players.find((p) => p.id !== exceptId && p.connected) || null;
}

function removePlayer(s, ctx, id, noticeKey) {
  const p = player(s, id);
  s.players = s.players.filter((x) => x.id !== id);
  notice(ctx, noticeKey, { name: p.name });
  if (s.hostId === id) {
    const h = nextHost(s, id) || s.players[0] || null;
    s.hostId = h ? h.id : null;
    if (h) notice(ctx, 'notice.hostChanged', { name: h.name, reason: 'left' });
  }
  if (s.players.length === 0) ctx.effects.push({ type: 'empty' });
}

function startPropose(s, advanceLeader) {
  const g = s.game;
  if (advanceLeader) g.leader = (g.leader + 1) % g.seats.length;
  g.proposal = { leader: g.seats[g.leader], picks: [], team: null, votes: {} };
  s.phase = 'propose';
}

function startReveal(s, phase) {
  s.game.continued = [];
  s.game.revealSeq += 1;
  s.phase = phase;
}

function endGame(s, winner, reason) {
  s.game.winner = winner;
  s.game.winReason = reason;
  s.game.proposal = null;
  s.phase = 'game_over';
}

// Moves on from vote_reveal / quest_result once every connected player has
// pressed Continue. Disconnected players are not waited for here: continuing
// past a reveal is not a game decision, so this never acts on anyone's behalf.
function maybeFinishReveal(s) {
  if (s.phase !== 'vote_reveal' && s.phase !== 'quest_result') return;
  const g = s.game;
  const waiting = g.seats.filter((id) => player(s, id)?.connected && !g.continued.includes(id));
  if (waiting.length === 0) finishReveal(s);
}

function finishReveal(s) {
  const g = s.game;
  if (s.phase === 'vote_reveal') {
    const last = g.proposals[g.proposals.length - 1];
    if (last.approved) {
      g.questPlay = { team: last.team.slice(), played: [], cards: {} };
      g.proposal = null;
      s.phase = 'quest';
    } else if (g.rejects >= MAX_REJECTS) {
      endGame(s, EVIL, 'fiveRejects');
    } else {
      startPropose(s, true);
    }
    return;
  }

  // quest_result
  const fails = g.quests.filter((q) => q.result === 'fail').length;
  const wins = g.quests.filter((q) => q.result === 'success').length;
  g.questPlay = null;
  if (fails >= WINS_NEEDED) return endGame(s, EVIL, 'threeFails');
  if (wins >= WINS_NEEDED) {
    s.phase = 'assassination';
    return;
  }
  const finished = g.questIndex;
  g.questIndex += 1;
  if (g.lady && LADY_AFTER_QUEST_INDEXES.includes(finished)) {
    g.lady.target = null;
    g.lady.afterQuest = finished;
    s.phase = 'lady';
  } else {
    startPropose(s, true);
  }
}

// Public record of a finished game, kept after Play again so players who are
// still reading the results (F4) don't lose them.
function gameSummary(s) {
  const g = s.game;
  return {
    seats: g.seats.slice(),
    names: { ...g.names },
    roles: { ...g.roles },
    quests: JSON.parse(JSON.stringify(g.quests)),
    proposals: JSON.parse(JSON.stringify(g.proposals)),
    winner: g.winner,
    winReason: g.winReason,
    guess: g.guess,
  };
}

// ---------- action handlers: return an error, or nothing on success ----------

const HANDLERS = {
  JOIN(s, a, ctx) {
    if (s.phase !== 'lobby') return error(ERR.STARTED, { code: s.code });
    if (s.players.length >= MAX_PLAYERS) return error(ERR.ROOM_FULL, { code: s.code, n: s.players.length });
    if (typeof a.playerId !== 'string' || !a.playerId || player(s, a.playerId)) return error(ERR.BAD_ACTION);
    const name = cleanName(a.name);
    const bad = nameError(name, s.players);
    if (bad) return bad;
    s.players.push({ id: a.playerId, name, connected: true, disconnectedAt: null, joinedAt: a.now ?? 0 });
    if (!s.hostId) s.hostId = a.playerId;
    else notice(ctx, 'notice.joined', { name });
  },

  // Leaving only removes a seat outside a game. During a game the server treats
  // leaving as a disconnect, so the seat is held for the player to come back.
  LEAVE(s, a, ctx) {
    const bad = needPlayer(s, a.actor) || needPhase(s, 'lobby', 'game_over');
    if (bad) return bad;
    removePlayer(s, ctx, a.actor, 'notice.left');
  },

  KICK(s, a, ctx) {
    const bad = needPhase(s, 'lobby') || needHost(s, a.actor);
    if (bad) return bad;
    if (a.target === a.actor) return error(ERR.KICK_SELF);
    if (!player(s, a.target)) return error(ERR.BAD_PLAYER);
    removePlayer(s, ctx, a.target, 'notice.kicked');
    ctx.effects.push({ type: 'kicked', playerId: a.target });
  },

  SET_CONFIG(s, a) {
    const bad = needPhase(s, 'lobby') || needHost(s, a.actor);
    if (bad) return bad;
    const patch = a.config;
    if (!patch || typeof patch !== 'object') return error(ERR.BAD_ACTION);
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULT_CONFIG) || typeof v !== 'boolean') return error(ERR.BAD_ACTION);
    }
    Object.assign(s.config, patch);
  },

  TRANSFER_HOST(s, a, ctx) {
    const bad = needHost(s, a.actor);
    if (bad) return bad;
    const to = player(s, a.to);
    if (!to || to.id === a.actor) return error(ERR.BAD_PLAYER);
    s.hostId = to.id;
    notice(ctx, 'notice.hostChanged', { name: to.name, reason: 'handed' });
  },

  // System: the host has been disconnected past the grace period.
  HOST_AUTO(s, a, ctx) {
    const host = player(s, s.hostId);
    if (host && host.connected) return;
    const h = nextHost(s, s.hostId);
    if (!h) return;
    s.hostId = h.id;
    notice(ctx, 'notice.hostChanged', { name: h.name, reason: 'away' });
  },

  // System: socket connected or dropped.
  SET_CONNECTED(s, a, ctx) {
    const p = player(s, a.playerId);
    if (!p) return error(ERR.NOT_PLAYER);
    if (p.connected === !!a.connected) return;
    p.connected = !!a.connected;
    p.disconnectedAt = p.connected ? null : (a.now ?? 0);
    notice(ctx, p.connected ? 'notice.back' : 'notice.away', { name: p.name });
    if (!p.connected) maybeFinishReveal(s);
  },

  START(s, a, ctx) {
    const bad = needPhase(s, 'lobby') || needHost(s, a.actor);
    if (bad) return bad;
    const setup = checkSetup(s.config, s.players.length);
    if (!setup.canStart) return setup.problems[0];

    const rng = ctx.rng;
    const seats = s.players.map((p) => p.id);
    const n = seats.length;
    const roles = assignRoles(seats, s.config, rng);
    const night = nightInfoAll(seats, roles, s.config, rng);
    const first = rng.int(n);
    // The Lady starts with the player to the first leader's right, i.e. the
    // seat before the leader (leadership moves clockwise, to the next seat).
    const ladyHolder = seats[(first - 1 + n) % n];

    s.game = {
      config: { ...s.config },
      seats,
      names: Object.fromEntries(s.players.map((p) => [p.id, p.name])),
      roles, // SECRET
      night, // SECRET, per player
      ready: [],
      quests: QUEST_SIZES[n].map((size, i) => ({
        size, failsNeeded: failsNeeded(n, i), result: null, fails: null, successes: null, cards: null,
      })),
      questIndex: 0,
      firstLeader: first,
      leader: first,
      rejects: 0,
      proposal: null, // { leader, picks, team, votes (SECRET until everyone has voted) }
      proposals: [], // resolved proposals, public: { quest, attempt, leader, team, votes, approved }
      questPlay: null, // { team, played, cards (SECRET, wiped at the reveal) }
      continued: [],
      revealSeq: 0,
      lady: s.config.lady
        ? { holder: ladyHolder, pastHolders: [ladyHolder], target: null, afterQuest: null, results: [] /* SECRET to each holder */ }
        : null,
      guess: null,
      winner: null,
      winReason: null,
    };
    s.lastGame = null;
    s.phase = 'night';
  },

  NIGHT_ACK(s, a) {
    const bad = needPhase(s, 'night') || needSeat(s, a.actor);
    if (bad) return bad;
    const g = s.game;
    if (g.ready.includes(a.actor)) return error(ERR.LOCKED);
    g.ready.push(a.actor);
    if (g.ready.length === g.seats.length) startPropose(s, false);
  },

  // Live picks while the leader builds a team. Any count is allowed here (the
  // design shows a "too many" state); the size is enforced on PROPOSE.
  SELECT(s, a) {
    const bad = needPhase(s, 'propose') || needSeat(s, a.actor);
    if (bad) return bad;
    if (s.game.proposal.leader !== a.actor) return error(ERR.NOT_LEADER);
    const picks = seatList(s, a.team);
    if (!picks) return error(ERR.BAD_PLAYER);
    s.game.proposal.picks = picks;
  },

  PROPOSE(s, a) {
    const bad = needPhase(s, 'propose') || needSeat(s, a.actor);
    if (bad) return bad;
    const g = s.game;
    if (g.proposal.leader !== a.actor) return error(ERR.NOT_LEADER);
    const team = seatList(s, a.team);
    if (!team) return error(ERR.BAD_PLAYER);
    const size = g.quests[g.questIndex].size;
    if (team.length < size) return error(ERR.PICK_TOO_FEW, { n: size - team.length });
    if (team.length > size) return error(ERR.PICK_TOO_MANY, { q: g.questIndex + 1, n: size, x: team.length - size });
    g.proposal.team = team;
    g.proposal.picks = team.slice();
    g.proposal.votes = {};
    s.phase = 'vote';
  },

  VOTE(s, a) {
    const bad = needPhase(s, 'vote') || needSeat(s, a.actor);
    if (bad) return bad;
    if (typeof a.approve !== 'boolean') return error(ERR.BAD_ACTION);
    const g = s.game;
    const p = g.proposal;
    if (a.actor in p.votes) return error(ERR.LOCKED);
    p.votes[a.actor] = a.approve ? 'approve' : 'reject';
    if (Object.keys(p.votes).length < g.seats.length) return;

    // Everyone has voted: reveal all votes together. A tie is a rejection.
    const approvals = Object.values(p.votes).filter((v) => v === 'approve').length;
    const approved = approvals > g.seats.length / 2;
    g.proposals.push({
      quest: g.questIndex,
      attempt: g.proposals.filter((x) => x.quest === g.questIndex).length + 1,
      leader: p.leader,
      team: p.team,
      votes: p.votes,
      approved,
    });
    g.rejects = approved ? 0 : g.rejects + 1;
    g.proposal = null;
    startReveal(s, 'vote_reveal');
  },

  CONTINUE(s, a) {
    const bad = needPhase(s, 'vote_reveal', 'quest_result') || needSeat(s, a.actor);
    if (bad) return bad;
    if (!s.game.continued.includes(a.actor)) s.game.continued.push(a.actor);
    maybeFinishReveal(s);
  },

  // System: fallback timer so one idle phone can't stall the table after a
  // reveal. `revealSeq` makes a timer from an earlier reveal harmless.
  ADVANCE(s, a) {
    const bad = needPhase(s, 'vote_reveal', 'quest_result');
    if (bad) return bad;
    if (a.revealSeq !== s.game.revealSeq) return error(ERR.STALE);
    finishReveal(s);
  },

  PLAY(s, a, ctx) {
    const bad = needPhase(s, 'quest') || needSeat(s, a.actor);
    if (bad) return bad;
    const g = s.game;
    const qp = g.questPlay;
    if (!qp.team.includes(a.actor)) return error(ERR.NOT_ON_TEAM);
    if (a.card !== 'success' && a.card !== 'fail') return error(ERR.BAD_ACTION);
    if (qp.played.includes(a.actor)) return error(ERR.LOCKED);
    if (a.card === 'fail' && teamOf(g.roles[a.actor]) === GOOD) return error(ERR.FAIL_LOCKED);
    qp.cards[a.actor] = a.card;
    qp.played.push(a.actor);
    if (qp.played.length < qp.team.length) return;

    // Everyone on the team has played. Shuffle, keep only the shuffled cards
    // and counts, and wipe who played what so it can never leak later.
    const q = g.quests[g.questIndex];
    q.cards = ctx.rng.shuffle(qp.team.map((id) => qp.cards[id]));
    q.fails = q.cards.filter((c) => c === 'fail').length;
    q.successes = q.cards.length - q.fails;
    q.result = q.fails >= q.failsNeeded ? 'fail' : 'success';
    qp.cards = null;
    startReveal(s, 'quest_result');
  },

  LADY_INSPECT(s, a) {
    const bad = needPhase(s, 'lady') || needSeat(s, a.actor);
    if (bad) return bad;
    const lady = s.game.lady;
    if (lady.holder !== a.actor) return error(ERR.NOT_HOLDER);
    if (lady.target) return error(ERR.LOCKED);
    if (!isSeated(s, a.target)) return error(ERR.BAD_PLAYER);
    if (a.target === a.actor) return error(ERR.LADY_SELF);
    if (lady.pastHolders.includes(a.target)) return error(ERR.LADY_REPEAT);
    lady.target = a.target;
    lady.results.push({
      holder: a.actor,
      target: a.target,
      seenTeam: ladySees(s.game.roles[a.target], s.game.config),
      afterQuest: lady.afterQuest,
    });
  },

  LADY_PASS(s, a, ctx) {
    const bad = needPhase(s, 'lady') || needSeat(s, a.actor);
    if (bad) return bad;
    const lady = s.game.lady;
    if (lady.holder !== a.actor) return error(ERR.NOT_HOLDER);
    if (!lady.target) return error(ERR.PHASE);
    lady.pastHolders.push(lady.target);
    lady.holder = lady.target;
    lady.target = null;
    notice(ctx, 'notice.ladyPassed', { name: s.game.names[lady.holder] });
    startPropose(s, true);
  },

  GUESS(s, a) {
    const bad = needPhase(s, 'assassination') || needSeat(s, a.actor);
    if (bad) return bad;
    const g = s.game;
    if (g.roles[a.actor] !== 'assassin') return error(ERR.NOT_ASSASSIN);
    if (!isSeated(s, a.target) || teamOf(g.roles[a.target]) === EVIL) return error(ERR.BAD_TARGET);
    g.guess = a.target;
    if (g.roles[a.target] === 'merlin') endGame(s, EVIL, 'assassinHit');
    else endGame(s, GOOD, 'assassinMiss');
  },

  // Play again: back to the lobby with the same players and settings.
  REMATCH(s, a) {
    const bad = needPhase(s, 'game_over') || needPlayer(s, a.actor);
    if (bad) return bad;
    s.lastGame = gameSummary(s);
    s.game = null;
    s.phase = 'lobby';
  },

  // The host ends the game for everyone; the server closes the room.
  END(s, a, ctx) {
    const bad = needHost(s, a.actor);
    if (bad) return bad;
    ctx.effects.push({ type: 'closed', reason: 'hostEnded', by: player(s, a.actor).name });
  },
};
