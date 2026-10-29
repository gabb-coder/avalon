// Bots: the engine's rules for them, the brain's moves (every one legal, every
// game finishes), and a human playing with bots over real sockets.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRoom, reduce, viewFor, checkSetup, MAX_PLAYERS, BOT_LEVELS } from '../src/engine/index.js';
import { botDuty, botMove } from '../server/botBrain.js';
import { C2S } from '../shared/protocol.js';
import { act, reject, lobby, NAMES } from './helpers.js';
import { allConfigs } from './bots.js';
import { startServer, Client, closeAll } from './socketClient.js';

after(closeAll);

const addBot = (s, id, name = `Bot ${id}`) => act(s, { type: 'ADD_BOT', actor: s.hostId, playerId: id, name });

describe('bots in the engine', () => {
  test('only the host, only in the lobby, only while there is a free seat', () => {
    let s = lobby(2);
    reject(s, { type: 'ADD_BOT', actor: 'p2', playerId: 'b1', name: 'Gawain' }, 'err.notHost');
    s = addBot(s, 'b1', 'Gawain');
    assert.deepEqual(s.players.at(-1), { id: 'b1', name: 'Gawain', connected: true, disconnectedAt: null, joinedAt: 0, bot: true });
    reject(s, { type: 'ADD_BOT', actor: 'p1', playerId: 'b2', name: 'gawain' }, 'name.taken');
    for (let i = 2; s.players.length < MAX_PLAYERS; i++) s = addBot(s, `b${i}`);
    reject(s, { type: 'ADD_BOT', actor: 'p1', playerId: 'bx', name: 'One more' }, 'code.full');
    s = act(s, { type: 'START', actor: 'p1' });
    reject(s, { type: 'ADD_BOT', actor: 'p1', playerId: 'by', name: 'Late' }, 'err.phase');
  });

  test('everyone can see who is a bot', () => {
    const s = addBot(lobby(2), 'b1');
    assert.deepEqual(viewFor(s, 'p2').players.map((p) => p.bot), [false, false, true]);
  });

  test('a bot is never host: not handed it, not given it when the host is away or leaves', () => {
    let s = addBot(lobby(1), 'b1');
    s = addBot(s, 'b2');
    s = act(s, { type: 'JOIN', playerId: 'p2', name: 'Ilse' });
    reject(s, { type: 'TRANSFER_HOST', actor: 'p1', to: 'b1' }, 'err.badPlayer');
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p1', connected: false, now: 1 });
    assert.equal(act(s, { type: 'HOST_AUTO' }).hostId, 'p2');
    s = act(s, { type: 'SET_CONNECTED', playerId: 'p1', connected: true, now: 2 });
    assert.equal(act(s, { type: 'LEAVE', actor: 'p1' }).hostId, 'p2');
  });

  test('when the last person leaves, the room closes even with bots seated', () => {
    let s = addBot(lobby(1), 'b1');
    const r = reduce(s, { type: 'LEAVE', actor: 'p1' });
    assert.ok(r.effects.some((e) => e.type === 'empty'));
  });

  test('the host sets how well bots play: easy, normal or clever, seen by everyone', () => {
    let s = addBot(lobby(2), 'b1');
    assert.equal(viewFor(s, 'p2').config.botLevel, 'normal');
    s = act(s, { type: 'SET_CONFIG', actor: 'p1', config: { botLevel: 'clever' } });
    assert.equal(viewFor(s, 'b1').config.botLevel, 'clever');
    reject(s, { type: 'SET_CONFIG', actor: 'p1', config: { botLevel: 'genius' } }, 'err.badAction');
    reject(s, { type: 'SET_CONFIG', actor: 'p1', config: { lady: 'clever' } }, 'err.badAction');
    reject(s, { type: 'SET_CONFIG', actor: 'p2', config: { botLevel: 'easy' } }, 'err.notHost');
  });

  test('a bot can be removed like anyone (KICK)', () => {
    const s = act(addBot(lobby(2), 'b1'), { type: 'KICK', actor: 'p1', target: 'b1' });
    assert.equal(s.players.length, 2);
  });
});

describe('the bot brain', () => {
  const rng = (seed) => {
    let x = seed >>> 0;
    const next = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    return { next, int: (n) => Math.floor(next() * n) };
  };

  // Every seat a bot: each move comes from botMove(viewFor(state, bot)).
  function playAllBots(n, config, seed) {
    let s = createRoom({ code: 'BOTS', seed });
    s = act(s, { type: 'JOIN', playerId: 'h', name: 'Host' });
    s = act(s, { type: 'SET_CONFIG', actor: 'h', config });
    for (let i = 1; i < n; i++) s = addBot(s, `b${i}`, `Bot${i}`);
    s = act(s, { type: 'START', actor: 'h' });
    const r = rng(seed);
    const plans = {};
    for (let moves = 0; moves < 2000; moves++) {
      if (s.phase === 'game_over') return s;
      const owing = s.players.map((p) => p.id).filter((id) => botDuty(viewFor(s, id)));
      assert.ok(owing.length, `nobody can move in ${s.phase}`);
      const id = owing[r.int(owing.length)];
      const view = viewFor(s, id);
      const turn = `${id}:${view.game.questIndex}.${view.game.proposals.length}`;
      const move = botMove(view, r, (plans[turn] ||= {}));
      const res = reduce(s, { ...move, actor: id, now: moves });
      assert.ok(!res.error, `${move.type} refused in ${s.phase}: ${res.error?.code}`);
      s = res.state;
    }
    assert.fail('game did not finish');
  }

  test('every move is legal and every game ends, for 5–10 players and every setup', () => {
    let games = 0;
    const ends = {};
    for (let n = 5; n <= 10; n++) {
      // Every other valid setup, with a different seed each: about 150 games.
      const configs = [...allConfigs()].filter((c) => checkSetup(c, n).canStart).filter((_, i) => i % 2 === 0);
      configs.forEach((config, i) => {
        // Each level in turn.
        const s = playAllBots(n, { ...config, botLevel: BOT_LEVELS[i % 3] }, i * 7919 + n);
        ends[s.game.winReason] = (ends[s.game.winReason] || 0) + 1;
        games++;
      });
    }
    assert.ok(games > 120, `${games} games`);
    // Bots that play sensibly reach every kind of ending.
    for (const reason of ['threeFails', 'assassinHit', 'assassinMiss']) assert.ok(ends[reason] > 0, `no ${reason} in ${JSON.stringify(ends)}`);
  });

  test('a bot only ever sees its own view (the brain imports nothing)', () => {
    const src = fs.readFileSync(new URL('../server/botBrain.js', import.meta.url), 'utf8');
    assert.ok(!/^import /m.test(src));
  });
});

describe('bots over sockets', () => {
  test('a person plays whole games with six bots, at each level', async () => {
    const server = await startServer({ botSpeed: 0 });
    const me = await new Client(server.url).connected();
    const { code } = await me.create(NAMES[0]);
    for (let i = 0; i < 6; i++) assert.ok((await me.req(C2S.LOBBY_ADD_BOT, {})).ok);
    await me.until((v) => v.players.length === 7);
    assert.equal(me.view.players.filter((p) => p.bot).length, 6);
    assert.equal(new Set(me.view.players.map((p) => p.name)).size, 7);
    await me.req(C2S.LOBBY_SET_CONFIG, { config: { lady: true, percival: true, morgana: true } });

    assert.equal((await me.req(C2S.LOBBY_SET_CONFIG, { config: { botLevel: 'genius' } })).code, 'err.badPayload');
    for (let game = 0; game < 3; game++) {
      // One game at each bot level.
      assert.ok((await me.req(C2S.LOBBY_SET_CONFIG, { config: { botLevel: BOT_LEVELS[game] } })).ok);
      assert.ok((await me.req(C2S.GAME_START, {})).ok);
      await me.until((v) => v.phase !== 'lobby');
      // The person plays simply; the bots do everything else on their own.
      const end = Date.now() + 15000;
      while (me.view.phase !== 'game_over') {
        assert.ok(Date.now() < end, `stuck in ${me.view.phase}`);
        const v = me.view;
        const g = v.game;
        let move = null;
        if (v.phase === 'night' && !g.ready.includes(v.you)) move = [C2S.NIGHT_ACK, {}];
        if (v.phase === 'propose' && g.proposal.leader === v.you) move = [C2S.TEAM_PROPOSE, { team: g.seats.slice(0, g.quests[g.questIndex].size) }];
        if (v.phase === 'vote' && !g.proposal.voted.includes(v.you)) move = [C2S.VOTE_CAST, { approve: true }];
        if ((v.phase === 'vote_reveal' || v.phase === 'quest_result') && !g.continued.includes(v.you)) move = [C2S.REVEAL_CONTINUE, {}];
        if (v.phase === 'quest' && g.questPlay.team.includes(v.you) && !g.questPlay.played.includes(v.you)) move = [C2S.QUEST_PLAY, { card: 'success' }];
        if (v.phase === 'lady' && g.lady.holder === v.you) move = g.lady.target ? [C2S.LADY_PASS, {}] : [C2S.LADY_INSPECT, { playerId: g.seats.find((id) => id !== v.you && !g.lady.pastHolders.includes(id)) }];
        if (v.phase === 'assassination' && g.assassinId === v.you) move = [C2S.ASSASSIN_GUESS, { playerId: g.seats.find((id) => !g.evilIds.includes(id)) }];
        if (move) {
          const r = await me.req(...move);
          assert.ok(r.ok || r.code === 'err.phase' || r.code === 'err.locked', `${move[0]}: ${r.code}`);
        }
        await new Promise((r) => setTimeout(r, 5));
      }
      assert.ok(me.view.game.winReason);
      assert.ok((await me.req(C2S.GAME_REMATCH, {})).ok);
      await me.until((v) => v.phase === 'lobby');
    }
    // The person leaves: a room of bots closes.
    await me.req(C2S.ROOM_LEAVE, {});
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await me.req(C2S.ROOM_CHECK, { code })).exists, false);
  });

  test('guests cannot add bots', async () => {
    const server = await startServer({ botSpeed: 0 });
    const host = await new Client(server.url).connected();
    const guest = await new Client(server.url).connected();
    const { code } = await host.create(NAMES[0]);
    await guest.join(code, NAMES[1]);
    assert.equal((await guest.req(C2S.LOBBY_ADD_BOT, {})).code, 'err.notHost');
  });
});
