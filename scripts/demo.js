// A watchable demo: starts the game server in-process, seats bot players
// over real WebSockets, plays one full game, and prints what happens.
//
//   npm run demo          7 players
//   npm run demo -- 10    any count from 5 to 10
//
// Every bot acts only on its own view, exactly like a phone. Lines marked
// "[only X sees]" are printed from that one bot's private view.

import { C2S } from '../shared/protocol.js';
import { startServer, newClients, step, closeAll } from '../test/socketClient.js';

const NAMES = ['Rowan', 'Ilse', 'Tomas', 'Kofi', 'Mei', 'Sana', 'Jude', 'Priya', 'Ana', 'Wen'];
const ROLE = {
  merlin: 'Merlin', percival: 'Percival', servant: 'Loyal Servant', assassin: 'Assassin',
  morgana: 'Morgana', mordred: 'Mordred', oberon: 'Oberon', minion: 'Minion',
};
const REASON = {
  threeFails: 'three quests failed',
  fiveRejects: 'five teams were rejected in a row',
  assassinHit: 'the Assassin found Merlin',
  assassinMiss: 'Good won three quests and the Assassin missed Merlin',
};

const n = Math.min(10, Math.max(5, Number(process.argv[2]) || 7));
const say = (s = '') => console.log(s);

const server = await startServer();
const bots = await newClients(server.url, n);
const created = await bots[0].create(NAMES[0]);
for (let i = 1; i < n; i++) await bots[i].join(created.code, NAMES[i]);

// Turn on every optional role that fits, and the Lady from 7 players.
const evilSeats = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 }[n];
const config = { percival: true, morgana: true, mordred: evilSeats >= 3, oberon: evilSeats >= 4, lady: n >= 7 };
await bots[0].req(C2S.LOBBY_SET_CONFIG, { config });
await bots[0].req(C2S.GAME_START);
await step([]); // let the first broadcast land
await new Promise((r) => setTimeout(r, 50));

const name = (v, id) => v.game.names[id];
const list = (v, ids) => ids.map((id) => name(v, id)).join(', ') || 'no one';

say(`Room ${created.code} · ${n} players · ${Object.entries(config).filter(([, on]) => on).map(([k]) => k).join(', ')}`);
say('');
say('NIGHT: each phone shows its owner, and only its owner:');
for (const b of bots) {
  const { me } = b.view.game;
  const seen = me.night.seen.length ? list(b.view, me.night.seen) : null;
  const what = {
    evil: me.role === 'merlin' ? `Evil you can see: ${seen}` : `your fellow Evil: ${seen}`,
    maybe: `one of these is Merlin: ${seen}`,
    sure: `Merlin is ${seen}`,
    none: 'you saw no one',
  }[me.night.kind];
  say(`  [only ${NAMES[bots.indexOf(b)]} sees] ${ROLE[me.role]} (${me.team === 'good' ? 'Good' : 'Evil'}). ${what}.`);
}
say('');

let shownProposals = 0;
let shownQuests = 0;
let shownLady = 0;
const host = bots[0];

while (host.view.phase !== 'game_over') {
  if (!(await step(bots, Math.random))) throw new Error(`stuck in ${host.view.phase}`);
  const v = host.view;
  const g = v.game;
  for (; shownProposals < g.proposals.length; shownProposals++) {
    const p = g.proposals[shownProposals];
    const yes = g.seats.filter((id) => p.votes[id] === 'approve');
    const no = g.seats.filter((id) => p.votes[id] === 'reject');
    say(`Quest ${p.quest + 1}, proposal ${p.attempt}: ${name(v, p.leader)} picks ${list(v, p.team)}`);
    say(`  ${p.approved ? 'APPROVED' : 'REJECTED'} ${yes.length}–${no.length} · approve: ${list(v, yes)} · reject: ${list(v, no)}`);
  }
  for (; shownQuests < g.quests.filter((q) => q.result).length; shownQuests++) {
    const q = g.quests[shownQuests];
    const note = q.failsNeeded === 2 ? ' (this quest needed 2 fails)' : '';
    say(`  QUEST ${shownQuests + 1} ${q.result === 'success' ? 'SUCCEEDS' : 'FAILS'}: ${q.successes} Success, ${q.fails} Fail${note}`);
    say('');
  }
  if (g.lady && g.lady.target && shownLady < g.lady.pastHolders.length) {
    shownLady = g.lady.pastHolders.length;
    const holder = bots.find((b) => b.id === g.lady.holder);
    const result = holder.view.game.me.ladyResults.at(-1);
    say(`LADY OF THE LAKE: ${name(v, g.lady.holder)} looks into ${name(v, g.lady.target)}`);
    say(`  [only ${name(v, g.lady.holder)} sees] ${name(v, result.target)} is ${result.seenTeam === 'good' ? 'Good' : 'Evil'}`);
    say('');
  }
}

const g = host.view.game;
if (g.guess) {
  say(`ASSASSINATION: ${name(host.view, g.assassinId)}, the Assassin, names ${name(host.view, g.guess)} as Merlin.`);
}
say(`GAME OVER: ${g.winner === 'good' ? 'Good' : 'Evil'} wins, because ${REASON[g.winReason]}.`);
say('Everyone\'s role: ' + g.seats.map((id) => `${name(host.view, id)} ${ROLE[g.roles[id]]}`).join(' · '));

await closeAll();
process.exit(0);
