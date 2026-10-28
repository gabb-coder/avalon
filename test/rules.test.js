import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEAM_SIZES, QUEST_SIZES, failsNeeded, questSize, roleList, checkSetup, teamOf, DEFAULT_CONFIG,
} from '../src/engine/index.js';

test('team sizes match the table for 5–10 players', () => {
  assert.deepEqual(TEAM_SIZES, {
    5: { good: 3, evil: 2 },
    6: { good: 4, evil: 2 },
    7: { good: 4, evil: 3 },
    8: { good: 5, evil: 3 },
    9: { good: 6, evil: 3 },
    10: { good: 6, evil: 4 },
  });
  for (let n = 5; n <= 10; n++) assert.equal(TEAM_SIZES[n].good + TEAM_SIZES[n].evil, n);
});

test('quest team sizes match the table', () => {
  assert.deepEqual(QUEST_SIZES, {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
  });
  for (let n = 5; n <= 10; n++) for (let q = 0; q < 5; q++) assert.ok(questSize(n, q) <= n);
});

test('Quest 4 needs two fails only with 7 or more players', () => {
  for (let n = 5; n <= 10; n++) {
    for (let q = 0; q < 5; q++) {
      const expected = n >= 7 && q === 3 ? 2 : 1;
      assert.equal(failsNeeded(n, q), expected, `n=${n} quest ${q + 1}`);
    }
  }
});

test('role list always has Merlin and the Assassin, and fills with servants and minions', () => {
  for (let n = 5; n <= 10; n++) {
    const roles = roleList(DEFAULT_CONFIG, n);
    assert.equal(roles.length, n);
    assert.equal(roles.filter((r) => r === 'merlin').length, 1);
    assert.equal(roles.filter((r) => r === 'assassin').length, 1);
    assert.equal(roles.filter((r) => teamOf(r) === 'good').length, TEAM_SIZES[n].good);
    assert.equal(roles.filter((r) => r === 'minion').length, TEAM_SIZES[n].evil - 1);
  }
});

test('checkSetup: too few players', () => {
  const s = checkSetup(DEFAULT_CONFIG, 4);
  assert.equal(s.canStart, false);
  assert.deepEqual(s.problems, [{ code: 'start.tooFew', params: { n: 1 } }]);
  assert.equal(checkSetup(DEFAULT_CONFIG, 1).problems[0].params.n, 4);
});

test('checkSetup: more Evil special roles than Evil seats (copy from B1)', () => {
  const cfg = { ...DEFAULT_CONFIG, morgana: true, mordred: true, oberon: true };
  // 7 players have 3 Evil seats; Assassin + 3 optional = 4 Evil roles.
  const s = checkSetup(cfg, 7);
  assert.equal(s.canStart, false);
  assert.deepEqual(s.problems, [{ code: 'start.tooManyEvil', params: { p: 7, e: 3, r: 4 } }]);
  // 10 players have 4 Evil seats: all four fit.
  assert.equal(checkSetup(cfg, 10).canStart, true);
  // 5 players have 2 Evil seats: Assassin + Morgana fits, + Mordred doesn't.
  assert.equal(checkSetup({ ...DEFAULT_CONFIG, morgana: true }, 5).canStart, true);
  assert.equal(checkSetup({ ...DEFAULT_CONFIG, morgana: true, mordred: true }, 5).canStart, false);
});

test('checkSetup: Morgana without Percival is a warning, not a problem', () => {
  const s = checkSetup({ ...DEFAULT_CONFIG, morgana: true }, 7);
  assert.equal(s.canStart, true);
  assert.deepEqual(s.warnings, [{ code: 'start.morganaNoPercival', params: {} }]);
  assert.deepEqual(checkSetup({ ...DEFAULT_CONFIG, morgana: true, percival: true }, 7).warnings, []);
});

test('checkSetup: lobby summary counts (B3: 7 players, Percival, Morgana, Mordred)', () => {
  const s = checkSetup({ ...DEFAULT_CONFIG, percival: true, morgana: true, mordred: true, lady: true }, 7);
  assert.deepEqual(
    { good: s.good, evil: s.evil, goodRoles: s.goodRoles, servants: s.servants, evilRoles: s.evilRoles, minions: s.minions, lady: s.lady },
    { good: 4, evil: 3, goodRoles: ['merlin', 'percival'], servants: 2, evilRoles: ['assassin', 'morgana', 'mordred'], minions: 0, lady: true },
  );
});
