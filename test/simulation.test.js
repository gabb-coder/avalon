// Simulation: thousands of random bot games across every player count and
// every role/Lady/Oberon config. After every single action the state must be
// legal, illegal actions must leave the state untouched, and every game must end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reduce, makeRng, PHASES, TEAM_SIZES, QUEST_SIZES, teamOf, MAX_REJECTS,
} from '../src/engine/index.js';
import { lobby } from './helpers.js';
import { botAction, validConfigs } from './bots.js';

const GAMES_PER_CONFIG = 6;
const MAX_STEPS = 5000;

function checkInvariants(s) {
  assert.ok(PHASES.includes(s.phase), `bad phase ${s.phase}`);
  assert.ok(s.players.some((p) => p.id === s.hostId), 'host must be a player');
  const g = s.game;
  if (s.phase === 'lobby') return assert.equal(g, null);

  const n = g.seats.length;
  const roles = g.seats.map((id) => g.roles[id]);
  assert.equal(roles.filter((r) => teamOf(r) === 'evil').length, TEAM_SIZES[n].evil);
  assert.equal(roles.filter((r) => r === 'merlin').length, 1);
  assert.equal(roles.filter((r) => r === 'assassin').length, 1);
  assert.deepEqual(g.quests.map((q) => q.size), QUEST_SIZES[n]);

  const wins = g.quests.filter((q) => q.result === 'success').length;
  const fails = g.quests.filter((q) => q.result === 'fail').length;
  assert.ok(wins <= 3 && fails <= 3 && !(wins === 3 && fails === 3));
  // Results fill in order: quests before the current one are decided, later ones aren't.
  g.quests.forEach((q, i) => {
    if (i < g.questIndex) assert.ok(q.result, `quest ${i + 1} should have a result`);
    if (i > g.questIndex) assert.equal(q.result, null);
    if (q.result) {
      assert.equal(q.fails + q.successes, q.size);
      assert.equal(q.result, q.fails >= q.failsNeeded ? 'fail' : 'success');
    }
  });
  assert.ok(g.rejects >= 0 && g.rejects <= MAX_REJECTS);
  if (g.rejects === MAX_REJECTS) assert.ok(['vote_reveal', 'game_over'].includes(s.phase));

  for (const p of g.proposals) {
    assert.equal(p.team.length, g.quests[p.quest].size);
    assert.equal(Object.keys(p.votes).length, n, 'every proposal has every vote');
    const yes = Object.values(p.votes).filter((v) => v === 'approve').length;
    assert.equal(p.approved, yes > n / 2);
  }

  if (['propose', 'vote'].includes(s.phase)) {
    assert.equal(g.proposal.leader, g.seats[g.leader]);
  }
  if (s.phase === 'vote') assert.equal(g.proposal.team.length, g.quests[g.questIndex].size);
  if (s.phase === 'quest') {
    for (const id of g.questPlay.played) {
      if (teamOf(g.roles[id]) === 'good') assert.equal(g.questPlay.cards[id], 'success', 'Good played Fail');
    }
  } else if (g.questPlay) {
    assert.equal(g.questPlay.cards, null, 'cards kept after the reveal');
  }
  if (s.phase === 'assassination') assert.equal(wins, 3);
  if (g.lady) {
    assert.equal(new Set(g.lady.pastHolders).size, g.lady.pastHolders.length, 'Lady repeated a holder');
    for (const r of g.lady.results) assert.notEqual(r.holder, r.target);
  }
  if (s.phase === 'game_over') {
    const reason = g.winReason;
    if (reason === 'threeFails') assert.equal(fails, 3);
    if (reason === 'fiveRejects') assert.equal(g.rejects, MAX_REJECTS);
    if (reason === 'assassinHit' || reason === 'assassinMiss') {
      assert.equal(wins, 3);
      assert.equal(g.roles[g.guess] === 'merlin', reason === 'assassinHit');
      assert.equal(teamOf(g.roles[g.guess]), 'good');
    }
    assert.equal(g.winner, reason === 'assassinMiss' ? 'good' : 'evil');
  }
}

test('thousands of random games: no illegal state, every game ends', (t) => {
  const rng = makeRng(1234);
  const reasons = {};
  let games = 0;
  let rejected = 0;
  for (let n = 5; n <= 10; n++) {
    for (const cfg of validConfigs(n)) {
      for (let k = 0; k < GAMES_PER_CONFIG; k++) {
        let s = lobby(n, cfg, rng.int(2 ** 31));
        let steps = 0;
        while (s.phase !== 'game_over') {
          assert.ok(++steps < MAX_STEPS, `game did not end (n=${n}, ${JSON.stringify(cfg)})`);
          const r = reduce(s, botAction(s, rng));
          if (r.error) {
            assert.equal(r.state, s, 'a rejected action must not change the state');
            assert.equal(r.effects.length, 0);
            rejected++;
          }
          s = r.state;
          checkInvariants(s);
        }
        reasons[s.game.winReason] = (reasons[s.game.winReason] || 0) + 1;
        games++;
      }
    }
  }
  t.diagnostic(`${games} games, ${rejected} illegal actions refused, endings: ${JSON.stringify(reasons)}`);
  assert.ok(games >= 1500, `only ${games} games`);
  assert.ok(rejected > 1000, 'bots should have tried plenty of illegal actions');
  for (const reason of ['threeFails', 'fiveRejects', 'assassinHit', 'assassinMiss']) {
    assert.ok(reasons[reason] > 10, `rarely saw ${reason}: ${JSON.stringify(reasons)}`);
  }
});
