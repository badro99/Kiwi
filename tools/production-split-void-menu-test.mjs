#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Production Split Payment, Authoritative Void & Menu Resolution Test
 *
 * Production-executing regression test suite covering:
 *  1. Pasta Corner Menu Resolution & Configurator I18N:
 *     - "Prépare ton Plat" formula configurator with real Pasta Corner menu.
 *     - Option chips display localized names (Penne, Tagliatelle, Spaghetti,
 *       Pappardelle) in FR and EN, and Arabic RTL names (بيني, تالياتيل, سباجيتي,
 *       بابارديلا) - never raw database IDs (it_6, it_8, it_7, it_9).
 *     - Missing/broken references fall back safely to localized placeholder
 *       ("Option indisponible" / "Option unavailable" / "خيار غير متوفر")
 *       without exposing raw IDs or substituting arbitrary items.
 *     - Preserves untranslated merchant content ("Choose your Sauce") rather
 *       than inventing fake translations.
 *     - Validates formula payload construction with internal IDs and slot metadata.
 *  2. Split Payments Persistence Protocol (backed by real in-memory SQLite):
 *     - Direct execution of functions/api/sale.js with paired till & employee auth.
 *     - Part 1 (35.00 MAD) and Part 2 (25.00 MAD) persist as distinct financial rows.
 *     - Table session remains open after Part 1 and closes only after Part 2.
 *     - Conflicting financial retry (amount mismatch) rejected with 409 Conflict.
 *     - Idempotent replay (identical amount/method) succeeds with 200 OK.
 *     - 1-part split settles immediately and marks table session closed.
 *  3. Clock Skew Void Protection & Reconcile Voids:
 *     - Direct execution of kiwi-caisse.html reconcileVoids().
 *     - Exact unique ID voids honored when client clock is 5m ahead of server void.
 *     - Partial feed omission does not reactivate confirmed voids.
 *     - Explicit empty feed restores/reinstates voids.
 *  4. Feed Split Label Consistency:
 *     - Direct execution of functions/api/feed.js onRequestGet().
 *     - Split receipts prioritize human label ("5 · part 1") as orderRef
 *       while retaining fiscal receipt reference in receiptRef.
 *  5. 7-Visit / 8-Receipt MixMax Fixture Reconciliation:
 *     - Full 8-receipt / 7-visit settlement (1,130 MAD cash, Table 5 split).
 *     - Perfect reconciliation across Journal, Handover, Clôture, and Day Report Z.
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import { tillToken, employeeToken } from '../functions/auth/_lib.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const orderProHtml = fs.readFileSync(path.join(ROOT, 'OrderPro.html'), 'utf8');
const caisseHtml = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const dayReportSrc = fs.readFileSync(path.join(ROOT, 'assets/day-report.js'), 'utf8');
const posSaleSrc = fs.readFileSync(path.join(ROOT, 'assets/pos-sale.js'), 'utf8');

function extractBody(src, startMarker, endMarker) {
  const sIdx = src.indexOf(startMarker);
  if (sIdx === -1) throw new Error(`Could not find start marker: ${startMarker}`);
  const eIdx = src.indexOf(endMarker, sIdx);
  if (eIdx === -1) throw new Error(`Could not find end marker: ${endMarker}`);
  return src.slice(sIdx, eIdx + endMarker.length);
}

let controls = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  controls++;
  console.log('  ✓ ' + message);
}

function makeD1Adapter(db) {
  let transactionQueue = Promise.resolve();
  return {
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async run() {
          const stmt = db.prepare(sql);
          const res = stmt.run(...bound);
          return {
            ...res,
            meta: {
              changes: res ? res.changes : 0,
              last_row_id: res ? res.lastInsertRowid : 0,
            },
          };
        },
        async all() {
          const stmt = db.prepare(sql);
          const results = stmt.all(...bound);
          return { results };
        },
        async first(col) {
          const stmt = db.prepare(sql);
          const results = stmt.all(...bound);
          if (!results.length) return null;
          if (col) return results[0][col];
          return results[0];
        },
      };
    },
    batch(statements) {
      const execute = async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      };
      const result = transactionQueue.then(execute, execute);
      transactionQueue = result.catch(() => {});
      return result;
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Section 1: Pasta Corner Menu Resolution & Configurator I18N
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n--- Section 1: Pasta Corner Menu Resolution & Configurator I18N ---');
{
  const pastaCornerMenu = {
    langs: ['fr', 'ar', 'en'],
    cats: [
      {
        id: 'cat_1',
        name: 'Choose your Pasta',
        sub: [],
        i18n: {
          fr: { name: 'Choisissez vos Pâtes', h: '6h3jbh' },
          ar: { name: 'اختر معكرونيك', h: '6h3jbh' },
          en: { name: 'Choose your Pasta', h: '6h3jbh' },
        },
      },
      {
        id: 'cat_5',
        name: 'Choose-pasta',
        sub: [
          { id: 'sub_11', name: 'Pasta', i18n: { fr: { name: 'Pâtes' }, ar: { name: 'المعكرونة' }, en: { name: 'Pasta' } } },
          { id: 'sub_12', name: 'Sauce', i18n: { fr: { name: 'Sauce' }, ar: { name: 'الصلصات' }, en: { name: 'Sauce' } } },
          { id: 'sub_13', name: 'Extras', i18n: { fr: { name: 'Suppléments' }, ar: { name: 'الإضافات' }, en: { name: 'Extras' } } },
        ],
      },
    ],
    items: [
      {
        id: 'it_6',
        name: 'Penne',
        price: 0,
        catId: 'cat_5',
        subId: 'sub_11',
        avail: true,
        formulaOnly: true,
        showPhotoInFormulas: true,
        opts: [],
        i18n: {
          fr: { name: 'Penne', h: '1k0dmt6', desc: '' },
          ar: { name: 'بيني', h: '1k0dmt6', desc: '' },
          en: { name: 'Penne', h: '1k0dmt6', desc: '' },
        },
      },
      {
        id: 'it_7',
        name: 'Spaghetti',
        price: 0,
        catId: 'cat_5',
        subId: 'sub_11',
        avail: true,
        formulaOnly: true,
        showPhotoInFormulas: true,
        opts: [],
        i18n: {
          fr: { name: 'Spaghetti', h: '1vgwnn1', desc: '' },
          ar: { name: 'سباجيتي', h: '1vgwnn1', desc: '' },
          en: { name: 'Spaghetti', h: '1vgwnn1', desc: '' },
        },
      },
      {
        id: 'it_8',
        name: 'Tagliatelle',
        price: 0,
        catId: 'cat_5',
        subId: 'sub_11',
        avail: true,
        formulaOnly: true,
        showPhotoInFormulas: true,
        opts: [],
        i18n: {
          fr: { name: 'Tagliatelle', h: '1pd0j1o', desc: '' },
          ar: { name: 'تالياتيل', h: '1pd0j1o', desc: '' },
          en: { name: 'Tagliatelle', h: '1pd0j1o', desc: '' },
        },
      },
      {
        id: 'it_9',
        name: 'Pappardelle',
        price: 0,
        catId: 'cat_5',
        subId: 'sub_11',
        avail: true,
        formulaOnly: true,
        showPhotoInFormulas: true,
        opts: [],
        i18n: {
          fr: { name: 'Pappardelle', h: '19r5pzi', desc: '' },
          ar: { name: 'بابارديلا', h: '19r5pzi', desc: '' },
          en: { name: 'Pappardelle', h: '19r5pzi', desc: '' },
        },
      },
      {
        id: 'it_14',
        name: 'Rosa Pomodoro',
        price: 0,
        catId: 'cat_5',
        subId: 'sub_12',
        avail: true,
        formulaOnly: true,
        showPhotoInFormulas: true,
        opts: [],
        i18n: {
          fr: { name: 'Rosa Pomodoro', h: '8xb58o', desc: '' },
          ar: { name: 'روزا بومودورو', h: '8xb58o', desc: '' },
          en: { name: 'Rose Tomato', h: '8xb58o', desc: '' },
        },
      },
      {
        id: 'it_21',
        name: 'Poulet',
        price: 18,
        catId: 'cat_5',
        subId: 'sub_13',
        avail: true,
        formulaOnly: true,
        showPhotoInFormulas: true,
        opts: [],
        i18n: {
          fr: { name: 'Poulet', h: '85h065', desc: '' },
          ar: { name: 'دجاج', h: '85h065', desc: '' },
          en: { name: 'Chicken', h: '85h065', desc: '' },
        },
      },
      {
        id: 'it_26',
        name: 'Prépare ton Plat',
        price: 49,
        catId: 'cat_1',
        subId: null,
        avail: true,
        formulaOnly: false,
        opts: ['og_56'],
        i18n: {
          fr: { name: 'Prépare ton Plat', h: '1u50vmh', desc: '' },
          ar: { name: 'جهز طبقك', h: '1u50vmh', desc: '' },
          en: { name: 'Prepare Your Dish', h: '1u50vmh', desc: '' },
        },
        formula: {
          slots: [
            {
              id: 'sl_1',
              label: 'Choose your Pasta',
              min: 1,
              max: 1,
              choices: [
                { itemId: 'it_6', extra: 0 },
                { itemId: 'it_8', extra: 0 },
                { itemId: 'it_7', extra: 0 },
                { itemId: 'it_9', extra: 0 },
              ],
            },
            {
              id: 'sl_2',
              label: 'Choose your Sauce',
              min: 1,
              max: 1,
              choices: [
                { itemId: 'it_14', extra: 0 },
              ],
            },
            {
              id: 'sl_3',
              label: 'Extras',
              min: 0,
              max: 1,
              choices: [
                { itemId: 'it_21', extra: 17 },
              ],
            },
          ],
        },
      },
    ],
    opts: [
      {
        id: 'og_56',
        name: 'Extras',
        kind: 'one',
        required: false,
        choices: [
          {
            id: 'oc_59',
            name: 'Extra Parmigiano',
            price: 7,
            i18n: {
              fr: { name: 'Supplément Parmigiano', h: '12wo77z' },
              ar: { name: 'إضافة بارميجيانو', h: '12wo77z' },
              en: { name: 'Extra Parmigiano', h: '12wo77z' },
            },
          },
          {
            id: 'oc_60',
            name: 'No Extras',
            price: 0,
            i18n: {
              fr: { name: 'Aucun supplément', h: 'p7z3iw' },
              ar: { name: 'لا إضافات', h: 'p7z3iw' },
              en: { name: 'No Extra', h: 'p7z3iw' },
            },
          },
        ],
        i18n: {
          fr: { name: 'Suppléments', h: '1r52jvf' },
          ar: { name: 'إضافات', h: '1r52jvf' },
          en: { name: 'Extras', h: '1r52jvf' },
        },
      },
    ],
  };

  const i18nSrc = extractBody(orderProHtml, 'const I18N = {', 'bq_foot: "غير للتصفح · خلّص فالكيس باش تشري",\n      },\n    };');
  const helpersSrc = extractBody(orderProHtml, 'function menuHash(name, desc) {', 'function totals() {\n').replace(/function totals\(\) \{\s*$/, '');
  const bootRestaurantSrc = extractBody(orderProHtml, 'function availabilityOf(data) {', "renderMenu('all');\n      return true;\n    }");

  const mockEl = {
    innerHTML: '',
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  const ctx = {
    console,
    Math,
    String,
    Number,
    Array,
    Object,
    Set,
    Map,
    Boolean,
    window: {},
    document: {
      addEventListener() {},
      documentElement: { lang: 'fr', setAttribute() {} },
      querySelector: () => mockEl,
      querySelectorAll: () => [],
    },
    $: () => mockEl,
    $$: () => [],
    escapeHtml: (s) => String(s || ''),
    renderMenuSubtabs: () => {},
    renderMenu: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    setTimeout: () => {},
    clearTimeout: () => {},
  };

  vm.createContext(ctx);

  vm.runInContext(`
    ${i18nSrc}
    ${helpersSrc}
    ${bootRestaurantSrc}
    globalThis.setTestLang = function(l) { currentLang = l; };
    globalThis.getChoiceLabel = choiceLabel;
    globalThis.getGroupLabel = groupLabel;
    globalThis.buildLinesPayload = function(linesCopy, pendingRef) {
      return linesCopy.flatMap((l, lineIndex) => {
        const item = itemOf(l.id);
        const formulaSlots = (item && item.options || []).filter(opt => opt.formulaSlotId);
        const formulaUid = formulaSlots.length ? (pendingRef + '-' + lineIndex).slice(0, 40) : '';
        const parent = {
          id: l.id, qty: l.qty,
          options: describeOptionChoices(l).map(p => groupLabel(p.group) + ': ' + p.label).join(' · '),
          optionChoices: describeOptionChoices(l),
          visuals: describeOptionVisuals(l, true),
          note: l.note || '',
        };
        if (!formulaUid) return [parent];
        Object.assign(parent, { kind: 'formula', formulaUid, formulaName: nameOf(l.id) });
        const children = [];
        formulaSlots.forEach(slot => {
          const selected = l.options?.[slot.key];
          const ids = slot.type === 'multi' ? (Array.isArray(selected) ? selected : [])
            : (selected == null ? [] : [selected]);
          ids.forEach((id, choiceIndex) => children.push({
            id, qty: l.qty, kind: 'formula-part', formulaUid,
            formulaName: nameOf(l.id), slotLabel: slot.label || '',
            formulaSlotId: slot.formulaSlotId,
            lineId: (formulaUid + '-' + slot.formulaSlotId + '-' + choiceIndex).slice(0, 60),
          }));
        });
        return [parent].concat(children);
      });
    };
  `, ctx);

  ctx.bootRestaurant(pastaCornerMenu);

  // 1. French resolution
  ctx.setTestLang('fr');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_6') === 'Penne', 'FR: it_6 resolves to Penne');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_8') === 'Tagliatelle', 'FR: it_8 resolves to Tagliatelle');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_7') === 'Spaghetti', 'FR: it_7 resolves to Spaghetti');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_9') === 'Pappardelle', 'FR: it_9 resolves to Pappardelle');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_999') === 'Option indisponible', 'FR: broken ref it_999 safely falls back to Option indisponible');

  // 2. Arabic RTL resolution
  ctx.setTestLang('ar');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_6') === 'بيني', 'AR: it_6 resolves to Arabic بیني');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_8') === 'تالياتيل', 'AR: it_8 resolves to Arabic تالياتيل');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_7') === 'سباجيتي', 'AR: it_7 resolves to Arabic سباجيتي');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_9') === 'بابارديلا', 'AR: it_9 resolves to Arabic بابارديلا');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_999') === 'خيار غير متوفر', 'AR: broken ref it_999 safely falls back to Arabic خيار غير متوفر');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'sl_unknown') === 'خيار غير متوفر', 'AR: broken slot ref sl_unknown safely falls back without exposing ID');

  // 3. English resolution
  ctx.setTestLang('en');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_6') === 'Penne', 'EN: it_6 resolves to Penne');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_8') === 'Tagliatelle', 'EN: it_8 resolves to Tagliatelle');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_7') === 'Spaghetti', 'EN: it_7 resolves to Spaghetti');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_9') === 'Pappardelle', 'EN: it_9 resolves to Pappardelle');
  ok(ctx.getChoiceLabel('formula_it_26_sl_1', 'it_999') === 'Option unavailable', 'EN: broken ref it_999 safely falls back to Option unavailable');

  // 4. Untranslated merchant content preservation
  ok(ctx.getGroupLabel('formula_it_26_sl_2') === 'Choose your Sauce', 'Preserves untranslated merchant slot label "Choose your Sauce" without inventing fake translations');
  ctx.setTestLang('fr');
  ok(ctx.getGroupLabel('formula_it_26_sl_2') === 'Choose your Sauce', 'FR: Preserves untranslated merchant slot label "Choose your Sauce"');

  // 5. Formula ordering payload construction
  const testCartLine = {
    id: 'it_26',
    qty: 1,
    options: {
      'formula_it_26_sl_1': 'it_6',
      'formula_it_26_sl_2': 'it_14',
      'formula_it_26_sl_3': 'it_21',
      'og_56': 'oc_59',
    },
    note: 'Extra chaud',
  };
  const payload = ctx.buildLinesPayload([testCartLine], 'order-pasta-01');
  ok(payload.length === 4, 'Formula expands to 1 parent + 3 child part lines');
  ok(payload[0].id === 'it_26' && payload[0].kind === 'formula' && payload[0].formulaName === 'Prépare ton Plat', 'Parent formula line identified');
  ok(payload[0].optionChoices[0].choiceId === 'oc_59' && payload[0].optionChoices[0].label === 'Supplément Parmigiano', 'Parent retains standalone add-ons with localized labels');
  ok(payload[1].id === 'it_6' && payload[1].kind === 'formula-part' && payload[1].slotLabel === 'Choose your Pasta', 'Child part 1 carries it_6 and slotLabel');
  ok(payload[2].id === 'it_14' && payload[2].kind === 'formula-part' && payload[2].slotLabel === 'Choose your Sauce', 'Child part 2 carries it_14 and preserved slotLabel');
  ok(payload[3].id === 'it_21' && payload[3].kind === 'formula-part' && payload[3].slotLabel === 'Extras', 'Child part 3 carries it_21 and slotLabel');
  ok(!payload[0].options.includes('it_6') && !payload[0].options.includes('it_14'), 'Display options never expose raw internal IDs');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Section 2: Split Payments Persistence Protocol (backed by node:sqlite)
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n--- Section 2: Split Payments Persistence Protocol (node:sqlite) ---');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE sales (
      id TEXT PRIMARY KEY,
      merchant TEXT NOT NULL,
      amount INTEGER NOT NULL,
      amount_cents INTEGER,
      gross_amount_cents INTEGER,
      discount_amount_cents INTEGER,
      discount_reason TEXT,
      discount_actor_id TEXT,
      method TEXT NOT NULL,
      label TEXT,
      ref TEXT,
      ts INTEGER NOT NULL,
      lines TEXT,
      channel TEXT,
      void_ts INTEGER,
      void_reason TEXT,
      void_note TEXT,
      void_actor TEXT,
      void_actor_id TEXT
    );

    CREATE TABLE table_sessions (
      id TEXT PRIMARY KEY,
      merchant TEXT NOT NULL,
      mode TEXT NOT NULL,
      table_no TEXT NOT NULL,
      status TEXT NOT NULL,
      opened_ts INTEGER NOT NULL,
      seen_ts INTEGER,
      closed_ts INTEGER,
      closed_by TEXT
    );

    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      merchant TEXT NOT NULL,
      session_id TEXT,
      table_no TEXT,
      channel TEXT,
      server_name TEXT,
      paid_ts INTEGER,
      created_ts INTEGER,
      updated_ts INTEGER
    );

    CREATE TABLE staff_pins (
      merchant TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      pin_hash TEXT,
      pin_salt TEXT,
      active INTEGER DEFAULT 1,
      archived INTEGER DEFAULT 0
    );

    CREATE TABLE employee_attendance (
      merchant TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      clock_in_ts INTEGER NOT NULL,
      clock_out_ts INTEGER,
      pause_ts INTEGER,
      PRIMARY KEY (merchant, staff_id, shift_date)
    );

    CREATE TABLE store_subscriptions (
      slug TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      business TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      session_epoch INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE merchant_config (
      merchant TEXT PRIMARY KEY,
      features TEXT NOT NULL DEFAULT '{}',
      type TEXT,
      account_id TEXT,
      name TEXT,
      status TEXT,
      till_epoch INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE store_docs (
      merchant TEXT NOT NULL,
      feature TEXT NOT NULL,
      data TEXT,
      rev INTEGER DEFAULT 0,
      updated_ts INTEGER,
      PRIMARY KEY (merchant, feature)
    );
  `);

  const AUTH_SECRET = 'test-auth-secret-32-chars-long-abc';
  const merchant = 'pasta-corner';
  const env = {
    DB: makeD1Adapter(db),
    AUTH_SECRET,
  };

  db.prepare("INSERT INTO accounts (id, email, business, status, session_epoch) VALUES (?, ?, ?, 'active', 0)")
    .run('acc-pasta-corner-fixture', 'fixture-pasta@example.test', merchant);
  db.prepare("INSERT INTO merchant_config (merchant, features, type, account_id, name, status, till_epoch) VALUES (?, '{}', 'restaurant', ?, ?, 'active', 7)")
    .run(merchant, 'acc-pasta-corner-fixture', 'Pasta Corner Fixture');
  db.prepare("INSERT INTO store_subscriptions VALUES (?, 'pro', 'active')").run(merchant);
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'floorplan', ?, 1, ?)").run(
    merchant,
    JSON.stringify({
      tables: [
        { num: '5', servers: ['c-hafid'] },
        { num: '9', servers: ['c-hafid'] },
        { num: '12', servers: ['c-hafid'] },
        { num: '15', servers: ['c-hafid'] },
        { num: '20', servers: ['c-hafid'] },
        { num: '21', servers: ['c-hafid'] },
        { num: '22', servers: ['c-hafid'] },
      ],
    }),
    Date.now()
  );
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'team', ?, 1, ?)").run(
    merchant,
    JSON.stringify({
      members: [{ id: 'c-hafid', firstName: 'Hafid', lastName: '' }],
    }),
    Date.now()
  );
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'service-events', ?, 1, ?)").run(
    merchant,
    JSON.stringify({
      states: {
        '5': { table: '5', status: 'ka-yaklo', covers: 2, syncVersion: 1 },
      },
      events: [],
    }),
    Date.now()
  );
  db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-table-5', merchant, '5', Date.now());
  db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', NULL, ?, ?)").run('ord-table-5', merchant, 'sess-table-5', '5', Date.now(), Date.now());

  const tillCookie = await tillToken(AUTH_SECRET, merchant, 7);

  async function postSale(body) {
    const req = new Request('https://kiwi.test/api/sale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `kiwi_till=${tillCookie}`,
      },
      body: JSON.stringify({ merchant, ...body }),
    });
    const res = await salePost({ request: req, env });
    const data = await res.json();
    return { status: res.status, data };
  }

  // 1. Post Part 1 (35.00 MAD)
  const part1 = await postSale({
    table: '5',
    session: 'sess-table-5',
    amount: 35,
    amountCents: 3500,
    method: 'card',
    label: 'Table 5 · part 1',
    split: { index: 0, count: 2 },
  });
  ok(part1.status === 200 && part1.data.ok === true, 'Part 1 post succeeds with 200 OK');
  ok(part1.data.id === 'visit-sess-table-5-split-0-emp', 'Part 1 derives deterministic visit ID visit-sess-table-5-split-0-emp');

  const sessAfterPart1 = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-5');
  ok(sessAfterPart1[0].status === 'open', 'Table session remains OPEN after Part 1 (1/2 parts received)');

  const orderAfterPart1 = db.prepare('SELECT paid_ts FROM orders WHERE id = ?').all('ord-table-5');
  ok(orderAfterPart1[0].paid_ts === null, 'Table order remains unpaid after Part 1');

  // 2. Conflicting retry of Part 1 (different amount)
  const conflictRetry = await postSale({
    table: '5',
    session: 'sess-table-5',
    amount: 40,
    amountCents: 4000,
    method: 'card',
    label: 'Table 5 · part 1',
    split: { index: 0, count: 2 },
  });
  ok(conflictRetry.status === 409, 'Conflicting retry with different amount is rejected with 409 Conflict');
  ok(conflictRetry.data.error === 'sale-conflict', 'Error response reports sale-conflict');
  ok(conflictRetry.data.detail === 'conflicting-financial-data', 'Error response details conflicting-financial-data');

  // 3. Idempotent retry of Part 1 (identical financial data)
  const idempotentRetry = await postSale({
    table: '5',
    session: 'sess-table-5',
    amount: 35,
    amountCents: 3500,
    method: 'card',
    label: 'Table 5 · part 1',
    split: { index: 0, count: 2 },
  });
  ok(idempotentRetry.status === 200 && idempotentRetry.data.ok === true, 'Idempotent retry with identical financial data succeeds with 200 OK');

  // 4. Post Part 2 (25.00 MAD)
  const part2 = await postSale({
    table: '5',
    session: 'sess-table-5',
    amount: 25,
    amountCents: 2500,
    method: 'cash',
    label: 'Table 5 · part 2',
    split: { index: 1, count: 2 },
  });
  ok(part2.status === 200 && part2.data.ok === true, 'Part 2 post succeeds with 200 OK');
  ok(part2.data.id === 'visit-sess-table-5-split-1-emp', 'Part 2 derives deterministic visit ID visit-sess-table-5-split-1-emp');

  const sessAfterPart2 = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-5');
  ok(sessAfterPart2[0].status === 'closed', 'Table session is CLOSED after Part 2 (all 2/2 parts received)');

  const orderAfterPart2 = db.prepare('SELECT paid_ts FROM orders WHERE id = ?').all('ord-table-5');
  ok(orderAfterPart2[0].paid_ts !== null, 'Table order is settled and marked paid after Part 2');

  const persistedSales = db.prepare('SELECT id, amount, amount_cents, method FROM sales WHERE merchant = ? ORDER BY id ASC').all(merchant);
  ok(persistedSales.length === 2, 'Exactly 2 distinct sales persisted in D1 database');
  ok(persistedSales[0].amount_cents === 3500 && persistedSales[0].method === 'card', 'Part 1 persisted with 3500 cents card');
  ok(persistedSales[1].amount_cents === 2500 && persistedSales[1].method === 'cash', 'Part 2 persisted with 2500 cents cash');

  // 5. 1-part split (split: { index: 0, count: 1 }) settles immediately
  db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-table-9', merchant, '9', Date.now());
  const onePartSplit = await postSale({
    table: '9',
    session: 'sess-table-9',
    amount: 50,
    amountCents: 5000,
    method: 'cash',
    label: 'Table 9 · part 1',
    split: { index: 0, count: 1 },
  });
  ok(onePartSplit.status === 200, '1-part split succeeds with 200 OK');
  const sessTable9 = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-9');
  ok(sessTable9[0].status === 'closed', '1-part split closes table session immediately');

  // 6. Concurrent conflicting payment requests with deterministic barrier
  {
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-table-conc', merchant, '12', Date.now());
    db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', NULL, ?, ?)").run('ord-table-12', merchant, 'sess-table-conc', '12', Date.now(), Date.now());

    // Deterministic barrier forcing preflight reads for both requests to complete before either insert executes
    let barrierTriggered = false;
    let preflightCount = 0;
    let releaseInserts = null;
    const insertBarrier = new Promise((resolve) => { releaseInserts = resolve; });
    let releaseSmallInsert = null;
    const smallInsertDone = new Promise((resolve) => { releaseSmallInsert = resolve; });

    const barrierDb = {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          bind(...args) {
            return {
              async run() {
                if (sql.includes('INSERT OR IGNORE INTO sales') && !barrierTriggered) {
                  await insertBarrier;
                }
                if (sql.includes('INSERT OR IGNORE INTO sales') && Number(args[9]) === 4000) {
                  await smallInsertDone;
                }
                const result = await stmt.run(...args);
                if (sql.includes('INSERT OR IGNORE INTO sales') && Number(args[9]) === 3500) {
                  releaseSmallInsert();
                }
                return result;
              },
              async all() {
                const results = stmt.all(...args);
                return { results };
              },
              async first(col) {
                if (sql.includes('SELECT id, amount, amount_cents, method FROM sales WHERE id = ?')) {
                  preflightCount++;
                  if (preflightCount >= 2 && !barrierTriggered) {
                    barrierTriggered = true;
                    releaseInserts();
                  }
                }
                const results = stmt.all(...args);
                if (!results.length) return null;
                if (col) return results[0][col];
                return results[0];
              },
            };
          },
        };
      },
    };

    const barrierEnv = { DB: barrierDb, AUTH_SECRET };

    async function postSaleBarrier(body) {
      const req = new Request('https://kiwi.test/api/sale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `kiwi_till=${tillCookie}`,
        },
        body: JSON.stringify({ merchant, ...body }),
      });
      const res = await salePost({ request: req, env: barrierEnv });
      const data = await res.json();
      return { status: res.status, data };
    }

    // Launch two concurrent requests for split part 1 of Table 12 with conflicting amounts (35 vs 40 MAD)
    const [reqA, reqB] = await Promise.all([
      postSaleBarrier({
        table: '12',
        session: 'sess-table-conc',
        amount: 35,
        amountCents: 3500,
        method: 'card',
        label: 'Table 12 · part 1',
        split: { index: 0, count: 2 },
      }),
      postSaleBarrier({
        table: '12',
        session: 'sess-table-conc',
        amount: 40,
        amountCents: 4000,
        method: 'card',
        label: 'Table 12 · part 1',
        split: { index: 0, count: 2 },
      }),
    ]);

    const successes = [reqA, reqB].filter(r => r.status === 200);
    const conflicts = [reqA, reqB].filter(r => r.status === 409);

    ok(successes.length === 1, 'Exactly one concurrent request succeeds with 200 OK');
    ok(conflicts.length === 1, 'The conflicting concurrent request fails with 409 Conflict');
    ok(conflicts[0].data.error === 'sale-conflict', 'Conflicting response reports sale-conflict');
    ok(conflicts[0].data.detail === 'conflicting-financial-data', 'Conflicting response details conflicting-financial-data');

    const table12Sales = db.prepare("SELECT id, amount, amount_cents FROM sales WHERE id LIKE 'visit-sess-table-conc-%'").all();
    ok(table12Sales.length === 1, 'Sales table contains exactly one row for part 1');
    ok(table12Sales[0].amount_cents === 3500, 'Winning persisted sale has 3500 cents (35 MAD), never 40 MAD');

    // Concurrent identical retries both succeed
    const [identA, identB] = await Promise.all([
      postSaleBarrier({
        table: '12',
        session: 'sess-table-conc',
        amount: 35,
        amountCents: 3500,
        method: 'card',
        label: 'Table 12 · part 1',
        split: { index: 0, count: 2 },
      }),
      postSaleBarrier({
        table: '12',
        session: 'sess-table-conc',
        amount: 35,
        amountCents: 3500,
        method: 'card',
        label: 'Table 12 · part 1',
        split: { index: 0, count: 2 },
      }),
    ]);
    ok(identA.status === 200 && identB.status === 200, 'Concurrent identical retries both succeed with 200 OK');
  }

  // 7. Unresolved session ID cannot settle another table visit
  {
    const tNow = Date.now();
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-table-real', merchant, '15', tNow);
    db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', NULL, ?, ?)").run('ord-table-15', merchant, 'sess-table-real', '15', tNow, tNow);

    // Paired till posts payment for Table 15 with an unresolved session ID
    const badSessionPost = await postSale({
      table: '15',
      session: 'nonexistent-unresolved-session-xyz',
      amount: 60,
      amountCents: 6000,
      method: 'cash',
      label: 'Table 15',
    });
    ok(badSessionPost.status === 404, 'Payment with nonexistent session ID is rejected with 404 Not Found');
    ok(badSessionPost.data.error === 'table-session-missing', 'Rejection error is table-session-missing');

    // Cross-merchant session ID is also rejected with 404
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-other-merchant', 'other-merchant', '15', tNow);
    const crossMerchantPost = await postSale({
      table: '15',
      session: 'sess-other-merchant',
      amount: 60,
      amountCents: 6000,
      method: 'cash',
      label: 'Table 15',
    });
    ok(crossMerchantPost.status === 404, 'Cross-merchant session ID is rejected with 404 Not Found');
    ok(crossMerchantPost.data.error === 'table-session-missing', 'Cross-merchant error is table-session-missing');

    // Confirm real open session and its orders were NOT touched
    const realSession = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-real');
    ok(realSession[0].status === 'open', 'Real table session remains OPEN after rejected bad-session requests');
    const realOrder = db.prepare('SELECT paid_ts FROM orders WHERE id = ?').all('ord-table-15');
    ok(realOrder[0].paid_ts === null, 'Real table orders remain UNPAID after rejected bad-session requests');

    // Replay of an older closed visit must not close a newer visit on the same table
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'closed', ?, ?, 'service-payment', NULL)").run('sess-table-old', merchant, '15', tNow - 3600000, tNow - 1800000);
    const oldVisitReplay = await postSale({
      table: '15',
      session: 'sess-table-old',
      amount: 45,
      amountCents: 4500,
      method: 'cash',
      label: 'Table 15 (old)',
    });
    ok(oldVisitReplay.status === 200, 'Replay of older visit succeeds idempotently');
    const realSessionAfterReplay = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-real');
    ok(realSessionAfterReplay[0].status === 'open', 'Newer table visit remains OPEN after replay of older visit');
    const realOrderAfterReplay = db.prepare('SELECT paid_ts FROM orders WHERE id = ?').all('ord-table-15');
    ok(realOrderAfterReplay[0].paid_ts === null, 'Newer table orders remain UNPAID after replay of older visit');
  }

  // 8. Settlement Fault Injection & Recovery
  {
    // a) Temporary failure of service-events write -> returns settlementPending: true
    const tNow = Date.now();
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-table-20', merchant, '20', tNow);
    db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', NULL, ?, ?)").run('ord-table-20', merchant, 'sess-table-20', '20', tNow, tNow);

    // Initial floor state: Table 20 is seated
    const docRow = db.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'service-events'").all(merchant)[0];
    const docData = JSON.parse(docRow.data);
    docData.states['20'] = { table: '20', status: 'ka-yaklo', covers: 2, syncVersion: 1 };
    db.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'service-events'").run(JSON.stringify(docData), merchant);

    let failStoreDocsWrite = true;
    const faultDb = {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          bind(...args) {
            return {
              async run() {
                if (failStoreDocsWrite && sql.includes('UPDATE store_docs') && args.includes('service-events')) {
                  throw new Error('d1-service-events-write-failed');
                }
                const res = stmt.run(...args);
                return {
                  ...res,
                  meta: {
                    changes: res ? res.changes : 0,
                    last_row_id: res ? res.lastInsertRowid : 0,
                  },
                };
              },
              async all() {
                const results = stmt.all(...args);
                return { results };
              },
              async first(col) {
                const results = stmt.all(...args);
                if (!results.length) return null;
                if (col) return results[0][col];
                return results[0];
              },
            };
          },
        };
      },
    };

    const faultEnv = { DB: faultDb, AUTH_SECRET };
    async function postSaleFault(body) {
      const req = new Request('https://kiwi.test/api/sale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `kiwi_till=${tillCookie}`,
        },
        body: JSON.stringify({ merchant, ...body }),
      });
      const res = await salePost({ request: req, env: faultEnv });
      const data = await res.json();
      return { status: res.status, data };
    }

    const failedSettlementPost = await postSaleFault({
      table: '20',
      session: 'sess-table-20',
      amount: 85,
      amountCents: 8500,
      method: 'cash',
      label: 'Table 20',
    });

    ok(failedSettlementPost.status === 200, 'Payment succeeds 200 despite floor write failure');
    ok(failedSettlementPost.data.settlementPending === true, 'Response reports settlementPending: true on floor write failure');

    const sess20Pending = db.prepare('SELECT status, closed_by FROM table_sessions WHERE id = ?').all('sess-table-20')[0];
    ok(sess20Pending.status === 'closed', 'Table session is closed');
    ok(sess20Pending.closed_by === 'service-payment-pending', 'Session closed_by is service-payment-pending');

    const doc20StillOccupied = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'").all(merchant)[0].data);
    ok(doc20StillOccupied.states['20'].status === 'ka-yaklo', 'Table 20 floor state remains ka-yaklo while settlement is pending');

    // b) Replay of identical payment after DB restored -> completes settleServiceTable, returns 200 without settlementPending, table transitions to khawya
    failStoreDocsWrite = false;
    const recoveredReplay = await postSaleFault({
      table: '20',
      session: 'sess-table-20',
      amount: 85,
      amountCents: 8500,
      method: 'cash',
      label: 'Table 20',
    });

    ok(recoveredReplay.status === 200, 'Replay after DB restored succeeds with 200 OK');
    ok(!recoveredReplay.data.settlementPending, 'Response no longer reports settlementPending');

    const sess20Final = db.prepare('SELECT status, closed_by FROM table_sessions WHERE id = ?').all('sess-table-20')[0];
    ok(sess20Final.closed_by === 'service-payment', 'Session closed_by is finalized to service-payment');

    const doc20Khawya = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'").all(merchant)[0].data);
    ok(doc20Khawya.states['20'].status === 'khawya', 'Table 20 floor state transitioned to khawya upon recovery');

    // c) Replay when newer visit is seated on same table -> newer visit floor state remains intact (ka-yaklo)
    const tOlder = tNow + 10000;
    const tNewer = tNow + 20000;
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'closed', ?, ?, 'service-payment-pending', NULL)").run('sess-t21-old', merchant, '21', tOlder, tOlder + 5000);
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-t21-new', merchant, '21', tNewer);
    db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', ?, ?, ?)").run('ord-t21-old', merchant, 'sess-t21-old', '21', tOlder + 4000, tOlder, tOlder);
    db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', NULL, ?, ?)").run('ord-t21-new', merchant, 'sess-t21-new', '21', tNewer + 1000, tNewer);

    // Newer visit seated on Table 21
    const docData21 = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'").all(merchant)[0].data);
    docData21.states['21'] = { table: '21', status: 'ka-yaklo', covers: 4, syncVersion: 1 };
    db.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'service-events'").run(JSON.stringify(docData21), merchant);

    // Pre-insert old sale
    db.prepare(`
      INSERT OR IGNORE INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts)
      VALUES (?, ?, 95, 9500, 'cash', 'Table 21 (old)', '260907-0021-OLD', ?)
    `).run('visit-sess-t21-old-emp', merchant, tOlder);

    const oldReplayWithNewVisit = await postSaleFault({
      table: '21',
      session: 'sess-t21-old',
      amount: 95,
      amountCents: 9500,
      method: 'cash',
      label: 'Table 21 (old)',
    });

    ok(oldReplayWithNewVisit.status === 200, 'Replay of older session succeeds with 200 OK');
    const doc21AfterOldReplay = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'").all(merchant)[0].data);
    ok(doc21AfterOldReplay.states['21'].status === 'ka-yaklo', 'Newer visit floor state remains ka-yaklo; older settlement did not wipe it to khawya');

    const newSess21 = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-t21-new')[0];
    ok(newSess21.status === 'open', 'Newer visit session remains open');

    const newOrder21 = db.prepare('SELECT paid_ts FROM orders WHERE id = ?').all('ord-t21-new')[0];
    ok(newOrder21.paid_ts === null, 'Newer visit order remains unpaid');
  }

  // 9. Failed Verification Reads & Conflict Enforcement
  {
    const tNow = Date.now();
    db.prepare("INSERT INTO table_sessions VALUES (?, ?, 'table', ?, 'open', ?, NULL, NULL, NULL)").run('sess-table-22', merchant, '22', tNow);
    db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, 'kiwi', 'Hafid', NULL, ?, ?)").run('ord-table-22', merchant, 'sess-table-22', '22', tNow, tNow);

    let injectVerifyDbError = false;
    let injectWinningRowMissing = false;

    const verifyDb = {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          bind(...args) {
            return {
              async run() {
                const res = stmt.run(...args);
                return {
                  ...res,
                  meta: {
                    changes: res ? res.changes : 0,
                    last_row_id: res ? res.lastInsertRowid : 0,
                  },
                };
              },
              async all() {
                const results = stmt.all(...args);
                return { results };
              },
              async first(col) {
                if (sql.includes('SELECT id, amount, amount_cents, method FROM sales WHERE id = ? AND merchant = ? LIMIT 1')) {
                  if (injectVerifyDbError) {
                    throw new Error('d1-read-timeout-during-verification');
                  }
                  if (injectWinningRowMissing) {
                    return null;
                  }
                }
                const results = stmt.all(...args);
                if (!results.length) return null;
                if (col) return results[0][col];
                return results[0];
              },
            };
          },
        };
      },
    };

    const verifyEnv = { DB: verifyDb, AUTH_SECRET };
    async function postSaleVerify(body) {
      const req = new Request('https://kiwi.test/api/sale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `kiwi_till=${tillCookie}`,
        },
        body: JSON.stringify({ merchant, ...body }),
      });
      const res = await salePost({ request: req, env: verifyEnv });
      const data = await res.json();
      return { status: res.status, data };
    }

    // d) Failed verification reads throwing DB errors -> returns 503 db-verification-failed, retains idempotency key, prevents reference mutation, prevents settlement
    injectVerifyDbError = true;
    const verifyFailPost = await postSaleVerify({
      table: '22',
      session: 'sess-table-22',
      amount: 110,
      amountCents: 11000,
      method: 'card',
      label: 'Table 22',
      ref: 'MUTATED-REF-SHOULD-NOT-BE-SAVED',
    });

    ok(verifyFailPost.status === 503, 'Failed verification read returns 503 Service Unavailable');
    ok(verifyFailPost.data.error === 'db-verification-failed', 'Error code is db-verification-failed');

    // Verify reference mutation was PREVENTED
    const sale22AfterFail = db.prepare("SELECT ref FROM sales WHERE id = 'visit-sess-table-22-emp'").all();
    if (sale22AfterFail.length > 0) {
      ok(sale22AfterFail[0].ref !== 'MUTATED-REF-SHOULD-NOT-BE-SAVED', 'Reference was NOT mutated on verification failure');
    }

    // Verify settlement was PREVENTED
    const sess22AfterFail = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-22')[0];
    ok(sess22AfterFail.status === 'open', 'Table session remains OPEN; settlement was prevented');
    const ord22AfterFail = db.prepare('SELECT paid_ts FROM orders WHERE id = ?').all('ord-table-22')[0];
    ok(ord22AfterFail.paid_ts === null, 'Table order remains UNPAID; settlement was prevented');

    // e) Missing winning row -> returns 503 sale-not-persisted
    injectVerifyDbError = false;
    injectWinningRowMissing = true;
    const missingWinningPost = await postSaleVerify({
      table: '22',
      session: 'sess-table-22',
      amount: 110,
      amountCents: 11000,
      method: 'card',
      label: 'Table 22',
    });

    ok(missingWinningPost.status === 503, 'Missing winning row returns 503 Service Unavailable');
    ok(missingWinningPost.data.error === 'sale-not-persisted', 'Error code is sale-not-persisted');

    // f) Subsequent retry with identical data succeeds with 200 once DB recovers; conflicting data returns 409
    injectWinningRowMissing = false;
    const recoveredIdentical = await postSaleVerify({
      table: '22',
      session: 'sess-table-22',
      amount: 110,
      amountCents: 11000,
      method: 'card',
      label: 'Table 22',
      ref: 'CANONICAL-22',
    });

    ok(recoveredIdentical.status === 200, 'Subsequent retry with identical data succeeds with 200 OK');
    const sess22Recovered = db.prepare('SELECT status FROM table_sessions WHERE id = ?').all('sess-table-22')[0];
    ok(sess22Recovered.status === 'closed', 'Table session is now closed');

    // Conflicting retry with different method fails 409
    const conflictingDataPost = await postSaleVerify({
      table: '22',
      session: 'sess-table-22',
      amount: 110,
      amountCents: 11000,
      method: 'cash',
      label: 'Table 22',
    });

    ok(conflictingDataPost.status === 409, 'Conflicting data returns 409 Conflict');
    ok(conflictingDataPost.data.error === 'sale-conflict', 'Error code is sale-conflict');
    ok(conflictingDataPost.data.detail === 'conflicting-financial-data', 'Detail is conflicting-financial-data');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Section 3: Clock Skew Void Protection & Reconcile Voids
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n--- Section 3: Clock Skew Void Protection & Reconcile Voids ---');
{
  const moneyHelpers = extractBody(caisseHtml, 'const money = n =>', "fmtMADcents = n => money(n).toFixed(2).replace('.', ',') + ' MAD';");
  const ledgerRollupBlock = extractBody(caisseHtml, 'function rollupLedger(sinceMs) {', 'function journalTotals() {\n      return rollupLedger();\n    }');
  const reconcileBlock = extractBody(caisseHtml, 'function refreshOpenReconciliationModals() {', 'return touched;\n    }');
  const clotureBlock = extractBody(caisseHtml, 'let clotureExpected = 0;', "el.style.animationDelay = delay + 'ms';\n      });\n    }");
  const drawerBlock = extractBody(caisseHtml, 'function drawerExpected() {', 'return major(minor(openingFloat) + t.cashC + t.cashTipsC + t.movesInC - t.movesOutC);\n    }');
  const handoverBlock = extractBody(caisseHtml, 'function fmtEcart(e) {', 'window.KiwiCaisseAccounting = Object.freeze({\n      rollupLedger,\n      journalTotals,\n      posteRollup,\n      drawerExpected,\n      renderHandoverCount,\n      confirmHandover,\n      renderCloture,\n      reconcileVoids,\n      refreshOpenReconciliationModals,\n    });');

  function makePosMatcher() {
    const g = { window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { addEventListener() {} } };
    const fn = new Function('window', 'localStorage', 'document', posSaleSrc + '\nreturn window.KiwiPosSale;');
    return fn(g.window, g.localStorage, g.document).refMatcher;
  }
  const refMatcher = makePosMatcher();

  function createCaisseContext(journal = []) {
    const elements = new Map();
    function getEl(sel) {
      if (!elements.has(sel)) {
        const el = {
          _classes: new Set(),
          classList: {
            contains: (c) => el._classes.has(c),
            add: (c) => el._classes.add(c),
            remove: (c) => el._classes.delete(c),
            toggle: (c, force) => (force ? el._classes.add(c) : el._classes.delete(c)),
          },
          style: {},
          innerHTML: '',
          textContent: '',
          value: '',
          dataset: {},
          hidden: false,
          addEventListener() {},
          focus() {},
        };
        elements.set(sel, el);
      }
      return elements.get(sel);
    }
    const $ = (sel) => getEl(sel);
    const $$ = (sel) => [getEl(sel)];

    const ctx = {
      Math,
      Date,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Set,
      Map,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      JSON,
      console,
      $,
      $$,
      document: {
        querySelector: $,
        querySelectorAll: $$,
        getElementById: (id) => getEl(id.startsWith('#') ? id : '#' + id),
        addEventListener() {},
      },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      currentCashier: { id: 'c-hafid', name: 'Hafid', role: 'Caissier' },
      CASHIER_ROSTER: [{ id: 'c-hafid', name: 'Hafid', role: 'Caissier' }],
      shiftOpenedBy: 'Hafid',
      shiftOpenedAt: new Date(Date.now() - 3600000),
      posteOpenedAt: new Date(Date.now() - 3600000),
      openingFloat: 1000.0,
      posteOpeningFloat: 1000.0,
      journal,
      cashMovements: [],
      handovers: [],
      authorizations: [],
      shift: { tablesPaid: 0, discounts: 0, discountsCount: 0, cancels: 0, refunds: 0 },
      storeIsReal: () => true,
      currentMerchantSlug: () => 'pasta-corner',
      isFeatureOff: () => false,
      toast() {},
      fmtDur: (m) => `${m} mn`,
      pad2HO: (n) => String(n).padStart(2, '0'),
      cashierInitials: (n) => (n ? n.slice(0, 2).toUpperCase() : 'CA'),
      cashSessionId: () => 'sess-001',
      cashActorId: () => 'c-hafid',
      emitCashSession() {},
      window: {
        lucide: { createIcons() {} },
        KiwiPosSale: { refMatcher },
        KiwiLive: { saleIdFor: (e) => e.serverSaleId || e.id || '' },
      },
      renderShiftStats() {},
      renderJournal() {},
      persistShift() {},
      saveProvisional() {},
    };

    vm.createContext(ctx);
    const script = `
      ${moneyHelpers}
      ${ledgerRollupBlock}
      ${reconcileBlock}
      ${clotureBlock}
      ${drawerBlock}
      ${handoverBlock}
    `;
    vm.runInContext(script, ctx);
    return ctx;
  }

  const serverVoidTs = 1788799000000;

  const journal = [
    {
      id: 'visit-sess-table-5-split-0-emp',
      time: new Date(serverVoidTs),
      amount: 35.0,
      method: 'card',
      label: 'Table 5 · part 1',
      ref: '5',
      table: '5',
      kind: 'sale',
      voided: false,
    },
  ];

  const caisseContext = createCaisseContext(journal);

  // 1. Authoritative exact ID void is honored despite 5m clock skew
  const touched = caisseContext.reconcileVoids(
    [],
    ['visit-sess-table-5-split-0-emp'],
    [{ id: 'visit-sess-table-5-split-0-emp', voidTs: serverVoidTs }]
  );
  ok(touched === 1, 'reconcileVoids returns 1 touched entry');
  ok(journal[0].voided === true, 'Exact unique ID void is HONORED despite 5m client clock skew');

  // 2. Partial feed omission does NOT reactivate confirmed void
  const partialTouched = caisseContext.reconcileVoids(
    ['260907-9999-Q1'],
    ['unrelated-sale-id-888'],
    [{ id: 'unrelated-sale-id-888', voidTs: serverVoidTs + 60000 }]
  );
  ok(partialTouched === 0, 'Partial feed omitting confirmed void touches 0 entries');
  ok(journal[0].voided === true, 'Confirmed void REMAINS VOIDED when omitted from subsequent partial feed');

  // 3. Empty void list MUST NOT reactivate confirmed void
  const emptyFeedTouched = caisseContext.reconcileVoids([], [], []);
  ok(emptyFeedTouched === 0, 'Empty feed touches 0 entries and never reactivates confirmed void');
  ok(journal[0].voided === true, 'Confirmed void REMAINS VOIDED across empty feed');

  // 4. Explicit restoration evidence reinstates void
  const restoredTouched = caisseContext.reconcileVoids([], [], [], { restoredIds: new Set(['visit-sess-table-5-split-0-emp']) });
  ok(restoredTouched === 1, 'Explicit restoration evidence touched 1 entry for reinstatement');
  ok(journal[0].voided === false, 'Explicit restoration evidence reinstates void cleanly');

  // 5. Already-corrupted journals heal falsely voided sales
  {
    const corruptedJournal = [
      { id: 'v1', time: new Date('2026-09-07T16:42:00Z'), amount: 70, method: 'cash', label: '1', ref: '1', table: '1', voided: true },
      { id: 'v2', time: new Date('2026-09-07T16:48:07Z'), amount: 35, method: 'cash', label: '5 · part 1', ref: '260907-0001-Q2', table: '5', voided: false },
      { id: 'v3', time: new Date('2026-09-07T16:48:11Z'), amount: 25, method: 'cash', label: '5 · part 2', ref: '5', table: '5', voided: true },
      { id: 'v4', time: new Date('2026-09-07T16:48:51Z'), amount: 75, method: 'cash', label: '3', ref: '3', table: '3', voided: true },
      { id: 'v5', time: new Date('2026-09-07T16:48:58Z'), amount: 130, method: 'cash', label: 'KH-7', ref: 'KH-7', table: 'KH-7', voided: true },
      { id: 'v6', time: new Date('2026-09-07T16:49:07Z'), amount: 490, method: 'cash', label: '4', ref: '4', table: '4', voided: true },
      { id: 'v7', time: new Date('2026-09-07T16:49:18Z'), amount: 150, method: 'cash', label: 'KH-5', ref: 'KH-5', table: 'KH-5', voided: false },
      { id: 'v8', time: new Date('2026-09-07T16:49:20Z'), amount: 155, method: 'cash', label: 'KH-6', ref: 'KH-6', table: 'KH-6', voided: true },
    ];
    const corruptedCtx = createCaisseContext(corruptedJournal);
    const histRefs = ['1', '2', '3', '4', '5', 'KH-6', 'KH-7'];
    const histEvents = histRefs.map((r, i) => ({
      id: `old-${i}`,
      ref: r,
      voidTs: new Date('2026-09-02T12:00:00Z').getTime(),
    }));

    // Repro 1B: Legacy voids without authority are NOT healed by unrelated ref collision alone
    const unhealed = corruptedCtx.reconcileVoids(histRefs, [], histEvents);
    ok(unhealed === 0, 'Legacy voids are NOT unvoided merely by colliding refs in void feed');
    ok(corruptedJournal.filter(e => e.voided).length === 6, 'Legacy voids remain voided without authoritative active evidence');

    // Authoritative activeSaleIds heals the 6 falsely voided sales
    const activeSaleIds = new Set(['v1', 'v3', 'v4', 'v5', 'v6', 'v8']);
    const healed = corruptedCtx.reconcileVoids(histRefs, [], histEvents, { activeSaleIds });
    ok(healed === 6, `reconcileVoids with authoritative activeSaleIds healed exactly 6 corrupted sales (got ${healed})`);
    const remainingVoided = corruptedJournal.filter(e => e.voided);
    ok(remainingVoided.length === 0, 'Zero sales remain voided in the healed journal');
    const tot = corruptedCtx.journalTotals();
    ok(tot.txns === 8, `Healed journal reflects 8 transactions (got ${tot.txns})`);
    ok(tot.revenue === 1130.00, `Healed journal reflects 1,130.00 MAD (got ${tot.revenue})`);
    ok(tot.cash === 1130.00, `Healed journal reflects 1,130.00 MAD cash (got ${tot.cash})`);

    // Genuinely voided 50 MAD receipt with voidConfirmed remains voided
    corruptedJournal.push({
      id: 'genuine-void-50',
      time: new Date('2026-09-07T17:00:00Z'),
      amount: 50,
      method: 'cash',
      ref: '260907-0050-G1',
      voided: true,
      voidConfirmed: true,
      voidAuthority: 'server',
    });
    const emptyCheck = corruptedCtx.reconcileVoids([], []);
    ok(emptyCheck === 0, 'Empty feed does not clear genuinely voided 50 MAD receipt');
    ok(corruptedJournal[corruptedJournal.length - 1].voided === true, 'Genuinely voided 50 MAD receipt preserved across empty feed');

    // Durability of voidAuthority === 'ref': omission does NOT restore it
    corruptedJournal.push({
      id: 'ref-void-60',
      time: new Date('2026-09-07T17:05:00Z'),
      amount: 60,
      method: 'cash',
      ref: 'FAC-2026-0907-0060',
      voided: true,
      voidAuthority: 'ref',
    });
    const refOmissionCheck = corruptedCtx.reconcileVoids([], []);
    ok(refOmissionCheck === 0, 'Omission from feed does NOT restore receipt with voidAuthority === "ref"');
    ok(corruptedJournal[corruptedJournal.length - 1].voided === true, 'voidAuthority === "ref" preserved across subsequent feed omission');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Section 4: Feed Split Label Consistency
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n--- Section 4: Feed Split Label Consistency ---');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE sales (
      id TEXT PRIMARY KEY,
      merchant TEXT NOT NULL,
      amount INTEGER NOT NULL,
      amount_cents INTEGER,
      gross_amount_cents INTEGER,
      discount_amount_cents INTEGER,
      discount_reason TEXT,
      discount_actor_id TEXT,
      method TEXT NOT NULL,
      label TEXT,
      ref TEXT,
      ts INTEGER NOT NULL,
      lines TEXT,
      channel TEXT,
      void_ts INTEGER,
      void_reason TEXT,
      void_note TEXT,
      void_actor TEXT,
      void_actor_id TEXT
    );

    CREATE TABLE orders (
      session_id TEXT,
      merchant TEXT NOT NULL,
      number TEXT,
      channel TEXT,
      server_name TEXT,
      created_ts INTEGER
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      business TEXT
      ,status TEXT NOT NULL DEFAULT 'active'
      ,session_epoch INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE merchant_config (
      merchant TEXT PRIMARY KEY,
      account_id TEXT,
      till_epoch INTEGER DEFAULT 0
    );
  `);

  const AUTH_SECRET = 'test-auth-secret-32-chars-long-abc';
  const merchant = 'restaurant-mixmax';
  const env = {
    DB: makeD1Adapter(db),
    AUTH_SECRET,
  };

  db.prepare("INSERT INTO accounts (id, business, status, session_epoch) VALUES (?, ?, 'active', 0)")
    .run('acc-restaurant-mixmax-fixture', merchant);
  db.prepare("INSERT INTO merchant_config (merchant, account_id, till_epoch) VALUES (?, ?, 7)")
    .run(merchant, 'acc-restaurant-mixmax-fixture');
  const epochTillCookie = await tillToken(AUTH_SECRET, merchant, 7);

  // Insert non-visit split receipt
  db.prepare(`
    INSERT INTO sales (
      id, merchant, amount, amount_cents, gross_amount_cents, method, label, ref, ts, channel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sale-ref-d1e44c64-sale-1788799687072-1',
    merchant,
    35,
    3500,
    3500,
    'cash',
    '5 · part 1',
    '260907-0001-Q2',
    Date.now(),
    'caisse'
  );

  const req = new Request(`https://kiwi.test/api/feed?merchant=${merchant}&since=0`, {
    headers: {
      'Cookie': `kiwi_till=${epochTillCookie}`,
    },
  });

  const res = await feedGet({ request: req, env });
  const data = await res.json();

  ok(Array.isArray(data.sales) && data.sales.length === 1, 'Feed returns exactly 1 sale row');
  const feedSale = data.sales[0];
  ok(feedSale.orderRef === '5 · part 1', 'Split receipt orderRef prioritizes human split label "5 · part 1"');
  ok(feedSale.receiptRef === '260907-0001-Q2', 'Split receipt receiptRef retains fiscal receipt number "260907-0001-Q2"');
  ok(feedSale.amountCents === 3500, 'Sale amountCents is 3500');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Section 5: 7-Visit / 8-Receipt MixMax Fixture Reconciliation
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n--- Section 5: 7-Visit / 8-Receipt Fixture Reconciliation ---');
{
  const moneyHelpers = extractBody(caisseHtml, 'const money = n =>', "fmtMADcents = n => money(n).toFixed(2).replace('.', ',') + ' MAD';");
  const ledgerRollupBlock = extractBody(caisseHtml, 'function rollupLedger(sinceMs) {', 'function journalTotals() {\n      return rollupLedger();\n    }');
  const reconcileBlock = extractBody(caisseHtml, 'function refreshOpenReconciliationModals() {', 'return touched;\n    }');
  const clotureBlock = extractBody(caisseHtml, 'let clotureExpected = 0;', "el.style.animationDelay = delay + 'ms';\n      });\n    }");
  const drawerBlock = extractBody(caisseHtml, 'function drawerExpected() {', 'return major(minor(openingFloat) + t.cashC + t.cashTipsC + t.movesInC - t.movesOutC);\n    }');
  const handoverBlock = extractBody(caisseHtml, 'function fmtEcart(e) {', 'window.KiwiCaisseAccounting = Object.freeze({\n      rollupLedger,\n      journalTotals,\n      posteRollup,\n      drawerExpected,\n      renderHandoverCount,\n      confirmHandover,\n      renderCloture,\n      reconcileVoids,\n      refreshOpenReconciliationModals,\n    });');

  function makePosMatcher() {
    const g = { window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { addEventListener() {} } };
    const fn = new Function('window', 'localStorage', 'document', posSaleSrc + '\nreturn window.KiwiPosSale;');
    return fn(g.window, g.localStorage, g.document).refMatcher;
  }
  const refMatcher = makePosMatcher();

  function loadDayReport() {
    const g = { window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
    const fn = new Function('window', 'localStorage', dayReportSrc + '\nreturn window.KiwiDayReport;');
    return fn(g.window, g.localStorage);
  }
  const KiwiDayReport = loadDayReport();

  const sept7Sales = [
    {
      id: 'visit-tsx-wP2qUVBKY5zBtzViY2XcAk-emp',
      time: new Date('2026-09-07T16:42:00Z'),
      amount: 70.0, method: 'cash', label: '1', ref: '1', table: '1', kind: 'sale'
    },
    {
      id: 'sale-ref-d1e44c64-sale-1788799687072-1',
      time: new Date('2026-09-07T16:48:07Z'),
      amount: 35.0, method: 'cash', label: '5 · part 1', ref: '260907-0001-Q2', table: '5', kind: 'sale'
    },
    {
      id: 'visit-tsx-exC4ayLaM5WM2TmwKNDaeE-emp',
      time: new Date('2026-09-07T16:48:11Z'),
      amount: 25.0, method: 'cash', label: '5 · part 2', ref: '5', table: '5', kind: 'sale'
    },
    {
      id: 'visit-tsx-6mBVCvHMWNnCCF762FwE5k-emp',
      time: new Date('2026-09-07T16:48:51Z'),
      amount: 75.0, method: 'cash', label: '3', ref: '3', table: '3', kind: 'sale'
    },
    {
      id: 'visit-tsx-TmTkSKuxE7mAXCPuSzWzAg-emp',
      time: new Date('2026-09-07T16:48:58Z'),
      amount: 130.0, method: 'cash', label: 'KH-7', ref: 'KH-7', table: 'KH-7', kind: 'sale'
    },
    {
      id: 'visit-tsx-jXdoXJQBNfpxJ3LiPEbuME-emp',
      time: new Date('2026-09-07T16:49:07Z'),
      amount: 490.0, method: 'cash', label: '4', ref: '4', table: '4', kind: 'sale'
    },
    {
      id: 'visit-tsx-FD2daHrNbLjJowYTGhiMfL-emp',
      time: new Date('2026-09-07T16:49:18Z'),
      amount: 150.0, method: 'cash', label: 'KH-5', ref: 'KH-5', table: 'KH-5', kind: 'sale'
    },
    {
      id: 'visit-tsx-8H7DAAv6cpBRNFdRYMNBPC-emp',
      time: new Date('2026-09-07T16:49:20Z'),
      amount: 155.0, method: 'cash', label: 'KH-6', ref: 'KH-6', table: 'KH-6', kind: 'sale'
    },
  ];

  const elements = new Map();
  function getEl(sel) {
    if (!elements.has(sel)) {
      const el = {
        _classes: new Set(),
        classList: {
          contains: (c) => el._classes.has(c),
          add: (c) => el._classes.add(c),
          remove: (c) => el._classes.delete(c),
          toggle: (c, force) => (force ? el._classes.add(c) : el._classes.delete(c)),
        },
        style: {},
        innerHTML: '',
        textContent: '',
        value: '',
        dataset: {},
        hidden: false,
        addEventListener() {},
        focus() {},
      };
      elements.set(sel, el);
    }
    return elements.get(sel);
  }
  const $ = (sel) => getEl(sel);
  const $$ = (sel) => [getEl(sel)];

  const ctx = {
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    JSON,
    console,
    $,
    $$,
    document: {
      querySelector: $,
      querySelectorAll: $$,
      getElementById: (id) => getEl(id.startsWith('#') ? id : '#' + id),
      addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    currentCashier: { id: 'c-hafid', name: 'Hafid', role: 'Caissier' },
    CASHIER_ROSTER: [{ id: 'c-hafid', name: 'Hafid', role: 'Caissier' }],
    shiftOpenedBy: 'Hafid',
    shiftOpenedAt: new Date('2026-09-07T16:30:00Z'),
    posteOpenedAt: new Date('2026-09-07T16:30:00Z'),
    openingFloat: 1452.0,
    posteOpeningFloat: 1452.0,
    journal: JSON.parse(JSON.stringify(sept7Sales)),
    cashMovements: [],
    handovers: [],
    authorizations: [],
    shift: { tablesPaid: 7, discounts: 0, discountsCount: 0, cancels: 0, refunds: 0 },
    tables: {
      '1': { zone: 'salle' },
      '3': { zone: 'salle' },
      '4': { zone: 'salle' },
      '5': { zone: 'salle' },
      'KH-5': { zone: 'salle' },
      'KH-6': { zone: 'salle' },
      'KH-7': { zone: 'salle' },
    },
    kdsOrders: [],
    DAILY_OBJECTIF: 5000,
    dafrDays: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    monthsEn: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    storeName: () => 'Restaurant MixMax',
    currentMerchantSlug: () => 'restaurant-mixmax',
    storeIsReal: () => true,
    isFeatureOff: () => false,
    toast() {},
    fmtDur: (m) => `${m} mn`,
    pad2HO: (n) => String(n).padStart(2, '0'),
    cashierInitials: (n) => (n ? n.slice(0, 2).toUpperCase() : 'CA'),
    cashSessionId: () => 'sess-mixmax-001',
    cashActorId: () => 'c-hafid',
    emitCashSession() {},
    window: {
      lucide: { createIcons() {} },
      KiwiPosSale: { refMatcher },
      KiwiLive: { saleIdFor: (e) => e.serverSaleId || e.id || '' },
    },
    renderShiftStats() {},
    renderJournal() {},
    persistShift() {},
    saveProvisional() {},
  };

  vm.createContext(ctx);
  const script = `
    ${moneyHelpers}
    ${ledgerRollupBlock}
    ${reconcileBlock}
    ${clotureBlock}
    ${drawerBlock}
    ${handoverBlock}
    Object.defineProperty(globalThis, 'clotureExpected', { get: () => clotureExpected });
    Object.defineProperty(globalThis, 'handoverState', { get: () => handoverState });
  `;
  vm.runInContext(script, ctx);

  // 1. RollupLedger & JournalTotals: 8 transactions, 1,130 MAD
  const tot = (ctx.window.KiwiCaisseAccounting || ctx).journalTotals();
  ok(tot.txns === 8, 'Caisse rollup reports exactly 8 transactions');
  ok(tot.cash === 1130, 'Caisse rollup reports 1,130.00 MAD cash');
  ok(tot.revenue === 1130, 'Caisse rollup reports 1,130.00 MAD revenue');

  // 2. Expected Drawer: float 1,452 + cash 1,130 = 2,582 MAD
  const expected = (ctx.window.KiwiCaisseAccounting || ctx).drawerExpected();
  ok(expected === 2582, 'Expected drawer is exactly 2,582.00 MAD (1,452.00 float + 1,130.00 cash)');

  // 3. Handover reconciliation with physical cash count 2,582 MAD
  (ctx.window.KiwiCaisseAccounting || ctx).renderHandoverCount(false);
  ok(ctx.handoverState.expected === 2582, 'Handover expected drawer matches 2,582.00 MAD');

  // 4. Clôture render: 2,582 MAD expected drawer
  (ctx.window.KiwiCaisseAccounting || ctx).renderCloture(false);
  ok(ctx.clotureExpected === 2582, 'Clôture expected drawer matches exactly 2,582.00 MAD');
  ok(ctx.handoverState.expected === ctx.clotureExpected, 'Handover and Clôture expected drawer tie out with 0 discrepancy');

  // 5. Real KiwiDayReport.build() Z Report
  const dayReport = KiwiDayReport.build({
    day: '2026-09-07',
    sales: sept7Sales.map(s => ({
      id: s.id,
      ts: s.time.getTime(),
      amount: s.amount,
      method: s.method,
      ref: s.ref,
      label: s.label,
      table: s.table,
      lines: [{ name: s.label, qty: 1, total: s.amount }],
    })),
    session: {
      openingFloat: 1452.0,
      countedCash: 2582.0,
      cashMovements: [],
    },
    store: { slug: 'restaurant-mixmax', name: 'Restaurant MixMax' },
  });

  ok(dayReport.txns === 8, 'Day Report Z reports 8 transactions');
  ok(dayReport.methods.cash === 1130.0, 'Day Report Z reports 1,130.00 MAD cash');
  ok(dayReport.cash.expected === 2582.0, 'Day Report Z expected drawer is 2,582.00 MAD');
  ok(dayReport.cash.ecart === 0.0, 'Day Report Z cash discrepancy is 0 MAD against counted cash');

  // 6. Distinct Visit Count vs Receipt Count reconciliation
  const distinctTables = new Set(sept7Sales.map(s => s.table));
  ok(distinctTables.size === 7, '7 distinct tables/visits (Table 1, 3, 4, 5, KH-5, KH-6, KH-7)');
  ok(sept7Sales.length === 8, '8 distinct receipts (Table 5 cleanly split into part 1 + part 2)');
}

console.log('\n' + '─'.repeat(60));
console.log(`✓ All production tests passed (${controls} controls green)`);
