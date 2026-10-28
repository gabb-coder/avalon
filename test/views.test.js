// Information-leak tests: the most important tests in the project.
// The checker lives in leakCheck.js; the big random sweeps are in
// leaks-*.test.js (split by player count so they run in parallel).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewFor, makeRng } from '../src/engine/index.js';
import { assertNoLeaks } from './leakCheck.js';
import { lobby, act, ackAll, started, runQuest, roleIds, evilIds, pickTeam, propose, voteAll, playAll, evilFails, continueAll } from './helpers.js';
import { botAction } from './bots.js';

test('viewFor returns null for someone not in the room', () => {
  assert.equal(viewFor(started(5), 'stranger'), null);
});

test('10-player game with every optional role and the Lady: no leaks after any single action', () => {
  let s = lobby(10, { percival: true, morgana: true, mordred: true, oberon: true, lady: true }, 77);
  const rng = makeRng(77);
  const phases = new Set();
  for (let step = 0; step < 2000 && s.phase !== 'game_over'; step++) {
    s = act(s, botAction(s, rng, { chaos: false }));
    phases.add(s.phase);
    assertNoLeaks(s);
  }
  assert.equal(s.phase, 'game_over');
  for (const p of ['night', 'propose', 'vote', 'vote_reveal', 'quest', 'quest_result']) assert.ok(phases.has(p), p);
});

test('assassination reveals Evil and the Assassin; game over reveals roles but never cards', () => {
  let s = ackAll(started(7, { percival: true, morgana: true, oberon: true }, 8));
  s = runQuest(runQuest(runQuest(s)));
  assert.equal(s.phase, 'assassination');
  const v = viewFor(s, roleIds(s, 'merlin')[0]).game;
  assert.equal(v.assassinId, roleIds(s, 'assassin')[0]);
  assert.deepEqual([...v.evilIds].sort(), evilIds(s).sort(), 'all Evil, Oberon included');
  assert.equal(v.roles, null);

  s = act(s, { type: 'GUESS', actor: v.assassinId, target: roleIds(s, 'percival')[0] });
  const end = viewFor(s, 'p2');
  assert.deepEqual(end.game.roles, s.game.roles);
  assert.equal(end.game.winner, 'good');
  assert.equal(end.game.guess, roleIds(s, 'percival')[0]);
  assertNoLeaks(s);
});

test('the Lady result reaches only the holder, and stays with them for Peek', () => {
  let s = ackAll(started(7, { lady: true }, 4));
  s = runQuest(runQuest(s));
  assert.equal(s.phase, 'lady');
  const holder = s.game.lady.holder;
  const target = s.game.seats.find((id) => id !== holder);
  s = act(s, { type: 'LADY_INSPECT', actor: holder, target });
  for (const id of s.game.seats) {
    const v = viewFor(s, id).game;
    assert.equal(v.lady.target, target, 'who is being looked into is public (D16)');
    assert.equal(v.me.ladyResults.length, id === holder ? 1 : 0);
  }
  s = act(s, { type: 'LADY_PASS', actor: holder });
  assert.equal(viewFor(s, holder).game.me.ladyResults[0].target, target, 'kept for Peek');
  assertNoLeaks(s);
});

test('quest result shows shuffled cards and counts only', () => {
  let s = ackAll(started(7, {}, 11));
  const team = pickTeam(s, 2, [evilIds(s)[0]]);
  s = playAll(continueAll(voteAll(propose(s, team), true)), evilFails(s));
  const v = viewFor(s, 'p1').game;
  assert.deepEqual([v.quests[0].fails, v.quests[0].successes], [1, 1]);
  assert.equal(v.questPlay.played.length, 2);
  assertNoLeaks(s);
});

// The checker itself must have teeth: plant one leak at a time in an
// otherwise-correct view and make sure each is caught.
test('the leak checker catches planted leaks', () => {
  const leaky = {
    'roles map': (s, id) => ({ ...viewFor(s, id), game: { ...viewFor(s, id).game, roles: s.game.roles } }),
    'live votes': (s, id) => withGame(s, id, (g) => ({ ...g, proposal: g.proposal && { ...g.proposal, votes: s.game.proposal.votes } })),
    "someone else's night info": (s, id) => withGame(s, id, (g) => ({ ...g, others: s.game.night })),
    'all Lady results': (s, id) => withGame(s, id, (g) => ({ ...g, me: { ...g.me, ladyResults: s.game.lady ? s.game.lady.results : [] } })),
    'quest cards by player': (s, id) => withGame(s, id, (g) => ({ ...g, questPlay: g.questPlay && { ...g.questPlay, cards: s.game.questPlay.cards } })),
    'Evil revealed early': (s, id) => withGame(s, id, (g) => ({ ...g, evilIds: evilIds(s) })),
    'teams of everyone': (s, id) => withGame(s, id, (g) => ({ ...g, teams: Object.fromEntries(s.game.seats.map((x) => [x, evilIds(s).includes(x) ? 'evil' : 'good'])) })),
  };
  const withGame = (s, id, f) => {
    const v = viewFor(s, id);
    return v.game ? { ...v, game: f(v.game) } : v;
  };

  // States that exercise every secret: a vote in progress, a quest with a card
  // played, and a Lady inspection.
  let base = ackAll(started(8, { lady: true, percival: true, morgana: true }, 5));
  const voting = act(propose(base, pickTeam(base, 3)), { type: 'VOTE', actor: 'p1', approve: false });
  let questing = continueAll(voteAll(propose(base, pickTeam(base, 3, [evilIds(base)[0]])), true));
  questing = act(questing, { type: 'PLAY', actor: questing.game.questPlay.team[0], card: 'fail' });
  let lady = runQuest(runQuest(base));
  lady = act(lady, { type: 'LADY_INSPECT', actor: lady.game.lady.holder, target: lady.game.seats.find((x) => x !== lady.game.lady.holder) });

  for (const [name, fn] of Object.entries(leaky)) {
    const caught = [voting, questing, lady].some((st) => {
      try {
        assertNoLeaks(st, fn);
        return false;
      } catch {
        return true;
      }
    });
    assert.ok(caught, `planted leak not caught: ${name}`);
  }
  for (const st of [voting, questing, lady]) assertNoLeaks(st);
});
