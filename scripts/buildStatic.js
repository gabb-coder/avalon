// Prepares public/ to be served as a static site (Render's build step).
// There is no bundling or transpiling: files are copied as they are.
//
//   1. Copies the shared protocol file and the Socket.IO browser client in.
//      (In local dev, `npm run dev`, Express serves both from their sources.)
//   2. If SERVER_URL is set (the game server's address, e.g.
//      https://avalon-server.onrender.com), writes it into public/config.js,
//      and adds a Content-Security-Policy <meta> to index.html that lets the
//      page connect to that one server only. render.yaml's CSP header allows
//      any *.onrender.com server, because the address isn't known when that
//      file is written; the browser applies both, so the narrower one wins.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// BUILD_ROOT: tests run the build on a throwaway copy instead of the repo.
const root = process.env.BUILD_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (p) => path.join(root, p);

const copies = [
  ['shared/protocol.js', 'public/shared/protocol.js'],
  ['node_modules/socket.io-client/dist/socket.io.esm.min.js', 'public/vendor/socket.io.esm.min.js'],
];
for (const [from, to] of copies) {
  fs.mkdirSync(path.dirname(file(to)), { recursive: true });
  fs.copyFileSync(file(from), file(to));
  console.log(`copied ${from} -> ${to}`);
}

const raw = (process.env.SERVER_URL || '').trim().replace(/\/+$/, '');
if (!raw) {
  console.log('SERVER_URL is not set: the page will look for the game server on its own address (fine for local use).');
  process.exit(0);
}

let server;
try {
  server = new URL(raw);
} catch {
  console.error(`SERVER_URL "${raw}" is not a web address. It should look like https://avalon-server.onrender.com`);
  process.exit(1);
}
if (server.protocol !== 'https:' && server.hostname !== 'localhost' && server.hostname !== '127.0.0.1') {
  console.error(`SERVER_URL must start with https:// (got ${server.protocol}//)`);
  process.exit(1);
}
const origin = server.origin; // drops any path: the socket and /healthz live at the root
const wsOrigin = origin.replace(/^http/, 'ws'); // https -> wss

// 2a. config.js: the one place the client reads the server address from.
const configPath = file('public/config.js');
const config = fs.readFileSync(configPath, 'utf8');
const line = /^export const SERVER_URL = .*;$/m;
if (!line.test(config)) {
  console.error('public/config.js has no "export const SERVER_URL = …;" line to fill in.');
  process.exit(1);
}
fs.writeFileSync(configPath, config.replace(line, `export const SERVER_URL = ${JSON.stringify(origin)};`));
console.log(`public/config.js: SERVER_URL = ${origin}`);

// 2b. index.html: the exact Content-Security-Policy for this server.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src 'self' ${origin} ${wsOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');
const htmlPath = file('public/index.html');
let html = fs.readFileSync(htmlPath, 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, '');
html = html.replace('<meta charset="utf-8">\n', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n`);
fs.writeFileSync(htmlPath, html);
console.log('public/index.html: Content-Security-Policy limited to that server');
