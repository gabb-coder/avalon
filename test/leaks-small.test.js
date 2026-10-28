// Random leak sweep, 5 to 8 players: every phase × every role, every
// valid role/Lady/Oberon config, every player's view after every action.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leakSweep } from './leakSweep.js';

test('no leaks in any phase for any role (5 to 8 players)', () => {
  const games = leakSweep([5, 6, 7, 8], 2024);
  assert.ok(games > 80, `only ${games} games`);
});
