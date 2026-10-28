// Dealing roles and working out each player's private night information.

import { roleList, rulesConfig, teamOf, GOOD, EVIL } from './rules.js';

// Returns { [playerId]: role }. `seats` is the list of player ids in seat order.
export function assignRoles(seats, config, rng) {
  const deck = rng.shuffle(roleList(config, seats.length));
  const roles = {};
  seats.forEach((id, i) => {
    roles[id] = deck[i];
  });
  return roles;
}

// Night info for one player: { kind, seen: [playerIds] }.
//
//   kind 'evil'  - the listed players are Evil (Merlin, or an Evil player seeing allies)
//   kind 'maybe' - Percival with Morgana in the game: one of these two is Merlin
//   kind 'sure'  - Percival without Morgana: this one player is Merlin
//   kind 'none'  - sees no one
//
// Kinds deliberately avoid role words, and the list holds ids only, so a
// player's payload never names a role they couldn't know. Lists are in seat
// order, except Percival's pair, which is shuffled: in seat order or role
// order it could give away which of the two is the real Merlin.
export function nightInfoFor(playerId, seats, roles, config, rng) {
  const role = roles[playerId];
  const rules = rulesConfig(config);
  const others = seats.filter((id) => id !== playerId);

  if (role === 'merlin') {
    const seen = others.filter((id) => {
      const r = roles[id];
      if (teamOf(r) !== EVIL) return false;
      if (r === 'mordred') return false;
      if (r === 'oberon') return rules.merlinSeesOberon;
      return true;
    });
    return { kind: 'evil', seen };
  }

  if (role === 'percival') {
    const candidates = others.filter((id) => roles[id] === 'merlin' || roles[id] === 'morgana');
    if (candidates.length === 1) return { kind: 'sure', seen: candidates };
    return { kind: 'maybe', seen: rng.shuffle(candidates) };
  }

  // Evil players see each other, except Oberon, who sees no one and is seen by no one.
  if (teamOf(role) === EVIL && role !== 'oberon') {
    const seen = others.filter((id) => teamOf(roles[id]) === EVIL && roles[id] !== 'oberon');
    return { kind: 'evil', seen };
  }

  return { kind: 'none', seen: [] };
}

export function nightInfoAll(seats, roles, config, rng) {
  const out = {};
  for (const id of seats) out[id] = nightInfoFor(id, seats, roles, config, rng);
  return out;
}

// What the Lady of the Lake shows about a player: their team, never their role.
export function ladySees(role, config) {
  if (role === 'oberon' && !rulesConfig(config).ladySeesOberonAsEvil) return GOOD;
  return teamOf(role);
}
