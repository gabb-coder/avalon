import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, reduce, DEFAULT_CONFIG } from '../src/engine/index.js';
import {
  act, reject, lobby, started, ackAll, leaderOf, sizeOf, roleIds, evilIds, goodIds,
  propose, voteAll, continueAll, playAll, runQuest, pickTeam, evilFails, ids,
} from './helpers.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe('lobby', () => {
  test('first player to join is the host', () => {
    const s = lobby(3);
    assert.equal(s.hostId, 'p1');
    assert.deepEqual(s.players.map((p) => p.name), ['Rowan', 'Ilse', 'Tomas']);
  });

  test('names are trimmed, 1–16 characters and unique (case-insensitive)', () => {
    let s = lobby(2);
    reject(s, { type: 'JOIN', playerId: 'x', name: '   ' }, 'name.empty');
    reject(s, { type: 'JOIN', playerId: 'x', name: 'A'.repeat(17) }, 'name.tooLong');
    const e = reject(s, { type: 'JOIN', playerId: 'x', name: ' rowan ' }, 'name.taken');
    assert.deepEqual(e.params, { name: 'rowan' });
    s = act(s, { type: 'JOIN', playerId: 'x', name: '  Kofi   B\u0007 ' });
    assert.equal(s.players[2].name, 'Kofi B');
    s = act(s, { type: 'JOIN', playerId: 'y', name: 'A'.repeat(16) });
  });

  test('room is full at 10, and closed once a game starts', () => {
    const s = lobby(10);
    reject(s, { type: 'JOIN', playerId: 'x', name: 'Late' }, 'code.full');
    reject(started(5), { type: 'JOIN', playerId: 'x', name: 'Late' }, 'code.started');
  });

  test('only the host changes settings, only in the lobby, only known boolean keys', () => {
    const s = lobby(5);
    reject(s, { type: 'SET_CONFIG', actor: 'p2', config: { lady: true } }, 'err.notHost');
    reject(s, { type: 'SET_CONFIG', actor: 'p1', config: { lady: 'yes' } }, 'err.badAction');
    reject(s, { type: 'SET_CONFIG', actor: 'p1', config: { __proto__x: true } }, 'err.badAction');
    const s2 = act(s, { type: 'SET_CONFIG', actor: 'p1', config: { lady: true, percival: true } });
    assert.equal(s2.config.lady, true);
    assert.equal(s2.config.percival, true);
    reject(started(5), { type: 'SET_CONFIG', actor: 'p1', config: { lady: true } }, 'err.phase');
  });

  test('start needs the host, 5+ players and a valid role setup', () => {
    reject(lobby(4), { type: 'START', actor: 'p1' }, 'start.tooFew');
    reject(lobby(5), { type: 'START', actor: 'p2' }, 'err.notHost');
    const e = reject(lobby(5, { morgana: true, mordred: true }), { type: 'START', actor: 'p1' }, 'start.tooManyEvil');
    assert.deepEqual(e.params, { p: 5, e: 2, r: 3 });
    // Morgana without Percival is only a warning.
    assert.equal(started(5, { morgana: true }).phase, 'night');
  });

  test('kick: host only, lobby only, not yourself', () => {
    const s = lobby(5);
    reject(s, { type: 'KICK', actor: 'p2', target: 'p3' }, 'err.notHost');
    reject(s, { type: 'KICK', actor: 'p1', target: 'p1' }, 'err.kickSelf');
    const r = reduce(s, { type: 'KICK', actor: 'p1', target: 'p3' });
    assert.equal(r.state.players.length, 4);
    assert.ok(r.effects.some((e) => e.type === 'kicked' && e.playerId === 'p3'));
    reject(started(5), { type: 'KICK', actor: 'p1', target: 'p3' }, 'err.phase');
  });

  test('host leaving the lobby passes the crown to the longest-seated connected player', () => {
    let s = lobby(5);
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p2', connected: false, now: 1 });
    s = act(s, { type: 'LEAVE', actor: 'p1' });
    assert.equal(s.hostId, 'p3');
  });

  test('host can hand the crown on; auto transfer only when the host is away', () => {
    let s = lobby(5);
    reject(s, { type: 'TRANSFER_HOST', actor: 'p2', to: 'p3' }, 'err.notHost');
    s = act(s, { type: 'TRANSFER_HOST', actor: 'p1', to: 'p4' });
    assert.equal(s.hostId, 'p4');
    assert.equal(act(s, { type: 'HOST_AUTO' }).hostId, 'p4', 'connected host keeps the crown');
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p4', connected: false, now: 5 });
    assert.equal(act(s, { type: 'HOST_AUTO' }).hostId, 'p1');
  });

  test('last player leaving reports the room empty', () => {
    let s = lobby(1);
    const r = reduce(s, { type: 'LEAVE', actor: 'p1' });
    assert.ok(r.effects.some((e) => e.type === 'empty'));
  });

  test('leaving mid-game is not allowed (the server treats it as a disconnect)', () => {
    reject(started(5), { type: 'LEAVE', actor: 'p2' }, 'err.phase');
  });
});

describe('night', () => {
  test('everyone must acknowledge once; then the first leader proposes', () => {
    let s = started(7);
    assert.equal(s.phase, 'night');
    s = act(s, { type: 'NIGHT_ACK', actor: 'p1' });
    reject(s, { type: 'NIGHT_ACK', actor: 'p1' }, 'err.locked');
    // A disconnected player is still waited for: nobody acts on their behalf.
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p7', connected: false, now: 1 });
    for (const id of ids(6).slice(1)) s = act(s, { type: 'NIGHT_ACK', actor: id });
    assert.equal(s.phase, 'night');
    s = act(s, { type: 'NIGHT_ACK', actor: 'p7' });
    assert.equal(s.phase, 'propose');
    assert.equal(leaderOf(s), s.game.seats[s.game.firstLeader]);
  });

  test('the first leader is random', () => {
    const leaders = new Set();
    for (let seed = 1; seed <= 60; seed++) leaders.add(ackAll(started(5, {}, seed)).game.proposal.leader);
    assert.equal(leaders.size, 5);
  });
});

describe('proposals and votes', () => {
  test('only the leader picks; team must be exactly the quest size', () => {
    const s = ackAll(started(7));
    const leader = leaderOf(s);
    const other = s.game.seats.find((id) => id !== leader);
    reject(s, { type: 'PROPOSE', actor: other, team: pickTeam(s, 2) }, 'err.notLeader');
    reject(s, { type: 'SELECT', actor: other, team: [] }, 'err.notLeader');
    let e = reject(s, { type: 'PROPOSE', actor: leader, team: pickTeam(s, 1) }, 'pick.tooFew');
    assert.deepEqual(e.params, { n: 1 });
    e = reject(s, { type: 'PROPOSE', actor: leader, team: pickTeam(s, 3) }, 'pick.tooMany');
    assert.deepEqual(e.params, { q: 1, n: 2, x: 1 });
    reject(s, { type: 'PROPOSE', actor: leader, team: ['p1', 'p1'] }, 'err.badPlayer');
    reject(s, { type: 'PROPOSE', actor: leader, team: ['p1', 'nobody'] }, 'err.badPlayer');
    reject(s, { type: 'PROPOSE', actor: leader, team: 'p1,p2' }, 'err.badPlayer');
  });

  test('live picks are stored and may exceed the size', () => {
    let s = ackAll(started(7));
    s = act(s, { type: 'SELECT', actor: leaderOf(s), team: pickTeam(s, 3) });
    assert.equal(s.game.proposal.picks.length, 3);
    assert.equal(s.phase, 'propose');
  });

  test('a vote is final once cast', () => {
    let s = propose(ackAll(started(5)), pickTeam(ackAll(started(5)), 2));
    s = act(s, { type: 'VOTE', actor: 'p1', approve: true });
    reject(s, { type: 'VOTE', actor: 'p1', approve: false }, 'err.locked');
    reject(s, { type: 'VOTE', actor: 'p2', approve: 'yes' }, 'err.badAction');
  });

  test('majority approves; a tie is a rejection', () => {
    let s = ackAll(started(6));
    s = propose(s, pickTeam(s, 2));
    const half = s.game.seats.slice(0, 3);
    s = voteAll(s, (id) => half.includes(id));
    assert.equal(s.phase, 'vote_reveal');
    assert.equal(s.game.proposals[0].approved, false);
    assert.equal(s.game.rejects, 1);

    let t = ackAll(started(6));
    t = propose(t, pickTeam(t, 2));
    t = voteAll(t, (id) => t.game.seats.slice(0, 4).includes(id));
    assert.equal(t.game.proposals[0].approved, true);
  });

  test('leadership passes clockwise after every proposal', () => {
    let s = ackAll(started(5));
    const seats = s.game.seats;
    const first = seats.indexOf(leaderOf(s));
    s = continueAll(voteAll(propose(s, pickTeam(s, 2)), false));
    assert.equal(leaderOf(s), seats[(first + 1) % 5]);
    s = runQuest(s);
    assert.equal(leaderOf(s), seats[(first + 2) % 5]);
  });

  test('five rejected teams in a row: Evil wins', () => {
    let s = ackAll(started(5));
    for (let i = 1; i <= 5; i++) {
      s = voteAll(propose(s, pickTeam(s, 2)), false);
      assert.equal(s.game.rejects, i);
      s = continueAll(s);
    }
    assert.equal(s.phase, 'game_over');
    assert.equal(s.game.winner, 'evil');
    assert.equal(s.game.winReason, 'fiveRejects');
  });

  test('the reject counter resets when a team is approved', () => {
    let s = ackAll(started(5));
    for (let i = 0; i < 4; i++) s = continueAll(voteAll(propose(s, pickTeam(s, 2)), false));
    assert.equal(s.game.rejects, 4);
    s = voteAll(propose(s, pickTeam(s, 2)), true);
    assert.equal(s.game.rejects, 0);
    assert.equal(s.game.proposals.at(-1).attempt, 5);
  });
});

describe('quests', () => {
  test('only team members play, once; Good cannot play Fail', () => {
    let s = ackAll(started(5));
    const good = goodIds(s)[0];
    const team = pickTeam(s, 2, [good]);
    s = continueAll(voteAll(propose(s, team), true));
    assert.equal(s.phase, 'quest');
    const outsider = s.game.seats.find((id) => !team.includes(id));
    reject(s, { type: 'PLAY', actor: outsider, card: 'success' }, 'err.notOnTeam');
    reject(s, { type: 'PLAY', actor: good, card: 'fail' }, 'fail.locked');
    reject(s, { type: 'PLAY', actor: good, card: 'maybe' }, 'err.badAction');
    s = act(s, { type: 'PLAY', actor: good, card: 'success' });
    reject(s, { type: 'PLAY', actor: good, card: 'success' }, 'err.locked');
  });

  test('cards are counted, shuffled, and who played what is wiped', () => {
    let s = ackAll(started(7));
    const team = pickTeam(s, 2, [evilIds(s)[0]]);
    s = continueAll(voteAll(propose(s, team), true));
    s = playAll(s, evilFails(s));
    assert.equal(s.phase, 'quest_result');
    const q = s.game.quests[0];
    assert.deepEqual({ result: q.result, fails: q.fails, successes: q.successes }, { result: 'fail', fails: 1, successes: 1 });
    assert.deepEqual([...q.cards].sort(), ['fail', 'success']);
    assert.equal(s.game.questPlay.cards, null);
  });

  test('Quest 4 with 7+ players: one Fail is not enough, two are', () => {
    for (const fails of [1, 2]) {
      let s = ackAll(started(7));
      s = runQuest(s); // Q1 success
      s = runQuest(s, { team: pickTeam(s, 3, [evilIds(s)[0]]), card: evilFails(s) }); // Q2 fail
      s = runQuest(s); // Q3 success
      assert.equal(s.game.questIndex, 3);
      assert.equal(s.game.quests[3].failsNeeded, 2);
      const team = [...evilIds(s).slice(0, fails), ...goodIds(s)].slice(0, 4);
      s = continueAll(voteAll(propose(s, team), true));
      s = playAll(s, evilFails(s));
      assert.equal(s.game.quests[3].fails, fails);
      assert.equal(s.game.quests[3].result, fails === 1 ? 'success' : 'fail');
      s = continueAll(s);
      assert.equal(s.phase, fails === 1 ? 'assassination' : 'propose');
    }
  });

  test('Quest 4 with 6 players fails on one Fail', () => {
    let s = ackAll(started(6));
    s = runQuest(s);
    s = runQuest(s, { team: pickTeam(s, 3, [evilIds(s)[0]]), card: evilFails(s) });
    s = runQuest(s, { team: pickTeam(s, 4, [evilIds(s)[0]]), card: evilFails(s) });
    assert.equal(s.game.quests[3].failsNeeded, 1);
    s = runQuest(s, { team: pickTeam(s, 3, [evilIds(s)[0]]), card: evilFails(s) });
    assert.equal(s.game.quests[3].result, 'fail');
    assert.equal(s.phase, 'game_over');
    assert.equal(s.game.winReason, 'threeFails');
  });

  test('three successes lead to the assassination', () => {
    let s = ackAll(started(5));
    s = runQuest(runQuest(runQuest(s)));
    assert.equal(s.phase, 'assassination');
  });
});

describe('assassination', () => {
  function atAssassination(seed = 3) {
    let s = ackAll(started(7, { percival: true, morgana: true }, seed));
    return runQuest(runQuest(runQuest(s)));
  }

  test('only the Assassin guesses, and only a non-Evil player', () => {
    const s = atAssassination();
    const assassin = roleIds(s, 'assassin')[0];
    const merlin = roleIds(s, 'merlin')[0];
    const other = evilIds(s).find((id) => id !== assassin);
    reject(s, { type: 'GUESS', actor: merlin, target: merlin }, 'err.notAssassin');
    reject(s, { type: 'GUESS', actor: assassin, target: other }, 'err.badTarget');
    reject(s, { type: 'GUESS', actor: assassin, target: assassin }, 'err.badTarget');
  });

  test('naming Merlin wins it for Evil; anyone else, Good wins', () => {
    const s = atAssassination();
    const assassin = roleIds(s, 'assassin')[0];
    const hit = act(s, { type: 'GUESS', actor: assassin, target: roleIds(s, 'merlin')[0] });
    assert.deepEqual([hit.phase, hit.game.winner, hit.game.winReason], ['game_over', 'evil', 'assassinHit']);
    const miss = act(s, { type: 'GUESS', actor: assassin, target: roleIds(s, 'percival')[0] });
    assert.deepEqual([miss.phase, miss.game.winner, miss.game.winReason], ['game_over', 'good', 'assassinMiss']);
  });
});

describe('Lady of the Lake', () => {
  test('starts with the player to the first leader\'s right', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = started(7, { lady: true }, seed);
      const n = s.game.seats.length;
      assert.equal(s.game.lady.holder, s.game.seats[(s.game.firstLeader - 1 + n) % n]);
    }
    assert.equal(started(7).game.lady, null, 'off by default');
  });

  test('used after quests 2, 3 and 4; no self, no past holders; passes to the target', () => {
    let s = ackAll(started(8, { lady: true }));
    s = runQuest(s, { team: pickTeam(s, 3, [evilIds(s)[0]]), card: evilFails(s) }); // Q1 fail
    assert.equal(s.phase, 'propose', 'no Lady after Quest 1');
    s = runQuest(s); // Q2 success
    assert.equal(s.phase, 'lady');
    assert.equal(s.game.lady.afterQuest, 1);

    const first = s.game.lady.holder;
    const outsider = s.game.seats.find((id) => id !== first);
    reject(s, { type: 'LADY_INSPECT', actor: outsider, target: first }, 'err.notHolder');
    reject(s, { type: 'LADY_INSPECT', actor: first, target: first }, 'lady.self');
    reject(s, { type: 'LADY_PASS', actor: first }, 'err.phase');
    const target = s.game.seats.find((id) => id !== first);
    s = act(s, { type: 'LADY_INSPECT', actor: first, target });
    reject(s, { type: 'LADY_INSPECT', actor: first, target: outsider }, 'err.locked');
    assert.deepEqual(s.game.lady.results[0], {
      holder: first, target, afterQuest: 1, seenTeam: evilIds(s).includes(target) ? 'evil' : 'good',
    });
    s = act(s, { type: 'LADY_PASS', actor: first });
    assert.equal(s.game.lady.holder, target);
    assert.equal(s.phase, 'propose');

    s = runQuest(s, { team: pickTeam(s, 4, [evilIds(s)[0]]), card: evilFails(s) }); // Q3 fail
    assert.equal(s.phase, 'lady');
    reject(s, { type: 'LADY_INSPECT', actor: target, target: first }, 'lady.disabled');
  });

  test('skipped when the quest decides the game', () => {
    let s = ackAll(started(7, { lady: true }));
    s = runQuest(runQuest(s)); // Q1, Q2 success; Lady after Q2
    s = act(s, { type: 'LADY_INSPECT', actor: s.game.lady.holder, target: s.game.seats.find((id) => id !== s.game.lady.holder) });
    s = act(s, { type: 'LADY_PASS', actor: s.game.lady.holder });
    s = runQuest(s); // Q3 success: 3 wins
    assert.equal(s.phase, 'assassination');
  });
});

describe('reveals, disconnects and timers', () => {
  test('reveals wait for connected players only', () => {
    let s = ackAll(started(5));
    s = voteAll(propose(s, pickTeam(s, 2)), false);
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p5', connected: false, now: 10 });
    for (const id of ids(4)) s = act(s, { type: 'CONTINUE', actor: id });
    assert.equal(s.phase, 'propose');
  });

  test('a disconnect can finish a reveal everyone else has continued', () => {
    let s = ackAll(started(5));
    s = voteAll(propose(s, pickTeam(s, 2)), false);
    for (const id of ids(4)) s = act(s, { type: 'CONTINUE', actor: id });
    assert.equal(s.phase, 'vote_reveal');
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p5', connected: false, now: 10 });
    assert.equal(s.phase, 'propose');
  });

  test('the fallback timer advances only the reveal it was set for', () => {
    let s = ackAll(started(5));
    s = voteAll(propose(s, pickTeam(s, 2)), false);
    const seq = s.game.revealSeq;
    reject(s, { type: 'ADVANCE', revealSeq: seq - 1 }, 'err.stale');
    s = act(s, { type: 'ADVANCE', revealSeq: seq });
    assert.equal(s.phase, 'propose');
    reject(s, { type: 'ADVANCE', revealSeq: seq }, 'err.phase');
  });

  test('the game never votes for a disconnected player', () => {
    let s = ackAll(started(5));
    s = propose(s, pickTeam(s, 2));
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p3', connected: false, now: 10 });
    for (const id of ['p1', 'p2', 'p4', 'p5']) s = act(s, { type: 'VOTE', actor: id, approve: true });
    assert.equal(s.phase, 'vote');
    assert.ok(!('p3' in s.game.proposal.votes));
    assert.equal(s.players[2].disconnectedAt, 10);
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p3', connected: true, now: 20 });
    assert.equal(s.players[2].disconnectedAt, null);
    s = act(s, { type: 'VOTE', actor: 'p3', approve: true });
    assert.equal(s.phase, 'vote_reveal');
  });
});

describe('ending and Play again', () => {
  test('host ends the game for everyone', () => {
    const s = started(5);
    reject(s, { type: 'END', actor: 'p2' }, 'err.notHost');
    const r = reduce(s, { type: 'END', actor: 'p1' });
    assert.deepEqual(r.effects, [{ type: 'closed', reason: 'hostEnded', by: 'Rowan' }]);
  });

  test('Play again keeps the room, players and settings; the last game stays readable', () => {
    let s = ackAll(started(5, { percival: true }));
    s = runQuest(runQuest(runQuest(s)));
    s = act(s, { type: 'GUESS', actor: roleIds(s, 'assassin')[0], target: roleIds(s, 'merlin')[0] });
    reject(s, { type: 'REMATCH', actor: 'nobody' }, 'err.notPlayer');
    s = act(s, { type: 'REMATCH', actor: 'p3' });
    assert.equal(s.phase, 'lobby');
    assert.equal(s.game, null);
    assert.equal(s.players.length, 5);
    assert.equal(s.config.percival, true);
    assert.equal(s.lastGame.winReason, 'assassinHit');
    s = act(s, { type: 'START', actor: 'p1' });
    assert.equal(s.lastGame, null);
  });

  test('players can leave at game over', () => {
    let s = ackAll(started(5));
    for (let i = 0; i < 5; i++) s = continueAll(voteAll(propose(s, pickTeam(s, 2)), false));
    s = act(s, { type: 'LEAVE', actor: 'p1' });
    assert.equal(s.hostId, 'p2');
    assert.equal(s.game.names.p1, 'Rowan', 'history still has their name');
  });
});

describe('purity', () => {
  test('reduce never mutates its input and unknown actions are rejected', () => {
    let s = deepFreeze(ackAll(started(5)));
    s = deepFreeze(act(s, { type: 'SELECT', actor: leaderOf(s), team: pickTeam(s, 2) }));
    s = deepFreeze(propose(s, pickTeam(s, sizeOf(s))));
    s = deepFreeze(voteAll(s, true));
    assert.equal(s.phase, 'vote_reveal');
    reject(s, { type: 'HACK' }, 'err.badAction');
    assert.equal(reduce(s, null).error.code, 'err.badAction');
  });

  test('same seed and actions give the same game', () => {
    const a = runQuest(ackAll(started(7, {}, 99)));
    const b = runQuest(ackAll(started(7, {}, 99)));
    assert.deepEqual(a, b);
    assert.notDeepEqual(started(7, {}, 1).game.roles, started(7, {}, 2).game.roles);
  });

  test('createRoom starts empty in the lobby with default settings', () => {
    const s = createRoom({ code: 'ABCD', seed: 5 });
    assert.deepEqual([s.phase, s.players.length, s.hostId], ['lobby', 0, null]);
    assert.deepEqual(s.config, DEFAULT_CONFIG);
  });
});
