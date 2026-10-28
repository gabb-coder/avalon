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

  test('the static build copies everything the page imports', () => {
    execFileSync(process.execPath, [path.join(root, 'scripts/buildStatic.js')], { stdio: 'ignore' });
    assert.equal(read('public/shared/protocol.js'), read('shared/protocol.js'));
    assert.ok(fs.statSync(path.join(root, 'public/vendor/socket.io.esm.min.js')).size > 10000);
  });
});
