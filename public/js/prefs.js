// Small settings kept on this phone (localStorage). Storage can be missing or
// throw (private browsing, blocked storage), so every access is wrapped and
// the app works without it, just without remembering anything.
//
// Nothing secret about the game is ever stored here: only the player's name,
// display settings, and the session token that lets this phone reclaim its seat.

const PREFIX = 'avalon.';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore: storage unavailable
  }
}

export const prefs = {
  get name() { return read('name', ''); },
  set name(v) { write('name', v); },

  // One token per phone, issued by the server on the first create/join and
  // sent with every later one, so the server can recognise this phone.
  get token() { return read('token', null); },
  set token(v) { write('token', v); },

  // The room this phone last sat in: { code, playerId, active }. `active`
  // means "we were in it": on reload we go straight back in.
  get session() { return read('session', null); },
  set session(v) { write('session', v); },

  // 'en' | 'zh-Hans', or null: follow the phone's language (see i18n.js).
  get lang() { return read('lang', null); },
  set lang(v) { write('lang', v); },

  get textScale() { return read('textScale', 1); }, // 1 | 1.15 | 1.3
  set textScale(v) { write('textScale', v); },

  get reduceMotion() { return read('reduceMotion', false); },
  set reduceMotion(v) { write('reduceMotion', v); },

  get vibrate() { return read('vibrate', true); },
  set vibrate(v) { write('vibrate', v); },
};
