#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'kiwi-caisse.html'), 'utf8');
let checks = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
  checks += 1;
  console.log('  ✓ ' + message);
}

function zIndex(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(escaped + '\\s*\\{[^}]*z-index\\s*:\\s*(\\d+)', 'm'));
  return match ? Number(match[1]) : NaN;
}

const clockinZ = zIndex('.clockin-screen');
const hoursGateZ = zIndex('#hours-gate');

ok(Number.isFinite(clockinZ), 'clock-in screen has an explicit stacking level');
ok(Number.isFinite(hoursGateZ), 'after-hours gate has an explicit stacking level');
ok(hoursGateZ > clockinZ, 'after-hours confirmation stays visible above clock-in');
ok(/function openService\(\)[\s\S]*askHoursOverride\(gate\.text, doOpenService\)/.test(html), 'opening outside configured hours routes through the confirmation');
ok(/id="hg-confirm"[\s\S]*Ouvrir le service/.test(html), 'confirmation exposes the service-opening action');

console.log(`\nCaisse opening gate: ${checks} checks passed.`);
