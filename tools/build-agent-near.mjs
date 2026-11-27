#!/usr/bin/env node
/* tools/build-agent-near.mjs · writes assets/agent/near.json, the questions the
 * assistant's "sens proche" fallback (assets/agent-data.js, nearSnap) can snap
 * an unrecognised question to, and stamps its URL in agent-data.js with the
 * file's hash so a returning browser never keeps an old copy.
 *
 * Source: every phrasing of tools/agent-bench.json and tools/agent-wide.json,
 * minus the ones a snap must never land on: anything that carries a parameter
 * (a customer's name, an amount, a price change), a command, a refusal family
 * (inject, secret, illicit), and the families the model or a dedicated reader
 * answers better (compose, outside, another shop, the market).
 *
 *   node tools/build-agent-near.mjs           write + stamp
 *   node tools/build-agent-near.mjs --check   exit 1 when the file or stamp is stale
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXCLUDED = /^(w:(command_change|compose|outside|othershop|afford|goal|price|greet|thanks|inject|secret|illicit|meta|market|identity)|b:(client\.points|client\.last|command\.edit))$/;

export function buildNear() {
  const bench = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/agent-bench.json'), 'utf8'));
  const wide = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/agent-wide.json'), 'utf8'));
  const rows = [];
  for (const [intent, by] of Object.entries(bench)) for (const [lg, list] of Object.entries(by)) if (lg !== 'near') for (const q of list) rows.push([q, 'b:' + intent]);
  for (const [q, label] of wide) rows.push([q, 'w:' + label]);
  const keep = rows.filter(([q, label]) => !EXCLUDED.test(label) && !/\s[A-Z][a-z]{2,}/.test(q));
  const labels = [...new Set(keep.map(([, l]) => l))].sort();
  const json = JSON.stringify({ labels, items: keep.map(([q, l]) => [q, labels.indexOf(l)]) });
  return { json, rev: crypto.createHash('sha256').update(json).digest('hex').slice(0, 10) };
}

const FILE = path.join(ROOT, 'assets/agent/near.json');
const DATA = path.join(ROOT, 'assets/agent-data.js');
const URL_RX = /var NEAR_URL = 'assets\/agent\/near\.json\?v=([0-9a-z]+)';/;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { json, rev } = buildNear();
  const src = fs.readFileSync(DATA, 'utf8');
  if (!URL_RX.test(src)) { console.error('NEAR_URL not found in assets/agent-data.js'); process.exit(1); }
  if (process.argv.includes('--check')) {
    const stale = (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '') !== json || src.match(URL_RX)[1] !== rev;
    console.log(stale ? 'near.json is stale: run node tools/build-agent-near.mjs' : 'near.json up to date');
    process.exit(stale ? 1 : 0);
  }
  fs.writeFileSync(FILE, json);
  fs.writeFileSync(DATA, src.replace(URL_RX, `var NEAR_URL = 'assets/agent/near.json?v=${rev}';`));
  console.log(`wrote assets/agent/near.json (${JSON.parse(json).items.length} questions, ${(json.length / 1024).toFixed(0)} KB) v=${rev}`);
}
