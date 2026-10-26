#!/usr/bin/env node
// Mutation vérifiée : mount() retourne avant le rendu du panneau imprimantes.
// Anciennes assertions vertes, exécution rouge ; octets livrés restaurés ensuite.
import { createRequire as text2Require } from 'node:module';
text2Require(import.meta.url)('./text2-runtime.cjs').run('boutique-printer-settings');
import maisonSource from './pos-maison-test-source.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function ok(value, message) {
  if (!value) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS: ${message}`);
}

for (const file of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
  const source = maisonSource(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  ok(/data-action="printer-connect"[^>]*>[\s\S]*?<i data-lucide="printer"><\/i><span>Imprimantes<\/span>/.test(source),
    `${file} exposes the shared printer configuration panel`);
}

if (!process.exitCode) console.log(`${passed} boutique printer controls passed`);
