// A token bucket per socket: `burst` events at once, refilled at `perSecond`.
// Generous for a person tapping, tight enough to stop a script flooding a room.

export function makeRateLimiter({ perSecond, burst, now = () => Date.now() }) {
  let tokens = burst;
  let last = now();
  return function allow() {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
