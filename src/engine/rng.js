// A small seedable random number generator (mulberry32).
//
// The whole generator state is one 32-bit number, stored in the game state, so
// games are reproducible in tests and can be saved and restored (e.g. to Redis).
// The server seeds each room from crypto.randomInt and never sends the seed or
// state to any client, which is what keeps dealt roles and the quest-card
// shuffle unpredictable to players.

export function makeRng(seed) {
  let s = seed >>> 0;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(n) {
    return Math.floor(next() * n);
  }

  // Fisher–Yates on a copy; the input array is left alone.
  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  return {
    next,
    int,
    shuffle,
    get state() {
      return s;
    },
  };
}
