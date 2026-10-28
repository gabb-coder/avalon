// Starts the game server. On Render: `npm start`, listening on $PORT at 0.0.0.0.

import { createServer } from './app.js';
import { loadConfig } from './config.js';
import { createRoomStore, RedisRoomStore } from './roomStore.js';
import { log } from './log.js';

// Keep serving other rooms if something unexpected slips through. Rooms are
// isolated (each is its own state, changed only by the pure engine), so one
// broken room can't corrupt another.
process.on('uncaughtException', (err) => log.error('process.uncaughtException', err));
process.on('unhandledRejection', (err) => log.error('process.unhandledRejection', err));

// Rooms live in memory, or also in Redis when REDIS_URL is set (so games
// survive a restart or redeploy).
const store = await createRoomStore(loadConfig());
const app = createServer({}, { store });
let port;
try {
  port = await app.listen();
} catch (err) {
  // Can't listen (port taken, no permission): exit, so Render sees the
  // failure and restarts, instead of a process that runs but serves nothing.
  log.error('server.listenFailed', err);
  process.exit(1);
}
log.info('server.listen', { port, serveClient: app.config.serveClient, origins: app.config.allowedOrigins.length, rooms: store instanceof RedisRoomStore ? 'redis' : 'memory' });

async function shutdown(signal) {
  log.info('server.shutdown', { signal });
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
