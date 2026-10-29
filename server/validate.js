// Shape checks for every client intent. All client input is treated as hostile:
// each validator returns a clean object with only the expected fields, or null.
// These check types and lengths only; game rules (phase, turn, permissions)
// are checked by the engine.

import { C2S, CODE_PATTERN, TOKEN_PATTERN } from '../shared/protocol.js';

const ID_MAX = 32;
const NAME_RAW_MAX = 64; // the engine trims and enforces the real 16-character limit
const CONFIG_KEYS = ['percival', 'morgana', 'mordred', 'oberon', 'lady', 'oberonSeenByMerlin'];

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = (x) => typeof x === 'string' && x.length > 0 && x.length <= ID_MAX;

function code(x) {
  if (typeof x !== 'string') return null;
  const c = x.trim().toUpperCase();
  return CODE_PATTERN.test(c) ? c : null;
}

// Optional token: absent is fine; present must be well-formed.
function optToken(x) {
  if (x === undefined || x === null) return { ok: true, value: null };
  return typeof x === 'string' && TOKEN_PATTERN.test(x) ? { ok: true, value: x } : { ok: false };
}

function name(x) {
  return typeof x === 'string' && x.length <= NAME_RAW_MAX ? x : null;
}

function team(x) {
  if (!Array.isArray(x) || x.length > 10 || !x.every(isId)) return null;
  return x.slice();
}

// Intents without a payload. Socket.IO turns a missing payload into null.
const empty = (p) => (p === undefined || p === null || isObj(p) ? {} : null);

export const validators = {
  [C2S.ROOM_CREATE](p) {
    if (!isObj(p)) return null;
    const t = optToken(p.token);
    const n = name(p.name);
    return t.ok && n !== null ? { name: n, token: t.value } : null;
  },
  [C2S.ROOM_JOIN](p) {
    if (!isObj(p)) return null;
    const t = optToken(p.token);
    const c = code(p.code);
    const n = name(p.name);
    return t.ok && c && n !== null ? { code: c, name: n, token: t.value } : null;
  },
  [C2S.ROOM_CHECK](p) {
    if (!isObj(p)) return null;
    const t = optToken(p.token);
    const c = code(p.code);
    return t.ok && c ? { code: c, token: t.value } : null;
  },
  [C2S.SESSION_RESUME](p) {
    if (!isObj(p)) return null;
    const c = code(p.code);
    return c && typeof p.token === 'string' && TOKEN_PATTERN.test(p.token) ? { code: c, token: p.token } : null;
  },
  [C2S.ROOM_LEAVE]: empty,
  [C2S.LOBBY_SET_CONFIG](p) {
    if (!isObj(p) || !isObj(p.config)) return null;
    const entries = Object.entries(p.config);
    if (entries.length === 0 || !entries.every(([k, v]) => CONFIG_KEYS.includes(k) && typeof v === 'boolean')) return null;
    return { config: Object.fromEntries(entries) };
  },
  [C2S.LOBBY_KICK](p) {
    if (!isObj(p) || !isId(p.playerId)) return null;
    if (p.block !== undefined && typeof p.block !== 'boolean') return null;
    return { playerId: p.playerId, block: !!p.block };
  },
  [C2S.LOBBY_ADD_BOT]: empty,
  [C2S.HOST_TRANSFER]: (p) => (isObj(p) && isId(p.playerId) ? { playerId: p.playerId } : null),
  [C2S.GAME_START]: empty,
  [C2S.NIGHT_ACK]: empty,
  [C2S.TEAM_SELECT]: (p) => (isObj(p) && team(p.team) ? { team: team(p.team) } : null),
  [C2S.TEAM_PROPOSE]: (p) => (isObj(p) && team(p.team) ? { team: team(p.team) } : null),
  [C2S.VOTE_CAST]: (p) => (isObj(p) && typeof p.approve === 'boolean' ? { approve: p.approve } : null),
  [C2S.REVEAL_CONTINUE]: empty,
  [C2S.QUEST_PLAY]: (p) => (isObj(p) && (p.card === 'success' || p.card === 'fail') ? { card: p.card } : null),
  [C2S.LADY_INSPECT]: (p) => (isObj(p) && isId(p.playerId) ? { playerId: p.playerId } : null),
  [C2S.LADY_PASS]: empty,
  [C2S.ASSASSIN_GUESS]: (p) => (isObj(p) && isId(p.playerId) ? { playerId: p.playerId } : null),
  [C2S.GAME_REMATCH]: empty,
  [C2S.GAME_END]: empty,
};
