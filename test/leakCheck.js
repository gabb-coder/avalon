// The information-leak checker, shared by the leak tests.
//
// For one game state and every player in it, the serialized view must contain
// nothing that player isn't allowed to know. Checks run on what actually goes
// over the wire (the JSON, or exactly the strings in it), not just on fields.

import assert from 'node:assert/strict';
import { viewFor, checkSetup, ROLE_IDS } from '../src/engine/index.js';

// How many times each string occurs as a key or string value, i.e. exactly
// the quoted strings in the JSON. Built once per view, so checks are lookups.
function quotedCounts(value, counts = new Map()) {
  const add = (t) => counts.set(t, (counts.get(t) || 0) + 1);
  if (typeof value === 'string') add(value);
  else if (Array.isArray(value)) for (const x of value) quotedCounts(x, counts);
  else if (value && typeof value === 'object') {
    for (const [k, x] of Object.entries(value)) {
      if (x === undefined) continue; // JSON.stringify drops these
      add(k);
      quotedCounts(x, counts);
    }
  }
  return counts;
}

// Fail with a message built only when the check fails (this runs millions of times).
function check(ok, message) {
  if (!ok) assert.fail(typeof message === 'function' ? message() : message);
}

// The public parts every player gets, derived only from the host's settings.
function stripPublic(view) {
  const { config, setup, lastGame, ...rest } = view;
  return rest;
}

export function assertNoLeaks(s, viewFn = viewFor) {
  const g = s.game;
  const seatIds = g ? g.seats.map((id) => id.replace(/[^\w-]/g, '')).join('|') : '';
  const cardMap = new RegExp(`"(${seatIds})":"(success|fail)"`);
  const roleMap = new RegExp(`"(${seatIds})":"(${ROLE_IDS.join('|')})"`);
  const setupJson = JSON.stringify(checkSetup(s.config, s.players.length));
  const configKeys = Object.keys(s.config).sort().join();

  for (const p of s.players) {
    const view = viewFn(s, p.id);
    const where = () => `${s.phase} viewer=${p.id}`;

    // config and setup must be functions of the settings alone.
    check(JSON.stringify(view.setup) === setupJson, () => `${where()}: setup differs`);
    check(Object.keys(view.config).sort().join() === configKeys, () => `${where()}: config keys`);

    if (!g) {
      check(view.game === null, () => `${where()}: game view without a game`);
      continue;
    }
    const v = view.game;
    const body = JSON.stringify(stripPublic(view));
    const tokens = quotedCounts(stripPublic(view));
    const n = (t) => tokens.get(t) || 0;
    const over = s.phase === 'game_over';
    const myRole = g.roles[p.id];

    // 1. No other role name appears anywhere (until game over). Your own
    //    appears exactly once, as me.role.
    if (!over) {
      for (const r of ROLE_IDS) {
        check(n(r) === (r === myRole ? 1 : 0), () => `${where()}: role ${r} appears ${n(r)} times (own role ${myRole})`);
      }
      check(v.roles === null, () => `${where()}: roles map before game over`);
    }

    // 2. No player id is ever mapped to a role or a quest card (e.g. a spread
    //    secret map). At game over the roles map is allowed; cards never are.
    check(!cardMap.test(body), () => `${where()}: card mapped to player`);
    if (!over) check(!roleMap.test(body), () => `${where()}: role mapped to player`);

    // 3. Votes stay secret until everyone has voted: only WHO has voted.
    if (s.phase === 'vote') {
      const { proposals, ...rest } = v;
      const live = JSON.stringify(rest);
      check(!live.includes('"approve"') && !live.includes('"reject"'), () => `${where()}: live vote leaked`);
      check(proposals.length === g.proposals.length, () => `${where()}: unresolved proposal in history`);
      check(Object.keys(v.proposal).sort().join() === 'leader,picks,team,voted', () => `${where()}: proposal fields`);
    }

    // 4. Quest cards: during the quest only WHO has played. Your own card isn't echoed back.
    if (s.phase === 'quest') {
      const { quests, ...rest } = v;
      const live = JSON.stringify(rest);
      check(!live.includes('"success"') && !live.includes('"fail"'), () => `${where()}: live card leaked`);
      check(Object.keys(v.questPlay).sort().join() === 'played,team', () => `${where()}: questPlay fields`);
    }

    // 5. Exactly your own night info, and only your own Lady results.
    check(n('kind') === 1, () => `${where()}: night info appears ${n('kind')} times`);
    check(JSON.stringify(v.me.night) === JSON.stringify(g.night[p.id]), () => `${where()}: night info differs`);
    const mine = g.lady ? g.lady.results.filter((r) => r.holder === p.id) : [];
    check(v.me.ladyResults.length === mine.length, () => `${where()}: Lady results`);
    check(n('seenTeam') === mine.length, () => `${where()}: someone else's Lady result`);

    // 6. The word "evil" appears only where this player is entitled to it:
    //    their own team, their own night-info kind, their own Lady results.
    //    (From the assassination on, Evil is public.)
    if (s.phase !== 'assassination' && !over) {
      const expected = (v.me.team === 'evil' ? 1 : 0) + (v.me.night.kind === 'evil' ? 1 : 0)
        + mine.filter((r) => r.seenTeam === 'evil').length;
      check(n('evil') === expected, () => `${where()}: "evil" appears ${n('evil')} times, expected ${expected}`);
      check(v.assassinId === null && v.evilIds === null && v.winner === null, () => `${where()}: endgame info early`);
    }

    // 7. Raw state hygiene: once a quest is revealed, who played what is gone.
    if (g.questPlay && s.phase !== 'quest') check(g.questPlay.cards === null, () => `${where()}: cards kept`);
  }
}

