// A random sweep for the leak tests: one bot game per valid config for each
// player count, checking every player's view after every accepted action, and
// recording which (phase, role) pairs were checked.

import assert from 'node:assert/strict';
import { reduce, makeRng, ROLE_IDS, PHASES } from '../src/engine/index.js';
import { lobby } from './helpers.js';
import { botAction, validConfigs } from './bots.js';
import { assertNoLeaks } from './leakCheck.js';

export function leakSweep(playerCounts, seed) {
  const seen = new Set();
  const rng = makeRng(seed);
  let games = 0;
  for (const n of playerCounts) {
    for (const cfg of validConfigs(n)) {
      let s = lobby(n, cfg, rng.int(1e9));
      for (let step = 0; step < 3000 && s.phase !== 'game_over'; step++) {
        const r = reduce(s, botAction(s, rng));
        if (r.error) continue; // a rejected action returns the same, already-checked state
        s = r.state;
        if (s.game) for (const id of s.game.seats) seen.add(`${s.phase}:${s.game.roles[id]}`);
        assertNoLeaks(s);
      }
      assert.equal(s.phase, 'game_over');
      games++;
    }
  }
  for (const phase of PHASES.filter((x) => x !== 'lobby')) {
    for (const role of ROLE_IDS) assert.ok(seen.has(`${phase}:${role}`), `never checked ${role} in ${phase}`);
  }
  return games;
}
