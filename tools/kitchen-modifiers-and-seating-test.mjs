#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Modifier & Allergy Fidelity, Waitlist & TableSplits
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { priceOrder } from '../functions/api/order/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

import { DatabaseSync } from 'node:sqlite';

const MERCHANT = 'resto-modifiers-test';

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  const facade = { _db: db };
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() {
        const r = db.prepare(query).run(...args);
        return { success: true, meta: { changes: r.changes } };
      },
    };
    return st;
  };
  facade.prepare = prepare;
  return facade;
}

const db = makeDB();
const env = { DB: db };

console.log('\n■ Kitchen Modifiers, Waitlist Seating & TableSplits Tests (tools/kitchen-modifiers-and-seating-test.mjs)');

// 1. Test priceOrder preserves text-only modifiers without emojis
const mockMenu = {
  stations: [{ id: 'kitchen', name: 'Cuisine' }],
  kitchenId: 'kitchen',
  cats: [{ id: 'c1', name: 'Plats', station: 'kitchen' }],
  items: [
    { id: 'i1', name: 'Tagine Agneau', price: 110, catId: 'c1', avail: true, opts: ['opt-cuisson', 'opt-allergy'] },
  ],
  opts: [
    {
      id: 'opt-cuisson', name: 'Cuisson', kind: 'one',
      choices: [
        { id: 'c-ap', name: 'À point', price: 0, emoji: '' }, // Text-only choice without emoji
        { id: 'c-bc', name: 'Bien cuit', price: 0, emoji: '🔥' },
      ],
    },
    {
      id: 'opt-allergy', name: 'Allergies', kind: 'multi',
      choices: [
        { id: 'c-no-nut', name: 'Sans arachides', price: 0, emoji: '' }, // Text-only allergy option
      ],
    },
  ],
};

db._db.prepare('INSERT INTO menus (merchant, data, updated_ts) VALUES (?, ?, ?)').run(
  MERCHANT, JSON.stringify(mockMenu), Date.now()
);

const priced1 = await priceOrder(env, MERCHANT, [
  {
    id: 'i1',
    qty: 1,
    optionChoices: [
      { group: 'opt-cuisson', label: 'À point' },
      { group: 'opt-allergy', label: 'Sans arachides' },
    ],
  },
]);

check('priceOrder succeeds', priced1.priced === true);
check('Text-only option "À point" preserved in visuals', priced1.lines[0].visuals.some(v => v.name === 'À point' && v.emoji === ''));
check('Text-only allergy "Sans arachides" preserved in visuals', priced1.lines[0].visuals.some(v => v.name === 'Sans arachides' && v.emoji === ''));
check('options summary string constructed properly', priced1.lines[0].options.includes('Cuisson: À point') && priced1.lines[0].options.includes('Allergies: Sans arachides'));

// 2. Test direct visuals preservation without emoji
const priced2 = await priceOrder(env, MERCHANT, [
  {
    id: 'i1',
    qty: 1,
    visuals: [
      { name: 'Sans oignon', emoji: '' },
      { name: 'Extra piquant', emoji: '🌶️' },
    ],
  },
]);

check('Direct text-only visual "Sans oignon" preserved', priced2.lines[0].visuals.some(v => v.name === 'Sans oignon'));
check('Direct emoji visual "Extra piquant" preserved', priced2.lines[0].visuals.some(v => v.name === 'Extra piquant' && v.emoji === '🌶️'));

// 3. Inspect kiwi-cuisine.html renderer for text-only options
const cuisineHtml = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
check('kiwi-cuisine.html renders visuals without requiring emoji',
  !cuisineHtml.includes('filter(function (v) { return v && v.emoji && v.name; })') &&
  cuisineHtml.includes('tk-visual'));
check('kiwi-cuisine.html renders formula parents and their component lines',
  cuisineHtml.includes("var items = (o.lines || []).map(function (l)")
    && cuisineHtml.includes("l.kind === 'formula-part'"));
check('standalone KDS keeps formula parents in station routing and status',
  !cuisineHtml.includes("filter(function (l) { return l.kind !== 'formula'; })")
    && !cuisineHtml.includes("l.kind !== 'formula' && l.station === S.station"));

// 4. Inspect kiwi-serveur.html svSendOrder
const serveurHtml = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
check('kiwi-serveur.html attaches visuals in svSendOrder delta payload',
  serveurHtml.includes('visuals: visuals') || serveurHtml.includes('visuals,'));
check('kiwi-serveur.html relays formula identity and slot metadata',
  serveurHtml.includes('if (l.kind) linePayload.kind = l.kind')
    && serveurHtml.includes('if (l.formulaUid) linePayload.formulaUid = l.formulaUid')
    && serveurHtml.includes('if (l.formulaSlotId) linePayload.formulaSlotId = l.formulaSlotId'));

// 5. Inspect kiwi-caisse.html for tableSplits migration & unassigned waitlist seating
const caisseHtml = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
check('caisse KDS and kitchen paper keep formula parents, options, and components',
  caisseHtml.includes("items: (o.lines || []).map(l =>")
    && caisseHtml.includes('visuals: ownVisuals.slice()')
    && caisseHtml.includes(".map(v => v && (v.name || v.label || v.cn)).filter(Boolean).join(' · ')"));
check('caisse KDS restores a missing formula parent from persisted component lines',
  caisseHtml.includes('function kdsEnsureFormulaParents(o)')
    && caisseHtml.includes("kind: 'formula', formulaUid, formulaName: name")
    && caisseHtml.includes('kdsEnsureFormulaParents(o).some')
    && caisseHtml.includes('const allItems = kdsEnsureFormulaParents(o)'));
check('caisse repairs legacy OrderPro component-only payloads before billing and KDS ingestion',
  caisseHtml.includes('function opRepairFormulaParents(o)')
    && caisseHtml.includes('opRepairFormulaParents(o);')
    && caisseHtml.includes("kind: 'formula', formulaUid, formulaName: item.name"));
check('caisse local tickets print the composed-menu parent and its components',
    caisseHtml.includes('function kitchenItemsFromLines(lines)')
    && caisseHtml.includes('source.filter(Boolean).map((l) =>')
    && caisseHtml.includes('visuals: ownVisuals'));
check('caisse takeout billing uses priced formula parents, never zero-price kitchen components',
  caisseHtml.includes('function vrapFinancialItems(o)')
    && caisseHtml.includes("filter(l => l.kind !== 'formula-part')")
    && caisseHtml.includes('cart = vrapFinancialItems(o).map(i =>')
    && caisseHtml.includes('saveVrapBillItems(o, vrapCartItems(o))'));
check('caisse relay preserves formula and canonical option metadata',
  caisseHtml.includes('function relayLinesFromCaisse(lines)')
    && caisseHtml.includes("['kind', 'formulaUid', 'formulaName', 'slotLabel', 'formulaSlotId', 'lineId']")
    && caisseHtml.includes('relayLines: relayLinesFromCaisse(lines)')
    && caisseHtml.includes('relayLines: relayLinesFromCaisse(source)'));
check('kiwi-caisse.html migrates tableSplits on confirmCaisseTransfer',
  caisseHtml.includes('tableSplits.set(to, tableSplits.get(from))'));
check('kiwi-caisse.html clears tableSplits on confirmCaisseMerge',
  caisseHtml.includes('tableSplits.delete(source)') && caisseHtml.includes('tableSplits.delete(target)'));
check('kiwi-caisse.html seatPartyAt dispatches table-seated even if t.server is absent',
  caisseHtml.includes('if (t && merchant)') && caisseHtml.includes("type: 'table-seated'"));

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All kitchen modifier and seating checks green.\n`);
process.exitCode = failures ? 1 : 0;
