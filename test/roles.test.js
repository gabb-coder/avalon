import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEAM_SIZES, DEFAULT_CONFIG, OPTIONAL_ROLES, checkSetup, teamOf, makeRng, assignRoles, nightInfoAll, ladySees,
} from '../src/engine/index.js';
import { ids } from './helpers.js';

// Every combination of the four optional roles, both Oberon settings.
function* allConfigs() {
  for (let mask = 0; mask < 16; mask++) {
    for (const oberonSeenByMerlin of [true, false]) {
      const cfg = { ...DEFAULT_CONFIG, oberonSeenByMerlin };
      OPTIONAL_ROLES.forEach((r, i) => {
        cfg[r] = !!(mask & (1 << i));
      });
      yield cfg;
    }
  }
}

function* validSetups() {
  for (let n = 5; n <= 10; n++) {
    for (const cfg of allConfigs()) if (checkSetup(cfg, n).canStart) yield { n, cfg };
  }
}

test('role distribution for 5–10 players and every valid config', () => {
  let checked = 0;
  for (const { n, cfg } of validSetups()) {
    for (let seed = 1; seed <= 5; seed++) {
      const seats = ids(n);
      const roles = assignRoles(seats, cfg, makeRng(seed));
      const dealt = seats.map((id) => roles[id]);
      assert.equal(dealt.filter((r) => teamOf(r) === 'good').length, TEAM_SIZES[n].good);
      assert.equal(dealt.filter((r) => teamOf(r) === 'evil').length, TEAM_SIZES[n].evil);
      assert.equal(dealt.filter((r) => r === 'merlin').length, 1);
      assert.equal(dealt.filter((r) => r === 'assassin').length, 1);
      for (const r of OPTIONAL_ROLES) assert.equal(dealt.filter((x) => x === r).length, cfg[r] ? 1 : 0, `${r} n=${n}`);
      checked++;
    }
  }
  assert.ok(checked > 300);
});

test('dealing is deterministic per seed and varies across seeds', () => {
  const seats = ids(7);
  const a = assignRoles(seats, DEFAULT_CONFIG, makeRng(42));
  const b = assignRoles(seats, DEFAULT_CONFIG, makeRng(42));
  assert.deepEqual(a, b);
  const merlinSeats = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const r = assignRoles(seats, DEFAULT_CONFIG, makeRng(seed));
    merlinSeats.add(seats.find((id) => r[id] === 'merlin'));
  }
  assert.equal(merlinSeats.size, 7, 'Merlin should land in every seat over many seeds');
});

// Independent statement of what each role should see at night, written from
// the rules rather than from the implementation.
function expectedSeen(viewer, seats, roles, cfg) {
  const role = roles[viewer];
  const others = seats.filter((id) => id !== viewer);
  const isEvil = (id) => teamOf(roles[id]) === 'evil';
  switch (role) {
    case 'merlin':
      return others.filter((id) => isEvil(id) && roles[id] !== 'mordred' && (roles[id] !== 'oberon' || cfg.oberonSeenByMerlin));
    case 'percival':
      return others.filter((id) => roles[id] === 'merlin' || roles[id] === 'morgana');
    case 'oberon':
      return [];
    case 'assassin': case 'morgana': case 'mordred': case 'minion':
      return others.filter((id) => isEvil(id) && roles[id] !== 'oberon');
    default:
      return [];
  }
}

test('night info for every role, every optional-role combination and both Oberon settings', () => {
  let checked = 0;
  for (const { n, cfg } of validSetups()) {
    for (let seed = 1; seed <= 3; seed++) {
      const seats = ids(n);
      const rng = makeRng(seed);
      const roles = assignRoles(seats, cfg, rng);
      const night = nightInfoAll(seats, roles, cfg, rng);
      for (const id of seats) {
        const info = night[id];
        const want = expectedSeen(id, seats, roles, cfg);
        assert.deepEqual([...info.seen].sort(), [...want].sort(), `${roles[id]} n=${n} cfg=${JSON.stringify(cfg)}`);
        assert.ok(!info.seen.includes(id), 'nobody sees themselves');
        const role = roles[id];
        if (role === 'percival') assert.equal(info.kind, cfg.morgana ? 'maybe' : 'sure');
        else if (role === 'merlin' || (teamOf(role) === 'evil' && role !== 'oberon')) assert.equal(info.kind, 'evil');
        else assert.equal(info.kind, 'none');
        checked++;
      }
    }
  }
  assert.ok(checked > 2000);
});

test('night info contains only ids and neutral kinds, never role names', () => {
  const roleWords = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];
  for (const { n, cfg } of validSetups()) {
    const seats = ids(n);
    const rng = makeRng(n);
    const night = nightInfoAll(seats, assignRoles(seats, cfg, rng), cfg, rng);
    const json = JSON.stringify(night).toLowerCase();
    for (const w of roleWords) assert.ok(!json.includes(w), `night info mentions ${w}`);
  }
});

test("Percival's two candidates come in both orders across games", () => {
  const cfg = { ...DEFAULT_CONFIG, percival: true, morgana: true };
  const seats = ids(7);
  const firstIsMerlin = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const rng = makeRng(seed);
    const roles = assignRoles(seats, cfg, rng);
    const night = nightInfoAll(seats, roles, cfg, rng);
    const perc = seats.find((id) => roles[id] === 'percival');
    firstIsMerlin.add(roles[night[perc].seen[0]] === 'merlin');
  }
  assert.deepEqual([...firstIsMerlin].sort(), [false, true]);
});

test('the Lady shows teams, and Oberon follows the Oberon setting', () => {
  const seen = { ...DEFAULT_CONFIG, oberonSeenByMerlin: true };
  const hidden = { ...DEFAULT_CONFIG, oberonSeenByMerlin: false };
  for (const r of ['merlin', 'percival', 'servant']) assert.equal(ladySees(r, seen), 'good');
  for (const r of ['assassin', 'morgana', 'mordred', 'minion', 'oberon']) assert.equal(ladySees(r, seen), 'evil');
  assert.equal(ladySees('mordred', hidden), 'evil', 'Mordred always counts as Evil for the Lady');
  assert.equal(ladySees('oberon', hidden), 'good');
});
