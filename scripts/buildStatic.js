// Prepares public/ to be served as a static site (Render's build step):
// copies the shared protocol file and the Socket.IO browser client into it.
// There is no bundling or transpiling: the files are copied as they are.
// In local dev (`npm run dev`) Express serves both from their sources instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['shared/protocol.js', 'public/shared/protocol.js'],
  ['node_modules/socket.io-client/dist/socket.io.esm.min.js', 'public/vendor/socket.io.esm.min.js'],
];
for (const [from, to] of copies) {
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  fs.copyFileSync(path.join(root, from), path.join(root, to));
  console.log(`copied ${from} -> ${to}`);
}
