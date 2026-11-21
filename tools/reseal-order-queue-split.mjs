#!/usr/bin/env node
/* Rescelle la preuve de découpe de la file (tools/fixtures/order-queue/)
 * après un correctif volontaire dans un module privé.
 *
 *   node tools/reseal-order-queue-split.mjs
 *
 * La preuve garde, pour chaque route découpée, l'original reconstruit
 * (gzip + sha256) et la place de chaque corps privé dans cet original.
 * Un correctif change ces corps : l'original est reconstruit depuis les
 * fichiers livrés (tools/order-queue-test-source.cjs, le même chemin que le
 * test), puis chaque segment reçoit sa nouvelle position. Les en-têtes,
 * pieds, marqueurs, imports et tables du contrat ne bougent pas : un
 * changement de contrat reste refusé par tools/order-queue-split-test.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const source = require('./order-queue-test-source.cjs');
const mapPath = path.join(root, 'tools/fixtures/order-queue/split.json');
const maps = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
let touched = 0;
for (const map of maps) {
  const rebuilt = source(map.file);
  const sha = createHash('sha256').update(rebuilt).digest('hex');
  /* Positions : on rejoue le remplacement des marqueurs en suivant où chaque
     corps atterrit, et l'on décale ceux qu'une insertion plus tôt pousse. */
  let text = fs.readFileSync(path.join(root, map.file), 'utf8').slice(map.prefix.length);
  const spans = [];
  for (const part of map.segments) {
    const body = fs.readFileSync(path.join(root, part.file), 'utf8');
    const inner = body.slice(part.header.length, part.footer ? -part.footer.length : undefined);
    const at = text.indexOf(part.marker);
    if (at < 0) throw new Error('marqueur absent : ' + part.file);
    const delta = inner.length - part.marker.length;
    for (const s of spans) { if (s.start >= at + part.marker.length) { s.start += delta; s.end += delta; } }
    text = text.slice(0, at) + inner + text.slice(at + part.marker.length);
    spans.push({ part, start: at, end: at + inner.length });
  }
  if (text !== rebuilt) throw new Error('reconstruction divergente : ' + map.file);
  for (const s of spans) { s.part.start = s.start; s.part.end = s.end; }
  if (sha !== map.sha256) {
    fs.writeFileSync(path.join(root, 'tools/fixtures/order-queue', map.fixture), gzipSync(Buffer.from(rebuilt, 'utf8'), { level: 9 }));
    map.sha256 = sha;
    touched++;
  }
}
fs.writeFileSync(mapPath, JSON.stringify(maps, null, 2) + '\n');
console.log(`✓ preuve de la file rescellée : ${touched} original(aux) mis à jour`);
