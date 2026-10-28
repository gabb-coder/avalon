// Client checks that run in plain Node (no browser): strings, the i18n
// formatter, the shipped stylesheet, and the rules about how the client may
// touch the DOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { format, setMessages, t } from '../public/js/i18n.js';
import { ERR, ROLE_IDS, PHASES } from '../src/engine/index.js';
import { SERVER_ERRORS } from '../shared/protocol.js';
import { endOfferDue } from '../public/js/components/board.js';
import { turnKey } from '../public/js/device.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const en = JSON.parse(read('public/i18n/en.json'));

function clientFiles(dir = 'public/js') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? clientFiles(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : [],
  );
}

describe('i18n formatter', () => {
  test('arguments, plurals with #, exact matches and select', () => {
    assert.equal(format('Hello {name}', { name: 'Rowan' }), 'Hello Rowan');
    const waiting = 'Waiting on {n, plural, one {# player} other {# players}}';
    assert.equal(format(waiting, { n: 1 }), 'Waiting on 1 player');
    assert.equal(format(waiting, { n: 3 }), 'Waiting on 3 players');
    assert.equal(format('{n, plural, =0 {nobody} one {# knight} other {# knights}}', { n: 0 }), 'nobody');
    assert.equal(format('{team, select, good {Good} evil {Evil} other {?}}', { team: 'evil' }), 'Evil');
    assert.equal(format('Need {n} more {n, plural, one {player} other {players}} · 5 minimum', { n: 2 }), 'Need 2 more players · 5 minimum');
  });

  test('Chinese has no plural forms: "other" is used for every number', () => {
    assert.equal(format('{n, plural, one {# 人} other {# 人}}', { n: 1 }, 'zh'), '1 人');
  });

  test('copy-deck messages render as designed', () => {
    setMessages(en);
    assert.equal(t('start.tooManyEvil', { p: 7, e: 3, r: 4 }), '7 players have 3 Evil seats, but 4 Evil roles are on. Turn one off.');
    assert.equal(t('name.taken', { name: 'Kofi' }), 'Someone in this room is already “Kofi”. Try “Kofi B”.');
    assert.equal(t('code.full', { code: 'KQVX', n: 10 }), 'Room KQVX is full (10 of 10).');
    assert.equal(t('start.tooFew', { n: 1 }), 'Need 1 more player · 5 minimum');
    assert.equal(t('lobby.servants', { n: 2 }), '2 Loyal Servants');
    assert.equal(t('intel.merlinHidden', { n: 1, roles: 'Mordred' }), 'One Evil player is hidden from you (Mordred is in this game).');
  });
});

describe('strings', () => {
  // Keys built at runtime, listed here so a missing one fails the test.
  const dynamicKeys = [
    ...ROLE_IDS.flatMap((r) => [`role.${r}.name`, `role.${r}.ability`]),
    ...['good', 'evil'].map((x) => `team.${x}`),
    ...PHASES.map((p) => `phase.${p}`),
    ...['hostEnded', 'seatExpired', 'idle', 'empty', 'gone', 'seatGone', 'kicked'].map((r) => `ended.${r}`),
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`howto.${n}.title`, `howto.${n}.text`]),
    ...[...ROLE_IDS, 'lady'].flatMap((r) => [`glossary.${r}.ability`, `glossary.${r}.sees`]),
    ...['percival', 'morgana', 'mordred', 'oberon', 'lady'].map((k) => `lobby.desc.${k}`),
    ...['percivalMaybe', 'percivalSure', 'oberonHidden', 'minion', 'assassin', 'morgana', 'morganaNoPercival', 'mordred', 'oberon', 'servant'].map((k) => `intel.note.${k}`),
    ...['left', 'away', 'handed'].map((r) => `host.reason.${r}`),
    ...['assassinMiss', 'assassinHit', 'threeFails', 'fiveRejects'].map((r) => `over.reason.${r}`),
    // Every error code the engine or server can send back.
    ...Object.values(ERR),
    ...Object.values(SERVER_ERRORS),
    'err.timeout',
    'start.tooFew', 'start.tooManyEvil', 'start.morganaNoPercival',
  ];

  test('every key the client uses exists in en.json', () => {
    const used = new Set(dynamicKeys);
    for (const file of clientFiles()) {
      for (const m of read(file).matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !(k in en));
    assert.deepEqual(missing, [], `missing strings: ${missing.join(', ')}`);
  });

  test('every message parses and renders without leftover braces', () => {
    for (const [key, msg] of Object.entries(en)) {
      const out = format(msg, { n: 2, total: 7, code: 'KQVX', name: 'Rowan', names: 'Kofi and Mei', p: 7, e: 3, r: 4, q: 1, x: 1, host: 'Rowan', roles: 'Mordred', role: 'Merlin', team: 'Good', who: 'x', sees: 'y', title: 'Avalon', max: 10, min: 5 }, 'en');
      assert.ok(!/[{}]/.test(out), `${key} rendered as "${out}"`);
    }
  });

  test('the full game title never appears in strings (branding guardrail)', () => {
    assert.ok(!JSON.stringify(en).includes('Resistance'));
  });
});

describe('shipping rules', () => {
  test('public/css/rt.css is an unchanged copy of design/rt.css', () => {
    assert.equal(read('public/css/rt.css'), read('design/rt.css'));
  });

  test('no innerHTML, no eval, no inline style attributes in client code', () => {
    for (const file of clientFiles()) {
      const src = read(file);
      assert.ok(!/\.(inner|outer)HTML\b|insertAdjacentHTML/.test(src), `${file} writes HTML`);
      assert.ok(!/\beval\(|new Function\(/.test(src), `${file} evaluates code`);
      assert.ok(!/setAttribute\(\s*'style'/.test(src) && !/\bstyle:\s*'[^']*:/.test(src), `${file} sets an inline style attribute`);
    }
  });

  test('index.html has no inline scripts or styles (the CSP forbids them)', () => {
    const html = read('public/index.html');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'inline <script>');
    assert.ok(!/<style\b/.test(html), 'inline <style>');
    assert.ok(!/\sstyle="/.test(html), 'style attribute');
    assert.match(html, /viewport-fit=cover/);
  });

  test('app.css uses rt.css tokens rather than new hex colours', () => {
    const css = read('public/css/app.css');
    const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(hexes, []);
  });

  test('no secret role words in board-level markup files (only built while held)', () => {
    // The role card front and the Peek sheet are the only places that render
    // a role; both are created in hold handlers. Make sure no screen renders
    // roleFront/peekSheet outside a hold callback.
    for (const file of clientFiles()) {
      const src = read(file);
      for (const fn of ['roleFront(', 'peekSheet(']) {
        let i = src.indexOf(fn);
        while (i !== -1) {
          const before = src.slice(Math.max(0, i - 400), i);
          const isDefinition = /export function\s*$/.test(src.slice(Math.max(0, i - 20), i));
          assert.ok(isDefinition || /onShow/.test(before), `${file} calls ${fn} outside a hold handler`);
          i = src.indexOf(fn, i + 1);
        }
      }
    }
  });

  test('the host is offered "End game" after 2 minutes waiting on a needed player (decision 3)', () => {
    const MIN = 60000;
    const now = 10 * MIN;
    const app = { hello: { hostEndAfterMs: 2 * MIN }, serverNow: () => now };
    const view = (over = {}) => ({
      you: 'a',
      hostId: 'a',
      players: [
        { id: 'a', connected: true, disconnectedAt: null },
        { id: 'b', connected: false, disconnectedAt: now - 3 * MIN },
        { id: 'c', connected: true, disconnectedAt: null },
      ],
      game: { seats: ['a', 'b', 'c'], waitingOn: ['b'], names: {} },
      ...over,
    });
    assert.ok(endOfferDue(view(), app) <= 0, 'away 3 minutes and needed: offered now');
    assert.equal(endOfferDue(view({ hostId: 'c' }), app), Infinity, 'only the host');
    assert.equal(endOfferDue(view({ game: { seats: ['a', 'b', 'c'], waitingOn: ['c'], names: {} } }), app), Infinity, 'away but not needed: play continues');
    const recent = view();
    recent.players[1].disconnectedAt = now - 30000;
    assert.equal(endOfferDue(recent, app), 90000, 'away 30 s: offered in 90 s');
  });

  test('vibration: one buzz per new turn, only for turns the table can see are yours', () => {
    const game = (over = {}) => ({ questIndex: 1, proposals: [{}, {}], proposal: { leader: 'b', voted: [] }, questPlay: null, lady: null, assassinId: null, ...over });
    const view = (phase, g) => ({ you: 'a', phase, game: g });
    assert.equal(turnKey(view('propose', game())), null, 'not the leader');
    assert.ok(turnKey(view('propose', game({ proposal: { leader: 'a', voted: [] } }))), 'leader');
    const vote = turnKey(view('vote', game()));
    assert.ok(vote, 'everyone votes');
    assert.equal(turnKey(view('vote', game({ proposal: { leader: 'b', voted: ['a'] } }))), null, 'already voted');
    assert.notEqual(turnKey(view('vote', game({ proposals: [{}, {}, {}] }))), vote, 'the next vote is a new turn');
    assert.equal(turnKey(view('quest', game({ questPlay: { team: ['b', 'c'], played: [] } }))), null, 'not on the team');
    assert.ok(turnKey(view('quest', game({ questPlay: { team: ['a', 'c'], played: [] } }))), 'on the team');
    assert.ok(turnKey(view('lady', game({ lady: { holder: 'a', target: null, afterQuest: 1 } }))), 'Lady holder');
    assert.equal(turnKey(view('assassination', game({ assassinId: 'b' }))), null, 'not the Assassin');
    assert.ok(turnKey(view('assassination', game({ assassinId: 'a' }))), 'the Assassin, who is public by then');
    for (const phase of ['lobby', 'night', 'vote_reveal', 'quest_result', 'game_over']) assert.equal(turnKey(view(phase, game())), null, phase);
  });

  test("the Lady's answer card is built only by the Lady screen, while shown", () => {
    // D15's parchment card is secret. lady.js puts it on screen right after
    // looking (`shown`) or inside a hold's onShow; no other file may build it.
    for (const file of clientFiles()) {
      const src = read(file);
      let i = src.indexOf('ladyCard(');
      while (i !== -1) {
        const isDefinition = /export function\s*$/.test(src.slice(Math.max(0, i - 20), i));
        if (!isDefinition) {
          assert.ok(file.endsWith('screens/lady.js'), `${file} builds the Lady's answer`);
          const before = src.slice(Math.max(0, i - 300), i);
          assert.ok(/onShow|if \(shown && r\)/.test(before), `${file} builds the Lady's answer outside a shown/held branch`);
        }
        i = src.indexOf('ladyCard(', i + 1);
      }
    }
  });

  test('the static build copies everything the page imports', () => {
    execFileSync(process.execPath, [path.join(root, 'scripts/buildStatic.js')], { stdio: 'ignore' });
    assert.equal(read('public/shared/protocol.js'), read('shared/protocol.js'));
    assert.ok(fs.statSync(path.join(root, 'public/vendor/socket.io.esm.min.js')).size > 10000);
  });
});
