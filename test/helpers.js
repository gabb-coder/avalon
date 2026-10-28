// Shared helpers for engine tests: build rooms and drive games step by step.

import assert from 'node:assert/strict';
import { createRoom, reduce } from '../src/engine/index.js';

export const NAMES = ['Rowan', 'Ilse', 'Tomas', 'Kofi', 'Mei', 'Sana', 'Jude', 'Priya', 'Ana', 'Wen'];
export const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// Apply an action that must succeed.
export function act(state, action) {
  const r = reduce(state, action);
  assert.equal(r.error, undefined, `${action.type} failed: ${JSON.stringify(r.error)}`);
  return r.state;
}

// Apply an action that must fail with `code`; checks state is untouched.
export function reject(state, action, code) {
  const r = reduce(state, action);
  assert.ok(r.error, `${action.type} should have failed with ${code}`);
  assert.equal(r.error.code, code);
  assert.equal(r.state, state);
  return r.error;
}

export function lobby(n, config = {}, seed = 1) {
  let s = createRoom({ code: 'KQVX', seed });
  for (const [i, id] of ids(n).entries()) s = act(s, { type: 'JOIN', playerId: id, name: NAMES[i], now: i });
  if (Object.keys(config).length) s = act(s, { type: 'SET_CONFIG', actor: 'p1', config });
  return s;
}

export function started(n, config = {}, seed = 1) {
  return act(lobby(n, config, seed), { type: 'START', actor: 'p1' });
}

export function ackAll(s) {
  for (const id of s.game.seats) s = act(s, { type: 'NIGHT_ACK', actor: id });
  return s;
}

export const leaderOf = (s) => s.game.proposal.leader;
export const sizeOf = (s) => s.game.quests[s.game.questIndex].size;
export const roleIds = (s, role) => s.game.seats.filter((id) => s.game.roles[id] === role);
export const evilIds = (s) => s.game.seats.filter((id) => ['assassin', 'morgana', 'mordred', 'oberon', 'minion'].includes(s.game.roles[id]));
export const goodIds = (s) => s.game.seats.filter((id) => !evilIds(s).includes(id));

export function propose(s, team) {
  return act(s, { type: 'PROPOSE', actor: leaderOf(s), team });
}

// `approve` is a function (id) => boolean, or a boolean for everyone.
export function voteAll(s, approve) {
  const f = typeof approve === 'function' ? approve : () => approve;
  for (const id of s.game.seats) s = act(s, { type: 'VOTE', actor: id, approve: f(id) });
  return s;
}

export function continueAll(s) {
  for (const id of s.game.seats) {
    if (s.phase !== 'vote_reveal' && s.phase !== 'quest_result') break;
    s = act(s, { type: 'CONTINUE', actor: id });
  }
  return s;
}

// `card` is a function (id) => 'success' | 'fail', or a card for everyone.
export function playAll(s, card) {
  const f = typeof card === 'function' ? card : () => card;
  for (const id of s.game.questPlay.team) s = act(s, { type: 'PLAY', actor: id, card: f(id) });
  return s;
}

// Run one full quest: the current leader proposes `team` (default: a team of
// the right size starting from the leader), everyone approves, the team plays.
export function runQuest(s, { team, card = 'success' } = {}) {
  const t = team || pickTeam(s, sizeOf(s));
  s = propose(s, t);
  s = continueAll(voteAll(s, true));
  return continueAll(playAll(s, card));
}

export function pickTeam(s, size, include = []) {
  const rest = s.game.seats.filter((id) => !include.includes(id));
  return [...include, ...rest].slice(0, size);
}

// A card function: Evil players fail, Good players succeed.
export const evilFails = (s) => (id) => (evilIds(s).includes(id) ? 'fail' : 'success');
