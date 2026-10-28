// Random bots for the simulation and leak tests. Each call to botAction picks
// one action for the current state: mostly legal moves, sometimes junk or an
// out-of-turn move (which the engine must reject without changing anything),
// plus random disconnects and reconnects.

import { DEFAULT_CONFIG, OPTIONAL_ROLES, checkSetup, teamOf } from '../src/engine/index.js';

export function* allConfigs() {
  for (let mask = 0; mask < 64; mask++) {
    const cfg = { ...DEFAULT_CONFIG };
    OPTIONAL_ROLES.forEach((r, i) => {
      cfg[r] = !!(mask & (1 << i));
    });
    cfg.lady = !!(mask & 16);
    cfg.oberonSeenByMerlin = !(mask & 32);
    yield cfg;
  }
}

export function validConfigs(n) {
  return [...allConfigs()].filter((c) => checkSetup(c, n).canStart);
}

const pick = (rng, xs) => xs[rng.int(xs.length)];

function randomTeam(rng, seats, size) {
  return rng.shuffle(seats).slice(0, size);
}

export function botAction(s, rng, { chaos = true } = {}) {
  const g = s.game;
  const roll = rng.next();

  if (chaos && roll < 0.04) return junkAction(s, rng);
  if (chaos && g && roll < 0.07) {
    const p = pick(rng, s.players);
    return { type: 'SET_CONNECTED', playerId: p.id, connected: !p.connected, now: rng.int(1e6) };
  }

  switch (s.phase) {
    case 'lobby':
      return { type: 'START', actor: s.hostId };
    case 'night': {
      const waiting = g.seats.filter((id) => !g.ready.includes(id));
      return { type: 'NIGHT_ACK', actor: pick(rng, waiting) };
    }
    case 'propose': {
      const leader = g.proposal.leader;
      const size = g.quests[g.questIndex].size;
      if (rng.next() < 0.3) return { type: 'SELECT', actor: leader, team: randomTeam(rng, g.seats, 1 + rng.int(g.seats.length)) };
      // Occasionally a wrong-sized team, which must be refused.
      const len = chaos && rng.next() < 0.1 ? Math.max(1, size + (rng.next() < 0.5 ? -1 : 1)) : size;
      return { type: 'PROPOSE', actor: leader, team: randomTeam(rng, g.seats, Math.min(len, g.seats.length)) };
    }
    case 'vote': {
      const waiting = g.seats.filter((id) => !(id in g.proposal.votes));
      return { type: 'VOTE', actor: pick(rng, waiting), approve: rng.next() < 0.6 };
    }
    case 'vote_reveal':
    case 'quest_result':
      if (rng.next() < 0.05) return { type: 'ADVANCE', revealSeq: g.revealSeq };
      return { type: 'CONTINUE', actor: pick(rng, g.seats) };
    case 'quest': {
      const waiting = g.questPlay.team.filter((id) => !g.questPlay.played.includes(id));
      const id = pick(rng, waiting);
      const evil = teamOf(g.roles[id]) === 'evil';
      // Good bots sometimes try to play Fail, which must be refused.
      const card = evil ? (rng.next() < 0.5 ? 'fail' : 'success') : (chaos && rng.next() < 0.05 ? 'fail' : 'success');
      return { type: 'PLAY', actor: id, card };
    }
    case 'lady': {
      const lady = g.lady;
      if (lady.target) return { type: 'LADY_PASS', actor: lady.holder };
      const choices = g.seats.filter((id) => !lady.pastHolders.includes(id));
      return { type: 'LADY_INSPECT', actor: lady.holder, target: pick(rng, choices) };
    }
    case 'assassination': {
      const assassin = g.seats.find((id) => g.roles[id] === 'assassin');
      const choices = g.seats.filter((id) => teamOf(g.roles[id]) === 'good');
      return { type: 'GUESS', actor: assassin, target: pick(rng, choices) };
    }
    default:
      return null;
  }
}

const JUNK_TYPES = [
  'START', 'NIGHT_ACK', 'SELECT', 'PROPOSE', 'VOTE', 'CONTINUE', 'PLAY', 'LADY_INSPECT', 'LADY_PASS', 'GUESS',
  'REMATCH', 'KICK', 'SET_CONFIG', 'TRANSFER_HOST', 'JOIN', 'ADVANCE', 'NOPE',
];

function junkAction(s, rng) {
  const actor = rng.next() < 0.9 ? pick(rng, s.players).id : 'stranger';
  const target = pick(rng, [...s.players.map((p) => p.id), 'ghost', null, 42]);
  return {
    type: pick(rng, JUNK_TYPES),
    actor,
    target,
    team: pick(rng, [[], [target], [actor, actor], 'x', null]),
    approve: pick(rng, [true, false, 'yes', 1]),
    card: pick(rng, ['success', 'fail', 'meh', undefined]),
    config: pick(rng, [{ lady: true }, { evil: true }, null]),
    revealSeq: rng.int(5),
    name: 'Junk',
    playerId: 'junk',
  };
}
