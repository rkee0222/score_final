// Replaces __BUILD__ in the built service worker with a unique id so every
// deploy ships a byte-different sw.js, forcing browsers to install the update
// and discard the previously cached app.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sw.js');
const build = `${Date.now().toString(36)}`;
const source = readFileSync(dist, 'utf8').replaceAll('__BUILD__', build);
writeFileSync(dist, source);
console.log(`stamped service worker build: ${build}`);
