#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.KIWI_STAMP_COVERAGE_ROOT || DEFAULT_ROOT);
const SHELLS = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html'];
const EXPECTED_CHECKS = 5;
let checks = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok ${checks + 1} - ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error?.message || error}`);
    console.log(`  not ok ${checks + 1} - ${name}`);
  } finally {
    checks += 1;
  }
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function scriptAssets(html) {
  const refs = [];
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = tag[0].match(/\bsrc\s*=\s*(["'])(assets\/[^"']+)\1/i);
    if (src) refs.push(src[2]);
  }
  return refs;
}

function audit() {
  const manifest = readJson('tools/asset-stamps.json');
  const exceptions = readJson('tools/asset-stamp-exceptions.json');
  const issues = new Map();
  const referenced = new Set();
  const note = (asset, reason) => {
    if (!issues.has(asset)) issues.set(asset, new Set());
    issues.get(asset).add(reason);
  };

  for (const shell of SHELLS) {
    const file = path.join(ROOT, shell);
    if (!fs.existsSync(file)) continue;
    for (const raw of scriptAssets(fs.readFileSync(file, 'utf8'))) {
      const [asset, query = ''] = raw.split('?');
      referenced.add(asset);
      if (Object.prototype.hasOwnProperty.call(exceptions, asset)) continue;
      const stamp = new URLSearchParams(query).get('v');
      if (!stamp || !/^\d+$/.test(stamp)) note(asset, 'bare shell URL');
      if (!manifest[asset]) note(asset, 'missing manifest entry');
    }
  }
  return { manifest, exceptions, issues, referenced };
}

console.log('Asset stamp coverage');

await check('all application shells exist', async () => {
  const missing = SHELLS.filter((shell) => !fs.existsSync(path.join(ROOT, shell)));
  if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
});

await check('exception entries are explicit and documented', async () => {
  const exceptions = readJson('tools/asset-stamp-exceptions.json');
  for (const [asset, reason] of Object.entries(exceptions)) {
    if (!asset.startsWith('assets/')) throw new Error(`invalid asset: ${asset}`);
    if (typeof reason !== 'string' || reason.trim().length < 20) throw new Error(`missing rationale: ${asset}`);
  }
});

await check('parser sees script src regardless of attribute order', async () => {
  const refs = scriptAssets('<script defer src="assets/a.js?v=2"></script><script data-x="1" src="assets/b.js"></script>');
  if (refs.join('|') !== 'assets/a.js?v=2|assets/b.js') throw new Error(`parsed ${refs.join('|')}`);
});

await check('manifest and exception files are readable', async () => {
  const { manifest, exceptions } = audit();
  if (!manifest || Array.isArray(manifest) || !exceptions || Array.isArray(exceptions)) throw new Error('invalid JSON shape');
});

await check('every non-excepted shell asset has a matching stamp and manifest entry', async () => {
  const { issues } = audit();
  if (issues.size) {
    const detail = [...issues].map(([asset, reasons]) => `${asset} (${[...reasons].join(', ')})`).join('; ');
    throw new Error(`${issues.size} uncovered asset(s): ${detail}`);
  }
});

if (checks !== EXPECTED_CHECKS) {
  console.error(`expected ${EXPECTED_CHECKS} checks, ran ${checks}`);
  process.exit(1);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`  x ${failure}`));
  process.exit(1);
}
console.log(`ok ${checks} checks`);
