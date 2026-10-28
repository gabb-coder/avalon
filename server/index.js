// Starts the game server. On Render: `npm start`, listening on $PORT at 0.0.0.0.

import { createServer } from './app.js';
import { log } from './log.js';

// Keep serving other rooms if something unexpected slips through. Rooms are
// isolated (each is its own state, changed only by the pure engine), so one
// broken room can't corrupt another.
process.on('uncaughtException', (err) => log.error('process.uncaughtException', err));
process.on('unhandledRejection', (err) => log.error('process.unhandledRejection', err));

const app = createServer();
const port = await app.listen();
log.info('server.listen', { port, serveClient: app.config.serveClient, origins: app.config.allowedOrigins.length });

async function shutdown(signal) {
  log.info('server.shutdown', { signal });
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
