import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/escpos.js', import.meta.url), 'utf8');
const context = { window: {}, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64') };
vm.runInNewContext(source, context);

const bytes = context.window.KiwiEscPos.dayReport({
  paper: '80',
  shop: 'Amira Cafe',
  title: 'RAPPORT JOURNALIER',
  fmt: (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n),
  report: {
    day: '2026-08-24',
    net: 163,
    methods: { cash: 163 },
    categories: [],
    cash: { opening: 1000, sales: 163, expected: 1163, counted: null, movements: [] },
  },
});

const text = Buffer.from(bytes).toString('latin1');
assert.match(text, /Fond d'ouverture\s+1 000 MAD/, 'opening float uses a printable thousands separator');
assert.match(text, /ATTENDU EN CAISSE\s+1 163 MAD/, 'expected cash uses a printable thousands separator');
assert.doesNotMatch(text, /1\?000|1\?163/, 'unsupported Unicode spaces never become question marks');

console.log('day-report-print-format-test: 3 controls passed');
