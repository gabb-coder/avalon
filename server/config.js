// Server settings, read from environment variables (see .env.example).
// Every timing is configurable so tests can shrink them to milliseconds.

const num = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
};

const MIN = 60 * 1000;

export function loadConfig(overrides = {}) {
  return {
    port: num('PORT', 3000),
    host: process.env.HOST || '0.0.0.0',
    production: process.env.NODE_ENV === 'production',
    // The static site's URL(s), comma-separated. Empty = same origin only (local dev).
    // A trailing slash is dropped: a browser's Origin header never has one.
    allowedOrigins: (process.env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
    // Serve public/ from Express (local dev). On Render the Static Site serves it.
    serveClient: process.env.SERVE_CLIENT ? process.env.SERVE_CLIENT === 'true' : process.env.NODE_ENV !== 'production',

    seatHoldMs: num('SEAT_HOLD_MINUTES', 5) * MIN, // a disconnected player's seat is kept this long
    hostGraceMs: num('HOST_GRACE_SECONDS', 60) * 1000, // then an away host hands the crown on
    hostEndAfterMs: num('HOST_END_AFTER_MINUTES', 2) * MIN, // status bar offers "End game" after this wait
    roomIdleMs: num('ROOM_IDLE_MINUTES', 120) * MIN, // rooms with no activity are closed
    revealFallbackMs: num('REVEAL_FALLBACK_SECONDS', 20) * 1000, // reveals move on even if a phone is idle
    connectionLostMs: num('CONNECTION_LOST_SECONDS', 30) * 1000, // client shows G2 after this
    picksThrottleMs: num('PICKS_THROTTLE_MS', 150), // leader's live picks broadcast at most this often
    sweepMs: num('SWEEP_SECONDS', 60) * 1000, // how often idle rooms are looked for

    maxRooms: num('MAX_ROOMS', 500), // a cap so a script can't fill memory with empty rooms
    maxPayloadBytes: num('MAX_PAYLOAD_BYTES', 4096),
    rateLimitPerSecond: num('RATE_LIMIT_PER_SECOND', 10),
    rateLimitBurst: num('RATE_LIMIT_BURST', 20),

    redisUrl: process.env.REDIS_URL || '',
    ...overrides,
  };
}
