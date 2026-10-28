// Random leak sweep, 9 and 10 players: every phase × every role, every
// valid role/Lady/Oberon config, every player's view after every action.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leakSweep } from './leakSweep.js';

test('no leaks in any phase for any role (9 and 10 players)', () => {
  const games = leakSweep([9, 10], 2025);
  assert.ok(games > 80, `only ${games} games`);
});
